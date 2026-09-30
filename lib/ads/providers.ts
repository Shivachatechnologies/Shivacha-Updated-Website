import "server-only";
import { googleAccessToken } from "@/lib/integrations/oauth";
import { hydrateVault, secretValue } from "@/lib/integrations/vault";
import { trackedFetch } from "@/lib/integrations/usage";

/**
 * Paid-media provider adapters (official APIs only). Rules shared by every adapter:
 * - everything is CREATED PAUSED; spend starts only through launch(), which the ads engine gates by approval and limits;
 * - a result is ok only when the provider returned the created/updated object's id — nothing is simulated;
 * - missing credentials → NOT_CONNECTED; an operation this adapter does not implement → NOT_SUPPORTED.
 * Money in the adapters is in major units (e.g. 50.00 USD); each adapter converts to the provider's format.
 */

export type AdsProviderKey = "meta" | "google" | "linkedin";
export type AdsCode = "NOT_CONNECTED" | "NOT_SUPPORTED" | "PROVIDER_ERROR";
export type AdsResult<T> = { ok: true; data: T } | { ok: false; code: AdsCode; error: string };

export interface AdCreateInput {
  name: string;
  dailyBudget: number;
  currency: string;
  /** ISO-3166 alpha-2 country codes. */
  countries: string[];
  ageMin?: number | null;
  ageMax?: number | null;
  headline?: string | null;
  body?: string | null;
  link?: string | null;
  imageUrl?: string | null;
}

export interface InsightRow {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
}

export interface AdsProvider {
  key: AdsProviderKey;
  name: string;
  connected(): boolean;
  account(): Promise<AdsResult<{ name: string; currency: string }>>;
  create(i: AdCreateInput): Promise<AdsResult<{ externalId: string; refs: Record<string, string>; notes: string[] }>>;
  setStatus(externalId: string, refs: Record<string, string>, status: "ACTIVE" | "PAUSED"): Promise<AdsResult<{ status: string }>>;
  setBudget(externalId: string, refs: Record<string, string>, dailyBudget: number): Promise<AdsResult<{ dailyBudget: number }>>;
  insights(externalId: string, refs: Record<string, string>, from: string, to: string): Promise<AdsResult<InsightRow[]>>;
}

const notConnected = <T>(name: string, what: string): AdsResult<T> => ({ ok: false, code: "NOT_CONNECTED", error: `${name} is not connected (${what}).` });
const perr = <T>(name: string, status: number, body: Record<string, unknown>): AdsResult<T> => {
  const e = body.error as { message?: string; error_user_msg?: string } | string | undefined;
  const msg = typeof e === "string" ? e : (e?.error_user_msg ?? e?.message ?? (body.message as string | undefined) ?? "request failed");
  return { ok: false, code: "PROVIDER_ERROR", error: `${name}: ${String(msg).slice(0, 300)} (HTTP ${status})` };
};

async function req(url: string, init: { method?: string; headers?: Record<string, string>; json?: unknown } = {}) {
  try {
    const res = await trackedFetch(url, { method: init.method ?? "GET", headers: { ...(init.json !== undefined ? { "Content-Type": "application/json" } : {}), ...(init.headers ?? {}) }, body: init.json !== undefined ? JSON.stringify(init.json) : undefined, signal: AbortSignal.timeout(20_000), cache: "no-store" });
    const text = await res.text();
    let body: Record<string, unknown> = {};
    try {
      body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      body = { raw: text.slice(0, 200) };
    }
    return { ok: res.ok, status: res.status, body, headers: res.headers };
  } catch (e) {
    return { ok: false, status: 0, body: { error: (e as Error).name === "TimeoutError" ? "timed out" : "network error" }, headers: new Headers() };
  }
}

const cents = (v: number) => Math.round(v * 100);
const isoCodes = (list: string[]) => list.map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c));

/* ───────────────────────── Meta Marketing API ───────────────────────── */

