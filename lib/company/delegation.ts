import "server-only";
import { createHash } from "node:crypto";
import { db } from "@/lib/db/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { agentBySlug } from "@/lib/ai/catalog";
import { canRunAgent } from "@/lib/ai/agents";
import type { RoleName } from "@/lib/auth/permissions";
import type { VirtualTool } from "@/lib/ai/runner";
import { logEmployeeActivity } from "@/lib/ai/workforce/activity";
import { growthStop } from "@/lib/growth/settings";
import { notify } from "@/lib/os/notify";
import { audit } from "@/lib/audit";
import { canDelegate, chainOf, placementOf } from "./org";
import { getCompanyProfile, orgManagers } from "./organisation";
import { refreshObjective } from "./objective-status";

/**
 * AI-to-AI work: delegation, help requests, handoffs, escalations, blockers and manager review.
 * Everything here writes real rows (AITask, AIWorkMessage, AIActivity, notifications) — there is no simulated chat.
 * Delegated work runs with the permissions of the person who started it (requestedById is copied), so delegation can
 * never widen access. Runaway protection: per-task, per-objective and per-day caps, revision limits and kill switches.
 */

export const MAX_CHILDREN_PER_TASK = 12;
export const MAX_REVISIONS = 2;
export const MAX_DEPTH = 5;
const SETTLED = ["DONE", "FAILED", "CANCELLED"] as const;
const json = (v: unknown) => JSON.parse(JSON.stringify(v ?? null)) as Prisma.InputJsonValue;
const utcDay = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};

export type MessageKind = "DELEGATION" | "HANDOFF" | "HELP_REQUEST" | "ESCALATION" | "BLOCKER" | "RESULT" | "REVIEW" | "REVISION_REQUEST";

export async function postMessage(m: { fromSlug: string; toSlug?: string | null; toUserId?: string | null; kind: MessageKind; subject: string; body: string; taskId?: string | null; objectiveId?: string | null; data?: Record<string, unknown> }) {
  return db.aIWorkMessage.create({ data: { fromSlug: m.fromSlug, toSlug: m.toSlug ?? null, toUserId: m.toUserId ?? null, kind: m.kind, subject: m.subject.slice(0, 200), body: m.body.slice(0, 8000), taskId: m.taskId ?? null, objectiveId: m.objectiveId ?? null, data: m.data ? json(m.data) : undefined } });
}

/** Same manager task + same assignee + same work = the same task (a repeated model call never duplicates work). */
export const delegationKey = (parentTaskId: string, assignee: string, title: string) => createHash("sha256").update(`${parentTaskId}|${assignee}|${title.trim().toLowerCase().replace(/\s+/g, " ")}`).digest("hex").slice(0, 40);

/** Provider / network errors worth retrying later (rate limits, overload, timeouts). Validation and permission errors are not. */
export const isTransientError = (msg: string | null | undefined) => /\b(429|500|502|503|504|529)\b|rate.?limit|overloaded|timed? ?out|timeout|temporar|network error|could not reach|ECONNRESET|ETIMEDOUT|socket hang up/i.test(msg ?? "");

/** Retry delay for attempt n (1-based): 2, 4, 8 … minutes, capped at one hour. */
export const retryDelayMs = (attempt: number) => Math.min(60, 2 ** Math.max(1, attempt)) * 60_000;
export const MAX_ATTEMPTS = 3;

export interface CreateTaskFn {
  (t: { agentSlug: string; title: string; instructions?: string | null; priority?: string; deadline?: Date | null; requestedById?: string | null; source?: string; objectiveId?: string | null; parentTaskId?: string | null; delegatedBySlug?: string | null; dependsOn?: string[]; idempotencyKey?: string | null }): Promise<{ id: string; created?: boolean }>;
}

interface TaskRow {
  id: string;
  agentSlug: string;
  title: string;
  objectiveId: string | null;
  parentTaskId: string | null;
  requestedById: string | null;
  priority: string;
}

async function depthOf(task: TaskRow) {
  let depth = 0;
  let parent = task.parentTaskId;
  while (parent && depth < 20) {
    depth++;
    parent = (await db.aITask.findUnique({ where: { id: parent }, select: { parentTaskId: true } }))?.parentTaskId ?? null;
  }
  return depth;
}

/**
 * Creates delegated work after every organisational and safety check. Returns a message for the model either way.
 */
