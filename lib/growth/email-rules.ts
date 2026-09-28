import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Email sequence rules (pure): cadence, reply classification, unsubscribe tokens and message rendering. Every growth
 * email carries a working unsubscribe link; without a signing secret no growth email can be sent.
 */

export interface SequenceStep {
  day: number;
  subject: string;
  body: string;
}

export const DEFAULT_CADENCE = [0, 2, 5, 9, 14] as const;

export const normalizeEmail = (e: string) => e.trim().toLowerCase();
export const isEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim());

/** When the next step is due, measured from the enrollment's start. Null when the sequence is finished. */
export function nextStepAt(steps: SequenceStep[], nextIndex: number, startedAt: Date): Date | null {
  const s = steps[nextIndex];
  return s ? new Date(startedAt.getTime() + s.day * 86400_000) : null;
}

export type ReplyClass = "UNSUBSCRIBE" | "NEGATIVE" | "OUT_OF_OFFICE" | "POSITIVE" | "NEUTRAL";

const UNSUB = /\b(unsubscribe|remove me|take me off|stop (emailing|sending|contacting)|opt[- ]?out|do not (email|contact)|don'?t (email|contact))\b/i;
const NEG = /\b(not interested|no thanks|no thank you|not a fit|not relevant|leave me alone|spam|stop|please don'?t|already have (a )?(vendor|partner|solution)|nahi chahiye|interest nahi)\b/i;
const OOO = /\b(out of (the )?office|on (annual )?leave|on vacation|auto[- ]?reply|automatic reply)\b/i;
const POS = /\b(interested|let'?s (talk|chat|connect|meet)|book|schedule|call me|send (me )?(more|details|pricing|a proposal)|sounds good|yes|haan|share (details|pricing))\b/i;

/** Classifies a reply. Anything negative or an opt-out stops the sequence and suppresses the address. */
export function classifyReply(text: string): ReplyClass {
  const t = text.slice(0, 5000);
  if (UNSUB.test(t)) return "UNSUBSCRIBE";
  if (NEG.test(t)) return "NEGATIVE";
  if (OOO.test(t)) return "OUT_OF_OFFICE";
  if (POS.test(t)) return "POSITIVE";
  return "NEUTRAL";
}

/** Replies that end the sequence. Positive replies also stop it: a human takes over the conversation. */
export const STOPS_SEQUENCE: Record<ReplyClass, boolean> = { UNSUBSCRIBE: true, NEGATIVE: true, POSITIVE: true, OUT_OF_OFFICE: false, NEUTRAL: true };
export const SUPPRESSES: Record<ReplyClass, boolean> = { UNSUBSCRIBE: true, NEGATIVE: true, POSITIVE: false, OUT_OF_OFFICE: false, NEUTRAL: false };

export function unsubscribeToken(email: string, secret: string): string {
  const e = normalizeEmail(email);
  const sig = createHmac("sha256", secret).update(`unsub:${e}`).digest("base64url").slice(0, 32);
  return `${Buffer.from(e).toString("base64url")}.${sig}`;
}

export function verifyUnsubscribeToken(token: string, secret: string): string | null {
  const [b, sig] = token.split(".");
  if (!b || !sig) return null;
  let email: string;
  try {
    email = Buffer.from(b, "base64url").toString("utf8");
  } catch {
    return null;
  }
  if (!isEmail(email)) return null;
  const want = unsubscribeToken(email, secret).split(".")[1];
  const a = Buffer.from(sig);
  const w = Buffer.from(want);
  return a.length === w.length && timingSafeEqual(a, w) ? normalizeEmail(email) : null;
}

/** Fills {{name}}, {{firstName}}, {{company}} and appends the mandatory unsubscribe footer. */
export function renderStep(step: SequenceStep, v: { name?: string | null; company?: string | null; unsubscribeUrl: string; sender?: string }): { subject: string; body: string } {
  const first = (v.name ?? "").trim().split(/\s+/)[0] || "there";
  const fill = (s: string) => s.replace(/\{\{\s*firstName\s*\}\}/g, first).replace(/\{\{\s*name\s*\}\}/g, v.name?.trim() || "there").replace(/\{\{\s*company\s*\}\}/g, v.company?.trim() || "your team");
  const footer = `\n\n—\n${v.sender ?? "Shivacha Technologies"}\nYou received this because of your interest in Shivacha. Unsubscribe: ${v.unsubscribeUrl}`;
  return { subject: fill(step.subject).slice(0, 200), body: fill(step.body) + footer };
}

/** Default 5-step nurture (Day 0/2/5/9/14). Editable per sequence; no claims or guarantees. */
export const DEFAULT_STEPS: SequenceStep[] = [
  { day: 0, subject: "Thanks for reaching out, {{firstName}}", body: "Hi {{firstName}},\n\nThanks for your interest in Shivacha. A member of our team will review what {{company}} is looking for and reply personally.\n\nIf it helps, reply with your timeline and any must-have integrations." },
  { day: 2, subject: "How teams like {{company}} usually start", body: "Hi {{firstName}},\n\nMost engagements start with a short discovery call to map requirements, compliance needs and integrations, followed by a written scope and estimate.\n\nWould a 30-minute call next week be useful?" },
  { day: 5, subject: "A relevant case study", body: "Hi {{firstName}},\n\nOur case studies (https://www.shivacha.com/case-studies) show how we approach architecture, security and launch for platforms similar to yours.\n\nHappy to walk you through one that matches your use case." },
  { day: 9, subject: "Any questions on scope or budget?", body: "Hi {{firstName}},\n\nIf budget or scope is the open question, reply with a rough range and we'll suggest a phased plan that fits it." },
  { day: 14, subject: "Should I close your request?", body: "Hi {{firstName}},\n\nI haven't heard back, so I'll close this request for now. Reply any time and we'll pick it up again." },
];