const META_V = () => secretValue("META_GRAPH_VERSION") || "v21.0";
const metaToken = () => secretValue("META_ADS_ACCESS_TOKEN") || secretValue("META_USER_ACCESS_TOKEN");
const metaAct = () => {
  const id = secretValue("META_AD_ACCOUNT_ID").replace(/^act_/, "");
  return id ? `act_${id}` : "";
};
const META_CONVERSIONS = new Set(["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead", "complete_registration", "offsite_conversion.fb_pixel_complete_registration"]);

const meta: AdsProvider = {
  key: "meta",
  name: "Meta Ads",
  connected: () => !!metaAct() && !!metaToken(),
  async account() {
    if (!this.connected()) return notConnected("Meta Ads", "ad account ID and Meta sign-in");
    const r = await req(`https://graph.facebook.com/${META_V()}/${metaAct()}?fields=name,currency,account_status&access_token=${encodeURIComponent(metaToken())}`);
    return r.ok && typeof r.body.name === "string" ? { ok: true, data: { name: r.body.name, currency: String(r.body.currency ?? "") } } : perr("Meta Ads", r.status, r.body);
  },
  async create(i) {
    if (!this.connected()) return notConnected("Meta Ads", "ad account ID and Meta sign-in");
    const countries = isoCodes(i.countries);
    if (!countries.length) return { ok: false, code: "PROVIDER_ERROR", error: "Meta Ads needs at least one ISO country code (e.g. US, IN)." };
    const base = `https://graph.facebook.com/${META_V()}`;
    const tok = `access_token=${encodeURIComponent(metaToken())}`;
    const c = await req(`${base}/${metaAct()}/campaigns?${tok}`, { method: "POST", json: { name: i.name, objective: "OUTCOME_TRAFFIC", status: "PAUSED", special_ad_categories: [], daily_budget: cents(i.dailyBudget), bid_strategy: "LOWEST_COST_WITHOUT_CAP" } });
    if (!c.ok || typeof c.body.id !== "string") return perr("Meta Ads", c.status, c.body);
    const refs: Record<string, string> = {};
    const notes: string[] = [];
    const s = await req(`${base}/${metaAct()}/adsets?${tok}`, { method: "POST", json: { name: `${i.name} — ad set`, campaign_id: c.body.id, billing_event: "IMPRESSIONS", optimization_goal: "LINK_CLICKS", status: "PAUSED", targeting: { geo_locations: { countries }, ...(i.ageMin ? { age_min: i.ageMin } : {}), ...(i.ageMax ? { age_max: i.ageMax } : {}) } } });
    if (s.ok && typeof s.body.id === "string") refs.adSetId = s.body.id;
    else notes.push(`Ad set not created (${(perr("Meta Ads", s.status, s.body) as { error: string }).error}) — the campaign stays paused; add the ad set in Ads Manager.`);
    const page = secretValue("META_PAGE_ID");
    if (refs.adSetId && page && i.link) {
      const cr = await req(`${base}/${metaAct()}/adcreatives?${tok}`, { method: "POST", json: { name: `${i.name} — creative`, object_story_spec: { page_id: page, link_data: { link: i.link, message: i.body ?? "", name: i.headline ?? undefined, picture: i.imageUrl ?? undefined } } } });
      if (cr.ok && typeof cr.body.id === "string") {
        refs.creativeId = cr.body.id;
        const ad = await req(`${base}/${metaAct()}/ads?${tok}`, { method: "POST", json: { name: `${i.name} — ad`, adset_id: refs.adSetId, creative: { creative_id: cr.body.id }, status: "PAUSED" } });
        if (ad.ok && typeof ad.body.id === "string") refs.adId = ad.body.id;
        else notes.push("Ad not created — add it in Ads Manager.");
      } else notes.push("Creative not created — add it in Ads Manager.");
    } else if (refs.adSetId) notes.push("No creative: set a Page and a link to create the ad automatically, or add it in Ads Manager.");
    return { ok: true, data: { externalId: c.body.id, refs, notes } };
  },
  async setStatus(id, refs, status) {
    if (!this.connected()) return notConnected("Meta Ads", "ad account ID and Meta sign-in");
    const base = `https://graph.facebook.com/${META_V()}`;
    const tok = `access_token=${encodeURIComponent(metaToken())}`;
    // Children first on launch (they were created PAUSED); the campaign status alone stops delivery on pause.
    if (status === "ACTIVE") for (const child of [refs.adSetId, refs.adId].filter(Boolean)) await req(`${base}/${child}?${tok}`, { method: "POST", json: { status } });
    const r = await req(`${base}/${id}?${tok}`, { method: "POST", json: { status } });
    return r.ok && r.body.success !== false ? { ok: true, data: { status } } : perr("Meta Ads", r.status, r.body);
  },
  async setBudget(id, _refs, dailyBudget) {
    if (!this.connected()) return notConnected("Meta Ads", "ad account ID and Meta sign-in");
    const r = await req(`https://graph.facebook.com/${META_V()}/${id}?access_token=${encodeURIComponent(metaToken())}`, { method: "POST", json: { daily_budget: cents(dailyBudget) } });
    return r.ok && r.body.success !== false ? { ok: true, data: { dailyBudget } } : perr("Meta Ads", r.status, r.body);
  },
  async insights(id, _refs, from, to) {
    if (!this.connected()) return notConnected("Meta Ads", "ad account ID and Meta sign-in");
    const q = new URLSearchParams({ fields: "spend,impressions,clicks,actions", time_range: JSON.stringify({ since: from, until: to }), time_increment: "1", access_token: metaToken() });
    const r = await req(`https://graph.facebook.com/${META_V()}/${id}/insights?${q}`);
    if (!r.ok) return perr("Meta Ads", r.status, r.body);
    const rows = (r.body.data as { date_start: string; spend?: string; impressions?: string; clicks?: string; actions?: { action_type: string; value: string }[] }[] | undefined) ?? [];
    return { ok: true, data: rows.map((x) => ({ date: x.date_start, spend: Number(x.spend ?? 0), impressions: Number(x.impressions ?? 0), clicks: Number(x.clicks ?? 0), conversions: (x.actions ?? []).filter((a) => META_CONVERSIONS.has(a.action_type)).reduce((n, a) => n + Number(a.value), 0) })) };
  },
};

