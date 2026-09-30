import { isWorkEmail } from "@/lib/leads/score";

/**
 * Growth lead qualification (pure). Five transparent sub-scores (0–100) → weighted total → tier. Every point comes
 * from a recorded field or event and is listed in `signals`; nothing is inferred about the person (no sensitive traits,
 * no identity guessing). Budget informs the score but never disqualifies on its own.
 */
export const TIERS = ["SALES_READY", "QUALIFIED", "NURTURE", "LOW_FIT"] as const;
export type Tier = (typeof TIERS)[number];
export const TIER_LABELS: Record<Tier, string> = { SALES_READY: "Sales-ready", QUALIFIED: "Qualified", NURTURE: "Nurture", LOW_FIT: "Low fit" };

export interface QualifyInput {
  email: string;
  company?: string | null;
  website?: string | null;
  phone?: string | null;
  country?: string | null;
  service?: string | null;
  product?: string | null;
  budget?: string | null;
  message?: string | null;
  formType?: string | null;
  utmMedium?: string | null;
}

export interface EngagementFacts {
  visits?: number;
  pagesViewed?: number;
  /** Visits to pricing, estimator, hire, demo or contact pages. */
  intentPages?: number;
  emailReplies?: number;
  emailClicks?: number;
  meetingBooked?: boolean;
  demoRequested?: boolean;
}

/** Ideal customer profile. Empty lists mean "any". Countries are ISO codes or names (case-insensitive). */
export interface Icp {
  countries?: string[];
  services?: string[];
  minBudget?: number;
}

export interface Qualification {
  fit: number;
  intent: number;
  engagement: number;
  budget: number;
  timeline: number;
  total: number;
  tier: Tier;
  signals: string[];
  reason: string;
}

export const WEIGHTS = { fit: 0.3, intent: 0.25, engagement: 0.15, budget: 0.15, timeline: 0.15 } as const;

