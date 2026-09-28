import { z } from "zod";

/**
 * Growth department policy (pure, no I/O): the autonomous switch, per-channel toggles, kill switches and budgets that
 * every growth action is checked against. Stored in Setting "growth"; only a human with growth:control can change it
 * (see lib/growth/actions.ts). No AI tool can write these settings, so an agent can never lift its own kill switch.
 */

export const GROWTH_CHANNELS = {
  social: "Social media publishing & community",
  leadGen: "Lead generation & qualification",
  email: "Email nurture & sequences",
  paidAds: "Paid ads",
  seo: "SEO",
  content: "Content & creative production",
  community: "Community management",
  aiSales: "AI sales follow-up",
  background: "Background automation (daily loop)",
} as const;
export type GrowthChannel = keyof typeof GROWTH_CHANNELS;
export const CHANNEL_KEYS = Object.keys(GROWTH_CHANNELS) as GrowthChannel[];

export const KILL_SWITCHES = {
  all: "STOP ALL (every growth action and every AI agent)",
  ai: "Stop all AI agents",
  marketing: "Stop all marketing automation",
  social: "Stop social media",
  outbound: "Stop outbound (prospecting & cold email)",
  email: "Stop all email sending",
  ads: "Stop paid ads",
  publishing: "Stop all publishing",
} as const;
export type KillSwitch = keyof typeof KILL_SWITCHES;
export const KILL_KEYS = Object.keys(KILL_SWITCHES) as KillSwitch[];

export const SOCIAL_PLATFORMS = ["LINKEDIN", "INSTAGRAM", "FACEBOOK", "X", "YOUTUBE"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];
export const PLATFORM_LABELS: Record<SocialPlatform, string> = { LINKEDIN: "LinkedIn", INSTAGRAM: "Instagram", FACEBOOK: "Facebook", X: "X (Twitter)", YOUTUBE: "YouTube" };

export const LANGUAGES = { en: "English", hi: "Hindi", hinglish: "Hinglish" } as const;

export const BUDGET_KINDS = {
  adDaily: { label: "Ad spend per day", unit: "money" },
  aiDaily: { label: "AI cost per day (growth work)", unit: "money" },
  creativeMonthly: { label: "Creative / image spend per month", unit: "money" },
  videoMonthly: { label: "Video / TTS spend per month", unit: "money" },
  emailDaily: { label: "Emails per day", unit: "count" },
  socialDaily: { label: "Social posts per day", unit: "count" },
} as const;
export type BudgetKind = keyof typeof BUDGET_KINDS;
export const BUDGET_KEYS = Object.keys(BUDGET_KINDS) as BudgetKind[];

const bool = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());
const optNum = (max: number) => z.preprocess((v) => (v == null || v === "" ? null : Number(v)), z.number().min(0).max(max).nullable());
const list = (allowed?: readonly string[]) =>
  z.preprocess((v) => (Array.isArray(v) ? v : typeof v === "string" ? v.split(/[\n,]/) : []), z.array(z.string().trim().max(60)).transform((a) => [...new Set(a.filter(Boolean).filter((x) => !allowed || allowed.includes(x)))].slice(0, 50)));

const flags = <K extends string>(keys: readonly K[]) => z.object(Object.fromEntries(keys.map((k) => [k, bool.default(false)])) as { [P in K]: z.ZodDefault<typeof bool> }).prefault({} as never);

export const growthSettingsSchema = z.object({
  autonomousMode: bool.default(false),
  channels: flags(CHANNEL_KEYS),
  stops: flags(KILL_KEYS),
  stoppedAgents: list().default([]),
  stoppedPlatforms: list(SOCIAL_PLATFORMS).default([]),
  /** null = no budget configured, which blocks spending of that kind (never unlimited by default). */
  budgets: z.object(Object.fromEntries(BUDGET_KEYS.map((k) => [k, optNum(1e9).default(null)])) as { [P in BudgetKind]: z.ZodDefault<ReturnType<typeof optNum>> }).prefault({}),
  budgetCurrency: z.enum(["USD", "EUR", "GBP", "AED", "SAR", "INR", "SGD", "AUD", "CAD"]).default("USD"),
  /** A configurable target shown on dashboards. It is never presented as guaranteed. */
  dailyQualifiedLeadTarget: z.preprocess((v) => (v == null || v === "" ? 100 : Number(v)), z.number().int().min(0).max(100_000)).default(100),
  languages: list(Object.keys(LANGUAGES)).default(["en", "hi", "hinglish"]),
  brandVoice: z.string().trim().max(4000).default("Confident, precise and helpful. Enterprise tone. No hype, no guarantees of results, no invented numbers, no competitor disparagement."),
  bannedPhrases: list().default(["guaranteed returns", "100% guaranteed", "risk-free", "get rich"]),
});
export type GrowthSettings = z.infer<typeof growthSettingsSchema>;

