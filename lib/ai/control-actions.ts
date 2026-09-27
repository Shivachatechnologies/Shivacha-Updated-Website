"use server";

import { z } from "zod";
import { db } from "@/lib/db/client";
import { audit } from "@/lib/audit";
import { authorizeAccess } from "@/lib/os/guard";
import { notify } from "@/lib/os/notify";
import { fail, okThen, UserError, type ActionState } from "@/lib/os/action";
import { agentBySlug } from "./catalog";
import { ensureAgents } from "./agents";
import { CONTROL_ID, getWorkforceConfig } from "./control";

const PAGE = "/admin/ai/settings";
const on = (form: FormData, k: string) => form.get(k) === "on";

const budget = z
  .preprocess((v) => (v == null ? "" : String(v).replace(/[,\s$]/g, "")), z.string())
  .refine((v) => !v || (/^\d{1,8}(\.\d{1,4})?$/.test(v) && Number(v) > 0), "Enter a positive amount in USD, or leave blank for no limit")
  .transform((v) => v || null);

/** Snapshot of the switches for before/after audit entries. */
const snapshot = (c: Awaited<ReturnType<typeof getWorkforceConfig>>) => ({
  enabled: c.enabled,
  paused: c.paused,
  emergencyStop: c.emergencyStop,
  autonomousEnabled: c.autonomousEnabled,
  backgroundTasksEnabled: c.backgroundTasksEnabled,
  voiceEnabled: c.voiceEnabled,
  externalActionsEnabled: c.externalActionsEnabled,
  dailyBudget: c.dailyBudget == null ? null : c.dailyBudget.toString(),
});

/** Global switches (workforce, pause, autonomous, background, voice, external, daily budget). Emergency stop has its own actions. */
export async function saveWorkforceControlsAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("ai:configure", "AI_WORKFORCE");
    const before = await getWorkforceConfig();
    const next = {
      enabled: on(form, "enabled"),
      paused: on(form, "paused"),
      autonomousEnabled: on(form, "autonomousEnabled"),
      backgroundTasksEnabled: on(form, "backgroundTasksEnabled"),
      voiceEnabled: on(form, "voiceEnabled"),
      externalActionsEnabled: on(form, "externalActionsEnabled"),
      dailyBudget: z.object({ dailyBudget: budget }).parse({ dailyBudget: form.get("dailyBudget") }).dailyBudget,
    };
    if (next.autonomousEnabled && !before.autonomousEnabled && user.role !== "SUPER_ADMIN") throw new UserError("Only a Super Admin can enable autonomous mode.");
    const after = await db.aIWorkforceConfig.upsert({ where: { id: CONTROL_ID }, update: { ...next, updatedById: user.id }, create: { id: CONTROL_ID, ...next, updatedById: user.id } });
    await audit({ userId: user.id, action: "ai.workforce.updated", entity: "AIWorkforceConfig", entityId: CONTROL_ID, metadata: { before: snapshot(before), after: snapshot(after) } });
    const halted = (!next.enabled && before.enabled) || (next.paused && !before.paused);
    if (halted) await notify({ type: "ai.control", title: next.enabled ? "AI employees paused" : "AI workforce switched off", body: `${user.name} changed the AI Workforce Control Center.`, href: PAGE, permission: "ai:configure", exceptUserId: user.id });
    return okThen(PAGE, "AI workforce controls saved.");
  } catch (e) {
    return fail(e, "ai.control");
  }
}

/** One-click Pause All / Resume All. */
export async function setWorkforcePausedAction(paused: boolean): Promise<ActionState> {
  try {
    const user = await authorizeAccess("ai:configure", "AI_WORKFORCE");
    const before = await getWorkforceConfig();
    await db.aIWorkforceConfig.upsert({ where: { id: CONTROL_ID }, update: { paused, updatedById: user.id }, create: { id: CONTROL_ID, paused, updatedById: user.id } });
    await audit({ userId: user.id, action: paused ? "ai.workforce.paused" : "ai.workforce.resumed", entity: "AIWorkforceConfig", entityId: CONTROL_ID, metadata: { before: before.paused, after: paused } });
    if (paused !== before.paused) await notify({ type: "ai.control", title: paused ? "All AI employees paused" : "AI employees resumed", body: `${user.name} ${paused ? "paused" : "resumed"} the AI workforce.`, href: PAGE, permission: "ai:configure", exceptUserId: user.id });
    return okThen(PAGE, paused ? "All AI employees paused." : "AI employees resumed.");
  } catch (e) {
    return fail(e, "ai.control");
  }
}

