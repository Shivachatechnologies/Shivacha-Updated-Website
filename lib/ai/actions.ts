"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { audit } from "@/lib/audit";
import { authorizeAccess } from "@/lib/os/guard";
import { fail, okThen, UserError, type ActionState } from "@/lib/os/action";
import { agentBySlug, ALL_AGENTS } from "./catalog";
import { canRunAgent, ensureAgents } from "./agents";
import { decideApproval } from "./approvals";
import { generateBriefing } from "./briefing";
import { generateInsights } from "./insights";
import { MODEL_OPTIONS } from "./provider";
import { type EntityRef, type ProposedAction } from "./runner";
import { executeRequest, type ExecutionClass } from "./router";
import { processTasks } from "./tasks";

export type AskState =
  | {
      error?: string;
      result?: { executionId: string | null; agent: string; status: string; text: string; provider: string; drafts: { tool: string; draft: unknown }[]; actions: ProposedAction[]; toolsUsed: string[]; route: ExecutionClass; taskId?: string };
      conversationId?: string | null;
      question?: string;
    }
  | undefined;

const askSchema = z.object({
  q: z.string().trim().min(2, "Ask a question").max(4000),
  agent: z.string().trim().max(40).optional(),
  conversationId: z.string().trim().max(40).optional(),
  entity: z.enum(["Lead", "Deal", "Project", "Invoice", "Ticket", "Client"]).optional(),
  entityId: z.string().trim().max(40).optional(),
});

export async function askAIAction(_: AskState, form: FormData): Promise<AskState> {
  try {
    const user = await authorizeAccess("ai:execute", "AI_WORKFORCE");
    const d = askSchema.parse({ q: form.get("q"), agent: form.get("agent") || undefined, conversationId: form.get("conversationId") || undefined, entity: form.get("entity") || undefined, entityId: form.get("entityId") || undefined });
    const context: EntityRef | null = d.entity && d.entityId ? { entity: d.entity, id: d.entityId } : null;
    const r = await executeRequest({ user, text: d.q, channel: "chat", agentSlug: d.agent && d.agent !== "auto" ? d.agent : null, context, conversationId: d.conversationId });
    return { result: { executionId: r.executionId, agent: r.agent, status: r.status, text: r.text, provider: r.provider, drafts: r.drafts, actions: r.actions, toolsUsed: r.toolsUsed, route: r.cls, taskId: r.taskId }, conversationId: r.conversationId, question: d.q };
  } catch (e) {
    return { error: fail(e, "ai")?.error };
  }
}

export async function decideApprovalAction(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("ai:approve", "AI_WORKFORCE");
    const decision = form.get("decision") === "REJECT" ? "REJECT" : "APPROVE";
    const note = String(form.get("note") ?? "").trim().slice(0, 1000) || null;
    let editedInput: unknown;
    if (form.get("edit") === "1") {
      const raw = String(form.get("input") ?? "");
      try {
        editedInput = JSON.parse(raw);
      } catch {
        throw new UserError("The edited action input is not valid JSON.");
      }
      // Email approvals are edited through dedicated fields.
      for (const k of ["to", "subject", "body"]) if (form.has(`f_${k}`) && editedInput && typeof editedInput === "object") (editedInput as Record<string, unknown>)[k] = String(form.get(`f_${k}`) ?? "");
    }
    const r = await decideApproval(id, user, { decision, editedInput, note });
    return okThen(`/admin/ai/approvals/${id}`, r.status === "REJECTED" ? "Rejected." : "Approved and executed.");
  } catch (e) {
    return fail(e, "ai");
  }
}

const agentSchema = z.object({
  enabled: z.boolean(),
  mode: z.enum(["OBSERVE", "ASSIST", "AUTONOMOUS"]),
  model: z.string().trim().max(60).refine((v) => !v || MODEL_OPTIONS.includes(v), "Unknown model"),
  dailyCostLimit: z.string().trim().refine((v) => !v || /^\d{1,6}(\.\d{1,4})?$/.test(v), "Enter a USD amount"),
  systemPrompt: z.string().trim().max(8000),
  approvalActions: z.array(z.string()),
});

