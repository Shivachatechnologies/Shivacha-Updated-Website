/**
 * Microphone access for voice sessions, with failures classified by stage so the UI never reports
 * "permission denied" unless the browser actually says so. Everything here runs in the browser and is only
 * called from a click handler (a user gesture); nothing requests the microphone on page load.
 */

export type VoiceStage = "MIC_UNAVAILABLE" | "MIC_POLICY" | "MIC_PERMISSION" | "MIC_DEVICE" | "MIC_BUSY" | "MIC_CONSTRAINT" | "AUDIO_INITIALIZATION" | "SPEECH_RECOGNITION" | "VOICE_PROVIDER" | "AI_EMPLOYEE" | "UNKNOWN";

export interface VoiceFailure {
  stage: VoiceStage;
  message: string;
  /** The raw browser error, e.g. "NotAllowedError: Permission denied". Safe to show: it never contains secrets. */
  detail?: string;
}

export type PermissionStateLite = "granted" | "prompt" | "denied" | "unsupported";

/** What we know about the environment when getUserMedia failed. */
export interface MicContext {
  /** false when the page's Permissions-Policy header forbids the microphone (Chrome/Edge report this). */
  policyAllows?: boolean | null;
  permission?: PermissionStateLite;
  /** Number of audio input devices, or null when it could not be enumerated. */
  audioInputs?: number | null;
  /** getUserMedia already opened the microphone successfully on this click. */
  micOpened?: boolean;
}

export const VOICE_MESSAGES = {
  unavailable: "Microphone access is unavailable in this browser context. Open Shivacha OS over https in a normal browser window.",
  insecure: "Microphone access needs a secure (https) connection.",
  policy: "Microphone access is blocked by this site's security settings (Permissions-Policy), not by your browser. Please tell your administrator.",
  permission: "Microphone access is blocked. Allow microphone access for Shivacha in Chrome (the icon at the left of the address bar) and try again.",
  noDevice: "No microphone was detected. Connect a microphone and try again.",
  busy: "Your microphone is available but could not be opened. Another application may be using it.",
  constraint: "Your microphone does not support the requested audio settings.",
  aborted: "Opening the microphone was interrupted. Try again.",
  recorder: "Microphone access is working, but this browser cannot record audio for the voice service. Try another voice engine or type instead.",
  unsupported: "Voice input is not available in this browser. You can continue by typing.",
  provider: "Microphone access is working, but the voice service is currently unavailable.",
  speechNetwork: "Microphone access is working, but the browser's speech recognition service could not be reached.",
  language: "Speech recognition does not support this language in this browser. Pick another language or type.",
  ai: "Voice input is working, but the AI employee service is not connected.",
} as const;

const named = (e: unknown) => {
  const x = (e ?? {}) as { name?: unknown; message?: unknown; constraint?: unknown };
  return { name: typeof x.name === "string" ? x.name : "Error", message: typeof x.message === "string" ? x.message : String(e), constraint: typeof x.constraint === "string" ? x.constraint : undefined };
};

export const describeError = (e: unknown) => {
  const { name, message, constraint } = named(e);
  return `${name}: ${message}${constraint ? ` (constraint: ${constraint})` : ""}`;
};

/** Map a getUserMedia rejection to the stage that actually failed. */
export function classifyMicError(e: unknown, ctx: MicContext = {}): VoiceFailure {
  const { name } = named(e);
  const detail = describeError(e);
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      // The same DOMException is thrown when the site's own header forbids the microphone; tell them apart.
      if (ctx.policyAllows === false) return { stage: "MIC_POLICY", message: VOICE_MESSAGES.policy, detail };
      if (name === "SecurityError" && ctx.permission !== "denied") return { stage: "MIC_UNAVAILABLE", message: VOICE_MESSAGES.insecure, detail };
      if (ctx.permission === "granted") return { stage: "MIC_POLICY", message: "The browser allows the microphone for this site but refused to open it. This usually means a site security setting or an operating system privacy setting is blocking it.", detail };
      return { stage: "MIC_PERMISSION", message: VOICE_MESSAGES.permission, detail };
    case "NotFoundError":
    case "DevicesNotFoundError":
      return { stage: "MIC_DEVICE", message: VOICE_MESSAGES.noDevice, detail };
    case "NotReadableError":
    case "TrackStartError":
      return ctx.audioInputs === 0 ? { stage: "MIC_DEVICE", message: VOICE_MESSAGES.noDevice, detail } : { stage: "MIC_BUSY", message: VOICE_MESSAGES.busy, detail };
    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
      return { stage: "MIC_CONSTRAINT", message: VOICE_MESSAGES.constraint, detail };
    case "AbortError":
      return { stage: "MIC_BUSY", message: VOICE_MESSAGES.aborted, detail };
    case "TypeError":
      return { stage: "MIC_UNAVAILABLE", message: VOICE_MESSAGES.unavailable, detail };
    default:
      return { stage: "UNKNOWN", message: `The microphone could not be started (${detail}).`, detail };
  }
}

