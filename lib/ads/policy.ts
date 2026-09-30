/**
 * Advertising policy (pure). Defaults are safe: no autonomous spending, no daily limit configured (so nothing can be
 * launched until the CEO sets one), emergency stop off. Amounts are in the ad account's currency (major units).
 */

export interface AdsPolicy {
  /** CEO opt-in: the AI may launch campaigns whose daily budget is ≤ autoApproveUpTo without a person. */
  autonomous: boolean;
  autoApproveUpTo: number;
  /** Total daily budget of all ACTIVE campaigns may not exceed this (blank = launching is blocked). */
  dailySpendLimit: number | null;
  /** Reported spend this calendar month may not exceed this (blank = no monthly cap). */
  monthlyAccountBudget: number | null;
  /** Largest daily budget one campaign may have (blank = no cap). */
  maxCampaignDaily: number | null;
  emergencyStop: boolean;
}

export const DEFAULT_ADS_POLICY: AdsPolicy = { autonomous: false, autoApproveUpTo: 0, dailySpendLimit: null, monthlyAccountBudget: null, maxCampaignDaily: null, emergencyStop: false };

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : typeof v === "string" && /^\d+(\.\d{1,2})?$/.test(v.trim()) ? Number(v) : null);

export function parseAdsPolicy(v: unknown): AdsPolicy {
  const o = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const autonomous = o.autonomous === true;
  return {
    autonomous,
    autoApproveUpTo: autonomous ? (num(o.autoApproveUpTo) ?? 0) : 0,
    dailySpendLimit: num(o.dailySpendLimit),
    monthlyAccountBudget: num(o.monthlyAccountBudget),
    maxCampaignDaily: num(o.maxCampaignDaily),
    emergencyStop: o.emergencyStop === true,
  };
}

export interface LaunchContext {
  dailyBudget: number;
  currency: string;
  /** Sum of daily budgets already ACTIVE (same currency). */
  activeDaily: number;
  /** Reported spend so far this month (same currency). */
  monthSpend: number;
  /** Kill-switch reason, if any. */
  stop: string | null;
  via: "HUMAN" | "APPROVAL" | "POLICY";
}

/** Every rule a launch or budget increase must pass. The first failing rule is returned. */
export function checkLaunch(p: AdsPolicy, c: LaunchContext): { ok: true } | { ok: false; reason: string } {
  if (p.emergencyStop) return { ok: false, reason: "Advertising emergency stop is on." };
  if (c.stop) return { ok: false, reason: `Advertising is stopped: ${c.stop}` };
  if (p.dailySpendLimit == null) return { ok: false, reason: "No daily ad spend limit is configured. The CEO must set one before anything can be launched." };
  if (p.maxCampaignDaily != null && c.dailyBudget > p.maxCampaignDaily) return { ok: false, reason: `The campaign's daily budget ${c.dailyBudget} exceeds the per-campaign cap ${p.maxCampaignDaily}.` };
  if (c.activeDaily + c.dailyBudget > p.dailySpendLimit) return { ok: false, reason: `Active daily budgets would total ${(c.activeDaily + c.dailyBudget).toFixed(2)} ${c.currency}, above the daily spend limit ${p.dailySpendLimit}.` };
  if (p.monthlyAccountBudget != null && c.monthSpend + c.dailyBudget > p.monthlyAccountBudget) return { ok: false, reason: `This month's spend (${c.monthSpend.toFixed(2)}) plus one day of this campaign would exceed the monthly account budget ${p.monthlyAccountBudget}.` };
  if (c.via === "POLICY" && (!p.autonomous || c.dailyBudget > p.autoApproveUpTo)) return { ok: false, reason: p.autonomous ? `Above the autonomous limit (${p.autoApproveUpTo}); a person must approve.` : "Autonomous advertising is off; a person must approve." };
  return { ok: true };
}