/** Agent builder. AUTONOMOUS mode can only be switched on by a Super Admin. */
export async function updateAgentAction(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("ai:configure", "AI_WORKFORCE");
    const spec = agentBySlug(slug);
    if (!spec) throw new UserError("Unknown agent.");
    await ensureAgents();
    const d = agentSchema.parse({ enabled: form.get("enabled") === "on", mode: form.get("mode"), model: String(form.get("model") ?? ""), dailyCostLimit: String(form.get("dailyCostLimit") ?? ""), systemPrompt: String(form.get("systemPrompt") ?? ""), approvalActions: form.getAll("approvalActions").map(String).filter((t) => spec.tools.includes(t)) });
    const row = await db.aIAgent.findUniqueOrThrow({ where: { slug }, select: { id: true, mode: true } });
    if (d.mode === "AUTONOMOUS" && row.mode !== "AUTONOMOUS" && user.role !== "SUPER_ADMIN") throw new UserError("Only a Super Admin can enable AUTONOMOUS mode.");
    const enabledTools = new Set(form.getAll("tools").map(String));
    const autoTools = new Set(form.getAll("autonomous").map(String));
    await db.$transaction([
      db.aIAgent.update({ where: { slug }, data: { enabled: d.enabled, mode: d.mode, model: d.model || null, dailyCostLimit: d.dailyCostLimit || null, systemPrompt: d.systemPrompt || null, approvalActions: d.approvalActions } }),
      ...spec.tools.map((tool) => db.aIAgentTool.upsert({ where: { agentId_tool: { agentId: row.id, tool } }, update: { enabled: enabledTools.has(tool), autonomousAllowed: enabledTools.has(tool) && autoTools.has(tool) }, create: { agentId: row.id, tool, enabled: enabledTools.has(tool), autonomousAllowed: enabledTools.has(tool) && autoTools.has(tool) } })),
    ]);
    await audit({ userId: user.id, action: "ai.agent.updated", entity: "AIAgent", entityId: row.id, metadata: { slug, mode: d.mode, enabled: d.enabled, tools: [...enabledTools], autonomous: [...autoTools] } });
    return okThen(`/admin/ai/agents/${slug}`, "Agent saved.");
  } catch (e) {
    return fail(e, "ai");
  }
}

export async function setInsightStatusAction(id: string, status: "DISMISSED" | "OPEN") {
  const user = await authorizeAccess("ai:view", "AI_WORKFORCE");
  const r = await db.aIRecommendation.findUnique({ where: { id }, select: { permission: true } });
  if (!r || !can(user.role, r.permission as Parameters<typeof can>[1])) return;
  await db.aIRecommendation.update({ where: { id }, data: { status } });
  await audit({ userId: user.id, action: `ai.insight.${status.toLowerCase()}`, entity: "AIRecommendation", entityId: id });
  revalidatePath("/admin/ai/insights");
}

export async function refreshInsightsAction(): Promise<ActionState> {
  try {
    const user = await authorizeAccess("ai:execute", "AI_WORKFORCE");
    const n = await generateInsights();
    await audit({ userId: user.id, action: "ai.insights.refreshed", metadata: { count: n } });
    return okThen("/admin/ai/insights", `Insights refreshed (${n} active).`);
  } catch (e) {
    return fail(e, "ai");
  }
}

export async function generateBriefingAction(): Promise<ActionState> {
  try {
    const user = await authorizeAccess("executive:view", "AI_WORKFORCE");
    if (!can(user.role, "ai:execute")) throw new UserError("You do not have permission to run AI agents.");
    await generateInsights();
    const n = await generateBriefing({ force: true, actorId: user.id });
    return okThen("/admin/ai", n ? "Briefing generated." : "The briefing could not be generated — see AI Logs.");
  } catch (e) {
    return fail(e, "ai");
  }
}

const taskSchema = z.object({ agent: z.string().refine((s) => ALL_AGENTS.some((a) => a.slug === s), "Choose an agent"), title: z.string().trim().min(1, "Required").max(200), request: z.string().trim().min(3, "Describe the task").max(4000), runAfter: z.string().trim().optional() });

export async function queueTaskAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("ai:execute", "AI_WORKFORCE");
    const d = taskSchema.parse({ agent: form.get("agent"), title: form.get("title"), request: form.get("request"), runAfter: form.get("runAfter") || undefined });
    if (!canRunAgent(user.role, agentBySlug(d.agent)!)) throw new UserError("You cannot use that agent.");
    const runAfter = d.runAfter ? new Date(d.runAfter.length === 16 ? `${d.runAfter}:00Z` : d.runAfter) : new Date();
    if (Number.isNaN(runAfter.getTime())) throw new UserError("Invalid run time.");
    await db.aITask.create({ data: { agentSlug: d.agent, title: d.title, request: d.request, requestedById: user.id, source: "MANUAL", runAfter } });
    await audit({ userId: user.id, action: "ai.task.queued", metadata: { agent: d.agent, title: d.title } });
    return okThen("/admin/ai/tasks", "Task queued.");
  } catch (e) {
    return fail(e, "ai");
  }
}

export async function runQueuedTasksAction(): Promise<ActionState> {
  try {
    const user = await authorizeAccess("ai:configure", "AI_WORKFORCE");
    const n = await processTasks(5);
    await audit({ userId: user.id, action: "ai.tasks.run", metadata: { count: n } });
    return okThen("/admin/ai/tasks", n ? `Processed ${n} task(s).` : "No tasks were due.");
  } catch (e) {
    return fail(e, "ai");
  }
}

export async function cancelTaskAction(id: string) {
  const user = await authorizeAccess("ai:execute", "AI_WORKFORCE");
  const t = await db.aITask.findUnique({ where: { id }, select: { requestedById: true } });
  if (!t || (t.requestedById !== user.id && !can(user.role, "ai:configure"))) return;
  await db.aITask.updateMany({ where: { id, status: "QUEUED" }, data: { status: "CANCELLED" } });
  await audit({ userId: user.id, action: "ai.task.cancelled", entity: "AITask", entityId: id });
  revalidatePath("/admin/ai/tasks");
}