export async function delegate(task: TaskRow, input: { assignee: string; title: string; instructions?: string; priority?: string; dependsOn?: string[]; deadlineDays?: number }, kind: "DELEGATION" | "HELP_REQUEST" | "HANDOFF", createTask: CreateTaskFn): Promise<{ ok: boolean; message: string; taskId?: string }> {
  const from = task.agentSlug;
  const to = String(input.assignee ?? "").trim();
  const title = String(input.title ?? "").trim().slice(0, 200);
  if (!title) return { ok: false, message: "A title is required." };
  const spec = agentBySlug(to);
  if (!spec) return { ok: false, message: `There is no AI employee "${to}". Use a slug from your team list.` };
  const managers = await orgManagers();
  if (!canDelegate(from, to, managers, kind === "DELEGATION" ? "DELEGATION" : "HELP_REQUEST")) return { ok: false, message: kind === "DELEGATION" ? `${spec.name} is not in your reporting line. Delegate only to your team; use escalate for anything above you.` : `${spec.name} is neither in your team nor a peer under the same manager.` };
  const profile = await getCompanyProfile();
  const dept = placementOf(to)?.department;
  if (dept && !profile.departments.includes(dept)) return { ok: false, message: `The ${dept} department is switched off in the company configuration.` };
  const target = await db.aIAgent.findUnique({ where: { slug: to }, select: { enabled: true, available: true } });
  if (target && (!target.enabled || !target.available)) return { ok: false, message: `${spec.name} is ${target.enabled ? "clocked out" : "disabled"} and cannot take work. Choose someone else or escalate.` };
  const stop = await growthStop({ kind: "ai", agent: to });
  if (stop) return { ok: false, message: `Not delegated: ${stop}` };
  // Delegated work runs as the person who started it: they must be allowed to direct the target employee.
  if (task.requestedById) {
    const person = await db.user.findUnique({ where: { id: task.requestedById }, select: { role: true, active: true } });
    if (!person?.active || !canRunAgent(person.role as RoleName, spec)) return { ok: false, message: `The person who started this work is not allowed to direct the ${spec.name}. Do it yourself or escalate.` };
  }
  if ((await depthOf(task)) + 1 > MAX_DEPTH) return { ok: false, message: `Delegation is limited to ${MAX_DEPTH} levels. Do this work yourself or escalate.` };
  if ((await db.aITask.count({ where: { parentTaskId: task.id } })) >= MAX_CHILDREN_PER_TASK) return { ok: false, message: `This task already has ${MAX_CHILDREN_PER_TASK} delegated tasks (limit).` };
  if (task.objectiveId && (await db.aITask.count({ where: { objectiveId: task.objectiveId } })) >= profile.objectiveTaskLimit) return { ok: false, message: `This objective reached its limit of ${profile.objectiveTaskLimit} tasks. Report what is done and escalate if more is needed.` };
  if ((await db.aITask.count({ where: { delegatedBySlug: { not: null }, createdAt: { gte: utcDay() } } })) >= profile.dailyDelegationLimit) return { ok: false, message: `The company's daily delegation limit (${profile.dailyDelegationLimit}) is reached. Continue tomorrow or escalate.` };
  // Dependencies must be sibling tasks of this manager task (or earlier delegated work in the same objective).
  const deps = (input.dependsOn ?? []).map(String).slice(0, 10);
  if (deps.length) {
    const found = await db.aITask.count({ where: { id: { in: deps }, OR: [{ parentTaskId: task.id }, ...(task.objectiveId ? [{ objectiveId: task.objectiveId }] : [])] } });
    if (found !== deps.length) return { ok: false, message: "dependsOn must list task ids you delegated earlier in this task or objective." };
  }
  const key = delegationKey(task.id, to, title);
  const existing = await db.aITask.findUnique({ where: { idempotencyKey: key }, select: { id: true, status: true } });
  if (existing) return { ok: true, taskId: existing.id, message: `Already delegated earlier (task ${existing.id}, ${existing.status.toLowerCase()}); not duplicated.` };
  const days = Number(input.deadlineDays);
  const child = await createTask({
    agentSlug: to,
    title,
    instructions: [input.instructions?.slice(0, 4000), `Delegated by ${agentBySlug(from)?.name ?? from} (${kind.replace("_", " ").toLowerCase()}) as part of: ${task.title}`].filter(Boolean).join("\n\n"),
    priority: ["LOW", "MEDIUM", "HIGH", "URGENT"].includes(String(input.priority)) ? String(input.priority) : task.priority,
    deadline: days > 0 && days <= 365 ? new Date(Date.now() + days * 86400_000) : null,
    requestedById: task.requestedById,
    source: `${kind === "DELEGATION" ? "delegation" : kind === "HANDOFF" ? "handoff" : "help"}:${from}`.slice(0, 120),
    objectiveId: task.objectiveId,
    parentTaskId: task.id,
    delegatedBySlug: from,
    dependsOn: deps,
    idempotencyKey: key,
  });
  await postMessage({ fromSlug: from, toSlug: to, kind, subject: title, body: input.instructions ?? title, taskId: child.id, objectiveId: task.objectiveId, data: { parentTaskId: task.id } });
  await logEmployeeActivity({ agentSlug: from, taskId: task.id, objectiveId: task.objectiveId, type: `task.${kind.toLowerCase()}`, summary: `${kind === "DELEGATION" ? "Delegated" : kind === "HANDOFF" ? "Handed off" : "Asked for help"} to ${spec.name}: ${title}`, data: { childTaskId: child.id, to } });
  return { ok: true, taskId: child.id, message: `Created task ${child.id} for ${spec.name}${deps.length ? ` (starts after ${deps.length} dependenc${deps.length === 1 ? "y" : "ies"})` : ""}. You will resume and review it when your delegated work is finished.` };
}

