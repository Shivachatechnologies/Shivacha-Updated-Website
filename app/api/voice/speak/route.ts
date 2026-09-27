import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { getSessionUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { rateLimited } from "@/lib/os/ratelimit";
import { voiceProvider } from "@/lib/voice/provider";
import { checkAIWorkforcePermission } from "@/lib/ai/control";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Server text-to-speech for OpenAI voice sessions: streams audio back; nothing is stored. Only speaks this session's own replies. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user || !can(user.role, "voice:use")) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  if (rateLimited(`tts:${user.id}`, 40, 60_000)) return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  const body = (await req.json().catch(() => null)) as { sessionId?: string; messageId?: string } | null;
  const m = body?.messageId ? await db.voiceMessage.findFirst({ where: { id: String(body.messageId), sessionId: String(body.sessionId ?? ""), role: "assistant", session: { userId: user.id } }, include: { session: { select: { provider: true, language: true, agentSlug: true } } } }) : null;
  if (!m) return NextResponse.json({ error: "Message not found." }, { status: 404 });
  // AI Workforce Control Center: no speech provider calls while voice is off or the workforce is stopped.
  const gate = await checkAIWorkforcePermission({ kind: "voice", agentSlug: m.session.agentSlug, channel: "voice" });
  if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: 423 });
  const provider = voiceProvider(m.session.provider);
  if (!provider.serverAudio) return NextResponse.json({ error: "This session speaks in the browser." }, { status: 400 });
  const profile = await db.aIEmployeeVoiceProfile.findUnique({ where: { agentSlug: m.session.agentSlug } });
  const spoken = ((m.data as { spoken?: string } | null)?.spoken ?? m.text).slice(0, 4000);
  try {
    const res = await provider.synthesize(spoken, { voice: profile?.provider === "openai" ? profile.voiceId : null, language: m.session.language ?? "en-IN", rate: profile ? Number(profile.rate) : 1 });
    return new Response(res.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