/* ───────────────────────── Google Ads API (REST) ───────────────────────── */

const GADS_V = () => secretValue("GOOGLE_ADS_API_VERSION") || process.env.GOOGLE_ADS_API_VERSION || "v21";
const gCustomer = () => secretValue("GOOGLE_ADS_CUSTOMER_ID").replace(/-/g, "");
/** Geo target constants for the countries the regions use most (others are refused rather than guessed). */
export const GOOGLE_GEO: Record<string, number> = { US: 2840, GB: 2826, IN: 2356, AE: 2784, SA: 2682, SG: 2702, DE: 2276, FR: 2250, CA: 2124, AU: 2036, NL: 2528, QA: 2634 };

async function gHeaders(): Promise<Record<string, string> | null> {
  const token = await googleAccessToken();
  if (!token || !secretValue("GOOGLE_ADS_DEVELOPER_TOKEN") || !gCustomer()) return null;
  const login = secretValue("GOOGLE_ADS_LOGIN_CUSTOMER_ID").replace(/-/g, "");
  return { Authorization: `Bearer ${token}`, "developer-token": secretValue("GOOGLE_ADS_DEVELOPER_TOKEN"), ...(login ? { "login-customer-id": login } : {}) };
}
const gBase = () => `https://googleads.googleapis.com/${GADS_V()}/customers/${gCustomer()}`;
const gSearch = async (h: Record<string, string>, query: string) => req(`${gBase()}/googleAds:search`, { method: "POST", headers: h, json: { query } });
const G_NC = "developer token, customer ID and Google sign-in";

