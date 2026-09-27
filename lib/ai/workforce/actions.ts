"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import type { SessionUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { authorizeAccess } from "@/lib/os/guard";
import { fail, okThen, UserError, type ActionState } from "@/lib/os/action";
import { agentBySlug, AGENTS } from "@/lib/ai/catalog";
import { canRunAgent } from "@/lib/ai/agents";
import { getTool } from "@/lib/ai/tools";
import { logEmployeeActivity } from "./activity";
import { createEmployeeTask, kickTask } from "./engine";
import { ensureEmployees } from "./employees";
import { saveMemory } from "./memory";
import { MEMORY_KINDS, OPEN_TASK_STATUSES, SCHEDULES, TASK_PRIORITIES, type MemoryKind, type ScheduleTrigger } from "./profiles";
import { generateCeoBriefing, generateEndOfDayReports, generateMorningPlans } from "./reports";
import { pumpWorkforce } from "./scheduler";
import { executeRequest } from "@/lib/ai/router";

const agentSlug = z.string().refine((s) => AGENTS.some((a) => a.slug === s), "Choose an AI employee");

function assertCanDirect(user: SessionUser, slug: string) {
  const spec = agentBySlug(slug);
  if (!spec || !canRunAgent(user.role, spec)) throw new UserError(`You cannot assign work to the ${spec?.name ?? "selected employee"}.`);
}

