/**
 * Which external capability each plan stage depends on (pure). Used to say "BLOCKED BY <provider>" for a stage whose
 * provider is not connected — before it runs, while it runs and in the CEO report — instead of implying success.
 */

export type Capability = "ai" | "discovery" | "verification" | "email" | "social" | "ads";

export const CAPABILITY_PROVIDERS: Record<Capability, string> = {
  ai: "Anthropic (AI provider)",
  discovery: "Apollo or Hunter (lead discovery)",
  verification: "NeverBounce or Hunter (email verification)",
  email: "an email provider (SMTP / Gmail) for outreach sending",
  social: "a social platform sign-in (LinkedIn, Facebook, Instagram, X)",
  ads: "an ad account (Meta Ads, Google Ads or LinkedIn Ads)",
};

/** Stage key → capabilities it needs (every stage is run by an AI employee). */
const LEAD_STAGES: Record<string, Capability[]> = {
  campaign: ["discovery", "verification"],
  outreach: ["email"],
  social: ["social"],
  ads: ["ads"],
};

export function stageNeeds(playbook: string, stageKey: string): Capability[] {
  return ["ai", ...(playbook === "LEAD_GENERATION" ? (LEAD_STAGES[stageKey] ?? []) : [])];
}

export interface StageBlocker {
  stage: string;
  capability: Capability;
  message: string;
}

/** Every stage requirement that is not connected, as "BLOCKED BY …" lines. */
export function stageBlockers(playbook: string, stages: { key: string; title: string }[], connected: Record<Capability, boolean>): StageBlocker[] {
  const out: StageBlocker[] = [];
  for (const s of stages) for (const c of stageNeeds(playbook, s.key)) if (!connected[c]) out.push({ stage: s.key, capability: c, message: `${s.title}: BLOCKED BY ${CAPABILITY_PROVIDERS[c]}` });
  return out;
}

/** The distinct providers blocking an objective (what the CEO must connect), in capability order. */
export function blockingProviders(blockers: StageBlocker[]): string[] {
  return [...new Set((Object.keys(CAPABILITY_PROVIDERS) as Capability[]).filter((c) => blockers.some((b) => b.capability === c)).map((c) => CAPABILITY_PROVIDERS[c]))];
}
