import "server-only";
import { db } from "@/lib/db/client";
import { audit } from "@/lib/audit";
import { can } from "@/lib/auth/permissions";
import type { SessionUser } from "@/lib/auth/session";
import { UserError } from "@/lib/os/action";
import { rateLimited } from "@/lib/os/ratelimit";
import { isEnabled } from "@/lib/os/flags";
import { agentBySlug } from "@/lib/ai/catalog";
import { canRunAgent } from "@/lib/ai/agents";
import { checkAIWorkforcePermission, logBlocked } from "@/lib/ai/control";
import type { EntityRef } from "@/lib/ai/runner";
import { executeRequest, type ExecutionClass } from "@/lib/ai/router";
import type { ReplyLanguage } from "@/lib/ai/router/policy";
import { VOICE_LANGUAGES, toSpeech, voiceChannelHint, wantsBackground, type VoiceLanguage } from "./languages";
import { estimateVoiceCost, VOICE_PROVIDERS, voiceProvider } from "./provider";

/** A voice call is abandoned after this long without a turn (ended on next access). */
export const VOICE_IDLE_MS = 30 * 60_000;

export interface VoiceTurnResult {
  messageId: string;
  text: string;
  spoken: string;
  status: string;
  agent: string;
  actions: { tool: string; summary: string; status: string; approvalId?: string }[];
  toolsUsed: string[];
  executionId: string | null;
  taskId?: string;
  provider: string;
  route: ExecutionClass;
}

async function assertCanTalk(user: SessionUser, agentSlug: string) {
  if (!(await isEnabled("AI_WORKFORCE"))) throw new UserError("The AI workforce module is switched off.");
  if (!can(user.role, "voice:use") || !can(user.role, "ai:execute")) throw new UserError("You do not have permission to talk to AI employees.");
  const spec = agentBySlug(agentSlug);
  if (!spec) throw new UserError("Unknown AI employee.");
  // AI Workforce Control Center: voice employees can be switched off globally or per employee.
  const gate = await checkAIWorkforcePermission({ kind: "voice", agentSlug: spec.slug, channel: "voice" });
  if (!gate.ok) {
    await logBlocked(gate, { kind: "voice", agentSlug: spec.slug, channel: "voice" }, user.id);
    throw new UserError(gate.message);
  }
  // The AI employee can only do what BOTH it and you are allowed to do; runAgent enforces this per tool call.
  if (!canRunAgent(user.role, spec)) throw new UserError(`You do not have permission to use the ${spec.name}.`);
  return spec;
}

/** Readiness of the server side of a voice call, for diagnostics. Reports configuration only, never secrets. */
export async function voiceReadiness(user: SessionUser, agentSlug: string, providerId: string) {
  const provider = VOICE_PROVIDERS[providerId] ?? voiceProvider("browser");
  let employee: { ok: boolean; detail: string };
  try {
    const spec = await assertCanTalk(user, agentSlug);
    employee = { ok: true, detail: `${spec.name} ready` };
  } catch (e) {
    employee = { ok: false, detail: (e as Error).message };
  }
  return {
    provider: { id: provider.id, ok: provider.configured(), detail: provider.configured() ? `${provider.label} configured` : `${provider.label} is not configured on the server` },
    employee,
    aiConnected: !!process.env.ANTHROPIC_API_KEY,
  };
}

export async function startVoiceSession(user: SessionUser, input: { agentSlug: string; language: VoiceLanguage; provider: string; context: EntityRef | null }) {
  const spec = await assertCanTalk(user, input.agentSlug);
  if (rateLimited(`voice-start:${user.id}`, 20, 60 * 60_000)) throw new UserError("Too many voice sessions started. Try again later.");
  const provider = voiceProvider(input.provider);
  // End this user's other open calls: one live voice session per person.
  await db.voiceSession.updateMany({ where: { userId: user.id, status: "ACTIVE" }, data: { status: "ENDED", endedAt: new Date() } });
  const s = await db.voiceSession.create({ data: { userId: user.id, agentSlug: spec.slug, provider: provider.id, status: "ACTIVE", language: input.language, context: input.context ?? undefined } });
  await provider.createSession({ sessionId: s.id, provider: provider.id, language: input.language });
  await audit({ userId: user.id, action: "voice.session.started", entity: "VoiceSession", entityId: s.id, metadata: { agent: spec.slug, provider: provider.id, language: input.language, context: input.context } });
  return { id: s.id, provider: provider.id, serverAudio: provider.serverAudio };
}