/** "today" / "tomorrow" / yyyy-mm-dd (end of that day, UTC) / yyyy-mm-ddThh:mm (UTC). */
function parseDeadline(v: string | undefined): Date | null {
  if (!v) return null;
  const now = new Date();
  if (v === "today" || v === "tomorrow") return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + (v === "tomorrow" ? 1 : 0), 23, 59));
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T23:59:00Z` : v.length === 16 ? `${v}:00Z` : v);
  if (Number.isNaN(d.getTime())) throw new UserError("Invalid deadline.");
  return d;
}

const taskSchema = z.object({
  agent: agentSlug,
  title: z.string().trim().min(3, "Describe the task").max(200),
  instructions: z.string().trim().max(6000).optional(),
  priority: z.enum(TASK_PRIORITIES).default("MEDIUM"),
  deadline: z.string().trim().max(20).optional(),
  runAfter: z.string().trim().max(20).optional(),
});

/** ASSIGN TASK: the AI employee receives the task and starts on it immediately (or at the scheduled time). */
export async function assignTaskAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("ai:execute", "AI_WORKFORCE");
    const d = taskSchema.parse({ agent: form.get("agent"), title: form.get("title"), instructions: form.get("instructions") || undefined, priority: form.get("priority") || undefined, deadline: form.get("deadline") || undefined, runAfter: form.get("runAfter") || undefined });
    assertCanDirect(user, d.agent);
    await ensureEmployees();
    const runAfter = d.runAfter ? parseDeadline(d.runAfter) ?? new Date() : new Date();
    const task = await createEmployeeTask({ agentSlug: d.agent, title: d.title, instructions: d.instructions ?? null, priority: d.priority, deadline: parseDeadline(d.deadline), kind: "TASK", requestedById: user.id, runAfter });
    await audit({ userId: user.id, action: "ai.task.assigned", entity: "AITask", entityId: task.id, metadata: { agent: d.agent, priority: d.priority } });
    return okThen(`/admin/ai/tasks/${task.id}`, `Task assigned to ${agentBySlug(d.agent)!.name.replace(/^AI\s+/, "")}.`);
  } catch (e) {
    return fail(e, "workforce");
  }
}

const instructionSchema = z.object({ agent: agentSlug, instruction: z.string().trim().min(5, "Write the instruction").max(4000), priority: z.enum(TASK_PRIORITIES).default("MEDIUM") });

/**
 * ASSIGN INSTRUCTION goes through the global execution router like every other request: a question is answered on the
 * spot, a simple change is made now, and only long or multi-step work becomes a task the employee reports on.
 */
export async function assignInstructionAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("ai:execute", "AI_WORKFORCE");
    const d = instructionSchema.parse({ agent: form.get("agent"), instruction: form.get("instruction"), priority: form.get("priority") || undefined });
    assertCanDirect(user, d.agent);
    await ensureEmployees();
    const r = await executeRequest({ user, text: d.instruction, channel: "instruction", agentSlug: d.agent, priority: d.priority });
    const who = agentBySlug(d.agent)!.name.replace(/^AI\s+/, "");
    if (r.taskId) {
      await audit({ userId: user.id, action: "ai.instruction.assigned", entity: "AITask", entityId: r.taskId, metadata: { agent: d.agent, route: r.cls } });
      return { ok: `Instruction assigned to ${who}. Follow its progress on the task board.`, redirect: `/admin/ai/tasks/${r.taskId}` };
    }
    if (r.status === "BLOCKED" && !r.executionId) throw new UserError(r.text);
    const done = r.cls === "INSTANT_READ" ? "answered it now" : r.cls === "CLARIFICATION_REQUIRED" ? "needs one detail from you" : r.status === "AWAITING_APPROVAL" ? "prepared it; it is waiting for approval" : "did it now";
    return { ok: `${who} ${done}.`, redirect: r.executionId ? `/admin/ai/logs/${r.executionId}` : undefined };
  } catch (e) {
    return fail(e, "workforce");
  }
}

async function ownTask(id: string, user: SessionUser) {
  const t = await db.aITask.findUnique({ where: { id } });
  if (!t) throw new UserError("Task not found.");
  if (t.requestedById !== user.id && !can(user.role, "ai:configure")) throw new UserError("Only the person who assigned this task or an AI administrator can change it.");
  return t;
}

/** Pause / Resume / Cancel / Retry. A running task stops before its next step. */
export async function taskControlAction(id: string, op: "pause" | "resume" | "cancel" | "retry"): Promise<ActionState> {
  try {
    const user = await authorizeAccess("ai:execute", "AI_WORKFORCE");
    const t = await ownTask(id, user);
    const who = user.name;
    let summary = "";
    if (op === "pause") {
      const r = await db.aITask.updateMany({ where: { id, status: { in: ["QUEUED", "RUNNING"] } }, data: { status: "PAUSED", currentStep: "Paused" } });
      if (!r.count) throw new UserError("Only queued or running tasks can be paused.");
      summary = `Task paused by ${who}: ${t.title}`;
    } else if (op === "resume" || op === "retry") {
      const from = op === "resume" ? "PAUSED" : "FAILED";
      const r = await db.aITask.updateMany({ where: { id, status: from }, data: { status: "QUEUED", runAfter: new Date(), error: null, currentStep: op === "retry" ? "Retrying" : "Resuming", completedAt: null } });
      if (!r.count) throw new UserError(op === "resume" ? "Only paused tasks can be resumed." : "Only failed tasks can be retried.");
      summary = `Task ${op === "resume" ? "resumed" : "retried"} by ${who}: ${t.title}`;
      kickTask(id);
    } else {
      const r = await db.aITask.updateMany({ where: { id, status: { in: [...OPEN_TASK_STATUSES] } }, data: { status: "CANCELLED", currentStep: null, completedAt: new Date() } });
      if (!r.count) throw new UserError("This task is already finished.");
      // Actions the task queued must not run after the task was cancelled.
      await db.aIApproval.updateMany({ where: { taskId: id, status: "PENDING" }, data: { status: "EXPIRED", decisionNote: `Task cancelled by ${who}` } });
      summary = `Task cancelled by ${who}: ${t.title}`;
    }
    await logEmployeeActivity({ agentSlug: t.agentSlug, taskId: id, type: `task.${op === "retry" ? "retried" : op === "pause" ? "paused" : op === "resume" ? "resumed" : "cancelled"}`, summary, actorId: user.id });
    await audit({ userId: user.id, action: `ai.task.${op}`, entity: "AITask", entityId: id });
    revalidatePath("/admin/ai", "layout");
    return { ok: summary.split(":")[0] + "." };
  } catch (e) {
    return fail(e, "workforce");
  }
}

/** Reassign to another AI employee. Progress restarts under the new employee; queued approvals are withdrawn. */
export async function reassignTaskAction(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("ai:execute", "AI_WORKFORCE");
    const t = await ownTask(id, user);
    const to = agentSlug.parse(form.get("agent"));
    if (to === t.agentSlug) throw new UserError("The task is already assigned to that employee.");
    assertCanDirect(user, to);
    const r = await db.aITask.updateMany({ where: { id, status: { in: [...OPEN_TASK_STATUSES, "FAILED"] } }, data: { agentSlug: to, reassignedFrom: t.agentSlug, status: "QUEUED", runAfter: new Date(), progress: 0, subtasks: [], currentStep: "Reassigned", error: null, completedAt: null } });
    if (!r.count) throw new UserError("Finished tasks cannot be reassigned.");
    await db.aIApproval.updateMany({ where: { taskId: id, status: "PENDING" }, data: { status: "EXPIRED", decisionNote: `Task reassigned by ${user.name}` } });
    const toName = agentBySlug(to)!.name.replace(/^AI\s+/, "");
    await logEmployeeActivity({ agentSlug: t.agentSlug, taskId: id, type: "task.reassigned", summary: `Task reassigned to ${toName} by ${user.name}: ${t.title}`, actorId: user.id });
    await logEmployeeActivity({ agentSlug: to, taskId: id, type: "task.assigned", summary: `Task reassigned from ${agentBySlug(t.agentSlug)?.name.replace(/^AI\s+/, "") ?? t.agentSlug} by ${user.name}: ${t.title}`, actorId: user.id });
    await audit({ userId: user.id, action: "ai.task.reassigned", entity: "AITask", entityId: id, metadata: { from: t.agentSlug, to } });
    kickTask(id);
    return okThen(`/admin/ai/tasks/${id}`, `Reassigned to ${toName}.`);
  } catch (e) {
    return fail(e, "workforce");
  }
}

const profileSchema = z.object({
  personaName: z.string().trim().max(60),
  jobTitle: z.string().trim().min(2, "Required").max(120),
  department: z.string().trim().min(2, "Required").max(80),
  reportsToSlug: z.string().trim().max(40),
  managerUserId: z.string().trim().max(40),
  responsibilities: z.string().max(3000),
});

export async function updateEmployeeProfileAction(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("ai:configure", "AI_WORKFORCE");
    agentSlug.parse(slug);
    await ensureEmployees();
    const d = profileSchema.parse({ personaName: String(form.get("personaName") ?? ""), jobTitle: form.get("jobTitle"), department: form.get("department"), reportsToSlug: String(form.get("reportsToSlug") ?? ""), managerUserId: String(form.get("managerUserId") ?? ""), responsibilities: String(form.get("responsibilities") ?? "") });
    if (d.reportsToSlug && (d.reportsToSlug === slug || !agentBySlug(d.reportsToSlug))) throw new UserError("Choose a different manager.");
    const manager = d.managerUserId ? await db.user.findFirst({ where: { id: d.managerUserId, active: true }, select: { id: true } }) : null;
    await db.aIAgent.update({ where: { slug }, data: { personaName: d.personaName || null, jobTitle: d.jobTitle, department: d.department, reportsToSlug: d.reportsToSlug || null, managerUserId: manager?.id ?? null, responsibilities: d.responsibilities.split("\n").map((s) => s.replace(/^[-*•]\s*/, "").trim()).filter(Boolean).slice(0, 20) } });
    await audit({ userId: user.id, action: "ai.employee.updated", entity: "AIAgent", metadata: { slug } });
    return okThen(`/admin/ai/employees/${slug}?tab=settings`, "Profile saved.");
  } catch (e) {
    return fail(e, "workforce");
  }
}

/** Clock an employee in or out. Clocked-out employees take no new work; running work finishes. */
export async function setAvailabilityAction(slug: string, available: boolean): Promise<ActionState> {
  try {
    const user = await authorizeAccess("ai:configure", "AI_WORKFORCE");
    agentSlug.parse(slug);
    await ensureEmployees();
    await db.aIAgent.update({ where: { slug }, data: { available } });
    await logEmployeeActivity({ agentSlug: slug, type: available ? "employee.online" : "employee.offline", summary: `${available ? "Clocked in" : "Clocked out"} by ${user.name}`, actorId: user.id });
    await audit({ userId: user.id, action: available ? "ai.employee.online" : "ai.employee.offline", entity: "AIAgent", metadata: { slug } });
    revalidatePath("/admin/ai", "layout");
    return { ok: available ? "Employee is online." : "Employee is offline." };
  } catch (e) {
    return fail(e, "workforce");
  }
}

const goalSchema = z.object({ label: z.string().trim().min(2, "Required").max(80), metric: z.string().trim().max(60), target: z.coerce.number().int().min(1).max(100_000), period: z.enum(["DAILY", "WEEKLY", "MONTHLY"]) });

export async function addGoalAction(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("ai:configure", "AI_WORKFORCE");
    const spec = agentBySlug(slug);
    if (!spec) throw new UserError("Unknown employee.");
    const d = goalSchema.parse({ label: form.get("label"), metric: form.get("metric"), target: form.get("target"), period: form.get("period") });
    const ok = d.metric === "tasks_completed" || (d.metric.startsWith("actions:") && spec.tools.includes(d.metric.slice(8)) && getTool(d.metric.slice(8))?.kind === "write");
    if (!ok) throw new UserError("Choose a metric this employee can be measured on.");
    await db.aIGoal.create({ data: { agentSlug: slug, ...d } });
    await audit({ userId: user.id, action: "ai.goal.created", metadata: { slug, ...d } });
    return okThen(`/admin/ai/employees/${slug}?tab=goals`, "Goal added.");
  } catch (e) {
    return fail(e, "workforce");
  }
}

export async function deleteGoalAction(id: string): Promise<ActionState> {
  try {
    const user = await authorizeAccess("ai:configure", "AI_WORKFORCE");
    const g = await db.aIGoal.update({ where: { id }, data: { active: false } });
    await audit({ userId: user.id, action: "ai.goal.removed", metadata: { id, slug: g.agentSlug } });
    revalidatePath(`/admin/ai/employees/${g.agentSlug}`);
    return { ok: "Goal removed." };
  } catch (e) {
    return fail(e, "workforce");
  }
}

const memorySchema = z.object({ kind: z.enum(Object.keys(MEMORY_KINDS) as [MemoryKind, ...MemoryKind[]]), title: z.string().trim().min(2, "Required").max(200), content: z.string().trim().min(2, "Required").max(4000), shared: z.boolean(), pinned: z.boolean() });

export async function addMemoryAction(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("ai:configure", "AI_WORKFORCE");
    agentSlug.parse(slug);
    const d = memorySchema.parse({ kind: form.get("kind"), title: form.get("title"), content: form.get("content"), shared: form.get("shared") === "on", pinned: form.get("pinned") === "on" });
    const m = await saveMemory({ agentSlug: slug, ...d, createdById: user.id });
    await logEmployeeActivity({ agentSlug: slug, type: "memory.saved", summary: `${user.name} added to memory: ${d.title}`, actorId: user.id });
    await audit({ userId: user.id, action: "ai.memory.created", entity: "AIEmployeeMemory", entityId: m.id, metadata: { slug, kind: d.kind, shared: m.shared } });
    return okThen(`/admin/ai/employees/${slug}?tab=memory`, "Saved to memory.");
  } catch (e) {
    return fail(e, "workforce");
  }
}

export async function deleteMemoryAction(id: string): Promise<ActionState> {
  try {
    const user = await authorizeAccess("ai:configure", "AI_WORKFORCE");
    const m = await db.aIEmployeeMemory.delete({ where: { id } });
    await audit({ userId: user.id, action: "ai.memory.deleted", entity: "AIEmployeeMemory", entityId: id, metadata: { slug: m.agentSlug } });
    revalidatePath(`/admin/ai/employees/${m.agentSlug}`);
    return { ok: "Memory deleted." };
  } catch (e) {
    return fail(e, "workforce");
  }
}

const recurringSchema = z.object({ schedule: z.enum(Object.keys(SCHEDULES) as [ScheduleTrigger, ...ScheduleTrigger[]]), name: z.string().trim().min(3, "Required").max(120), instruction: z.string().trim().min(5, "Describe the responsibility").max(2000) });

/** Recurring responsibilities are ordinary Automations: a schedule trigger with an AI employee action. */
export async function addRecurringAction(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("automations:manage", "AUTOMATIONS");
    if (!can(user.role, "ai:configure")) throw new UserError("You need AI configuration permission.");
    assertCanDirect(user, slug);
    const d = recurringSchema.parse({ schedule: form.get("schedule"), name: form.get("name"), instruction: form.get("instruction") });
    const a = await db.automation.create({ data: { name: d.name, description: `${SCHEDULES[d.schedule]}: ${agentBySlug(slug)!.name}`, trigger: d.schedule, conditions: [], actions: [{ type: "AI_AGENT", agent: slug, instruction: d.instruction }], enabled: true, createdById: user.id } });
    await logEmployeeActivity({ agentSlug: slug, type: "responsibility.added", summary: `New recurring responsibility (${SCHEDULES[d.schedule].toLowerCase()}): ${d.name}`, actorId: user.id });
    await audit({ userId: user.id, action: "automation.created", entity: "Automation", entityId: a.id, metadata: { slug, schedule: d.schedule } });
    return okThen(`/admin/ai/employees/${slug}?tab=tasks`, "Recurring responsibility added.");
  } catch (e) {
    return fail(e, "workforce");
  }
}

export async function generateReportsAction(kind: "briefing" | "morning" | "eod"): Promise<ActionState> {
  try {
    const user = await authorizeAccess(kind === "briefing" ? "executive:view" : "ai:configure", "AI_WORKFORCE");
    const n = kind === "briefing" ? (await generateCeoBriefing(), 1) : kind === "morning" ? await generateMorningPlans() : await generateEndOfDayReports();
    await audit({ userId: user.id, action: `ai.reports.${kind}`, metadata: { count: n } });
    revalidatePath("/admin/ai", "layout");
    return { ok: kind === "briefing" ? "Briefing refreshed from live data." : `${n} report${n === 1 ? "" : "s"} generated.` };
  } catch (e) {
    return fail(e, "workforce");
  }
}

export async function runWorkforceNowAction(): Promise<ActionState> {
  try {
    const user = await authorizeAccess("ai:configure", "AI_WORKFORCE");
    const r = await pumpWorkforce();
    await audit({ userId: user.id, action: "ai.workforce.pump", metadata: { ...r } });
    revalidatePath("/admin/ai", "layout");
    return { ok: `Scheduler ran: ${r.fired.length} schedule${r.fired.length === 1 ? "" : "s"} fired, ${r.tasks} task${r.tasks === 1 ? "" : "s"} processed.` };
  } catch (e) {
    return fail(e, "workforce");
  }
}
