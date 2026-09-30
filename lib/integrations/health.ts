import "server-only";
import { db } from "@/lib/db/client";
import { mailMode } from "@/lib/email/mailer";
import { openaiVoice } from "@/lib/voice/provider";
import { webSearchEnabled } from "@/lib/ai/provider";
import { channels } from "@/lib/communication/providers";
import { SOCIAL_PROVIDERS } from "@/lib/growth/providers";
import type { SocialPlatform } from "@/lib/growth/policy";
import { INTEGRATIONS, integrationByKey, type IntegrationDef } from "./catalog";
import { hydrateVault, secretSource, secretValue } from "./vault";
import { trackedFetch, usageSince, usageToday } from "./usage";
import { googleAccessToken, oauthStatus } from "./oauth";
import { classifyFailure, scrubSecrets, statusFromText, type Evidence, type HealthState } from "./health-rules";
import { ga4Summary, gscSummary } from "./google";
import { adsProviders } from "@/lib/ads/providers";

export type { HealthState } from "./health-rules";

export interface IntegrationStatusRow {
  def: IntegrationDef;
  state: HealthState;
  source: "ENV" | "VAULT" | "MIXED" | null;
  lastTestedAt: Date | null;
  lastError: string | null;
  usage: string | null;
  /** Last check that the provider accepted, and last one it did not (with the classified reason). */
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  failureKind: string | null;
  /** OAuth token expiry, when the provider told us. */
  expiresAt: string | null;
  /** Non-secret account identifier (page / ad account / property / channel id, or the account name the provider returned). */
  account: string | null;
}

/** What a health check stores in Integration.config (never a secret). */
interface HealthRecord {
  state?: HealthState;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  failureKind?: string;
  account?: string | null;
}

/** Catalogue key → provider name used by the usage counters. */
const USAGE_PROVIDER: Record<string, string> = { facebook: "meta", instagram: "meta", "meta-app": "meta", "meta-ads": "meta", "linkedin-app": "linkedin", "linkedin-ads": "linkedin", "x-app": "x", ga4: "google", gsc: "google", "google-app": "google" };
const SOCIAL: Record<string, SocialPlatform> = { linkedin: "LINKEDIN", facebook: "FACEBOOK", instagram: "INSTAGRAM", x: "X", youtube: "YOUTUBE" };
const healthKey = (k: string) => `center:${k}`;

/** Credentials present for this integration (required fields only). */
function configured(d: IntegrationDef): boolean {
  switch (d.key) {
    case "email": return mailMode() !== "none";
    case "tts": return openaiVoice.configured();
    case "ga4": return !!secretValue("GA4_PROPERTY_ID") && !!secretValue("GOOGLE_REFRESH_TOKEN");
    case "gsc": return !!secretValue("GSC_SITE_URL") && !!secretValue("GOOGLE_REFRESH_TOKEN");
    case "google-ads": return ["GOOGLE_ADS_DEVELOPER_TOKEN", "GOOGLE_ADS_CUSTOMER_ID", "GOOGLE_REFRESH_TOKEN"].every((k) => !!secretValue(k));
    case "meta-ads": return !!secretValue("META_AD_ACCOUNT_ID") && !!(secretValue("META_ADS_ACCESS_TOKEN") || secretValue("META_USER_ACCESS_TOKEN"));
    case "linkedin-ads": return !!secretValue("LINKEDIN_AD_ACCOUNT_ID") && !!secretValue("LINKEDIN_ACCESS_TOKEN");
    case "whatsapp": return channels().some((c) => /whatsapp/i.test(c.key) && c.connected);
    case "web-search": return webSearchEnabled();
    // OAuth apps are CONNECTED only after a real sign-in (token exchange) succeeded.
    case "linkedin-app": return !!secretValue("LINKEDIN_CLIENT_ID") && !!secretValue("LINKEDIN_ACCESS_TOKEN");
    case "meta-app": return !!secretValue("META_APP_ID") && !!secretValue("META_USER_ACCESS_TOKEN");
    case "x-app": return !!secretValue("X_CLIENT_ID") && !!secretValue("X_ACCESS_TOKEN");
    case "google-app": return !!secretValue("GOOGLE_OAUTH_CLIENT_ID") && !!secretValue("GOOGLE_REFRESH_TOKEN");
    default: return d.fields.length > 0 && d.fields.filter((f) => !f.optional).every((f) => !!secretValue(f.name));
  }
}

/**
 * Honest status for every catalogue entry: NOT_SUPPORTED / NOT_CONNECTED from configuration; EXPIRED when a stored
 * OAuth expiry has passed (and cannot be refreshed) or the last check said so; RATE_LIMITED while the provider's
 * cool-down is active; ERROR when the last real check failed and nothing changed since; otherwise CONNECTED.
 */