/** Escalation / blocker: to the AI manager, and to the responsible person (objective owner or task requester). */
export async function escalate(task: TaskRow, input: { reason: string; toCeo?: boolean }, kind: "ESCALATION" | "BLOCKER") {
  const reason = String(input.reason ?? "").trim().slice(0, 2000);
  if (!reason) return { ok: false, message: "Describe the reason." };
  const managers = await orgManagers();
  const manager = managers.get(task.agentSlug) ?? null;
  const objective = task.objectiveId ? await db.aIObjective.findUnique({ where: { id: task.objectiveId }, select: { createdById: true, title: true } }) : null;
  const person = objective?.createdById ?? task.requestedById;
  const to = input.toCeo || !manager ? null : manager;
  await postMessage({ fromSlug: task.agentSlug, toSlug: to, toUserId: to ? null : person, kind, subject: `${kind === "BLOCKER" ? "Blocked" : "Escalation"}: ${task.title}`, body: reason, taskId: task.id, objectiveId: task.objectiveId, data: { chain: chainOf(task.agentSlug, managers) } });
  await db.aITask.update({ where: { id: task.id }, data: kind === "BLOCKER" ? { blockedReason: reason.slice(0, 500), escalatedAt: new Date() } : { escalatedAt: new Date() } });
  await logEmployeeActivity({ agentSlug: task.agentSlug, taskId: task.id, objectiveId: task.objectiveId, type: kind === "BLOCKER" ? "task.blocked" : "task.escalated", summary: `${kind === "BLOCKER" ? "Reported a blocker" : "Escalated"}${to ? ` to ${agentBySlug(to)?.name ?? to}` : " to the CEO"}: ${reason.slice(0, 300)}` });
  if (person && (!to || kind === "BLOCKER" || input.toCeo)) await notify({ type: "ai.escalation", title: `${agentBySlug(task.agentSlug)?.name ?? task.agentSlug}: ${kind === "BLOCKER" ? "blocked" : "escalation"} on "${task.title}"`.slice(0, 200), body: reason.slice(0, 300), href: task.objectiveId ? `/admin/company/objectives/${task.objectiveId}` : `/admin/ai/tasks/${task.id}`, userIds: [person] });
  await audit({ userId: null, action: `ai.company.${kind.toLowerCase()}`, entity: "AITask", entityId: task.id, metadata: { agent: task.agentSlug, to: to ?? "ceo", objectiveId: task.objectiveId } });
  return { ok: true, message: to ? `Escalated to ${agentBySlug(to)?.name ?? to}${person ? " and the responsible person was notified" : ""}.` : "Escalated to the CEO (the responsible person was notified)." };
}