/** Map a Web Speech API error code (SpeechRecognitionErrorEvent.error). Returns null for benign codes. */
export function classifySpeechError(code: string, ctx: MicContext = {}): VoiceFailure | null {
  const detail = `SpeechRecognition: ${code}`;
  switch (code) {
    case "no-speech":
    case "aborted":
      return null;
    case "not-allowed":
      if (ctx.policyAllows === false) return { stage: "MIC_POLICY", message: VOICE_MESSAGES.policy, detail };
      if (ctx.permission === "granted") return { stage: "SPEECH_RECOGNITION", message: "The microphone is allowed, but the browser's speech recognition refused to start. Try again, or switch the voice engine.", detail };
      return { stage: "MIC_PERMISSION", message: VOICE_MESSAGES.permission, detail };
    case "service-not-allowed":
      return { stage: "SPEECH_RECOGNITION", message: "This browser does not allow its speech recognition service here. Use Chrome or Edge, pick another voice engine, or type.", detail };
    case "audio-capture":
      if (ctx.micOpened) return { stage: "SPEECH_RECOGNITION", message: "The microphone works, but the browser's speech recognition could not capture audio. Try again, or switch the voice engine.", detail };
      return ctx.audioInputs === 0 ? { stage: "MIC_DEVICE", message: VOICE_MESSAGES.noDevice, detail } : { stage: "MIC_BUSY", message: VOICE_MESSAGES.busy, detail };
    case "network":
      return { stage: "VOICE_PROVIDER", message: VOICE_MESSAGES.speechNetwork, detail };
    case "language-not-supported":
      return { stage: "SPEECH_RECOGNITION", message: VOICE_MESSAGES.language, detail };
    default:
      return { stage: "SPEECH_RECOGNITION", message: `Voice input error: ${code}.`, detail };
  }
}

/** Container types in preference order; the first one the browser can record is used. */
export const RECORDER_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", "audio/ogg"] as const;

/** Pick a MediaRecorder type the browser supports. "" means "let the browser choose"; null means no recorder. */
export function pickRecorderType(isSupported: ((t: string) => boolean) | null | undefined): string | null {
  if (!isSupported) return null;
  return RECORDER_TYPES.find((t) => {
    try {
      return isSupported(t);
    } catch {
      return false;
    }
  }) ?? "";
}

/** File extension for an uploaded recording, from its MIME type. */
export const recordingExtension = (mime: string) => (/mp4|m4a|aac/.test(mime) ? "m4a" : /ogg/.test(mime) ? "ogg" : "webm");

// ---------- browser-only helpers (call from event handlers) ----------

type FeaturePolicyDoc = Document & { featurePolicy?: { allowsFeature(f: string): boolean }; permissionsPolicy?: { allowsFeature(f: string): boolean } };

export function policyAllowsMicrophone(): boolean | null {
  if (typeof document === "undefined") return null;
  const d = document as FeaturePolicyDoc;
  const p = d.permissionsPolicy ?? d.featurePolicy;
  try {
    return p ? p.allowsFeature("microphone") : null;
  } catch {
    return null;
  }
}

export async function micPermissionState(): Promise<PermissionStateLite> {
  try {
    const s = await navigator.permissions.query({ name: "microphone" as PermissionName });
    return s.state;
  } catch {
    return "unsupported";
  }
}

export async function countAudioInputs(): Promise<number | null> {
  try {
    const d = await navigator.mediaDevices.enumerateDevices();
    return d.filter((x) => x.kind === "audioinput").length;
  } catch {
    return null;
  }
}

export async function micContext(): Promise<MicContext> {
  const [permission, audioInputs] = await Promise.all([micPermissionState(), countAudioInputs()]);
  return { policyAllows: policyAllowsMicrophone(), permission, audioInputs };
}

/** Why the microphone cannot even be requested here, or null when it can. */
export function micUnavailable(): VoiceFailure | null {
  if (typeof window === "undefined") return { stage: "MIC_UNAVAILABLE", message: VOICE_MESSAGES.unavailable };
  if (!window.isSecureContext) return { stage: "MIC_UNAVAILABLE", message: VOICE_MESSAGES.insecure, detail: `isSecureContext=false (${location.protocol})` };
  if (!navigator.mediaDevices?.getUserMedia) return { stage: "MIC_UNAVAILABLE", message: VOICE_MESSAGES.unavailable, detail: "navigator.mediaDevices is undefined" };
  if (policyAllowsMicrophone() === false) return { stage: "MIC_POLICY", message: VOICE_MESSAGES.policy, detail: "Permissions-Policy does not allow microphone" };
  return null;
}

