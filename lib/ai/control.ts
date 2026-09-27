import "server-only";
import { db } from "@/lib/db/client";
import { audit } from "@/lib/audit";
import { UserError } from "@/lib/os/action";

/**
 * AI Workforce Control Center: the server-side switches every AI execution path checks before it runs (router,
 * runner/orchestrator, provider calls, tool calls, autonomous actions, background tasks, voice, approvals executing
 * AI-proposed actions). The state lives in the database (AIWorkforceConfig + per-employee columns on AIAgent), is read
 * fresh on every check, and never depends on what the browser shows.
 */

export const CONTROL_ID = "global";

export type ControlChannel = "chat" | "voice" | "instruction" | "api" | "task" | "automation" | "schedule" | "approval";
/**
 * execute: start an AI request · provider: call the model · tool: run a tool an AI chose · autonomous: act without a
 * person approving · background: create or run an AI task · external: contact the outside world (email, web) ·
 * voice: speech session or speech provider call.
 */
export type ControlKind = "execute" | "provider" | "tool" | "autonomous" | "background" | "external" | "voice";

export type ControlCode = "EMERGENCY_STOP" | "WORKFORCE_OFF" | "PAUSED" | "AGENT_DISABLED" | "AUTONOMOUS_DISABLED" | "BACKGROUND_DISABLED" | "VOICE_DISABLED" | "EXTERNAL_DISABLED" | "BUDGET_EXCEEDED";

export type ControlResult = { ok: true } | { ok: false; code: ControlCode; message: string };

export interface ControlCheck {
  kind: ControlKind;
  agentSlug?: string | null;
  channel?: ControlChannel;
  tool?: string;
}

export const CONTROL_MESSAGES: Record<ControlCode, string> = {
  EMERGENCY_STOP: "AI workforce emergency stop is active. No AI work can run until an administrator resumes it.",
  WORKFORCE_OFF: "The AI workforce is switched off in the AI Workforce Control Center.",
  PAUSED: "All AI employees are paused in the AI Workforce Control Center.",
  AGENT_DISABLED: "This AI employee is disabled in the AI Workforce Control Center.",
  AUTONOMOUS_DISABLED: "Autonomous mode is disabled, so this action needs human approval.",
  BACKGROUND_DISABLED: "Background AI tasks are disabled in the AI Workforce Control Center.",
  VOICE_DISABLED: "AI voice employees are disabled in the AI Workforce Control Center.",
  EXTERNAL_DISABLED: "External actions (emails, web requests) are disabled in the AI Workforce Control Center.",
  BUDGET_EXCEEDED: "Today's AI workforce budget has been reached. AI calls resume tomorrow or when an administrator raises the budget.",
};

/** A UserError, so server actions show the reason to the person instead of a generic failure. */
export class AIControlError extends UserError {
  constructor(
    public code: ControlCode,
    message = CONTROL_MESSAGES[code],
  ) {
    super(message);
    this.name = "AIControlError";
  }
}

export type WorkforceConfig = Awaited<ReturnType<typeof getWorkforceConfig>>;

/** The current global state (defaults when no row exists yet: everything on, no emergency). Always read fresh. */
export async function getWorkforceConfig() {
  const row = await db.aIWorkforceConfig.findUnique({ where: { id: CONTROL_ID } });
  return (
    row ?? {
      id: CONTROL_ID,
      enabled: true,
      paused: false,
      emergencyStop: false,
      emergencyReason: null as string | null,
      emergencyById: null as string | null,
      emergencyAt: null as Date | null,
      autonomousEnabled: true,
      backgroundTasksEnabled: true,
      voiceEnabled: true,
      externalActionsEnabled: true,
      dailyBudget: null as { toString(): string } | null,
      updatedById: null as string | null,
      updatedAt: null as Date | null,
      createdAt: null as Date | null,
    }
  );
}

/** Today's AI spend across all employees (UTC day), from recorded usage rows. */
export async function spentToday(now = new Date()) {
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const r = await db.aIUsage.aggregate({ where: { createdAt: { gte: since } }, _sum: { costUsd: true } });
  return Number(r._sum.costUsd ?? 0);
}

/**
 * THE check. Order: emergency stop → workforce off → paused → employee disabled → the switch for this kind of work.
 * Returns a reason instead of throwing so callers can decide how to fail (block, hold a task, or fall back to approval).
 */
export async function checkAIWorkforcePermission(c: ControlCheck): Promise<ControlResult> {
  const cfg = await getWorkforceConfig();
  const no = (code: ControlCode): ControlResult => ({ ok: false, code, message: CONTROL_MESSAGES[code] });
  if (cfg.emergencyStop) return no("EMERGENCY_STOP");
  if (!cfg.enabled) return no("WORKFORCE_OFF");
  if (cfg.paused) return no("PAUSED");

  const agent = c.agentSlug ? await db.aIAgent.findUnique({ where: { slug: c.agentSlug }, select: { enabled: true, autonomousAllowed: true, backgroundTasksAllowed: true, voiceAllowed: true } }) : null;
  if (agent && !agent.enabled) return no("AGENT_DISABLED");

  if (c.kind === "autonomous" && (!cfg.autonomousEnabled || agent?.autonomousAllowed === false)) return no("AUTONOMOUS_DISABLED");
  if ((c.kind === "background" || c.channel === "task") && (!cfg.backgroundTasksEnabled || agent?.backgroundTasksAllowed === false)) return no("BACKGROUND_DISABLED");
  if ((c.kind === "voice" || c.channel === "voice") && (!cfg.voiceEnabled || agent?.voiceAllowed === false)) return no("VOICE_DISABLED");
  if (c.kind === "external" && !cfg.externalActionsEnabled) return no("EXTERNAL_DISABLED");
  if (c.kind === "provider" && cfg.dailyBudget != null && (await spentToday()) >= Number(cfg.dailyBudget)) return no("BUDGET_EXCEEDED");
  return { ok: true };
}

/** Records a blocked attempt in the audit log (who, which employee, what kind of work, why). */
export async function logBlocked(r: Exclude<ControlResult, { ok: true }>, c: ControlCheck, userId?: string | null) {
  await audit({ userId: userId && userId !== "system" ? userId : null, action: "ai.control.blocked", entity: "AIAgent", entityId: c.agentSlug ?? "workforce", metadata: { code: r.code, kind: c.kind, channel: c.channel ?? null, tool: c.tool ?? null } }).catch(() => null);
}

/** Throwing form for paths that simply must not proceed. Logs the block. */
export async function assertAIWorkforcePermission(c: ControlCheck, userId?: string | null) {
  const r = await checkAIWorkforcePermission(c);
  if (!r.ok) {
    await logBlocked(r, c, userId);
    throw new AIControlError(r.code, r.message);
  }
}

/** True when nothing at all may run (used to skip whole batches such as the task queue). */
export async function workforceHalted() {
  const cfg = await getWorkforceConfig();
  return cfg.emergencyStop || !cfg.enabled || cfg.paused;
}

/** Blocked attempts recorded in the last `hours` hours (Control Center summary). */
export async function blockedAttempts(hours = 24) {
  return db.auditLog.count({ where: { action: "ai.control.blocked", createdAt: { gte: new Date(Date.now() - hours * 3600_000) } } });
}
