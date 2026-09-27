/**
 * Microphone and voice-stage tests with a fake browser (no database, no real devices):
 *
 *   npm run test:voice
 */
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { classifyMicError, classifySpeechError, openMicrophone, pickRecorderType, recordingExtension, runVoiceDiagnostics, VOICE_MESSAGES, type DiagRow } from "../../lib/voice/mic";
import nextConfig from "../../next.config";

const err = (name: string, message = "x") => Object.assign(new Error(message), { name });

type FakeOpts = { secure?: boolean; mediaDevices?: boolean; policy?: boolean; permission?: PermissionState; inputs?: number; gum?: () => Promise<unknown>; audioState?: AudioContextState; recorder?: string[] | null };

const saved = new Map<string, PropertyDescriptor | undefined>();
const set = (k: string, v: unknown) => {
  if (!saved.has(k)) saved.set(k, Object.getOwnPropertyDescriptor(globalThis, k));
  Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
};
afterEach(() => {
  for (const [k, d] of saved) {
    if (d) Object.defineProperty(globalThis, k, d);
    else delete (globalThis as Record<string, unknown>)[k];
  }
  saved.clear();
});

function fakeBrowser(o: FakeOpts = {}) {
  let released = 0;
  const stream = { getAudioTracks: () => [{ label: "Fake mic" }], getTracks: () => [{ stop: () => void released++ }] };
  const mediaDevices = {
    getUserMedia: o.gum ?? (async () => stream),
    enumerateDevices: async () => Array.from({ length: o.inputs ?? 1 }, () => ({ kind: "audioinput" })),
  };
  set("window", { isSecureContext: o.secure ?? true, AudioContext: class { state: AudioContextState = "suspended"; async resume() { this.state = o.audioState ?? "running"; } async close() {} }, speechSynthesis: {} });
  set("location", { protocol: o.secure === false ? "http:" : "https:", origin: "https://shivacha.com", hostname: "shivacha.com" });
  set("document", { featurePolicy: { allowsFeature: () => o.policy ?? true } });
  set("navigator", { mediaDevices: o.mediaDevices === false ? undefined : mediaDevices, permissions: { query: async () => ({ state: o.permission ?? "granted" }) } });
  set("MediaRecorder", o.recorder === null ? undefined : { isTypeSupported: (t: string) => (o.recorder ?? ["audio/webm;codecs=opus"]).includes(t) });
  return { released: () => released };
}
const row = (rows: DiagRow[], label: string) => rows.find((r) => r.label.startsWith(label));

test("1. permission granted: the microphone opens", async () => {
  fakeBrowser();
  const r = await openMicrophone();
  assert.ok("stream" in r);
});

test("2. permission denied by the user: permission message with the real browser error", async () => {
  fakeBrowser({ permission: "denied", gum: async () => Promise.reject(err("NotAllowedError", "Permission denied")) });
  const r = await openMicrophone();
  assert.ok("failure" in r);
  assert.equal(r.failure.stage, "MIC_PERMISSION");
  assert.equal(r.failure.message, VOICE_MESSAGES.permission);
  assert.equal(r.failure.detail, "NotAllowedError: Permission denied");
});

test("2b. the production bug: site Permissions-Policy blocks the mic while Chrome says granted", async () => {
  fakeBrowser({ policy: false, permission: "granted" });
  const r = await openMicrophone();
  assert.ok("failure" in r);
  assert.equal(r.failure.stage, "MIC_POLICY");
  assert.doesNotMatch(r.failure.message, /Allow microphone access for Shivacha in Chrome/);
  // Same exception, classified from its context rather than its name.
  assert.equal(classifyMicError(err("NotAllowedError", "Permission denied"), { policyAllows: false, permission: "granted" }).stage, "MIC_POLICY");
  assert.notEqual(classifyMicError(err("NotAllowedError"), { permission: "granted" }).stage, "MIC_PERMISSION");
});

test("3. permission prompt dismissed: still a permission problem", async () => {
  fakeBrowser({ permission: "prompt", gum: async () => Promise.reject(err("NotAllowedError", "Permission dismissed")) });
  const r = await openMicrophone();
  assert.ok("failure" in r && r.failure.stage === "MIC_PERMISSION");
});

test("4. no microphone device", async () => {
  fakeBrowser({ inputs: 0, gum: async () => Promise.reject(err("NotFoundError", "Requested device not found")) });
  const r = await openMicrophone();
  assert.ok("failure" in r);
  assert.equal(r.failure.stage, "MIC_DEVICE");
  assert.equal(r.failure.message, VOICE_MESSAGES.noDevice);
});

test("5. device busy (another app holds the microphone)", async () => {
  fakeBrowser({ gum: async () => Promise.reject(err("NotReadableError", "Could not start audio source")) });
  const r = await openMicrophone();
  assert.ok("failure" in r);
  assert.equal(r.failure.stage, "MIC_BUSY");
  assert.equal(r.failure.message, VOICE_MESSAGES.busy);
});