export async function integrationStatuses(): Promise<IntegrationStatusRow[]> {
  await hydrateVault();
  const rows = process.env.DATABASE_URL ? await db.integration.findMany({ where: { key: { startsWith: "center:" } } }) : [];
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const [usage, today, oauth] = await Promise.all([usageSummary().catch(() => new Map<string, string>()), usageToday().catch(() => []), oauthStatus().catch(() => [])]);
  return INTEGRATIONS.map((def) => {
    const h = byKey.get(healthKey(def.key));
    const rec = ((h?.config ?? {}) as HealthRecord) ?? {};
    const sources = new Set(def.fields.map((f) => secretSource(f.name)).filter(Boolean));
    const source = sources.size > 1 ? "MIXED" : ((sources.values().next().value as "ENV" | "VAULT" | undefined) ?? null);
    const o = def.oauth ? oauth.find((x) => x.provider === def.oauth) : undefined;
    const expiresAt = o?.expiresAt ?? null;
    const cool = today.find((t) => t.provider === (USAGE_PROVIDER[def.key] ?? def.key))?.coolUntil;
    let state: HealthState;
    if (def.support === "NOT_SUPPORTED") state = "NOT_SUPPORTED";
    else if (!configured(def)) state = "NOT_CONNECTED";
    else if (o?.state === "EXPIRED" || (h?.status === "ERROR" && rec.state === "EXPIRED")) state = "EXPIRED";
    else if (cool && cool > new Date()) state = "RATE_LIMITED";
    else if (h?.status === "ERROR") state = rec.state === "RATE_LIMITED" ? "RATE_LIMITED" : "ERROR";
    else state = "CONNECTED";
    const failing = state === "ERROR" || state === "EXPIRED" || (state === "RATE_LIMITED" && h?.status === "ERROR");
    return {
      def,
      state,
      source,
      lastTestedAt: h?.lastSyncAt ?? null,
      lastError: failing ? (h?.lastError ?? (state === "EXPIRED" ? "Sign-in expired. Sign in again." : null)) : state === "RATE_LIMITED" ? `Rate limited until ${cool!.toISOString().slice(11, 16)} UTC.` : null,
      usage: usage.get(def.key) ?? null,
      lastSuccessAt: rec.lastSuccessAt ? new Date(rec.lastSuccessAt) : null,
      lastFailureAt: rec.lastFailureAt ? new Date(rec.lastFailureAt) : null,
      failureKind: failing ? (rec.failureKind ?? null) : null,
      expiresAt,
      account: accountOf(def) ?? rec.account ?? null,
    };
  });
}

/** Non-secret identifier from the integration's own non-secret fields (page id, ad account id, property, channel). */
function accountOf(def: IntegrationDef): string | null {
  const f = def.fields.find((x) => !x.secret && x.name !== "SMTP_USER" && !/CLIENT_ID|APP_ID/.test(x.name) && secretValue(x.name));
  return f ? `${f.label.replace(/\s*\(.*$/, "")}: ${secretValue(f.name)}` : null;
}

