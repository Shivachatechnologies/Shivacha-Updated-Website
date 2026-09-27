"use server";

import { z } from "zod";
import { db } from "@/lib/db/client";
import { audit } from "@/lib/audit";
import { authorize } from "@/lib/auth/session";
import { authorizeAccess } from "@/lib/os/guard";
import { fail, formObject, okThen, UserError, type ActionState } from "@/lib/os/action";
import type { EntityRef } from "@/lib/ai/runner";
import { isVoiceLanguage, VOICE_LANGUAGES } from "./languages";
import { endVoiceSession, interruptVoice, startVoiceSession, voiceReadiness, voiceTurn, type VoiceTurnResult } from "./session";
import { OPENAI_VOICES, VOICE_PROVIDERS } from "./provider";

const ENTITIES = ["Lead", "Deal", "Project", "Invoice", "Ticket", "Client"] as const;

const startSchema = z.object({
  agentSlug: z.string().trim().min(1).max(40),
  language: z.string().refine(isVoiceLanguage, "Unsupported language"),
  provider: z.enum(["browser", "openai"]),
  context: z.object({ entity: z.enum(ENTITIES), id: z.string().trim().min(1).max(40) }).nullable().optional(),
});

export async function startVoiceAction(input: z.input<typeof startSchema>): Promise<{ id?: string; provider?: string; serverAudio?: boolean; error?: string }> {
  try {
    const user = await authorizeAccess("voice:use", "AI_WORKFORCE");
    const d = startSchema.parse(input);
    return await startVoiceSession(user, { agentSlug: d.agentSlug, language: d.language as keyof typeof VOICE_LANGUAGES, provider: d.provider, context: (d.context as EntityRef | null) ?? null });
  } catch (e) {
    return { error: fail(e, "voice")?.error };
  }
}

const turnSchema = z.object({ sessionId: z.string().max(40), text: z.string().trim().min(1, "Say something").max(4000), audioSec: z.number().min(0).max(600).nullish(), background: z.boolean().optional(), sttLatencyMs: z.number().int().min(0).max(120_000).nullish() });

export async function voiceTurnAction(input: z.input<typeof turnSchema>): Promise<{ result?: VoiceTurnResult; error?: string }> {
  try {
    const user = await authorizeAccess("voice:use", "AI_WORKFORCE");
    const d = turnSchema.parse(input);
    return { result: await voiceTurn(user, d.sessionId, d.text, d) };
  } catch (e) {
    return { error: fail(e, "voice")?.error };
  }
}

/** Server half of the voice diagnostics: is the voice provider configured and may this user talk to this AI employee? */
export async function voiceReadinessAction(agentSlug: string, provider: string) {
  try {
    const user = await authorizeAccess("voice:use", "AI_WORKFORCE");
    return await voiceReadiness(user, z.string().trim().min(1).max(40).parse(agentSlug), z.enum(["browser", "openai"]).parse(provider));
  } catch (e) {
    return { error: fail(e, "voice")?.error ?? "Voice is not available." };
  }
}

export async function interruptVoiceAction(sessionId: string, messageId?: string | null) {
  const user = await authorize("voice:use");
  await interruptVoice(user, z.string().max(40).parse(sessionId), messageId ? z.string().max(40).parse(messageId) : null);
}

export async function endVoiceAction(sessionId: string) {
  const user = await authorize("voice:use");
  await endVoiceSession(user, z.string().max(40).parse(sessionId));
}

/** Voice identity per AI employee: stock provider voices only (no cloning). */
export async function saveVoiceProfileAction(agentSlug: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("ai:configure", "AI_WORKFORCE");
    const f = formObject(form);
    const d = z.object({ provider: z.enum(Object.keys(VOICE_PROVIDERS) as ["browser", "openai"]), voiceId: z.string().max(60).nullish().transform((v) => v || null), language: z.string().refine(isVoiceLanguage, "Unsupported language"), rate: z.coerce.number().min(0.75).max(1.5), style: z.string().trim().max(200).nullish().transform((v) => v || null) }).parse(f);
    if (d.provider === "openai" && d.voiceId && !OPENAI_VOICES.includes(d.voiceId as (typeof OPENAI_VOICES)[number])) throw new UserError("Unknown OpenAI voice.");
    const data = { provider: d.provider, voiceId: d.voiceId, language: d.language, rate: d.rate.toFixed(2), style: d.style };
    await db.aIEmployeeVoiceProfile.upsert({ where: { agentSlug }, update: data, create: { agentSlug, ...data } });
    await audit({ userId: user.id, action: "voice.profile.updated", entity: "AIAgent", entityId: agentSlug, metadata: data });
    return okThen(`/admin/ai/voice/${agentSlug}`, "Voice settings saved.");
  } catch (e) {
    return fail(e, "voice");
  }
}