/** Manager review of a finished delegated task. */
export async function review(task: TaskRow, input: { taskId: string; decision: string; note?: string }) {
  const child = await db.aITask.findFirst({ where: { id: String(input.taskId), parentTaskId: task.id } });
  if (!child) return { ok: false, message: "That task was not delegated by this task." };
  if (child.status !== "DONE") return { ok: false, message: `The task is ${child.status.toLowerCase()}, not done — only finished work can be reviewed.` };
  const note = String(input.note ?? "").trim().slice(0, 2000);
  if (input.decision === "accept") {
    await db.aITask.update({ where: { id: child.id }, data: { reviewStatus: "ACCEPTED", reviewNote: note || null } });
    await postMessage({ fromSlug: task.agentSlug, toSlug: child.agentSlug, kind: "REVIEW", subject: `Accepted: ${child.title}`, body: note || "Accepted.", taskId: child.id, objectiveId: task.objectiveId });
    await logEmployeeActivity({ agentSlug: task.agentSlug, taskId: task.id, objectiveId: task.objectiveId, type: "review.accepted", summary: `Accepted delegated work: ${child.title}` });
    return { ok: true, message: "Accepted." };
  }
  if (input.decision !== "revise") return { ok: false, message: "decision must be accept or revise." };
  if (!note) return { ok: false, message: "Say what must change." };
  if (child.revisions >= MAX_REVISIONS) return { ok: false, message: `This task was already revised ${MAX_REVISIONS} times. Accept it, do the rest yourself, or escalate.` };
  const r = await db.aITask.updateMany({ where: { id: child.id, status: "DONE" }, data: { status: "QUEUED", reviewStatus: "REVISION_REQUESTED", reviewNote: note, revisions: { increment: 1 }, runAfter: new Date(), completedAt: null, progress: 0, currentStep: "Revision requested", attempts: 0, instructions: `${child.instructions ?? ""}\n\nREVISION ${child.revisions + 1} requested by your manager: ${note}`.trim().slice(0, 8000) } });
  if (!r.count) return { ok: false, message: "The task changed; review it again." };
  await postMessage({ fromSlug: task.agentSlug, toSlug: child.agentSlug, kind: "REVISION_REQUEST", subject: `Revise: ${child.title}`, body: note, taskId: child.id, objectiveId: task.objectiveId });
  await logEmployeeActivity({ agentSlug: task.agentSlug, taskId: task.id, objectiveId: task.objectiveId, type: "review.revision", summary: `Requested a revision of "${child.title}": ${note.slice(0, 200)}` });
  return { ok: true, message: "Revision requested; the task is queued again and you will review it when it is done." };
}

/** Virtual tools for AI company work. Given to every task; they only act inside the org chart rules above. */
export function companyTools(task: TaskRow, createTask: CreateTaskFn, hasChildren: boolean): VirtualTool[] {
  const delegateSchema = { type: "object", properties: { assignee: { type: "string", description: "Slug of the AI employee (from your team list)." }, title: { type: "string", maxLength: 200 }, instructions: { type: "string", maxLength: 4000 }, priority: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "URGENT"] }, dependsOn: { type: "array", items: { type: "string" }, description: "Task ids (returned earlier) that must finish first." }, deadlineDays: { type: "integer", minimum: 1, maximum: 365 } }, required: ["assignee", "title", "instructions"] };
  const tools: VirtualTool[] = [
    { name: "delegateTask", description: "Assign work to someone in YOUR reporting line (direct or indirect report). Creates a real task for them; you resume and review when your delegated work is finished. Returns the new task id.", inputSchema: delegateSchema, run: async (raw) => { const r = await delegate(task, raw as never, "DELEGATION", createTask); return { content: r.message, isError: !r.ok }; } },
    { name: "requestHelp", description: "Ask a peer (same manager) or someone in your team to do a piece of work you need. Creates a real task for them.", inputSchema: delegateSchema, run: async (raw) => { const r = await delegate(task, raw as never, "HELP_REQUEST", createTask); return { content: r.message, isError: !r.ok }; } },
    { name: "handoffTask", description: "Hand the remaining work to a peer or team member better placed to finish it (include everything they need in instructions).", inputSchema: delegateSchema, run: async (raw) => { const r = await delegate(task, raw as never, "HANDOFF", createTask); return { content: r.message, isError: !r.ok }; } },
    { name: "escalate", description: "Escalate a decision or risk to your manager (or to the CEO with toCeo=true). Use for anything above your authority.", inputSchema: { type: "object", properties: { reason: { type: "string", maxLength: 2000 }, toCeo: { type: "boolean" } }, required: ["reason"] }, run: async (raw) => { const r = await escalate(task, raw as never, "ESCALATION"); return { content: r.message, isError: !r.ok }; } },
    { name: "reportBlocker", description: "Report that you cannot proceed (missing access, provider NOT CONNECTED, missing data). Notifies your manager and the responsible person. Never pretend the work was done.", inputSchema: { type: "object", properties: { reason: { type: "string", maxLength: 2000 } }, required: ["reason"] }, run: async (raw) => { const r = await escalate(task, raw as never, "BLOCKER"); return { content: r.message, isError: !r.ok }; } },
  ];
  if (hasChildren) tools.push({ name: "reviewDelegatedWork", description: "Review a finished task you delegated: decision accept, or revise with a note saying exactly what must change (max 2 revisions).", inputSchema: { type: "object", properties: { taskId: { type: "string" }, decision: { type: "string", enum: ["accept", "revise"] }, note: { type: "string", maxLength: 2000 } }, required: ["taskId", "decision"] }, run: async (raw) => { const r = await review(task, raw as never); return { content: r.message, isError: !r.ok }; } });
  return tools;
}