async function openSession(user: SessionUser, sessionId: string) {
  const s = await db.voiceSession.findFirst({ where: { id: sessionId, userId: user.id } });
  if (!s) throw new UserError("Voice session not found.");
  if (s.status !== "ACTIVE") throw new UserError("This voice session has ended. Start a new one.");
  const last = await db.voiceMessage.findFirst({ where: { sessionId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  if (Date.now() - (last?.createdAt ?? s.startedAt).getTime() > VOICE_IDLE_MS) {
    await endVoiceSession(user, sessionId, "idle");
    throw new UserError("This voice session timed out. Start a new one.");
  }
  return s;
}

export async function voiceTurn(user: SessionUser, sessionId: string, text: string, opts: { audioSec?: number | null; background?: boolean; sttLatencyMs?: number | null } = {}): Promise<VoiceTurnResult> {
  const s = await openSession(user, sessionId);
  await assertCanTalk(user, s.agentSlug);
  if (rateLimited(`voice-turn:${user.id}`, 30, 60_000)) throw new UserError("You're speaking faster than I can keep up. Wait a moment.");
  const lang = (s.language && s.language in VOICE_LANGUAGES ? s.language : "en-IN") as VoiceLanguage;
  const context = (s.context as EntityRef | null) ?? null;
  const t0 = Date.now();
  await db.voiceMessage.create({ data: { sessionId, role: "user", text: text.slice(0, 4000), latencyMs: opts.sttLatencyMs ?? null } });

  // One global router decides how this is handled; voice only adds its spoken-answer style and language.
  const r = await executeRequest({ user, text, channel: "voice", agentSlug: s.agentSlug, context, conversationId: s.conversationId, channelHint: voiceChannelHint(lang), explicitBackground: !!opts.background || wantsBackground(text), language: REPLY_LANGUAGE[lang] });
  const exec = r.executionId ? await db.aIExecution.findUnique({ where: { id: r.executionId }, select: { inputTokens: true, outputTokens: true, costUsd: true } }) : null;
  const spoken =
    r.provider === "none" && r.status === "SUCCEEDED"
      ? "The AI provider isn't connected, so I can't reason about this yet. I've put the live data I would use on screen."
      : toSpeech(r.spoken || r.error || "Sorry, I couldn't do that.");
  const actions = r.actions.map((a) => ({ tool: a.tool, summary: a.summary, status: a.status, approvalId: a.approvalId }));
  const m = await db.voiceMessage.create({ data: { sessionId, role: "assistant", text: r.text.slice(0, 20_000), executionId: r.executionId, data: { status: r.status, agent: r.agent, actions, toolsUsed: r.toolsUsed, spoken, route: r.cls, ...(r.taskId ? { taskId: r.taskId } : {}) }, latencyMs: Date.now() - t0 } });
  if (!s.conversationId && r.conversationId) await db.voiceSession.update({ where: { id: s.id }, data: { conversationId: r.conversationId } });
  await bump(s, opts.audioSec ?? 0, spoken.length, exec?.inputTokens ?? 0, exec?.outputTokens ?? 0, Number(exec?.costUsd ?? 0));
  if (r.taskId) await audit({ userId: user.id, action: "voice.task.delegated", entity: "AITask", entityId: r.taskId, metadata: { sessionId, agent: s.agentSlug } });
  return { messageId: m.id, text: r.text, spoken, status: r.status, agent: r.agent, actions, toolsUsed: r.toolsUsed, executionId: r.executionId, taskId: r.taskId, provider: s.provider, route: r.cls };
}

const REPLY_LANGUAGE: Record<VoiceLanguage, ReplyLanguage> = Object.fromEntries(Object.keys(VOICE_LANGUAGES).map((k) => [k, k === "hi-IN" ? "hi" : k === "hinglish" ? "hinglish" : "en"])) as Record<VoiceLanguage, ReplyLanguage>;

async function bump(s: { id: string; provider: string }, audioSec: number, outChars: number, inTok: number, outTok: number, cost: number) {
  const secs = Math.max(0, Math.min(600, Math.round(audioSec)));
  const serverChars = s.provider === "openai" ? outChars : 0;
  await db.voiceSession.update({
    where: { id: s.id },
    data: { audioInSec: { increment: secs }, audioOutChars: { increment: serverChars }, inputTokens: { increment: inTok }, outputTokens: { increment: outTok }, costUsd: { increment: cost }, voiceCostUsd: { increment: estimateVoiceCost(s.provider, s.provider === "openai" ? secs : 0, serverChars) } },
  });
}

/** Barge-in: the user spoke over the answer, so it is marked as interrupted (they did not hear all of it). */
export async function interruptVoice(user: SessionUser, sessionId: string, messageId?: string | null) {
  const s = await db.voiceSession.findFirst({ where: { id: sessionId, userId: user.id }, select: { id: true } });
  if (!s) return;
  const m = messageId ? await db.voiceMessage.findFirst({ where: { id: messageId, sessionId, role: "assistant" } }) : await db.voiceMessage.findFirst({ where: { sessionId, role: "assistant" }, orderBy: { createdAt: "desc" } });
  if (m) await db.voiceMessage.update({ where: { id: m.id }, data: { interrupted: true } });
}

export async function endVoiceSession(user: SessionUser, sessionId: string, reason: "user" | "idle" | "error" = "user") {
  const s = await db.voiceSession.findFirst({ where: { id: sessionId, userId: user.id } });
  if (!s || s.status !== "ACTIVE") return;
  const msgs = await db.voiceMessage.findMany({ where: { sessionId }, orderBy: { createdAt: "asc" }, select: { role: true, text: true, data: true } });
  const asks = msgs.filter((m) => m.role === "user");
  const tasks = msgs.filter((m) => (m.data as { taskId?: string } | null)?.taskId).length;
  const approvals = msgs.flatMap((m) => ((m.data as { actions?: { status: string }[] } | null)?.actions ?? []).filter((a) => a.status === "PENDING_APPROVAL")).length;
  const summary = asks.length ? `${asks.length} request(s)${tasks ? `, ${tasks} background task(s)` : ""}${approvals ? `, ${approvals} action(s) waiting for approval` : ""}. Started with: “${asks[0].text.slice(0, 160)}”` : "No requests were made.";
  const endedAt = new Date();
  await db.voiceSession.update({ where: { id: s.id }, data: { status: reason === "error" ? "ERROR" : "ENDED", endedAt, durationSec: Math.round((endedAt.getTime() - s.startedAt.getTime()) / 1000), summary } });
  await voiceProvider(s.provider).close({ sessionId: s.id, provider: s.provider, language: s.language ?? "en-IN" });
  await audit({ userId: user.id, action: "voice.session.ended", entity: "VoiceSession", entityId: s.id, metadata: { reason, turns: asks.length } });
}