/** Real usage recorded in Shivacha OS (no provider-side billing data is fetched). */
async function usageSummary(): Promise<Map<string, string>> {
  const since = new Date(Date.now() - 30 * 86400_000);
  const [ai, prospects, posts, emails] = await Promise.all([
    db.aIUsage.aggregate({ where: { createdAt: { gte: since } }, _sum: { costUsd: true, inputTokens: true, outputTokens: true }, _count: { _all: true } }),
    db.prospect.groupBy({ by: ["source"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    db.socialPost.groupBy({ by: ["platform"], where: { status: "PUBLISHED", publishedAt: { gte: since } }, _count: { _all: true } }),
    db.growthEmailSend.count({ where: { status: "SENT", sentAt: { gte: since } } }),
  ]);
  const m = new Map<string, string>();
  m.set("anthropic", `${ai._count._all} model calls · ${((ai._sum.inputTokens ?? 0) + (ai._sum.outputTokens ?? 0)).toLocaleString("en-US")} tokens · $${Number(ai._sum.costUsd ?? 0).toFixed(2)} (30 days, metered in Shivacha OS)`);
  for (const p of prospects) if (p.source === "apollo" || p.source === "hunter") m.set(p.source, `${p._count._all} prospects imported (30 days)`);
  for (const [k, plat] of Object.entries(SOCIAL)) {
    const n = posts.find((p) => p.platform === plat)?._count._all;
    if (n) m.set(k, `${n} posts published with platform confirmation (30 days)`);
  }
  m.set("email", `${emails} growth sequence emails sent (30 days)`);
  // API calls counted by the adapters (lib/integrations/usage.ts), with today's cool-down if a provider rate-limited us.
  const [calls, today] = await Promise.all([usageSince(30), usageToday()]);
  for (const def of INTEGRATIONS) {
    const p = USAGE_PROVIDER[def.key] ?? def.key;
    const c = calls.find((x) => x.provider === p);
    const t = today.find((x) => x.provider === p);
    const parts = [m.get(def.key), c ? `${(c._sum.calls ?? 0).toLocaleString("en-US")} API calls, ${c._sum.errors ?? 0} errors (30 days)` : null, t?.coolUntil && t.coolUntil > new Date() ? `rate-limited until ${t.coolUntil.toISOString().slice(11, 16)} UTC` : null].filter(Boolean);
    if (parts.length) m.set(def.key, parts.join(" · "));
  }
  return m;
}

/** A real, read-only API call with the stored credentials. Records the classified outcome; never returns or stores secrets. */
export async function testIntegration(key: string): Promise<{ state: HealthState; message: string }> {
  await hydrateVault(true);
  const def = integrationByKey(key);
  if (!def) return { state: "ERROR", message: "Unknown integration." };
  if (def.support === "NOT_SUPPORTED") return { state: "NOT_SUPPORTED", message: def.note ?? "Not supported in this release." };
  if (!configured(def)) return { state: "NOT_CONNECTED", message: "Credentials are missing." };
  const secrets = [...def.fields.filter((f) => f.secret).map((f) => secretValue(f.name)), ...["LINKEDIN_ACCESS_TOKEN", "META_USER_ACCESS_TOKEN", "META_PAGE_ACCESS_TOKEN", "X_ACCESS_TOKEN", "GOOGLE_REFRESH_TOKEN", "ANTHROPIC_API_KEY"].map(secretValue)];
  let r: ProbeResult;
  try {
    r = await probe(def);
  } catch (e) {
    const name = (e as Error).name;
    r = { ok: false, evidence: name === "TimeoutError" || name === "AbortError" ? { timeout: true } : { network: true } };
  }
  const prev = process.env.DATABASE_URL ? await db.integration.findUnique({ where: { key: healthKey(key) } }) : null;
  const rec: HealthRecord = { ...((prev?.config ?? {}) as HealthRecord) };
  const now = new Date().toISOString();
  let state: HealthState;
  let message: string;
  if (r.ok) {
    state = "CONNECTED";
    message = scrubSecrets(r.message ?? `${def.name} accepted the credentials.`, secrets);
    Object.assign(rec, { state, lastSuccessAt: now, failureKind: undefined, account: r.account ?? rec.account ?? null });
  } else {
    const ev = { ...r.evidence, message: scrubSecrets(r.evidence.message ?? "", secrets), oauth: r.evidence.oauth ?? def.auth === "OAUTH" };
    const f = classifyFailure(ev, def.name);
    state = f.state;
    message = scrubSecrets(f.reason, secrets);
    Object.assign(rec, { state, lastFailureAt: now, failureKind: f.kind });
  }
  if (process.env.DATABASE_URL) {
    const data = { status: (r.ok ? "CONNECTED" : "ERROR") as "CONNECTED" | "ERROR", lastSyncAt: new Date(), lastError: r.ok ? null : message.slice(0, 300), config: JSON.parse(JSON.stringify(rec)) };
    await db.integration.upsert({ where: { key: healthKey(key) }, update: data, create: { key: healthKey(key), ...data } });
  }
  return { state, message };
}

type ProbeResult = { ok: true; message?: string; account?: string | null } | { ok: false; evidence: Evidence };

async function get(url: string, headers: Record<string, string> = {}) {
  const res = await trackedFetch(url, { headers, signal: AbortSignal.timeout(15_000), cache: "no-store" });
  const text = await res.text().catch(() => "");
  let body: Record<string, unknown> | null = null;
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    body = null;
  }
  return { status: res.status, local: res.headers.get("x-shivacha-local") === "rate-limit", body };
}

const errText = (b: Record<string, unknown> | null) => {
  if (!b) return "";
  const e = b.error as { message?: string } | string | undefined;
  return String(typeof e === "string" ? e : (e?.message ?? b.message ?? b.detail ?? ""));
};

/** An HTTP probe: 2xx with a JSON body (and the expected field, when given) is success; anything else is evidence. */
async function http(name: string, url: string, headers: Record<string, string> = {}, expect?: (b: Record<string, unknown>) => boolean, account?: (b: Record<string, unknown>) => string | null): Promise<ProbeResult> {
  const r = await get(url, headers);
  if (r.status >= 200 && r.status < 300) {
    if (!r.body || (expect && !expect(r.body))) return { ok: false, evidence: { status: r.status, malformed: true } };
    return { ok: true, message: `${name} accepted the credentials.`, account: account?.(r.body) ?? null };
  }
  return { ok: false, evidence: { status: r.status, local: r.local, message: r.local ? errText(r.body) : errText(r.body) } };
}

/** Adapter results carry only text; recover the HTTP status from it. */
const fromAdapter = (error: string, code?: string): ProbeResult => ({ ok: false, evidence: code === "NOT_CONNECTED" ? { message: error } : { status: statusFromText(error), message: error, local: /asked us to slow down|daily API limit/i.test(error) } });

async function probe(def: IntegrationDef): Promise<ProbeResult> {
  switch (def.key) {
    case "anthropic":
      return http("Anthropic", "https://api.anthropic.com/v1/models?limit=1", { "x-api-key": secretValue("ANTHROPIC_API_KEY"), "anthropic-version": "2023-06-01" }, (b) => Array.isArray(b.data));
    case "openai":
      return http("OpenAI", "https://api.openai.com/v1/models", { Authorization: `Bearer ${secretValue("OPENAI_API_KEY")}` }, (b) => Array.isArray(b.data));
    case "apollo":
      return http("Apollo", "https://api.apollo.io/v1/auth/health", { "X-Api-Key": secretValue("APOLLO_API_KEY") }, (b) => b.is_logged_in !== false);
    case "hunter":
      return http("Hunter", `https://api.hunter.io/v2/account?api_key=${encodeURIComponent(secretValue("HUNTER_API_KEY"))}`, {}, (b) => !!b.data, (b) => { const plan = (b.data as { plan_name?: string } | undefined)?.plan_name; return plan ? `plan: ${plan}` : null; });
    case "neverbounce":
      return http("NeverBounce", `https://api.neverbounce.com/v4/account/info?key=${encodeURIComponent(secretValue("NEVERBOUNCE_API_KEY"))}`, {}, (b) => b.status === "success");
    case "gemini":
      return http("Gemini", `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(secretValue("GEMINI_API_KEY"))}`, {}, (b) => Array.isArray(b.models));
    case "google-app": {
      const t = await googleAccessToken();
      return t ? { ok: true, message: "Google issued an access token from the stored refresh token." } : { ok: false, evidence: { status: 401, oauth: true, message: "Google did not issue an access token from the stored refresh token (expired or revoked)." } };
    }
    case "ga4": {
      const r = await ga4Summary(7);
      return r.ok ? { ok: true, message: `GA4 responded: ${r.data.sessions.toLocaleString("en-US")} sessions in 7 days.`, account: `property ${secretValue("GA4_PROPERTY_ID")}` } : fromAdapter(r.error, r.state);
    }
    case "gsc": {
      const r = await gscSummary(28);
      return r.ok ? { ok: true, message: `Search Console responded: ${r.data.clicks.toLocaleString("en-US")} clicks in 28 days.`, account: secretValue("GSC_SITE_URL") } : fromAdapter(r.error, r.state);
    }
    case "meta-app":
      return http("Meta", `https://graph.facebook.com/${secretValue("META_GRAPH_VERSION") || "v21.0"}/me?fields=id,name&access_token=${encodeURIComponent(secretValue("META_USER_ACCESS_TOKEN"))}`, {}, (b) => typeof b.id === "string", (b) => (typeof b.name === "string" ? `Meta user: ${b.name}` : null));
    case "x-app":
      return http("X", "https://api.x.com/2/users/me", { Authorization: `Bearer ${secretValue("X_ACCESS_TOKEN")}` }, (b) => !!(b.data as { id?: string } | undefined)?.id, (b) => { const u = (b.data as { username?: string } | undefined)?.username; return u ? `@${u}` : null; });
    case "linkedin-app":
      return probe(integrationByKey("linkedin")!);
    case "meta-ads":
    case "google-ads":
    case "linkedin-ads": {
      const r = await adsProviders[def.key === "meta-ads" ? "meta" : def.key === "google-ads" ? "google" : "linkedin"].account();
      return r.ok ? { ok: true, message: `${def.name} account reachable: ${r.data.name} (${r.data.currency}).`, account: `${r.data.name} (${r.data.currency})` } : fromAdapter(r.error, r.code);
    }
    default: {
      const platform = SOCIAL[def.key];
      if (platform) {
        const r = await SOCIAL_PROVIDERS[platform].followers();
        return r.ok ? { ok: true, message: `${def.name} responded (followers: ${r.data.followers.toLocaleString("en-US")}).` } : fromAdapter(r.error, r.code);
      }
      if (def.key === "email" || def.key === "tts" || def.key === "whatsapp" || def.key === "web-search") return { ok: true, message: "Configuration present. This integration has no read-only test call; it is exercised when used." };
      return { ok: false, evidence: { message: "No test is available for this integration." } };
    }
  }
}