/** Team, inbox and delegated results for the task brief. */
export async function teamBrief(task: TaskRow): Promise<{ text: string; hasChildren: boolean; inboxIds: string[] }> {
  const managers = await orgManagers();
  const direct = [...managers].filter(([, m]) => m === task.agentSlug).map(([s]) => s);
  const peers = managers.get(task.agentSlug) ? [...managers].filter(([s, m]) => m === managers.get(task.agentSlug) && s !== task.agentSlug).map(([s]) => s) : [];
  const [children, inbox, objective] = await Promise.all([
    db.aITask.findMany({ where: { parentTaskId: task.id }, orderBy: { createdAt: "asc" }, select: { id: true, agentSlug: true, title: true, status: true, result: true, error: true, reviewStatus: true, revisions: true, blockedReason: true } }),
    db.aIWorkMessage.findMany({ where: { toSlug: task.agentSlug, status: "OPEN", ...(task.objectiveId ? { OR: [{ objectiveId: task.objectiveId }, { objectiveId: null }] } : {}) }, orderBy: { createdAt: "asc" }, take: 10 }),
    task.objectiveId ? db.aIObjective.findUnique({ where: { id: task.objectiveId }, select: { title: true, statement: true, targetMetric: true, targetValue: true, playbook: true } }) : null,
  ]);
  const name = (s: string) => `${s} (${agentBySlug(s)?.name ?? s})`;
  const parts: string[] = [];
  if (objective) parts.push(`## Company objective\n${objective.title}\n${objective.statement}${objective.targetMetric ? `\nTarget: ${objective.targetMetric} = ${objective.targetValue ?? "?"} (a target, not a guarantee)` : ""}`);
  parts.push(
    "## Your organisation",
    direct.length ? `Your direct reports (delegate with delegateTask): ${direct.map(name).join("; ")}.` : "You have no direct reports: do the work yourself; use requestHelp for peers.",
    peers.length ? `Peers (requestHelp / handoffTask): ${peers.map(name).join("; ")}.` : "",
    "Delegate only when someone else is better placed; give complete instructions. Never claim delegated work is done until its result is back. If a provider or permission is missing, call reportBlocker — never simulate the outcome.",
  );
  if (children.length) parts.push(`## Delegated work (review each finished task with reviewDelegatedWork)\n${children.map((c) => `- ${c.id} · ${name(c.agentSlug)} · ${c.title} · ${c.status}${c.reviewStatus ? ` · review ${c.reviewStatus}` : ""}${c.revisions ? ` · revised ${c.revisions}x` : ""}${c.status === "DONE" && c.result ? `\n  Result: ${c.result.replace(/\s+/g, " ").slice(0, 1200)}` : ""}${c.status === "FAILED" ? `\n  Failed: ${c.error ?? "unknown"}` : ""}${c.blockedReason ? `\n  Blocker: ${c.blockedReason}` : ""}`).join("\n")}`);
  if (inbox.length) parts.push(`## Messages to you\n${inbox.map((m) => `- [${m.kind}] from ${name(m.fromSlug)}: ${m.subject} — ${m.body.replace(/\s+/g, " ").slice(0, 500)}`).join("\n")}`);
  return { text: parts.filter(Boolean).join("\n\n"), hasChildren: children.length > 0, inboxIds: inbox.map((m) => m.id) };
}

