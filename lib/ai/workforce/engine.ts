import "server-only";
import { assertAIWorkforcePermission, checkAIWorkforcePermission, workforceHalted } from "@/lib/ai/control";
import { after } from "next/server";
import { db } from "@/lib/db/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { RoleName } from "@/lib/auth/permissions";
import type { SessionUser } from "@/lib/auth/session";
import { notify } from "@/lib/os/notify";
import { agentBySlug } from "@/lib/ai/catalog";
import { canRunAgent } from "@/lib/ai/agents";
import { getProvider, type AIProvider } from "@/lib/ai/provider";
import { runAgent, SYSTEM_USER, type EntityRef, type VirtualTool } from "@/lib/ai/runner";
import { logEmployeeActivity, toolSummary } from "./activity";
import { memoryPrompt, saveMemory } from "./memory";
import { parseSubtasks, progressOf, TASK_KINDS, type Subtask } from "./profiles";

const ENTITIES = ["Lead", "Deal", "Project", "Invoice", "Ticket", "Client"] as const;
const json = (v: unknown) => JSON.parse(JSON.stringify(v ?? null)) as Prisma.InputJsonValue;
const taskHref = (id: string) => `/admin/ai/tasks/${id}`;

export interface NewTask {
  agentSlug: string;
  title: string;
  instructions?: string | null;
  priority?: string;
  deadline?: Date | null;
  kind?: keyof typeof TASK_KINDS;
  requestedById?: string | null;
  automationId?: string | null;
  source?: string;
  runAfter?: Date;
  entity?: string | null;
  entityId?: string | null;
}

/** Assigns work to an AI employee: creates the task, records it on the timeline and starts it when it is due. */
export async function createEmployeeTask(t: NewTask) {
  // AI Workforce Control Center: no new background work while it is stopped, paused or switched off.
  await assertAIWorkforcePermission({ kind: "background", agentSlug: t.agentSlug, channel: t.automationId ? "automation" : "task" }, t.requestedById);
  const runAfter = t.runAfter ?? new Date();
  const task = await db.aITask.create({
    data: {
      agentSlug: t.agentSlug,
      title: t.title.slice(0, 200),
      request: [t.title, t.instructions].filter(Boolean).join("\n\n").slice(0, 8000),
      instructions: t.instructions ?? null,
      priority: t.priority ?? "MEDIUM",
      deadline: t.deadline ?? null,
      kind: t.kind ?? "TASK",
      requestedById: t.requestedById ?? null,
      automationId: t.automationId ?? null,
      source: (t.source ?? (t.kind === "RECURRING" ? "automation" : "MANUAL")).slice(0, 120),
      runAfter,
      entity: t.entity ?? null,
      entityId: t.entityId ?? null,
    },
  });
  const by = t.requestedById ? (await db.user.findUnique({ where: { id: t.requestedById }, select: { name: true } }))?.name : null;
  await logEmployeeActivity({ agentSlug: t.agentSlug, taskId: task.id, type: "task.assigned", summary: `${t.kind === "INSTRUCTION" ? "Instruction received" : t.kind === "RECURRING" ? "Recurring responsibility started" : "Task assigned"}${by ? ` by ${by}` : ""}: ${task.title}`, actorId: t.requestedById ?? null, data: { priority: task.priority, deadline: task.deadline } });
  if (runAfter <= new Date()) kickTask(task.id);
  return task;
}

/** Runs the task after the current response is sent (falls back to inline outside a request). */
export function kickTask(id: string) {
  try {
    after(() => executeTask(id).catch((e) => console.error("[workforce] task failed", id, (e as Error).message)));
  } catch {
    void executeTask(id).catch((e) => console.error("[workforce] task failed", id, (e as Error).message));
  }
}