test("6. insecure context (http): not called permission denied", async () => {
  fakeBrowser({ secure: false });
  const r = await openMicrophone();
  assert.ok("failure" in r);
  assert.equal(r.failure.stage, "MIC_UNAVAILABLE");
  assert.equal(r.failure.message, VOICE_MESSAGES.insecure);
});

test("7. navigator.mediaDevices unavailable", async () => {
  fakeBrowser({ mediaDevices: false });
  const r = await openMicrophone();
  assert.ok("failure" in r);
  assert.equal(r.failure.stage, "MIC_UNAVAILABLE");
  assert.equal(r.failure.message, VOICE_MESSAGES.unavailable);
});

test("8. AudioContext stays suspended: a warning, not a permission failure", async () => {
  fakeBrowser({ audioState: "suspended" });
  const rows = await runVoiceDiagnostics({ serverAudio: false });
  assert.equal(row(rows, "AudioContext")?.status, "WARN");
  assert.equal(row(rows, "Microphone permission")?.status, "PASS");
  assert.equal(row(rows, "getUserMedia")?.status, "PASS");
});

test("9. MediaRecorder unsupported: audio initialization stage, recorder type picked dynamically", async () => {
  assert.equal(pickRecorderType(null), null);
  assert.equal(pickRecorderType((t) => t === "audio/mp4"), "audio/mp4");
  assert.equal(pickRecorderType(() => false), "");
  assert.equal(recordingExtension("audio/mp4"), "m4a");
  assert.equal(recordingExtension("audio/webm;codecs=opus"), "webm");
  fakeBrowser({ recorder: null });
  const rows = await runVoiceDiagnostics({ serverAudio: true });
  assert.equal(row(rows, "MediaRecorder")?.status, "FAIL");
  assert.equal(row(rows, "getUserMedia")?.status, "PASS");
});

test("10. voice provider unavailable is reported after a working microphone", async () => {
  fakeBrowser();
  const rows = await runVoiceDiagnostics({ serverAudio: true, checkServer: async () => ({ provider: { label: "Voice provider", status: "FAIL", value: "OpenAI speech (server) is not configured on the server" }, employee: { label: "AI employee", status: "PASS", value: "ready" } }) });
  assert.equal(row(rows, "getUserMedia")?.status, "PASS");
  assert.equal(row(rows, "Voice provider")?.status, "FAIL");
});

test("11. speech service / connection failures are provider errors, not permission errors", () => {
  assert.equal(classifySpeechError("network")?.stage, "VOICE_PROVIDER");
  assert.equal(classifySpeechError("not-allowed", { permission: "granted" })?.stage, "SPEECH_RECOGNITION");
  assert.equal(classifySpeechError("not-allowed", { policyAllows: false })?.stage, "MIC_POLICY");
  assert.equal(classifySpeechError("not-allowed", { permission: "denied" })?.stage, "MIC_PERMISSION");
  assert.equal(classifySpeechError("audio-capture", { audioInputs: 0 })?.stage, "MIC_DEVICE");
  assert.equal(classifySpeechError("audio-capture", { micOpened: true })?.stage, "SPEECH_RECOGNITION");
  assert.equal(classifySpeechError("no-speech"), null);
  assert.equal(classifyMicError(err("OverconstrainedError")).stage, "MIC_CONSTRAINT");
  assert.equal(classifyMicError(err("AbortError")).stage, "MIC_BUSY");
  assert.equal(classifyMicError(err("TypeError")).stage, "MIC_UNAVAILABLE");
  assert.equal(classifyMicError(err("WeirdError", "boom")).stage, "UNKNOWN");
});

test("12. successful voice session: every stage passes", async () => {
  const b = fakeBrowser();
  const rows = await runVoiceDiagnostics({ serverAudio: true, checkServer: async () => ({ provider: { label: "Voice provider", status: "PASS", value: "ok" }, employee: { label: "AI employee", status: "PASS", value: "ready" } }) });
  assert.deepEqual(rows.filter((r) => r.status === "FAIL"), []);
  assert.equal(b.released(), 1, "the diagnostic releases the microphone");
});

test("13. retry after failure: a second attempt succeeds once the cause is gone", async () => {
  let n = 0;
  fakeBrowser({ gum: async () => (n++ === 0 ? Promise.reject(err("NotReadableError")) : { getTracks: () => [] }) });
  const first = await openMicrophone();
  assert.ok("failure" in first);
  const second = await openMicrophone();
  assert.ok("stream" in second);
});

test("site headers allow the microphone and location for this origin only, and replies can play", async () => {
  const groups = await nextConfig.headers!();
  const h = groups.find((g) => g.source === "/:path*")!.headers;
  const policy = h.find((x) => x.key === "Permissions-Policy")!.value;
  assert.match(policy, /microphone=\(self\)/);
  assert.match(policy, /geolocation=\(self\)/);
  assert.match(policy, /camera=\(\)/);
  assert.match(h.find((x) => x.key === "Content-Security-Policy")!.value, /media-src 'self' blob:/);
});