const google: AdsProvider = {
  key: "google",
  name: "Google Ads",
  connected: () => !!secretValue("GOOGLE_ADS_DEVELOPER_TOKEN") && !!gCustomer() && !!secretValue("GOOGLE_REFRESH_TOKEN"),
  async account() {
    const h = await gHeaders();
    if (!h) return notConnected("Google Ads", G_NC);
    const r = await gSearch(h, "SELECT customer.descriptive_name, customer.currency_code FROM customer LIMIT 1");
    const c = (r.body.results as { customer?: { descriptiveName?: string; currencyCode?: string } }[] | undefined)?.[0]?.customer;
    return r.ok && c ? { ok: true, data: { name: c.descriptiveName ?? gCustomer(), currency: c.currencyCode ?? "" } } : perr("Google Ads", r.status, r.body);
  },
  async create(i) {
    const h = await gHeaders();
    if (!h) return notConnected("Google Ads", G_NC);
    const geos = isoCodes(i.countries).map((c) => GOOGLE_GEO[c]).filter(Boolean);
    if (!geos.length) return { ok: false, code: "PROVIDER_ERROR", error: `Google Ads targeting supports these country codes here: ${Object.keys(GOOGLE_GEO).join(", ")}.` };
    const b = await req(`${gBase()}/campaignBudgets:mutate`, { method: "POST", headers: h, json: { operations: [{ create: { name: `${i.name} budget ${Date.now()}`, amountMicros: String(Math.round(i.dailyBudget * 1_000_000)), deliveryMethod: "STANDARD", explicitlyShared: false } }] } });
    const budget = (b.body.results as { resourceName?: string }[] | undefined)?.[0]?.resourceName;
    if (!b.ok || !budget) return perr("Google Ads", b.status, b.body);
    const c = await req(`${gBase()}/campaigns:mutate`, { method: "POST", headers: h, json: { operations: [{ create: { name: i.name, status: "PAUSED", advertisingChannelType: "SEARCH", campaignBudget: budget, manualCpc: {}, networkSettings: { targetGoogleSearch: true, targetSearchNetwork: true, targetContentNetwork: false }, containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING" } }] } });
    const campaign = (c.body.results as { resourceName?: string }[] | undefined)?.[0]?.resourceName;
    if (!c.ok || !campaign) return perr("Google Ads", c.status, c.body);
    const notes: string[] = ["Ad groups, keywords and ads are added in Google Ads by a person before launch."];
    const g = await req(`${gBase()}/campaignCriteria:mutate`, { method: "POST", headers: h, json: { operations: geos.map((id) => ({ create: { campaign, location: { geoTargetConstant: `geoTargetConstants/${id}` } } })) } });
    if (!g.ok) notes.push("Location targeting was not applied — set it in Google Ads.");
    return { ok: true, data: { externalId: campaign.split("/").pop()!, refs: { campaign, budget }, notes } };
  },
  async setStatus(_id, refs, status) {
    const h = await gHeaders();
    if (!h) return notConnected("Google Ads", G_NC);
    const r = await req(`${gBase()}/campaigns:mutate`, { method: "POST", headers: h, json: { operations: [{ update: { resourceName: refs.campaign, status }, updateMask: "status" }] } });
    return r.ok ? { ok: true, data: { status } } : perr("Google Ads", r.status, r.body);
  },
  async setBudget(_id, refs, dailyBudget) {
    const h = await gHeaders();
    if (!h) return notConnected("Google Ads", G_NC);
    const r = await req(`${gBase()}/campaignBudgets:mutate`, { method: "POST", headers: h, json: { operations: [{ update: { resourceName: refs.budget, amountMicros: String(Math.round(dailyBudget * 1_000_000)) }, updateMask: "amountMicros" }] } });
    return r.ok ? { ok: true, data: { dailyBudget } } : perr("Google Ads", r.status, r.body);
  },
  async insights(id, _refs, from, to) {
    const h = await gHeaders();
    if (!h) return notConnected("Google Ads", G_NC);
    if (!/^\d+$/.test(id)) return { ok: false, code: "PROVIDER_ERROR", error: "Invalid campaign id." };
    const r = await gSearch(h, `SELECT segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions FROM campaign WHERE campaign.id = ${id} AND segments.date BETWEEN '${from}' AND '${to}'`);
    if (!r.ok) return perr("Google Ads", r.status, r.body);
    const rows = (r.body.results as { segments: { date: string }; metrics: { costMicros?: string; impressions?: string; clicks?: string; conversions?: number } }[] | undefined) ?? [];
    return { ok: true, data: rows.map((x) => ({ date: x.segments.date, spend: Number(x.metrics.costMicros ?? 0) / 1_000_000, impressions: Number(x.metrics.impressions ?? 0), clicks: Number(x.metrics.clicks ?? 0), conversions: Number(x.metrics.conversions ?? 0) })) };
  },
};

/* ───────────────────────── LinkedIn Marketing API ───────────────────────── */

const LI_V = () => secretValue("LINKEDIN_API_VERSION") || "202409";
const liAccount = () => secretValue("LINKEDIN_AD_ACCOUNT_ID").replace(/\D/g, "");
const liHeaders = () => ({ Authorization: `Bearer ${secretValue("LINKEDIN_ACCESS_TOKEN")}`, "LinkedIn-Version": LI_V(), "X-Restli-Protocol-Version": "2.0.0" });
/** LinkedIn geo URNs for common markets (others are refused rather than guessed). */
export const LINKEDIN_GEO: Record<string, string> = { US: "103644278", GB: "101165590", IN: "102713980", AE: "104305776", SA: "100459316", SG: "102454443", DE: "101282230", FR: "105015875", CA: "101174742", AU: "101452733" };
const LI_NC = "ad account ID and LinkedIn sign-in";

const linkedin: AdsProvider = {
  key: "linkedin",
  name: "LinkedIn Ads",
  connected: () => !!liAccount() && !!secretValue("LINKEDIN_ACCESS_TOKEN"),
  async account() {
    if (!this.connected()) return notConnected("LinkedIn Ads", LI_NC);
    const r = await req(`https://api.linkedin.com/rest/adAccounts/${liAccount()}`, { headers: liHeaders() });
    return r.ok && typeof r.body.name === "string" ? { ok: true, data: { name: r.body.name, currency: String(r.body.currency ?? "") } } : perr("LinkedIn Ads", r.status, r.body);
  },
  async create(i) {
    if (!this.connected()) return notConnected("LinkedIn Ads", LI_NC);
    const geos = isoCodes(i.countries).map((c) => LINKEDIN_GEO[c]).filter(Boolean);
    if (!geos.length) return { ok: false, code: "PROVIDER_ERROR", error: `LinkedIn Ads targeting supports these country codes here: ${Object.keys(LINKEDIN_GEO).join(", ")}.` };
    const account = `urn:li:sponsoredAccount:${liAccount()}`;
    const start = Date.now() + 60_000;
    const g = await req(`https://api.linkedin.com/rest/adAccounts/${liAccount()}/adCampaignGroups`, { method: "POST", headers: liHeaders(), json: { account, name: `${i.name} — group`, status: "PAUSED", runSchedule: { start } } });
    const groupId = g.headers.get("x-restli-id") ?? (typeof g.body.id === "number" || typeof g.body.id === "string" ? String(g.body.id) : null);
    if (!g.ok || !groupId) return perr("LinkedIn Ads", g.status, g.body);
    const money = (v: number) => ({ amount: v.toFixed(2), currencyCode: i.currency });
    const c = await req(`https://api.linkedin.com/rest/adAccounts/${liAccount()}/adCampaigns`, { method: "POST", headers: liHeaders(), json: { account, campaignGroup: `urn:li:sponsoredCampaignGroup:${groupId}`, name: i.name, type: "SPONSORED_UPDATES", costType: "CPM", objectiveType: "WEBSITE_VISIT", dailyBudget: money(i.dailyBudget), unitCost: money(Math.max(2, Math.round(i.dailyBudget / 10))), locale: { country: "US", language: "en" }, offsiteDeliveryEnabled: false, targetingCriteria: { include: { and: [{ or: { "urn:li:adTargetingFacet:locations": geos.map((x) => `urn:li:geo:${x}`) } }] } }, status: "PAUSED", runSchedule: { start } } });
    const campaignId = c.headers.get("x-restli-id") ?? (c.body.id != null ? String(c.body.id) : null);
    if (!c.ok || !campaignId) return perr("LinkedIn Ads", c.status, c.body);
    return { ok: true, data: { externalId: campaignId, refs: { group: groupId }, notes: ["Creatives are attached in LinkedIn Campaign Manager by a person before launch."] } };
  },
  async setStatus(id, refs, status) {
    if (!this.connected()) return notConnected("LinkedIn Ads", LI_NC);
    const patch = async (path: string) => req(`https://api.linkedin.com/rest/adAccounts/${liAccount()}/${path}`, { method: "POST", headers: { ...liHeaders(), "X-RestLi-Method": "PARTIAL_UPDATE" }, json: { patch: { $set: { status } } } });
    if (status === "ACTIVE" && refs.group) await patch(`adCampaignGroups/${refs.group}`);
    const r = await patch(`adCampaigns/${id}`);
    return r.ok ? { ok: true, data: { status } } : perr("LinkedIn Ads", r.status, r.body);
  },
  async setBudget(id, _refs, dailyBudget) {
    if (!this.connected()) return notConnected("LinkedIn Ads", LI_NC);
    const acct = await this.account();
    const currency = acct.ok ? acct.data.currency : "USD";
    const r = await req(`https://api.linkedin.com/rest/adAccounts/${liAccount()}/adCampaigns/${id}`, { method: "POST", headers: { ...liHeaders(), "X-RestLi-Method": "PARTIAL_UPDATE" }, json: { patch: { $set: { dailyBudget: { amount: dailyBudget.toFixed(2), currencyCode: currency } } } } });
    return r.ok ? { ok: true, data: { dailyBudget } } : perr("LinkedIn Ads", r.status, r.body);
  },
  async insights(id, _refs, from, to) {
    if (!this.connected()) return notConnected("LinkedIn Ads", LI_NC);
    const d = (s: string) => {
      const [y, m, day] = s.split("-").map(Number);
      return `(year:${y},month:${m},day:${day})`;
    };
    const url = `https://api.linkedin.com/rest/adAnalytics?q=analytics&pivot=CAMPAIGN&timeGranularity=DAILY&dateRange=(start:${d(from)},end:${d(to)})&campaigns=List(${encodeURIComponent(`urn:li:sponsoredCampaign:${id}`)})&fields=costInLocalCurrency,impressions,clicks,externalWebsiteConversions,dateRange`;
    const r = await req(url, { headers: liHeaders() });
    if (!r.ok) return perr("LinkedIn Ads", r.status, r.body);
    const rows = (r.body.elements as { costInLocalCurrency?: string; impressions?: number; clicks?: number; externalWebsiteConversions?: number; dateRange: { start: { year: number; month: number; day: number } } }[] | undefined) ?? [];
    const pad = (n: number) => String(n).padStart(2, "0");
    return { ok: true, data: rows.map((x) => ({ date: `${x.dateRange.start.year}-${pad(x.dateRange.start.month)}-${pad(x.dateRange.start.day)}`, spend: Number(x.costInLocalCurrency ?? 0), impressions: x.impressions ?? 0, clicks: x.clicks ?? 0, conversions: x.externalWebsiteConversions ?? 0 })) };
  },
};

export const adsProviders: Record<AdsProviderKey, AdsProvider> = { meta, google, linkedin };
export const ADS_PROVIDER_KEYS = Object.keys(adsProviders) as AdsProviderKey[];

export async function adsReady() {
  await hydrateVault();
  return ADS_PROVIDER_KEYS.map((k) => ({ key: k, name: adsProviders[k].name, connected: adsProviders[k].connected() }));
}
