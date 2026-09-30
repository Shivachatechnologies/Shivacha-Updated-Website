import "server-only";
import { secretValue } from "@/lib/integrations/vault";

/**
 * Voice provider abstraction. The AI brain is always the existing orchestrator (runAgent); a voice provider only turns
 * speech into text and text into speech. Raw audio is processed in memory and never stored.
 *
 *  - browser: speech recognition and synthesis run in the user's browser (Web Speech API). The server only sees text.
 *  - openai:  server-side transcription and speech via the OpenAI audio API (requires OPENAI_API_KEY, server-only).
 */
export interface VoiceSessionHandle {
  sessionId: string;
  provider: string;
  language: string;
}

export interface VoiceProvider {
  readonly id: "browser" | "openai";
  readonly label: string;
  configured(): boolean;
  /** Whether audio passes through the server (false = browser does STT/TTS). */
  readonly serverAudio: boolean;
  createSession(h: VoiceSessionHandle): Promise<void>;
  connect(h: VoiceSessionHandle): Promise<void>;
  sendAudio(h: VoiceSessionHandle, audio: Blob): Promise<string>;
  receiveAudio(h: VoiceSessionHandle, text: string, voice?: string | null): Promise<Response>;
  interrupt(h: VoiceSessionHandle): Promise<void>;
  close(h: VoiceSessionHandle): Promise<void>;
  transcribe(audio: Blob, language: string): Promise<{ text: string; seconds: number | null }>;
  synthesize(text: string, opts: { voice?: string | null; language: string; rate?: number }): Promise<Response>;
}

class VoiceProviderError extends Error {}

const noop = async () => undefined;

export const browserVoice: VoiceProvider = {
  id: "browser",
  label: "Browser speech (free, on-device)",
  serverAudio: false,
  configured: () => true,
  createSession: noop,
  connect: noop,
  interrupt: noop,
  close: noop,
  sendAudio: async () => {
    throw new VoiceProviderError("Browser voice transcribes on the device; no audio is sent to the server.");
  },
  receiveAudio: async () => {
    throw new VoiceProviderError("Browser voice speaks on the device.");
  },
  transcribe: async () => {
    throw new VoiceProviderError("Browser voice transcribes on the device.");
  },
  synthesize: async () => {
    throw new VoiceProviderError("Browser voice speaks on the device.");
  },
};

export const OPENAI_STT_MODEL = process.env.OPENAI_STT_MODEL || "gpt-4o-mini-transcribe";
export const OPENAI_TTS_MODEL = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
export const OPENAI_VOICES = ["alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer"] as const;

export const openaiVoice: VoiceProvider = {
  id: "openai",
  label: "OpenAI speech (server)",
  serverAudio: true,
  configured: () => !!secretValue("OPENAI_API_KEY"),
  createSession: noop,
  connect: noop,
  interrupt: noop,
  close: noop,
  async sendAudio(h, audio) {
    return (await this.transcribe(audio, h.language)).text;
  },
  async receiveAudio(h, text, voice) {
    return this.synthesize(text, { voice, language: h.language });
  },
  async transcribe(audio, language) {
    const key = secretValue("OPENAI_API_KEY");
    if (!key) throw new VoiceProviderError("OpenAI voice is not configured.");
    const form = new FormData();
    form.set("file", audio, "speech.webm");
    form.set("model", OPENAI_STT_MODEL);
    const lang = language === "hi-IN" ? "hi" : language === "hinglish" ? undefined : "en";
    if (lang) form.set("language", lang);
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new VoiceProviderError(`Transcription failed (${res.status}).`);
    const j = (await res.json()) as { text?: string; usage?: { seconds?: number } };
    return { text: (j.text ?? "").trim(), seconds: j.usage?.seconds ?? null };
  },
  async synthesize(text, opts) {
    const key = secretValue("OPENAI_API_KEY");
    if (!key) throw new VoiceProviderError("OpenAI voice is not configured.");
    const voice = OPENAI_VOICES.includes((opts.voice ?? "") as (typeof OPENAI_VOICES)[number]) ? opts.voice : "alloy";
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: OPENAI_TTS_MODEL, voice, input: text.slice(0, 4000), response_format: "mp3", speed: Math.min(1.5, Math.max(0.75, opts.rate ?? 1)) }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok || !res.body) throw new VoiceProviderError(`Speech synthesis failed (${res.status}).`);
    return res;
  },
};

export const VOICE_PROVIDERS: Record<string, VoiceProvider> = { browser: browserVoice, openai: openaiVoice };
export const voiceProvider = (id: string | null | undefined) => {
  const p = VOICE_PROVIDERS[id ?? "browser"];
  return p?.configured() ? p : browserVoice;
};
export const availableVoiceProviders = () => Object.values(VOICE_PROVIDERS).filter((p) => p.configured()).map((p) => ({ id: p.id, label: p.label, serverAudio: p.serverAudio }));

/**
 * Estimated provider charges in USD (published list prices; update when prices change). Shown as estimates.
 * Transcription is priced per audio minute, speech per million input characters.
 */
export const VOICE_PRICING = { openai: { sttPerMinute: 0.003, ttsPerMillionChars: 15 } } as const;
export function estimateVoiceCost(provider: string, audioInSec: number, outChars: number) {
  if (provider !== "openai") return 0;
  const p = VOICE_PRICING.openai;
  return (audioInSec / 60) * p.sttPerMinute + (outChars / 1_000_000) * p.ttsPerMillionChars;
}