async function identityFor(task: { requestedById: string | null; automationId: string | null }): Promise<SessionUser> {
  const pick = async (id: string | null | undefined) => {
    if (!id) return null;
    const u = await db.user.findFirst({ where: { id, active: true }, select: { id: true, email: true, name: true, role: true } });
    return u ? { ...u, role: u.role as RoleName } : null;
  };
  const requester = await pick(task.requestedById);
  if (requester) return requester;
  // A recurring responsibility runs with the permissions of the person who set up its automation.
  if (task.automationId) {
    const creator = await pick((await db.automation.findUnique({ where: { id: task.automationId }, select: { createdById: true } }))?.createdById);
    if (creator) return creator;
  }
  return SYSTEM_USER;
}

function brief(task: { title: string; instructions: string | null; priority: string; deadline: Date | null; kind: string }, by: SessionUser, subtasks: Subtask[], memory: string) {
  const resumed = subtasks.length > 0;
  return [
    "## You are working on an assigned task",
    "You are a digital employee of Shivacha Technologies executing work assigned by your manager. This is not a chat: work the task end to end with your tools, report progress as you go, and finish with a written report.",
    `Task: ${task.title}`,
    `Type: ${TASK_KINDS[task.kind as keyof typeof TASK_KINDS] ?? task.kind} · Priority: ${task.priority}${task.deadline ? ` · Deadline: ${task.deadline.toISOString().slice(0, 16).replace("T", " ")} UTC` : ""}`,
    `Assigned by: ${by.id === SYSTEM_USER.id ? "an automated schedule (every change needs human approval)" : by.name}. You act with their permissions and never more.`,
    task.instructions ? `Instructions:\n${task.instructions}` : "",
    "Procedure:",
    resumed
      ? "1. This task was started before. Its plan is below — continue from the first step that is not done. Only call planTask if the plan must change."
      : "1. Understand the task, then call planTask once with 3–8 concrete subtasks in execution order.",
    "2. For each subtask call updateProgress(step, \"running\") when you start and updateProgress(step, \"done\", note) when it is finished. Notes carry real counts from tool results (e.g. \"found 18 companies\"). Several tools can be called in one turn.",
    "3. Use only your tools. If a tool fails, correct the input and retry once; if it still fails, mark the subtask \"failed\" with the reason and continue with what is still possible.",
    "4. Changes that need approval are queued automatically and do not happen until a person approves. Say so; never claim they were done.",
    "5. Call saveMemory only for something durable: a preference or instruction from your manager, a workflow that worked, or one that failed and why.",
    "6. When finished, call completeTask with a one-paragraph summary and key results (real numbers only), then write the final report: completed work, records affected (with /admin links), actions awaiting approval, blockers.",
    resumed ? `Current plan:\n${subtasks.map((s, i) => `${i + 1}. [${s.status}] ${s.title}${s.note ? ` — ${s.note}` : ""}`).join("\n")}` : "",
    memory,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Executes one AI employee task: claims it, plans, runs the employee's tool loop under the assigner's permissions with
 * live progress, routes risky actions to the Human Approval Center, and records the result, memory and timeline.
 */
export async function executeTask(id: string, opts: { provider?: AIProvider | null } = {}): Promise<"DONE" | "FAILED" | "AWAITING_APPROVAL" | "STOPPED" | "SKIPPED"> {
  const t = await db.aITask.findUnique({ where: { id } });
  if (!t || t.status !== "QUEUED" || t.runAfter > new Date()) return "SKIPPED";
  const employee = await db.aIAgent.findUnique({ where: { slug: t.agentSlug }, select: { enabled: true, available: true } });
  if (employee && (!employee.enabled || !employee.available)) return "SKIPPED";
  // Held (not failed) while the Control Center blocks background work; it runs once the workforce resumes.
  const gate = await checkAIWorkforcePermission({ kind: "background", agentSlug: t.agentSlug, channel: "task" });
  if (!gate.ok) {
    if (t.currentStep !== `On hold: ${gate.message}`) await db.aITask.updateMany({ where: { id, status: "QUEUED" }, data: { currentStep: `On hold: ${gate.message}` } });
    return "SKIPPED";
  }
  const claimed = await db.aITask.updateMany({ where: { id, status: "QUEUED" }, data: { status: "RUNNING", startedAt: t.startedAt ?? new Date(), attempts: { increment: 1 }, error: null, currentStep: t.currentStep ?? "Understanding the task" } });
  if (!claimed.count) return "SKIPPED";
  const slug = t.agentSlug;
  const name = agentBySlug(slug)?.name ?? slug;
  await logEmployeeActivity({ agentSlug: slug, taskId: id, type: "task.started", summary: t.attempts ? `Resumed task: ${t.title}` : `Started task: ${t.title}` });

  const fail = async (error: string) => {
    await db.aITask.updateMany({ where: { id, status: "RUNNING" }, data: { status: "FAILED", error: error.slice(0, 500), currentStep: null, completedAt: new Date() } });
    await logEmployeeActivity({ agentSlug: slug, taskId: id, type: "task.failed", summary: `Task failed: ${error.slice(0, 300)}` });
    if (t.requestedById) await notify({ type: "ai.task", title: `${name} could not complete "${t.title}"`.slice(0, 200), body: error.slice(0, 300), href: taskHref(id), userIds: [t.requestedById] });
    return "FAILED" as const;
  };

  const provider = opts.provider !== undefined ? opts.provider : getProvider();
  if (!provider) return fail("AI provider not connected (ANTHROPIC_API_KEY is not set).");
  const user = await identityFor(t);
  const spec = agentBySlug(slug);
  if (!spec) return fail(`Unknown AI employee "${slug}".`);
  if (user.id !== SYSTEM_USER.id && !canRunAgent(user.role, spec)) return fail(`${user.name} no longer has permission to direct the ${spec.name}.`);

  let subtasks = parseSubtasks(t.subtasks);
  let summary: { text: string; results: string[] } | null = null;
  const saveSubtasks = async (currentStep: string | null) => {
    await db.aITask.update({ where: { id }, data: { subtasks: json(subtasks), progress: progressOf(subtasks), currentStep } });
  };

  const tools: VirtualTool[] = [
    {
      name: "planTask",
      description: "Record your plan for this task: 3–8 subtasks in execution order. Call once at the start.",
      inputSchema: { type: "object", properties: { subtasks: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 10 } }, required: ["subtasks"] },
      run: async (raw) => {
        const list = Array.isArray((raw as { subtasks?: unknown }).subtasks) ? ((raw as { subtasks: unknown[] }).subtasks.map((s) => String(s).trim()).filter(Boolean).slice(0, 10)) : [];
        if (!list.length) return { content: "Provide at least one subtask.", isError: true };
        const keep = subtasks.filter((s) => s.status === "done");
        subtasks = [...keep, ...list.filter((title) => !keep.some((k) => k.title === title)).map((title) => ({ title: title.slice(0, 200), status: "pending" as const }))];
        await saveSubtasks(subtasks.find((s) => s.status !== "done")?.title ?? null);
        await logEmployeeActivity({ agentSlug: slug, taskId: id, type: "task.planned", summary: `Planned ${subtasks.length} steps: ${subtasks.map((s) => s.title).join(" → ")}`.slice(0, 500) });
        return { content: `Plan saved:\n${subtasks.map((s, i) => `${i + 1}. [${s.status}] ${s.title}`).join("\n")}` };
      },
    },
    {
      name: "updateProgress",
      description: "Report progress on a plan step (1-based). status: running | done | failed | skipped. note: what happened, with real counts.",
      inputSchema: { type: "object", properties: { step: { type: "integer", minimum: 1 }, status: { type: "string", enum: ["running", "done", "failed", "skipped"] }, note: { type: "string", maxLength: 500 } }, required: ["step", "status"] },
      run: async (raw) => {
        const r = raw as { step?: number; status?: Subtask["status"]; note?: string };
        const i = Number(r.step) - 1;
        if (!subtasks[i]) return { content: `No step ${r.step}. The plan has ${subtasks.length} steps${subtasks.length ? "" : " — call planTask first"}.`, isError: true };
        if (!r.status || !["running", "done", "failed", "skipped"].includes(r.status)) return { content: "Invalid status.", isError: true };
        subtasks[i] = { ...subtasks[i], status: r.status, note: r.note?.slice(0, 500) || subtasks[i].note };
        const running = subtasks.find((s) => s.status === "running");
        await saveSubtasks(running?.title ?? subtasks.find((s) => s.status === "pending")?.title ?? null);
        if (r.status !== "running") await logEmployeeActivity({ agentSlug: slug, taskId: id, type: `subtask.${r.status}`, summary: `${r.status === "done" ? "Completed" : r.status === "failed" ? "Failed" : "Skipped"}: ${subtasks[i].title}${r.note ? ` — ${r.note}` : ""}` });
        return { content: `Step ${i + 1} marked ${r.status}. Progress ${progressOf(subtasks)}%.` };
      },
    },
    {
      name: "completeTask",
      description: "Mark the task complete with a short summary and key results (real numbers only). Then write your final report.",
      inputSchema: { type: "object", properties: { summary: { type: "string", maxLength: 2000 }, results: { type: "array", items: { type: "string", maxLength: 200 }, maxItems: 12 } }, required: ["summary"] },
      run: async (raw) => {
        const r = raw as { summary?: string; results?: unknown[] };
        summary = { text: String(r.summary ?? "").slice(0, 2000), results: Array.isArray(r.results) ? r.results.map(String).slice(0, 12) : [] };
        return { content: "Recorded. Now write your final report." };
      },
    },
    {
      name: "saveMemory",
      description: "Save a durable memory to YOUR OWN memory: kind PREFERENCE (how your manager wants things done), WORKFLOW_SUCCESS, WORKFLOW_FAILURE or RECORD (a record worth remembering).",
      inputSchema: { type: "object", properties: { kind: { type: "string", enum: ["PREFERENCE", "WORKFLOW_SUCCESS", "WORKFLOW_FAILURE", "RECORD"] }, title: { type: "string", maxLength: 200 }, content: { type: "string", maxLength: 2000 }, entity: { type: "string" }, entityId: { type: "string" } }, required: ["kind", "title", "content"] },
      run: async (raw) => {
        const r = raw as { kind?: string; title?: string; content?: string; entity?: string; entityId?: string };
        if (!r.kind || !["PREFERENCE", "WORKFLOW_SUCCESS", "WORKFLOW_FAILURE", "RECORD"].includes(r.kind) || !r.title || !r.content) return { content: "kind, title and content are required.", isError: true };
        await saveMemory({ agentSlug: slug, kind: r.kind as "PREFERENCE", title: r.title, content: r.content, taskId: id, entity: r.entity?.slice(0, 40), entityId: r.entityId?.slice(0, 40) });
        await logEmployeeActivity({ agentSlug: slug, taskId: id, type: "memory.saved", summary: `Saved to memory: ${r.title.slice(0, 200)}` });
        return { content: "Saved to your memory." };
      },
    },
  ];

  const recordsAffected = new Set<string>();
  const context: EntityRef | null = t.entity && t.entityId && (ENTITIES as readonly string[]).includes(t.entity) ? { entity: t.entity as EntityRef["entity"], id: t.entityId } : null;
  let r: Awaited<ReturnType<typeof runAgent>>;
  try {
    r = await runAgent({
      agentSlug: slug,
      request: `Execute the assigned task "${t.title}". Follow the procedure in your instructions.`,
      user,
      trigger: "TASK",
      context,
      provider,
      task: {
        taskId: id,
        system: brief(t, user, subtasks, await memoryPrompt(slug)),
        tools,
        maxIterations: 24,
        requestTokens: Number(process.env.MAX_TASK_TOKENS) > 0 ? Number(process.env.MAX_TASK_TOKENS) : 400_000,
        shouldStop: async () => {
          const now = await db.aITask.findUnique({ where: { id }, select: { status: true, agentSlug: true } });
          if (!now || now.agentSlug !== slug) return "Task was reassigned.";
          return now.status === "RUNNING" ? null : `Task was ${now.status.toLowerCase().replace(/_/g, " ")}.`;
        },
        onTool: async (e) => {
          if (e.action?.status === "EXECUTED") e.records?.forEach((x) => recordsAffected.add(x));
          await logEmployeeActivity({ agentSlug: slug, taskId: id, type: e.action?.status === "EXECUTED" ? "action.executed" : e.action?.status === "PENDING_APPROVAL" ? "approval.requested" : e.ok ? "tool.used" : "tool.failed", summary: toolSummary(e.tool, e.ok, e), data: { tool: e.tool, ms: e.ms, records: e.records?.slice(0, 50), approvalId: e.action?.approvalId } });
        },
      },
    });
  } catch (e) {
    return fail((e as Error).message || "Execution error");
  }

  const current = await db.aITask.findUnique({ where: { id }, select: { status: true, agentSlug: true } });
  const exec = r.executionId ? await db.aIExecution.findUnique({ where: { id: r.executionId }, select: { toolsUsed: true, actionsExecuted: true } }) : null;
  const common = { executionId: r.executionId, toolsUsed: json(exec?.toolsUsed ?? []), recordsAffected: json([...recordsAffected].slice(0, 500)), result: r.text.slice(0, 50_000) };

  if (r.status === "CANCELLED" || !current || current.status !== "RUNNING" || current.agentSlug !== slug) {
    await db.aITask.update({ where: { id }, data: { ...common, currentStep: current?.status === "PAUSED" ? "Paused" : null } });
    await logEmployeeActivity({ agentSlug: slug, taskId: id, type: "task.stopped", summary: `Stopped working on "${t.title}" (${r.error ?? "stopped by a person"})` });
    return "STOPPED";
  }
  if (r.control && r.status === "BLOCKED") {
    // Stopped by the Control Center mid-run: put it back in the queue instead of failing it.
    await db.aITask.updateMany({ where: { id, status: "RUNNING" }, data: { ...common, status: "QUEUED", currentStep: `On hold: ${r.error ?? "AI workforce stopped"}` } });
    await logEmployeeActivity({ agentSlug: slug, taskId: id, type: "task.held", summary: `Put "${t.title}" on hold: ${r.error ?? "AI workforce stopped"}` });
    return "STOPPED";
  }
  if (r.status === "FAILED" || r.status === "BLOCKED") {
    await db.aITask.update({ where: { id }, data: common });
    await saveMemory({ agentSlug: slug, kind: "WORKFLOW_FAILURE", title: `Failed: ${t.title}`, content: `Error: ${r.error ?? "unknown"}. Tools used: ${r.toolsUsed.join(", ") || "none"}.`, taskId: id, expiresInDays: 90 });
    return fail(r.error ?? "The task could not be completed.");
  }

  const pendingApprovals = await db.aIApproval.count({ where: { taskId: id, status: "PENDING" } });
  const doneText = (summary as { text: string; results: string[] } | null)?.text || r.text.split("\n").find((l) => l.trim())?.slice(0, 300) || "Task completed.";
  if (pendingApprovals) {
    await db.aITask.updateMany({ where: { id, status: "RUNNING" }, data: { ...common, status: "AWAITING_APPROVAL", currentStep: `Waiting for approval (${pendingApprovals})` } });
    await logEmployeeActivity({ agentSlug: slug, taskId: id, type: "task.awaiting_approval", summary: `Finished its work on "${t.title}"; ${pendingApprovals} action${pendingApprovals === 1 ? "" : "s"} waiting for approval` });
    if (t.requestedById) await notify({ type: "ai.task", title: `${name} needs your approval to finish "${t.title}"`.slice(0, 200), href: taskHref(id), userIds: [t.requestedById] });
    return "AWAITING_APPROVAL";
  }
  await db.aITask.updateMany({ where: { id, status: "RUNNING" }, data: { ...common, status: "DONE", progress: 100, currentStep: null, completedAt: new Date() } });
  await logEmployeeActivity({ agentSlug: slug, taskId: id, type: "task.completed", summary: `Task completed: ${t.title}${recordsAffected.size ? ` · ${recordsAffected.size} record${recordsAffected.size === 1 ? "" : "s"} changed` : ""}`, data: { summary: doneText, results: (summary as { results: string[] } | null)?.results ?? [] } });
  await saveMemory({ agentSlug: slug, kind: "TASK", title: t.title, content: doneText, taskId: id, expiresInDays: 180 });
  if (t.requestedById) await notify({ type: "ai.task", title: `${name} completed "${t.title}"`.slice(0, 200), body: doneText.slice(0, 300), href: taskHref(id), userIds: [t.requestedById] });
  return "DONE";
}

/** Called after a person decides an approval: closes the task once nothing is pending and records the decision. */
export async function onApprovalDecided(a: { id: string; taskId: string | null; agentSlug: string; tool: string; action: string }, outcome: "EXECUTED" | "REJECTED" | "FAILED", actorId: string, records?: string[]) {
  await logEmployeeActivity({ agentSlug: a.agentSlug, taskId: a.taskId, type: outcome === "EXECUTED" ? "action.executed" : outcome === "REJECTED" ? "approval.rejected" : "action.failed", summary: `${outcome === "EXECUTED" ? "Approved and executed" : outcome === "REJECTED" ? "Rejected" : "Approved but failed"}: ${a.action}`, actorId, data: { tool: a.tool, approvalId: a.id, records } });
  if (!a.taskId) return;
  if (records?.length && outcome === "EXECUTED") {
    const t = await db.aITask.findUnique({ where: { id: a.taskId }, select: { recordsAffected: true } });
    const list = Array.isArray(t?.recordsAffected) ? (t!.recordsAffected as string[]) : [];
    await db.aITask.update({ where: { id: a.taskId }, data: { recordsAffected: json([...new Set([...list, ...records])].slice(0, 500)) } });
  }
  const pending = await db.aIApproval.count({ where: { taskId: a.taskId, status: "PENDING" } });
  if (pending) {
    await db.aITask.updateMany({ where: { id: a.taskId, status: "AWAITING_APPROVAL" }, data: { currentStep: `Waiting for approval (${pending})` } });
    return;
  }
  const closed = await db.aITask.updateMany({ where: { id: a.taskId, status: "AWAITING_APPROVAL" }, data: { status: "DONE", progress: 100, currentStep: null, completedAt: new Date() } });
  if (closed.count) {
    const t = await db.aITask.findUnique({ where: { id: a.taskId }, select: { title: true } });
    await logEmployeeActivity({ agentSlug: a.agentSlug, taskId: a.taskId, type: "task.completed", summary: `Task completed after approvals: ${t?.title ?? ""}` });
  }
}

/** Runs due queued tasks and recovers tasks interrupted mid-run (e.g. a serverless timeout). */
export async function processDueTasks(limit = 5): Promise<number> {
  if (await workforceHalted()) return 0;
  const stale = await db.aITask.findMany({ where: { status: "RUNNING", updatedAt: { lt: new Date(Date.now() - 15 * 60_000) } }, select: { id: true, attempts: true, agentSlug: true, title: true } });
  for (const s of stale) {
    const retry = s.attempts < 2;
    const r = await db.aITask.updateMany({ where: { id: s.id, status: "RUNNING" }, data: retry ? { status: "QUEUED", currentStep: "Resuming after an interruption" } : { status: "FAILED", error: "Execution was interrupted twice (time limit). Break the task into smaller tasks.", completedAt: new Date(), currentStep: null } });
    if (r.count) await logEmployeeActivity({ agentSlug: s.agentSlug, taskId: s.id, type: retry ? "task.requeued" : "task.failed", summary: retry ? `Execution of "${s.title}" was interrupted; it will resume` : `Task failed after two interruptions: ${s.title}` });
  }
  const unavailable = (await db.aIAgent.findMany({ where: { OR: [{ enabled: false }, { available: false }] }, select: { slug: true } })).map((a) => a.slug);
  const due = await db.aITask.findMany({ where: { status: "QUEUED", runAfter: { lte: new Date() }, agentSlug: { notIn: unavailable } }, orderBy: [{ createdAt: "asc" }], take: limit * 3, select: { id: true, priority: true } });
  const rank: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  let n = 0;
  for (const d of due.sort((a, b) => (rank[a.priority] ?? 2) - (rank[b.priority] ?? 2)).slice(0, limit)) if ((await executeTask(d.id)) !== "SKIPPED") n++;
  return n;
}
