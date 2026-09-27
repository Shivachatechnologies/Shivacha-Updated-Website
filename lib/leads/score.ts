/**
 * Rule-based lead score (0–100). Transparent on purpose so sales can reason about it.
 * Budget informs the score but never rejects a lead.
 */
const BUDGET_POINTS: Record<string, number> = {
  "$50K+": 35,
  "$25K–$50K": 28,
  "$10K–$25K": 20,
  "$5K–$10K": 12,
  "Under $5K": 5,
  "Not Sure Yet": 10,
};

const HIGH_VALUE_SERVICES = new Set([
  "FinTech Development",
  "Crypto Exchange Development",
  "Blockchain Development",
  "Web3 Development",
  "AI Development",
  "Dedicated Development Team",
]);

const FREE_EMAIL = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.in", "hotmail.com", "outlook.com", "live.com", "msn.com", "icloud.com", "me.com",
  "aol.com", "proton.me", "protonmail.com", "gmx.com", "mail.com", "yandex.com", "zoho.com", "rediffmail.com",
]);

export const isWorkEmail = (email: string) => {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  return !!domain && !FREE_EMAIL.has(domain);
};

export type ScoreLabel = "Hot" | "Warm" | "Nurture";

/**
 * Fit (budget, service, work email, phone, company, brief) plus engagement (return visits, pages viewed,
 * high-intent pages such as the estimator, hire or pricing pages, and paid-campaign traffic).
 * Low scores are labelled Nurture — never rejected.
 */
export function scoreLead(
  l: { email: string; phone: string; company: string; service: string; budget: string; description: string },
  e: { visits?: number; pagesViewed?: number; intentPages?: number; paid?: boolean } = {},
) {
  let s = l.budget ? (BUDGET_POINTS[l.budget] ?? 8) : 8;
  if (l.service) s += HIGH_VALUE_SERVICES.has(l.service) ? 15 : l.service === "Other" ? 5 : 10;
  if (isWorkEmail(l.email)) s += 15;
  if (l.phone) s += 10;
  if (l.company) s += 10;
  const len = l.description.trim().length;
  s += len > 200 ? 15 : len > 60 ? 8 : len > 0 ? 3 : 0;
  // Engagement signals (capped at 15 so fit still dominates).
  let eng = 0;
  if ((e.visits ?? 1) > 1) eng += 5;
  if ((e.pagesViewed ?? 1) >= 5) eng += 3;
  eng += Math.min(2, e.intentPages ?? 0) * 3;
  if (e.paid) eng += 2;
  s += Math.min(15, eng);
  const score = Math.min(100, s);
  const label: ScoreLabel = score >= 70 ? "Hot" : score >= 45 ? "Warm" : "Nurture";
  return { score, label };
}

/** Next follow-up: next business day at 10:00 in the sales team's time zone (IST, UTC+5:30). */
export function nextFollowUp(from = new Date()) {
  const d = new Date(from.getTime() + 5.5 * 3600_000); // shift to IST for calendar maths
  d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(10, 0, 0, 0);
  return new Date(d.getTime() - 5.5 * 3600_000); // back to UTC
}