/** Upper bound in USD of the website's budget options ("Not Sure Yet" → null). */
export function budgetUpperUsd(b: string | null | undefined): number | null {
  if (!b) return null;
  const s = b.replace(/,/g, "").toUpperCase();
  if (/NOT SURE/.test(s)) return null;
  const nums = [...s.matchAll(/\$?\s*(\d+(?:\.\d+)?)\s*(K|M)?/g)].map((m) => Number(m[1]) * (m[2] === "M" ? 1e6 : m[2] === "K" ? 1e3 : 1));
  if (!nums.length) return null;
  if (/UNDER|BELOW|</.test(s)) return nums[0];
  return Math.max(...nums);
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const has = (v: string | null | undefined) => !!v && v.trim().length > 0;
const URGENT = /\b(asap|urgent(ly)?|immediately|this (week|month)|within (a|one|two|\d+) (week|month)s?|by (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*|q[1-4]\b|deadline|launch (date|in)|jaldi|turant)\b/i;
const LATER = /\b(next year|someday|just (exploring|researching|curious)|no (rush|timeline)|student|assignment|thesis)\b/i;
const BUYING = /\b(budget|quote|pricing|price|cost|proposal|rfp|vendor|hire|contract|demo|white[- ]?label|launch|build|develop|integrate|migrate)\b/i;

export function qualify(l: QualifyInput, e: EngagementFacts = {}, icp: Icp = {}): Qualification {
  const signals: string[] = [];
  const add = (cond: boolean, pts: number, why: string) => (cond ? (signals.push(`${pts > 0 ? "+" : ""}${pts} ${why}`), pts) : 0);
  const msg = (l.message ?? "").trim();

  // FIT — is this an organisation we can serve?
  let fit = 20;
  fit += add(isWorkEmail(l.email), 25, "work email domain");
  fit += add(has(l.company), 15, "company provided");
  fit += add(has(l.website), 10, "company website provided");
  fit += add(has(l.phone), 5, "phone provided");
  if (icp.countries?.length) {
    const c = (l.country ?? "").toLowerCase();
    fit += add(!!c && icp.countries.some((x) => x.toLowerCase() === c), 15, "country in target markets");
  } else fit += add(has(l.country), 5, "country known");
  if (icp.services?.length) {
    const svc = [l.service, l.product].filter(Boolean).map((x) => x!.toLowerCase());
    fit += add(svc.some((x) => icp.services!.some((t) => x.includes(t.toLowerCase()))), 15, "service matches ICP");
  } else fit += add(has(l.service) || has(l.product), 10, "service/product selected");
  fit += add(!isWorkEmail(l.email) && !has(l.company), -15, "personal email and no company");

  // INTENT — did they ask for something specific?
  let intent = 10;
  intent += add(/demo|meeting|consult|quote|estimate|hire/i.test(l.formType ?? ""), 30, `high-intent form (${l.formType})`);
  intent += add(!!e.demoRequested, 20, "requested a demo");
  intent += add(BUYING.test(msg), 20, "buying language in message");
  intent += add(msg.length > 200, 15, "detailed brief");
  intent += add(msg.length > 40 && msg.length <= 200, 7, "short brief");
  intent += add(Math.min(3, e.intentPages ?? 0) > 0, Math.min(3, e.intentPages ?? 0) * 5, "visited pricing/estimator/demo pages");
  intent += add(/cpc|paid|ppc|cpm/i.test(l.utmMedium ?? ""), 5, "came from a paid campaign");

  // ENGAGEMENT — recorded interactions only.
  let engagement = 0;
  engagement += add((e.visits ?? 0) > 1, 20, `${e.visits} website visits`);
  engagement += add((e.pagesViewed ?? 0) >= 5, 15, `${e.pagesViewed} pages viewed`);
  engagement += add((e.emailClicks ?? 0) > 0, 15, "clicked an email");
  engagement += add((e.emailReplies ?? 0) > 0, 30, "replied to an email");
  engagement += add(!!e.meetingBooked, 40, "meeting booked");

  // BUDGET
  const usd = budgetUpperUsd(l.budget);
  let budget = usd == null ? (has(l.budget) ? 40 : 30) : usd >= 50_000 ? 100 : usd >= 25_000 ? 85 : usd >= 10_000 ? 65 : usd >= 5_000 ? 45 : 20;
  if (usd != null) signals.push(`budget ${l.budget}`);
  if (icp.minBudget && usd != null && usd < icp.minBudget) {
    budget = Math.min(budget, 25);
    signals.push("budget below ICP minimum");
  }

  // TIMELINE
  let timeline = 40;
  timeline += add(URGENT.test(msg), 40, "urgent timeline mentioned");
  timeline += add(!!e.meetingBooked, 20, "meeting on the calendar");
  timeline += add(LATER.test(msg), -30, "no near-term timeline");

  const s = { fit: clamp(fit), intent: clamp(intent), engagement: clamp(engagement), budget: clamp(budget), timeline: clamp(timeline) };
  const total = clamp(s.fit * WEIGHTS.fit + s.intent * WEIGHTS.intent + s.engagement * WEIGHTS.engagement + s.budget * WEIGHTS.budget + s.timeline * WEIGHTS.timeline);
  const tier: Tier = total >= 70 && s.fit >= 60 && s.intent >= 60 ? "SALES_READY" : total >= 50 && s.fit >= 45 ? "QUALIFIED" : total >= 30 && s.fit >= 25 ? "NURTURE" : "LOW_FIT";
  const top = signals.filter((x) => x.startsWith("+")).slice(0, 4).map((x) => x.replace(/^\+\d+ /, ""));
  const neg = signals.filter((x) => x.startsWith("-")).map((x) => x.replace(/^-\d+ /, ""));
  const reason = `${TIER_LABELS[tier]} (${total}/100: fit ${s.fit}, intent ${s.intent}, engagement ${s.engagement}, budget ${s.budget}, timeline ${s.timeline}).${top.length ? ` Strengths: ${top.join(", ")}.` : ""}${neg.length ? ` Concerns: ${neg.join(", ")}.` : ""}`;
  return { ...s, total, tier, signals, reason };
}

/** Maps a tier onto the existing CRM lifecycle (never downgrades a lead that sales has already advanced). */
export const TIER_LIFECYCLE: Record<Tier, "SQL" | "MQL" | "LEAD"> = { SALES_READY: "SQL", QUALIFIED: "MQL", NURTURE: "LEAD", LOW_FIT: "LEAD" };
const STAGE_ORDER = ["LEAD", "MQL", "SQL", "OPPORTUNITY", "CUSTOMER"];
export const shouldAdvanceStage = (current: string, tier: Tier) => {
  const cur = STAGE_ORDER.indexOf(current);
  return cur >= 0 && STAGE_ORDER.indexOf(TIER_LIFECYCLE[tier]) > cur;
};
