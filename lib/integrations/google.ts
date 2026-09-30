import "server-only";
import { googleAccessToken } from "./oauth";
import { hydrateVault, secretValue } from "./vault";
import { trackedFetch } from "./usage";

/**
 * Google Analytics 4 (Data API) and Search Console (Search Analytics API) reads with the Google OAuth token.
 * Results are the providers' own numbers; `null` means NOT CONNECTED (no fallback numbers are produced).
 */

export type Read<T> = { ok: true; data: T } | { ok: false; state: "NOT_CONNECTED" | "ERROR"; error: string };

const iso = (d: Date) => d.toISOString().slice(0, 10);

async function post(url: string, body: unknown): Promise<Read<Record<string, unknown>>> {
  const token = await googleAccessToken();
  if (!token) return { ok: false, state: "NOT_CONNECTED", error: "Google is not connected (Sign in with Google on the Integrations page)." };
  try {
    const res = await trackedFetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000), cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) return { ok: false, state: "ERROR", error: `Google API: ${String((json.error as { message?: string } | undefined)?.message ?? `HTTP ${res.status}`).slice(0, 200)}` };
    return { ok: true, data: json };
  } catch (e) {
    return { ok: false, state: "ERROR", error: (e as Error).name === "TimeoutError" ? "Google API timed out." : "Google API network error." };
  }
}

export interface Ga4Summary {
  sessions: number;
  users: number;
  conversions: number;
  from: string;
  to: string;
}

export async function ga4Summary(days = 7): Promise<Read<Ga4Summary>> {
  await hydrateVault();
  const property = secretValue("GA4_PROPERTY_ID").replace(/^properties\//, "");
  if (!property) return { ok: false, state: "NOT_CONNECTED", error: "GA4 property ID is not set." };
  const to = new Date();
  const from = new Date(to.getTime() - (days - 1) * 86400_000);
  const r = await post(`https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(property)}:runReport`, { dateRanges: [{ startDate: iso(from), endDate: iso(to) }], metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: "conversions" }] });
  if (!r.ok) return r;
  const row = (r.data.rows as { metricValues: { value: string }[] }[] | undefined)?.[0];
  const v = (i: number) => Number(row?.metricValues?.[i]?.value ?? 0);
  return { ok: true, data: { sessions: v(0), users: v(1), conversions: v(2), from: iso(from), to: iso(to) } };
}

export interface GscSummary {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  topQueries: { query: string; clicks: number; impressions: number; position: number }[];
  from: string;
  to: string;
}

export async function gscSummary(days = 28): Promise<Read<GscSummary>> {
  await hydrateVault();
  const site = secretValue("GSC_SITE_URL");
  if (!site) return { ok: false, state: "NOT_CONNECTED", error: "Search Console property is not set." };
  // Search Console data lags ~2 days.
  const to = new Date(Date.now() - 2 * 86400_000);
  const from = new Date(to.getTime() - (days - 1) * 86400_000);
  const url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`;
  const [total, queries] = await Promise.all([post(url, { startDate: iso(from), endDate: iso(to) }), post(url, { startDate: iso(from), endDate: iso(to), dimensions: ["query"], rowLimit: 10 })]);
  if (!total.ok) return total;
  const t = (total.data.rows as { clicks: number; impressions: number; ctr: number; position: number }[] | undefined)?.[0];
  const q = queries.ok ? ((queries.data.rows as { keys: string[]; clicks: number; impressions: number; position: number }[] | undefined) ?? []) : [];
  return { ok: true, data: { clicks: t?.clicks ?? 0, impressions: t?.impressions ?? 0, ctr: t?.ctr ?? 0, position: t?.position ?? 0, topQueries: q.map((x) => ({ query: x.keys[0], clicks: x.clicks, impressions: x.impressions, position: Math.round(x.position * 10) / 10 })), from: iso(from), to: iso(to) } };
}
