/**
 * UTM links and attribution models (pure). Credit is only ever split across touches that were actually recorded.
 */

const slug = (v: string) => v.trim().toLowerCase().replace(/[^\w.+-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);

export interface UtmParts {
  source: string;
  medium: string;
  campaign: string;
  content?: string | null;
  term?: string | null;
}

/** Adds UTM parameters to a site path or absolute URL. Existing utm_* values are replaced; other params are kept. */
export function buildUtmUrl(base: string, u: UtmParts, siteOrigin = "https://www.shivacha.com"): string {
  const url = new URL(base, siteOrigin);
  if (!/^https?:$/.test(url.protocol)) throw new Error("Only http(s) links can be tagged");
  const set: [string, string | null | undefined][] = [["utm_source", u.source], ["utm_medium", u.medium], ["utm_campaign", u.campaign], ["utm_content", u.content], ["utm_term", u.term]];
  for (const [k, v] of set) {
    url.searchParams.delete(k);
    const s = v ? slug(v) : "";
    if (s) url.searchParams.set(k, s);
  }
  return url.toString();
}

/** Standard source/medium per growth channel so reports group consistently. */
export const CHANNEL_UTM: Record<string, { source: string; medium: string }> = {
  LINKEDIN: { source: "linkedin", medium: "social" },
  INSTAGRAM: { source: "instagram", medium: "social" },
  FACEBOOK: { source: "facebook", medium: "social" },
  X: { source: "x", medium: "social" },
  YOUTUBE: { source: "youtube", medium: "video" },
  EMAIL: { source: "newsletter", medium: "email" },
  OUTBOUND: { source: "outbound", medium: "email" },
  PARTNER: { source: "partner", medium: "referral" },
  GOOGLE_ADS: { source: "google", medium: "cpc" },
  META_ADS: { source: "meta", medium: "paid-social" },
  LINKEDIN_ADS: { source: "linkedin", medium: "paid-social" },
};

export interface Touch {
  channel: string;
  campaign?: string | null;
  occurredAt: Date;
}

export const ATTRIBUTION_MODELS = { first: "First touch", last: "Last touch", linear: "Linear (multi-touch)", position: "Position-based 40/20/40" } as const;
export type AttributionModel = keyof typeof ATTRIBUTION_MODELS;

/** Returns credit per channel (sums to 1 when there is at least one touch, else empty). */
export function attribute(touches: Touch[], model: AttributionModel): Record<string, number> {
  const t = [...touches].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  const out: Record<string, number> = {};
  const give = (c: string, w: number) => (out[c] = (out[c] ?? 0) + w);
  if (!t.length) return out;
  if (model === "first") give(t[0].channel, 1);
  else if (model === "last") give(t[t.length - 1].channel, 1);
  else if (model === "linear") t.forEach((x) => give(x.channel, 1 / t.length));
  else if (t.length === 1) give(t[0].channel, 1);
  else if (t.length === 2) {
    give(t[0].channel, 0.5);
    give(t[1].channel, 0.5);
  } else {
    give(t[0].channel, 0.4);
    give(t[t.length - 1].channel, 0.4);
    t.slice(1, -1).forEach((x) => give(x.channel, 0.2 / (t.length - 2)));
  }
  return out;
}

/** Sums per-lead credits across many leads (e.g. qualified leads by channel under a model). */
export function aggregateCredit(perLead: Touch[][], model: AttributionModel): { channel: string; credit: number }[] {
  const tot: Record<string, number> = {};
  for (const touches of perLead) for (const [c, w] of Object.entries(attribute(touches, model))) tot[c] = (tot[c] ?? 0) + w;
  return Object.entries(tot)
    .map(([channel, credit]) => ({ channel, credit: Math.round(credit * 100) / 100 }))
    .sort((a, b) => b.credit - a.credit);
}

/** Channel label for a lead with no recorded touches, from its captured UTM/source fields. */
export function channelOfLead(l: { utmSource?: string | null; utmMedium?: string | null; source?: string | null }): string {
  const src = (l.utmSource ?? l.source ?? "").toLowerCase();
  const med = (l.utmMedium ?? "").toLowerCase();
  if (/cpc|ppc|paid/.test(med)) return src.includes("linkedin") ? "LINKEDIN_ADS" : /facebook|instagram|meta/.test(src) ? "META_ADS" : "GOOGLE_ADS";
  if (med === "email" || src === "newsletter") return "EMAIL";
  for (const p of ["linkedin", "instagram", "facebook", "youtube"]) if (src.includes(p)) return p.toUpperCase();
  if (src === "x" || src.includes("twitter") || src === "t.co") return "X";
  if (med === "referral" || src === "partner") return "REFERRAL";
  if (/google|bing|duckduckgo|yahoo/.test(src)) return "ORGANIC_SEARCH";
  return src && src !== "direct" ? "OTHER" : "DIRECT";
}
