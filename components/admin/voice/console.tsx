"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Loader2, Mic, MicOff, PhoneOff, Send, Square, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/cn";
import { endVoiceAction, interruptVoiceAction, startVoiceAction, voiceTurnAction } from "@/lib/voice/actions";
import { classifySpeechError, describeError, openMicrophone, pickRecorderType, policyAllowsMicrophone, recordingExtension, VOICE_MESSAGES, type VoiceFailure, type VoiceStage } from "@/lib/voice/mic";
import { VoiceDiagnostics } from "./diagnostics";

export interface VoiceAgent {
  slug: string;
  name: string;
  persona: string | null;
}
export interface VoiceProfileLite {
  provider: string;
  voiceId: string | null;
  language: string;
  rate: number;
}
type Ctx = { entity: "Lead" | "Deal" | "Project" | "Invoice" | "Ticket" | "Client"; id: string } | null;
type Msg = { id: string; role: "user" | "assistant" | "system"; text: string; spoken?: string; status?: string; actions?: { tool: string; summary: string; status: string }[]; taskId?: string; interrupted?: boolean };

const LANGS = { "en-IN": { label: "English", rec: "en-IN" }, "hi-IN": { label: "हिन्दी", rec: "hi-IN" }, hinglish: { label: "Hinglish", rec: "en-IN" } } as const;
type Lang = keyof typeof LANGS;

interface SpeechRec {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onspeechstart: (() => void) | null;
}

const noSubscribe = () => () => undefined;

const recognitionCtor = (): (new () => SpeechRec) | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

/**
 * Talk to an AI employee. The microphone only turns on when the user presses the mic button (with a visible
 * indicator), replies can be interrupted at any time, and typing always works as a fallback. The AI's answer comes
 * from the same orchestrator, tools, permissions and approvals as text chat.
 */
