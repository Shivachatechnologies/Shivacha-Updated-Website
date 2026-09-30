/**
 * Lead generation rules (pure — no I/O). Campaign configuration, ICP fit scoring and verification mapping.
 * Scores are transparent sums of named signals; nothing is guessed about a person.
 */

export const LEADGEN_SOURCES = { apollo: "Apollo.io (people search)", hunter: "Hunter.io (domain search)" } as const;
export type LeadGenSource = keyof typeof LEADGEN_SOURCES;
export const LEADGEN_MODES = { MANUAL: "Manual — a person runs each step", AUTONOMOUS: "Autonomous — the daily growth loop runs discovery → qualification (needs Autonomous Growth + the lead channel)" } as const;
export type LeadGenMode = keyof typeof LEADGEN_MODES;

export interface RunStep {
  key: "discover" | "enrich" | "dedupe" | "suppress" | "verify" | "intent" | "score" | "qualify" | "crm" | "sdr";
  status: "DONE" | "NOT_CONNECTED" | "SKIPPED" | "BLOCKED" | "ERROR";
  count: number;
  note?: string;
}

export interface RunSummary {
  at: string;
  by: string;
  discovered: number;
  enriched?: number;
  duplicates: number;
  alreadyInCrm: number;
  suppressed: number;
  verified: number;
  qualified: number;
  disqualified: number;
  steps: RunStep[];
}

export interface LeadGenConfig {
  sources: LeadGenSource[];
  titles: string[];
  countries: string[];
  domains: string[];
  industries: string[];
  /** Campaign total; the daily target is Campaign.dailyLeadTarget. Targets, never guarantees. */
  totalTarget: number | null;
  mode: LeadGenMode;
  /** Minimum ICP fit (0–100) for a prospect to count as qualified. */
  minFit: number;
  /** Cumulative duplicates avoided across runs. */
  duplicatesTotal: number;
  lastRun: RunSummary | null;
}

const list = (v: unknown, max = 40) => (Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,\n]/) : []).map((x) => String(x).trim()).filter(Boolean).slice(0, max);

export function parseLeadGen(v: unknown): LeadGenConfig {
  const o = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const sources = list(o.sources).filter((s): s is LeadGenSource => s in LEADGEN_SOURCES);
  const n = (x: unknown, d: number | null, min: number, max: number) => (typeof x === "number" && Number.isFinite(x) && x >= min && x <= max ? Math.round(x) : d);
  return {
    sources: sources.length ? [...new Set(sources)] : ["apollo", "hunter"],
    titles: list(o.titles),
    countries: list(o.countries),
    domains: list(o.domains, 100).map((d) => d.toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "")).filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)),
    industries: list(o.industries),
    totalTarget: n(o.totalTarget, null, 1, 1_000_000),
    mode: o.mode === "AUTONOMOUS" ? "AUTONOMOUS" : "MANUAL",
    minFit: n(o.minFit, 60, 0, 100) ?? 60,
    duplicatesTotal: n(o.duplicatesTotal, 0, 0, 1e9) ?? 0,
    lastRun: o.lastRun && typeof o.lastRun === "object" ? (o.lastRun as RunSummary) : null,
  };
}

/** Maps a verification provider status to the stored value. */
export function verificationOf(status: string): "VALID" | "INVALID" | "RISKY" | "UNKNOWN" {
  const s = status.toLowerCase();
  if (s === "valid" || s === "deliverable") return "VALID";
  if (s === "invalid" || s === "undeliverable") return "INVALID";
  if (s === "accept_all" || s === "webmail" || s === "risky" || s === "disposable") return "RISKY";
  return "UNKNOWN";
}

const has = (hay: string | null | undefined, needles: string[]) => {
  const h = (hay ?? "").toLowerCase();
  return !!h && needles.some((n) => h.includes(n.toLowerCase()));
};

/**
 * ICP fit (0–100) from the campaign definition only: title 35, country 25, industry 20, verified email 20.
 * A criterion the campaign does not define is not scored against the prospect (its weight is redistributed), so an
 * empty ICP never inflates or deflates scores arbitrarily.
 */
export function icpFit(p: { title: string | null; country: string | null; industry: string | null; email: string | null; verification: string | null }, c: Pick<LeadGenConfig, "titles" | "countries" | "industries">): { score: number; reasons: string[] } {
  const parts: [number, boolean, string][] = [];
  if (c.titles.length) parts.push([35, has(p.title, c.titles), `title ${p.title ? `"${p.title}"` : "unknown"}`]);
  if (c.countries.length) parts.push([25, has(p.country, c.countries), `country ${p.country ?? "unknown"}`]);
  if (c.industries.length) parts.push([20, has(p.industry, c.industries), `industry ${p.industry ?? "unknown"}`]);
  parts.push([20, p.verification === "VALID", p.email ? `email ${p.verification?.toLowerCase() ?? "not verified"}` : "no email"]);
  const total = parts.reduce((a, [w]) => a + w, 0);
  const got = parts.reduce((a, [w, ok]) => a + (ok ? w : 0), 0);
  return { score: Math.round((got / total) * 100), reasons: parts.map(([, ok, r]) => `${ok ? "✓" : "✗"} ${r}`) };
}