/** Open the microphone with the simplest possible request ({ audio: true }). Must be called from a user gesture. */
export async function openMicrophone(): Promise<{ stream: MediaStream } | { failure: VoiceFailure }> {
  const blocked = micUnavailable();
  if (blocked) return { failure: blocked };
  try {
    return { stream: await navigator.mediaDevices.getUserMedia({ audio: true }) };
  } catch (e) {
    console.error("MICROPHONE_ERROR", e);
    return { failure: classifyMicError(e, await micContext()) };
  }
}

export type DiagStatus = "PASS" | "FAIL" | "WARN" | "SKIP";
export interface DiagRow {
  label: string;
  status: DiagStatus;
  value: string;
}

/**
 * Run each voice stage in order and report where it stops. Opens the microphone briefly (then releases it), so it
 * must be started by a click. Server checks (provider, AI employee) are passed in by the caller.
 */
export async function runVoiceDiagnostics(opts: { serverAudio: boolean; checkServer?: () => Promise<{ provider: DiagRow; employee: DiagRow }> }): Promise<DiagRow[]> {
  const rows: DiagRow[] = [];
  const add = (label: string, status: DiagStatus, value: string) => rows.push({ label, status, value });
  const secure = typeof window !== "undefined" && window.isSecureContext;
  add("Secure context", secure ? "PASS" : "FAIL", String(secure));
  add("Protocol", location.protocol === "https:" || location.hostname === "localhost" ? "PASS" : "FAIL", `${location.protocol} ${location.origin}`);
  const md = !!navigator.mediaDevices?.getUserMedia;
  add("MediaDevices API", md ? "PASS" : "FAIL", md ? "available" : "undefined");
  const policy = policyAllowsMicrophone();
  add("Permissions-Policy (microphone)", policy === false ? "FAIL" : policy ? "PASS" : "SKIP", policy === null ? "not reported by this browser" : policy ? "allowed" : "blocked by site header");
  const perm = await micPermissionState();
  add("Microphone permission", perm === "granted" ? "PASS" : perm === "denied" ? "FAIL" : "WARN", perm.toUpperCase());
  let stream: MediaStream | null = null;
  if (md) {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      add("getUserMedia({ audio: true })", "PASS", `${stream.getAudioTracks().length} audio track(s): ${stream.getAudioTracks()[0]?.label || "unnamed"}`);
    } catch (e) {
      const f = classifyMicError(e, { policyAllows: policy, permission: perm, audioInputs: await countAudioInputs() });
      add("getUserMedia({ audio: true })", "FAIL", `${f.detail} → ${f.stage}`);
    }
  } else add("getUserMedia({ audio: true })", "SKIP", "no MediaDevices API");
  const inputs = md ? await countAudioInputs() : null;
  add("Audio input device", inputs ? "PASS" : inputs === 0 ? "FAIL" : "SKIP", inputs === null ? "could not enumerate" : `${inputs} found`);
  const AC = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (AC) {
    try {
      const ac = new AC();
      await ac.resume();
      add("AudioContext", ac.state === "running" ? "PASS" : "WARN", ac.state.toUpperCase());
      await ac.close();
    } catch (e) {
      add("AudioContext", "FAIL", describeError(e));
    }
  } else add("AudioContext", "SKIP", "not supported");
  const type = pickRecorderType(typeof MediaRecorder === "undefined" ? null : (t) => MediaRecorder.isTypeSupported(t));
  add("MediaRecorder", type === null ? (opts.serverAudio ? "FAIL" : "SKIP") : "PASS", type === null ? "not supported" : type || "browser default type");
  const sr = !!(window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }).SpeechRecognition || !!(window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
  add("Browser speech recognition", sr ? "PASS" : opts.serverAudio ? "SKIP" : "FAIL", sr ? "available" : "not available");
  add("Speech synthesis", "speechSynthesis" in window ? "PASS" : "WARN", "speechSynthesis" in window ? "available" : "not available");
  stream?.getTracks().forEach((t) => t.stop());
  add("VAD / realtime connection", "SKIP", "not used: turns are sent over HTTPS, no WebSocket/WebRTC");
  if (opts.checkServer) {
    try {
      const s = await opts.checkServer();
      rows.push(s.provider, s.employee);
    } catch (e) {
      add("Voice provider", "FAIL", describeError(e));
    }
  }
  return rows;
}