export async function openChildren(taskId: string) {
  return db.aITask.count({ where: { parentTaskId: taskId, status: { notIn: [...SETTLED] } } });
}

/**
 * Called whenever a task reaches DONE / FAILED / CANCELLED: reports the result to the delegating manager, resumes the
 * manager's task once all of its delegated work is settled, and refreshes the objective.
 * Returns the id of a parent task that should be started now (the caller kicks it).
 */
export async function settleTask(taskId: string): Promise<string | null> {
  const t = await db.aITask.findUnique({ where: { id: taskId }, select: { id: true, status: true, title: true, agentSlug: true, parentTaskId: true, delegatedBySlug: true, objectiveId: true, result: true, error: true } });
  if (!t || !(SETTLED as readonly string[]).includes(t.status)) return null;
  let resume: string | null = null;
  // Dependents of a failed or cancelled task cannot run: fail them so their manager sees why.
  if (t.status !== "DONE") {
    const dependents = await db.aITask.findMany({ where: { dependsOn: { has: t.id }, status: "QUEUED" }, select: { id: true, agentSlug: true, title: true } });
    for (const d of dependents) {
      const r = await db.aITask.updateMany({ where: { id: d.id, status: "QUEUED" }, data: { status: "FAILED", error: `Dependency "${t.title}" ${t.status.toLowerCase()}.`, completedAt: new Date(), currentStep: null } });
      if (r.count) {
        await logEmployeeActivity({ agentSlug: d.agentSlug, taskId: d.id, objectiveId: t.objectiveId, type: "task.failed", summary: `Cannot start "${d.title}": dependency "${t.title}" ${t.status.toLowerCase()}` });
        const again = await settleTask(d.id);
        resume ??= again;
      }
    }
  }
  if (t.parentTaskId) {
    // (reviewStatus is null until reviewed; SQL "<>" alone would skip NULL rows)
    if (t.status === "DONE") await db.aITask.updateMany({ where: { id: t.id, OR: [{ reviewStatus: null }, { reviewStatus: { not: "ACCEPTED" } }] }, data: { reviewStatus: "PENDING_REVIEW" } });
    if (t.delegatedBySlug) await postMessage({ fromSlug: t.agentSlug, toSlug: t.delegatedBySlug, kind: t.status === "DONE" ? "RESULT" : "ESCALATION", subject: `${t.status === "DONE" ? "Done" : t.status === "FAILED" ? "Failed" : "Cancelled"}: ${t.title}`, body: (t.status === "DONE" ? t.result : t.error) ?? t.status, taskId: t.id, objectiveId: t.objectiveId });
    if (!(await openChildren(t.parentTaskId))) {
      const r = await db.aITask.updateMany({ where: { id: t.parentTaskId, status: "WAITING" }, data: { status: "QUEUED", runAfter: new Date(), currentStep: "Reviewing delegated work", attempts: 0 } });
      if (r.count) {
        const p = await db.aITask.findUnique({ where: { id: t.parentTaskId }, select: { agentSlug: true, objectiveId: true, title: true } });
        if (p) await logEmployeeActivity({ agentSlug: p.agentSlug, taskId: t.parentTaskId, objectiveId: p.objectiveId, type: "task.resumed", summary: `All delegated work for "${p.title}" is finished; resuming to review it` });
        resume = t.parentTaskId;
      }
    }
  }
  if (t.objectiveId) await refreshObjective(t.objectiveId);
  return resume;
}

/** Marks inbox messages handled once the employee has worked with them. */
export async function resolveMessages(ids: string[]) {
  if (ids.length) await db.aIWorkMessage.updateMany({ where: { id: { in: ids }, status: "OPEN" }, data: { status: "RESOLVED", resolvedAt: new Date() } });
}

/** Unmet dependencies of a task: "wait" while any is still open, "failed" when one can never finish. */
export async function dependencyState(dependsOn: string[]): Promise<"ready" | "wait" | { failed: string }> {
  if (!dependsOn.length) return "ready";
  const deps = await db.aITask.findMany({ where: { id: { in: dependsOn } }, select: { id: true, status: true, title: true } });
  const bad = deps.find((d) => d.status === "FAILED" || d.status === "CANCELLED");
  if (bad) return { failed: bad.title };
  if (deps.length < dependsOn.length) return { failed: "a task that no longer exists" };
  return deps.every((d) => d.status === "DONE") ? "ready" : "wait";
}
