import "server-only";
import { db } from "@/lib/db/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { can, PERMISSIONS, type Permission } from "@/lib/auth/permissions";
import type { SessionUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { UserError } from "@/lib/os/action";
import { getTool, toolPermissions } from "./tools";
import { checkAIWorkforcePermission, logBlocked } from "./control";
import { onApprovalDecided } from "./workforce/engine";

const json = (v: unknown) => JSON.parse(JSON.stringify(v ?? null)) as Prisma.InputJsonValue;
/** Automation-created inputs may contain nulls for "not linked"; tool schemas use optional fields. */
const dropNulls = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== null && x !== undefined && x !== "")) : v);

export const approvalPermissions = (requiredPermission: string): Permission[] => requiredPermission.split(",").map((p) => p.trim()).filter((p): p is Permission => (PERMISSIONS as readonly string[]).includes(p));

/** Can this user decide this approval? Requires ai:approve plus every permission the action itself needs. */
export const canDecide = (user: SessionUser, requiredPermission: string) => can(user.role, "ai:approve") && approvalPermissions(requiredPermission).every((p) => can(user.role, p));

export type Decision = { decision: "APPROVE" | "REJECT"; editedInput?: unknown; note?: string | null };

/**
 * Human decision on an AI / automation request. The approval is claimed atomically (PENDING → APPROVED/REJECTED) so
 * it can never run twice, the input is re-validated (edited or not), permissions are re-checked for the approver —
 * who becomes the actor of record — and the outcome is written back to the approval, the execution and the audit log.
 */
export async function decideApproval(id: string, user: SessionUser, d: Decision) {
  const a = await db.aIApproval.findUnique({ where: { id } });
  if (!a) throw new UserError("Approval request not found.");
  if (!canDecide(user, a.requiredPermission)) throw new UserError("You do not have permission to decide this request.");
  if (a.status !== "PENDING") throw new UserError(`This request is already ${a.status.toLowerCase()}.`);
  if (a.expiresAt && a.expiresAt < new Date()) {
    await db.aIApproval.updateMany({ where: { id, status: "PENDING" }, data: { status: "EXPIRED" } });
    throw new UserError("This request has expired.");
  }
  const tool = getTool(a.tool);
  if (!tool) throw new UserError(`Unknown action "${a.tool}".`);

  if (d.decision === "REJECT") {
    const r = await db.aIApproval.updateMany({ where: { id, status: "PENDING" }, data: { status: "REJECTED", decidedById: user.id, decidedAt: new Date(), decisionNote: d.note?.slice(0, 1000) } });
    if (!r.count) throw new UserError("This request was decided by someone else.");
    await audit({ userId: user.id, action: "ai.approval.rejected", entity: "AIApproval", entityId: id, metadata: { tool: a.tool, agent: a.agentSlug, note: d.note } });
    await settleExecution(a.executionId);
    await onApprovalDecided(a, "REJECTED", user.id).catch(() => null);
    return { status: "REJECTED" as const };
  }

  const edited = d.editedInput !== undefined;
  const parsed = tool.input.safeParse(dropNulls(edited ? d.editedInput : a.input));
  if (!parsed.success) throw new UserError(`The action input is invalid: ${parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ")}`.slice(0, 400));
  // Edits may not widen the action beyond what the approver may do.
  const needed = toolPermissions(tool, parsed.data);
  if (!needed.every((p) => can(user.role, p))) throw new UserError(`You lack ${needed.filter((p) => !can(user.role, p)).join(", ")} for this action.`);

  // AI Workforce Control Center: an AI-proposed action does not execute during an emergency stop or pause, or (for
  // emails and other external actions) while external actions are off. The request stays pending for later.
  const kind = tool.alwaysApprove || tool.external ? "external" : "tool";
  const gate = await checkAIWorkforcePermission({ kind, agentSlug: a.agentSlug, channel: "approval", tool: a.tool });
  if (!gate.ok) {
    await logBlocked(gate, { kind, agentSlug: a.agentSlug, channel: "approval", tool: a.tool }, user.id);
    throw new UserError(`${gate.message} The request is still pending.`);
  }

  const claimed = await db.aIApproval.updateMany({ where: { id, status: "PENDING" }, data: { status: "APPROVED", decidedById: user.id, decidedAt: new Date(), decisionNote: d.note?.slice(0, 1000), input: edited ? json(parsed.data) : undefined } });
  if (!claimed.count) throw new UserError("This request was decided by someone else.");

  try {
    const r = await tool.run({ user, agentSlug: a.agentSlug, executionId: a.executionId }, parsed.data);
    await db.aIApproval.update({ where: { id }, data: { status: "EXECUTED", executedAt: new Date(), executionResult: json(r.data) } });
    await audit({ userId: user.id, action: edited ? "ai.approval.edited_and_executed" : "ai.approval.executed", entity: "AIApproval", entityId: id, metadata: { tool: a.tool, agent: a.agentSlug, records: r.records } });
    await settleExecution(a.executionId, { tool: a.tool, approvalId: id, summary: a.action, status: "EXECUTED", by: user.id });
    await onApprovalDecided(a, "EXECUTED", user.id, r.records).catch(() => null);
    return { status: "EXECUTED" as const, result: r.data };
  } catch (e) {
    const msg = (e as Error).message.slice(0, 500);
    await db.aIApproval.update({ where: { id }, data: { status: "FAILED", executionResult: json({ error: msg }) } });
    await audit({ userId: user.id, action: "ai.approval.failed", entity: "AIApproval", entityId: id, metadata: { tool: a.tool, error: msg } });
    await settleExecution(a.executionId);
    await onApprovalDecided(a, "FAILED", user.id).catch(() => null);
    throw new UserError(`Approved, but the action failed: ${msg}`);
  }
}

/** Records executed actions on the originating execution and closes it once nothing is pending. */
async function settleExecution(executionId: string | null, executed?: Record<string, unknown>) {
  if (!executionId) return;
  const ex = await db.aIExecution.findUnique({ where: { id: executionId }, select: { status: true, actionsExecuted: true } });
  if (!ex) return;
  const list: unknown[] = Array.isArray(ex.actionsExecuted) ? [...ex.actionsExecuted] : [];
  if (executed) list.push(executed);
  const pending = await db.aIApproval.count({ where: { executionId, status: "PENDING" } });
  await db.aIExecution.update({ where: { id: executionId }, data: { actionsExecuted: json(list), status: ex.status === "AWAITING_APPROVAL" && !pending ? "SUCCEEDED" : undefined } });
}

export async function expireApprovals() {
  const r = await db.aIApproval.updateMany({ where: { status: "PENDING", expiresAt: { lt: new Date() } }, data: { status: "EXPIRED" } });
  return r.count;
}
