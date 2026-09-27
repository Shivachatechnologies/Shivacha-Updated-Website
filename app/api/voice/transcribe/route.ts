import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { getSessionUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { rateLimited } from "@/lib/os/ratelimit";
import { voiceProvider } from "@/lib/voice/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024;
const TYPES = /^audio\/(webm|ogg|mp4|mpeg|wav|x-m4a|aac)/;

/** Server speech-to-text for OpenAI voice sessions. Audio is forwarded in memory and never written anywhere. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user || !can(user.role, "voice:use")) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  if (rateLimited(`stt:${user.id}`, 40, 60_000)) return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  const form = await req.formData().catch(() => null);
  const audio = form?.get("audio");
  const sessionId = String(form?.get("sessionId") ?? "");
  if (!(audio instanceof Blob) || audio.size === 0) return NextResponse.json({ error: "No audio." }, { status: 400 });
  if (audio.size > MAX_BYTES || !TYPES.test(audio.type)) return NextResponse.json({ error: "Unsupported or too large audio." }, { status: 413 });
  const s = await db.voiceSession.findFirst({ where: { id: sessionId, userId: user.id, status: "ACTIVE" }, select: { id: true, provider: true, language: true } });
  if (!s) return NextResponse.json({ error: "Voice session not found." }, { status: 404 });
  const provider = voiceProvider(s.provider);
  if (!provider.serverAudio) return NextResponse.json({ error: "This session transcribes in the browser." }, { status: 400 });
  try {
    const t0 = Date.now();
    const r = await provider.transcribe(audio, s.language ?? "en-IN");
    return NextResponse.json({ text: r.text, seconds: r.seconds, latencyMs: Date.now() - t0 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