export const DEFAULT_GROWTH_SETTINGS: GrowthSettings = growthSettingsSchema.parse({});

/** Tolerant parse: unknown/invalid stored values fall back to safe defaults (everything off, nothing stopped). */
export function parseGrowthSettings(v: unknown): GrowthSettings {
  const r = growthSettingsSchema.safeParse(v && typeof v === "object" ? v : {});
  return r.success ? r.data : DEFAULT_GROWTH_SETTINGS;
}

export type GrowthScope =
  | { kind: "ai"; agent?: string }
  | { kind: "channel"; channel: GrowthChannel; autonomous?: boolean; platform?: string; agent?: string; outbound?: boolean };

/** Which kill switches stop each channel (besides "all"). */
const CHANNEL_STOPS: Record<GrowthChannel, KillSwitch[]> = {
  social: ["marketing", "social", "publishing"],
  leadGen: ["marketing"],
  email: ["marketing", "email"],
  paidAds: ["marketing", "ads"],
  seo: ["marketing", "publishing"],
  content: ["marketing", "publishing"],
  community: ["marketing", "social"],
  aiSales: ["marketing", "ai", "email"],
  background: ["marketing"],
};

/**
 * Returns why the action must not run, or null when allowed. Kill switches win over every toggle. Autonomous work
 * additionally needs AUTONOMOUS_GROWTH_MODE and the channel's toggle; human-initiated work only respects the switches.
 */
export function stopReason(s: GrowthSettings, scope: GrowthScope): string | null {
  if (s.stops.all) return "STOP ALL is on.";
  if (scope.kind === "ai") {
    if (s.stops.ai) return "Stop all AI is on.";
    if (scope.agent && s.stoppedAgents.includes(scope.agent)) return `The ${scope.agent} agent is stopped.`;
    return null;
  }
  const hit = CHANNEL_STOPS[scope.channel].find((k) => s.stops[k]);
  if (hit) return `${KILL_SWITCHES[hit]} is on.`;
  if (scope.outbound && s.stops.outbound) return `${KILL_SWITCHES.outbound} is on.`;
  if (scope.agent && (s.stops.ai || s.stoppedAgents.includes(scope.agent))) return `AI agent ${scope.agent} is stopped.`;
  if (scope.platform && s.stoppedPlatforms.includes(scope.platform)) return `${scope.platform} is stopped.`;
  if (scope.autonomous) {
    if (!s.autonomousMode) return "Autonomous growth mode is off.";
    if (!s.channels[scope.channel]) return `The ${GROWTH_CHANNELS[scope.channel]} channel is off.`;
  }
  return null;
}

/**
 * Budget guardrail. A budget that is not configured blocks spending (never silently unlimited); a request that would
 * exceed the limit is refused rather than partially applied.
 */
export function checkBudget(limit: number | null | undefined, used: number, add: number): { ok: true; remaining: number } | { ok: false; reason: string } {
  if (limit == null) return { ok: false, reason: "No budget is configured for this." };
  if (add < 0 || !Number.isFinite(add)) return { ok: false, reason: "Invalid amount." };
  if (used + add > limit + 1e-9) return { ok: false, reason: `Budget reached (${round(used)} of ${round(limit)} used).` };
  return { ok: true, remaining: round(limit - used - add) };
}
const round = (n: number) => Math.round(n * 100) / 100;

/** Pure human check for settings changes: automation identities (the scheduler, AI) can never change growth control. */
export const isHumanActor = (u: { id: string } | null | undefined) => !!u && u.id !== "system" && !u.id.startsWith("ai:");