export function VoiceConsole({ agents, initialAgent, context = null, contextLabel, providers, profiles, compact = false }: { agents: VoiceAgent[]; initialAgent?: string; context?: Ctx; contextLabel?: string; providers: { id: string; label: string; serverAudio: boolean }[]; profiles: Record<string, VoiceProfileLite>; compact?: boolean }) {
  const [agent, setAgent] = useState(initialAgent && agents.some((a) => a.slug === initialAgent) ? initialAgent : agents[0]?.slug ?? "");
  const profile = profiles[agent];
  const [lang, setLang] = useState<Lang>((profile?.language as Lang) in LANGS ? (profile!.language as Lang) : "en-IN");
  const [provider, setProvider] = useState(profile && providers.some((p) => p.id === profile.provider) ? profile.provider : "browser");
  const [session, setSession] = useState<{ id: string; serverAudio: boolean } | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [thinking, setThinking] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  const [background, setBackground] = useState(false);
  const [error, setFailure] = useState<VoiceFailure | null>(null);
  const setError = (message: string | null, stage: VoiceStage = "AI_EMPLOYEE") => setFailure(message ? { stage, message } : null);
  const recRef = useRef<SpeechRec | null>(null);
  const mediaRef = useRef<{ rec: MediaRecorder; stream: MediaStream; started: number } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastAssistant = useRef<string | null>(null);
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);
  const listRef = useRef<HTMLDivElement>(null);
  // Browser capabilities are only known on the client; the server render assumes none (no hydration mismatch).
  const browserStt = useSyncExternalStore(noSubscribe, () => !!recognitionCtor(), () => false);
  const hasMic = useSyncExternalStore(noSubscribe, () => !!navigator.mediaDevices?.getUserMedia, () => false);
  const isDev = process.env.NODE_ENV !== "production";
  const serverAudio = session?.serverAudio ?? providers.find((p) => p.id === provider)?.serverAudio ?? false;
  const canListen = serverAudio ? hasMic : browserStt;

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, thinking]);

  // End the call when the console closes; the microphone is always released.
  useEffect(
    () => () => {
      recRef.current?.abort();
      mediaRef.current?.stream.getTracks().forEach((t) => t.stop());
      window.speechSynthesis?.cancel();
      audioRef.current?.pause();
      if (sessionRef.current) void endVoiceAction(sessionRef.current.id).catch(() => undefined);
    },
    [],
  );

  const stopSpeaking = useCallback(
    (bargeIn: boolean) => {
      const was = speaking || !!window.speechSynthesis?.speaking || (audioRef.current && !audioRef.current.paused);
      window.speechSynthesis?.cancel();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setSpeaking(false);
      if (bargeIn && was && sessionRef.current) {
        const id = lastAssistant.current;
        setMsgs((m) => m.map((x) => (x.id === id ? { ...x, interrupted: true } : x)));
        void interruptVoiceAction(sessionRef.current.id, id).catch(() => undefined);
      }
    },
    [speaking],
  );

  const ensureSession = async () => {
    if (sessionRef.current) return sessionRef.current;
    setError(null);
    const r = await startVoiceAction({ agentSlug: agent, language: lang, provider: provider as "browser" | "openai", context });
    if (r.error || !r.id) {
      setError(r.error ?? "Could not start the voice session.");
      return null;
    }
    const s = { id: r.id, serverAudio: !!r.serverAudio };
    setSession(s);
    sessionRef.current = s;
    return s;
  };

  const speak = async (s: { id: string; serverAudio: boolean }, m: Msg, after: () => void) => {
    if (muted || !m.spoken) return after();
    setSpeaking(true);
    if (s.serverAudio) {
      try {
        const res = await fetch("/api/voice/speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: s.id, messageId: m.id }) });
        if (!res.ok) throw new Error("speech failed");
        const url = URL.createObjectURL(await res.blob());
        const a = new Audio(url);
        audioRef.current = a;
        a.onended = () => {
          URL.revokeObjectURL(url);
          setSpeaking(false);
          after();
        };
        await a.play();
        return;
      } catch {
        // fall back to the browser voice below
      }
    }
    if (!("speechSynthesis" in window)) {
      setSpeaking(false);
      return after();
    }
    const u = new SpeechSynthesisUtterance(m.spoken);
    u.lang = lang === "hi-IN" ? "hi-IN" : "en-IN";
    u.rate = profile?.rate ?? 1;
    const voices = window.speechSynthesis.getVoices();
    const v = (profile?.provider === "browser" && profile.voiceId ? voices.find((x) => x.name === profile.voiceId) : null) ?? voices.find((x) => x.lang === u.lang) ?? voices.find((x) => x.lang.startsWith(u.lang.slice(0, 2)));
    if (v) u.voice = v;
    u.onend = () => {
      setSpeaking(false);
      after();
    };
    u.onerror = () => setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  };

  const send = async (said: string, meta: { audioSec?: number | null; sttLatencyMs?: number | null } = {}) => {
    const q = said.trim();
    if (!q || thinking) return;
    stopSpeaking(true);
    const s = await ensureSession();
    if (!s) return;
    setText("");
    setInterim("");
    setMsgs((m) => [...m, { id: `u${new Date().getTime()}`, role: "user", text: q }]);
    setThinking(true);
    const r = await voiceTurnAction({ sessionId: s.id, text: q, background, audioSec: meta.audioSec ?? null, sttLatencyMs: meta.sttLatencyMs ?? null }).catch(() => ({ error: "Network error. Try again.", result: undefined }));
    setThinking(false);
    if (r.error || !r.result) {
      setError(r.error ?? "Something went wrong.");
      if (/ended|timed out/i.test(r.error ?? "")) setSession(null);
      return;
    }
    const res = r.result;
    const m: Msg = { id: res.messageId, role: "assistant", text: res.text, spoken: res.spoken, status: res.status, actions: res.actions, taskId: res.taskId };
    lastAssistant.current = res.messageId;
    setMsgs((x) => [...x, m]);
    void speak(s, m, () => {
      if (handsFree) void listen();
    });
  };

  // Order matters: A. microphone (straight from the click) → C/E. voice session and AI employee → F. speech recognition.
  // Each stage reports its own failure, so a provider or recorder problem is never shown as "permission denied".
  const listen = async () => {
    setError(null);
    stopSpeaking(true);
    if (mediaRef.current) {
      mediaRef.current.rec.stop();
      return;
    }
    if (recRef.current) {
      recRef.current.stop();
      return;
    }
    const wantsServer = sessionRef.current?.serverAudio ?? providers.find((p) => p.id === provider)?.serverAudio ?? false;
    if (!wantsServer && !recognitionCtor()) return setFailure({ stage: "SPEECH_RECOGNITION", message: VOICE_MESSAGES.unsupported });
    const mic = await openMicrophone();
    if ("failure" in mic) return setFailure(mic.failure);
    const release = () => mic.stream.getTracks().forEach((t) => t.stop());
    const s = await ensureSession();
    if (!s) return release();
    if (s.serverAudio) {
      const type = pickRecorderType(typeof MediaRecorder === "undefined" ? null : (t) => MediaRecorder.isTypeSupported(t));
      let rec: MediaRecorder;
      try {
        if (type === null) throw new Error("MediaRecorder is not supported");
        rec = new MediaRecorder(mic.stream, type ? { mimeType: type } : undefined);
      } catch (e) {
        release();
        return setFailure({ stage: "AUDIO_INITIALIZATION", message: VOICE_MESSAGES.recorder, detail: describeError(e) });
      }
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onerror = (e) => setFailure({ stage: "AUDIO_INITIALIZATION", message: VOICE_MESSAGES.recorder, detail: describeError((e as unknown as { error?: unknown }).error ?? e) });
      rec.onstop = async () => {
        release();
        const secs = (new Date().getTime() - (mediaRef.current?.started ?? new Date().getTime())) / 1000;
        mediaRef.current = null;
        setListening(false);
        const mime = rec.mimeType || type || "audio/webm";
        const blob = new Blob(chunks, { type: mime });
        if (blob.size < 1000) return;
        const fd = new FormData();
        fd.set("audio", blob, `speech.${recordingExtension(mime)}`);
        fd.set("sessionId", s.id);
        setInterim("Transcribing…");
        const t0 = new Date().getTime();
        const tr = await fetch("/api/voice/transcribe", { method: "POST", body: fd })
          .then((x) => x.json())
          .catch((e) => ({ error: `${VOICE_MESSAGES.provider} (${describeError(e)})` }));
        setInterim("");
        if (tr.error) return setError(tr.error, "VOICE_PROVIDER");
        if (!tr.text) return setError("I didn't catch that. Try again or type.", "SPEECH_RECOGNITION");
        void send(tr.text, { audioSec: tr.seconds ?? secs, sttLatencyMs: new Date().getTime() - t0 });
      };
      try {
        rec.start();
      } catch (e) {
        release();
        return setFailure({ stage: "AUDIO_INITIALIZATION", message: VOICE_MESSAGES.recorder, detail: describeError(e) });
      }
      mediaRef.current = { rec, stream: mic.stream, started: new Date().getTime() };
      setListening(true);
      return;
    }
    // Browser speech recognition opens the microphone itself; the check above proved access works, so release it.
    release();
    const Ctor = recognitionCtor();
    if (!Ctor) return setFailure({ stage: "SPEECH_RECOGNITION", message: VOICE_MESSAGES.unsupported });
    const rec = new Ctor();
    rec.lang = LANGS[lang].rec;
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = "";
    const t0 = new Date().getTime();
    rec.onspeechstart = () => stopSpeaking(true);
    rec.onresult = (e) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else live += r[0].transcript;
      }
      setInterim(finalText + live);
    };
    rec.onerror = (e) => {
      console.error("SPEECH_RECOGNITION_ERROR", e.error);
      // getUserMedia just succeeded, so the browser permission itself is granted.
      const f = classifySpeechError(e.error, { policyAllows: policyAllowsMicrophone(), permission: "granted", micOpened: true });
      if (f) setFailure(f);
    };
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
      if (finalText.trim()) void send(finalText, { audioSec: (new Date().getTime() - t0) / 1000 });
      else setInterim("");
    };
    try {
      rec.start();
    } catch (e) {
      return setFailure({ stage: "SPEECH_RECOGNITION", message: "Speech recognition could not start. Try again.", detail: describeError(e) });
    }
    recRef.current = rec;
    setListening(true);
  };

  const hangUp = async () => {
    recRef.current?.abort();
    mediaRef.current?.rec.stop();
    stopSpeaking(false);
    if (session) await endVoiceAction(session.id).catch(() => undefined);
    setSession(null);
    setListening(false);
  };

  if (!agents.length) return <p className="text-sm text-muted">No AI employees are available to your role.</p>;
  const current = agents.find((a) => a.slug === agent);
  return (
    <div className={cn("flex flex-col gap-3", compact ? "h-full" : "")}>
      <div className="flex flex-wrap items-end gap-2 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-dim">AI employee</span>
          <select value={agent} disabled={!!session} onChange={(e) => setAgent(e.target.value)} className="h-9 rounded-md border border-line bg-ink-900 px-2">
            {agents.map((a) => (
              <option key={a.slug} value={a.slug}>{a.persona ? `${a.persona} · ${a.name}` : a.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-dim">Language</span>
          <select value={lang} disabled={!!session} onChange={(e) => setLang(e.target.value as Lang)} className="h-9 rounded-md border border-line bg-ink-900 px-2">
            {Object.entries(LANGS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
        {providers.length > 1 && (
          <label className="flex flex-col gap-1">
            <span className="text-xs text-dim">Voice engine</span>
            <select value={provider} disabled={!!session} onChange={(e) => setProvider(e.target.value)} className="h-9 rounded-md border border-line bg-ink-900 px-2">
              {providers.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
        )}
        {session && (
          <button type="button" onClick={hangUp} className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-md bg-red-600 px-3 text-white">
            <PhoneOff className="size-4" aria-hidden /> End
          </button>
        )}
      </div>
      {context && <p className="text-xs text-dim">Context: {contextLabel ?? `${context.entity} ${context.id}`}. {current?.persona ?? current?.name} can see this record if you can.</p>}

      <div ref={listRef} aria-live="polite" className={cn("flex-1 space-y-3 overflow-y-auto rounded-lg border border-line bg-ink-900 p-3", compact ? "min-h-0" : "max-h-[55vh] min-h-64")}>
        {!msgs.length && <p className="text-sm text-muted">Press the microphone and speak, or type below. You can interrupt an answer at any time by pressing the microphone again.</p>}
        {msgs.map((m) => (
          <div key={m.id} className={cn("max-w-[90%] rounded-lg px-3 py-2 text-sm", m.role === "user" ? "ml-auto bg-brand-blue/10" : "bg-ink-850")}>
            <p className="whitespace-pre-wrap">{m.text}</p>
            {m.interrupted && <p className="mt-1 text-xs text-dim">Interrupted</p>}
            {!!m.actions?.length && (
              <ul className="mt-2 space-y-1 border-t border-line pt-2 text-xs">
                {m.actions.map((a, i) => (
                  <li key={i}>
                    {a.status === "PENDING_APPROVAL" ? "Waiting for approval: " : a.status === "BLOCKED" ? "Blocked: " : "Done: "}
                    {a.summary} {a.status === "PENDING_APPROVAL" && <Link href="/admin/ai/approvals" className="text-brand-blue">Review</Link>}
                  </li>
                ))}
              </ul>
            )}
            {m.taskId && <Link href={`/admin/ai/tasks/${m.taskId}`} className="mt-1 block text-xs text-brand-blue">Open background task</Link>}
          </div>
        ))}
        {thinking && <p className="flex items-center gap-2 text-sm text-muted"><Loader2 className="size-4 animate-spin" aria-hidden /> {current?.persona ?? current?.name} is working on it…</p>}
        {interim && <p className="ml-auto max-w-[90%] text-right text-sm italic text-muted">{interim}</p>}
      </div>

      {error && (
        <div role="alert" className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-700">
          <p>{error.message}</p>
          {error.detail && <p className="mt-1 font-mono text-xs opacity-80">{error.stage}: {error.detail}</p>}
        </div>
      )}
      {(isDev || error) && <VoiceDiagnostics key={error ? "err" : "dev"} agent={agent} provider={session ? (session.serverAudio ? "openai" : "browser") : provider} serverAudio={serverAudio} open={!!error && error.stage !== "AI_EMPLOYEE"} />}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void listen()}
          disabled={thinking}
          aria-pressed={listening}
          aria-label={listening ? "Stop listening" : "Start talking"}
          title={canListen ? undefined : "Voice input isn't available in this browser"}
          className={cn("inline-flex size-11 shrink-0 items-center justify-center rounded-full text-white transition-colors disabled:opacity-40", listening ? "animate-pulse bg-red-600" : "bg-brand-blue")}
        >
          {listening ? <Square className="size-4" aria-hidden /> : canListen ? <Mic className="size-5" aria-hidden /> : <MicOff className="size-5" aria-hidden />}
        </button>
        <form
          className="flex flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send(text);
          }}
        >
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={listening ? "Listening…" : "Type a message"} aria-label="Message" maxLength={4000} className="h-11 flex-1 rounded-md border border-line bg-ink-900 px-3 text-sm" />
          <button type="submit" disabled={thinking || !text.trim()} aria-label="Send" className="inline-flex size-11 items-center justify-center rounded-md border border-line disabled:opacity-40">
            <Send className="size-4" aria-hidden />
          </button>
        </form>
        {speaking ? (
          <button type="button" onClick={() => stopSpeaking(true)} aria-label="Stop speaking" className="inline-flex size-11 items-center justify-center rounded-md border border-line"><Square className="size-4" aria-hidden /></button>
        ) : (
          <button type="button" onClick={() => setMuted((v) => !v)} aria-pressed={muted} aria-label={muted ? "Unmute replies" : "Mute replies"} className="inline-flex size-11 items-center justify-center rounded-md border border-line">{muted ? <VolumeX className="size-4" aria-hidden /> : <Volume2 className="size-4" aria-hidden />}</button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-dim">
        {listening && <span className="flex items-center gap-1 font-medium text-red-700"><span className="size-2 rounded-full bg-red-600" aria-hidden /> Microphone on</span>}
        <label className="flex items-center gap-1"><input type="checkbox" checked={handsFree} onChange={(e) => setHandsFree(e.target.checked)} /> Conversation mode (listen again after each answer)</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={background} onChange={(e) => setBackground(e.target.checked)} /> Run next request as a background task</label>
        <span>Transcripts are saved; raw audio is never stored.</span>
      </div>
    </div>
  );
}