const emergencySchema = z.object({
  reason: z.string({ error: "Required" }).trim().min(3, "Say why you are stopping the AI workforce").max(500, "Keep it under 500 characters"),
  confirm: z.string().trim().refine((v) => v.toUpperCase() === "STOP", "Type STOP to confirm"),
});

/** Emergency kill switch: blocks every new AI execution, provider call, tool, task, voice session and external action. */
export async function activateEmergencyStopAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("ai:configure", "AI_WORKFORCE");
    const d = emergencySchema.parse({ reason: form.get("reason") ?? "", confirm: form.get("confirm") ?? "" });
    const before = await getWorkforceConfig();
    if (before.emergencyStop) throw new UserError("Emergency stop is already active.");
    const now = new Date();
    const data = { emergencyStop: true, emergencyReason: d.reason, emergencyById: user.id, emergencyAt: now, updatedById: user.id };
    await db.aIWorkforceConfig.upsert({ where: { id: CONTROL_ID }, update: data, create: { id: CONTROL_ID, ...data } });
    // Tasks already running stop at their next model or tool call (the runner re-checks); queued ones stay queued, on hold.
    const running = await db.aITask.count({ where: { status: "RUNNING" } });
    await audit({ userId: user.id, action: "ai.emergency.activated", entity: "AIWorkforceConfig", entityId: CONTROL_ID, metadata: { reason: d.reason, runningTasks: running } });
    await notify({ type: "ai.control", title: "AI workforce emergency stop activated", body: `${user.name}: ${d.reason}`, href: PAGE, permission: "ai:configure", exceptUserId: user.id });
    return okThen(PAGE, "Emergency stop activated. All AI work is blocked.");
  } catch (e) {
    return fail(e, "ai.control");
  }
}

export async function resumeEmergencyStopAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("ai:configure", "AI_WORKFORCE");
    const confirm = String(form.get("confirm") ?? "").trim().toUpperCase();
    if (confirm !== "RESUME") return { error: "Type RESUME to confirm.", fieldErrors: { confirm: "Type RESUME to confirm" } };
    const before = await getWorkforceConfig();
    if (!before.emergencyStop) throw new UserError("Emergency stop is not active.");
    await db.aIWorkforceConfig.update({ where: { id: CONTROL_ID }, data: { emergencyStop: false, emergencyReason: null, emergencyById: null, emergencyAt: null, updatedById: user.id } });
    await audit({ userId: user.id, action: "ai.emergency.resumed", entity: "AIWorkforceConfig", entityId: CONTROL_ID, metadata: { reason: before.emergencyReason, activatedById: before.emergencyById, activatedAt: before.emergencyAt?.toISOString() ?? null, stoppedForMs: before.emergencyAt ? Date.now() - before.emergencyAt.getTime() : null } });
    await notify({ type: "ai.control", title: "AI workforce emergency stop lifted", body: `${user.name} resumed the AI workforce.`, href: PAGE, permission: "ai:configure", exceptUserId: user.id });
    return okThen(PAGE, "Emergency stop lifted. AI employees can work again.");
  } catch (e) {
    return fail(e, "ai.control");
  }
}

/** Per-employee switches. Reuses AIAgent.enabled and AIAgent.dailyCostLimit; the rest are the Control Center columns. */
export async function saveAgentControlAction(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("ai:configure", "AI_WORKFORCE");
    if (!agentBySlug(slug)) throw new UserError("Unknown AI employee.");
    await ensureAgents();
    const before = await db.aIAgent.findUniqueOrThrow({ where: { slug }, select: { id: true, name: true, enabled: true, autonomousAllowed: true, backgroundTasksAllowed: true, voiceAllowed: true, dailyCostLimit: true } });
    const next = {
      enabled: on(form, "enabled"),
      autonomousAllowed: on(form, "autonomousAllowed"),
      backgroundTasksAllowed: on(form, "backgroundTasksAllowed"),
      voiceAllowed: on(form, "voiceAllowed"),
      dailyCostLimit: z.object({ dailyCostLimit: budget }).parse({ dailyCostLimit: form.get("dailyCostLimit") }).dailyCostLimit,
    };
    if (next.autonomousAllowed && !before.autonomousAllowed && user.role !== "SUPER_ADMIN") throw new UserError("Only a Super Admin can allow autonomous work.");
    await db.aIAgent.update({ where: { slug }, data: { ...next, controlUpdatedById: user.id, controlUpdatedAt: new Date() } });
    const { id, name, ...prev } = before;
    await audit({ userId: user.id, action: "ai.agent.control", entity: "AIAgent", entityId: id, metadata: { slug, before: { ...prev, dailyCostLimit: prev.dailyCostLimit?.toString() ?? null }, after: next } });
    return okThen(PAGE, `${name} controls saved.`);
  } catch (e) {
    return fail(e, "ai.control");
  }
}
