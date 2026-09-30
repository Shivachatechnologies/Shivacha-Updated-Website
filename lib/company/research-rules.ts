/** Market research rules (pure). Every statistic needs a source; AI reasoning is labelled as inference. */

export const RESEARCH_SECTIONS = {
  opportunity: "Market opportunity",
  icp: "Ideal customer profile",
  personas: "Buyer personas",
  pain_points: "Pain points",
  buying_triggers: "Buying triggers",
  objections: "Objections",
  competitors: "Competitor observations",
  positioning: "Positioning",
  offers: "Offers",
  pricing: "Pricing observations",
  channels: "Acquisition channels",
  campaigns: "Campaign recommendations",
} as const;
export type ResearchSection = keyof typeof RESEARCH_SECTIONS;

export const FINDING_LABELS = {
  FACT: "Fact from an internal record",
  SOURCE: "Sourced from the public web",
  INFERENCE: "AI inference",
  RECOMMENDATION: "Recommendation",
} as const;
export type FindingLabel = keyof typeof FINDING_LABELS;

export interface Finding {
  section: ResearchSection;
  statement: string;
  label: FindingLabel;
  sourceUrl?: string | null;
  sourceTitle?: string | null;
  at: string;
}

export const RESEARCH_PARAMS = ["country", "region", "industry", "companySize", "revenue", "buyerRole", "technology", "product", "service", "competitors", "market"] as const;
export type ResearchParams = Partial<Record<(typeof RESEARCH_PARAMS)[number], string>>;

/** A claim that states a statistic (percentages, money, market sizes, growth figures). */
export const looksStatistical = (s: string) => /\d+(\.\d+)?\s?%|[$€£₹]\s?\d|\b\d+(\.\d+)?\s?(million|billion|trillion|bn|mn|k)\b|\bCAGR\b|\b(19|20)\d{2}\b.*\b(grew|growth|market size)\b/i.test(s);

const okUrl = (u: string | null | undefined) => !!u && (/^https:\/\/[^\s]+$/i.test(u) || /^\/admin\/[^\s]*$/.test(u));

/** Validates one finding; returns an error message the model can act on, or null. */
export function checkFinding(f: { section?: string; statement?: string; label?: string; sourceUrl?: string | null }): string | null {
  if (!f.section || !(f.section in RESEARCH_SECTIONS)) return `section must be one of: ${Object.keys(RESEARCH_SECTIONS).join(", ")}`;
  if (!f.statement || f.statement.trim().length < 10) return "statement is too short";
  if (!f.label || !(f.label in FINDING_LABELS)) return "label must be FACT, SOURCE, INFERENCE or RECOMMENDATION";
  if ((f.label === "FACT" || f.label === "SOURCE") && !okUrl(f.sourceUrl)) return `${f.label} needs sourceUrl: an https:// page you actually read, or the /admin/… link of the internal record`;
  if (f.label === "SOURCE" && !/^https:\/\//i.test(f.sourceUrl ?? "")) return "SOURCE findings need an https:// URL";
  if ((f.label === "INFERENCE" || f.label === "RECOMMENDATION") && looksStatistical(f.statement)) return "This states a statistic. Numbers must come from a source: record it as SOURCE with the URL (or FACT with the internal record link), or remove the number.";
  return null;
}

export function paramsSummary(p: ResearchParams) {
  return RESEARCH_PARAMS.filter((k) => p[k]).map((k) => `${k}: ${p[k]}`).join(" · ");
}
