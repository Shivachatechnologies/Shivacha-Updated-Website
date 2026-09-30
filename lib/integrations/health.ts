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
import { googleAccessToken } from "./oauth";
import { ga4Summary, gscSummary } from "./google";
import { adsProviders } from "@/lib/ads/providers";

export type HealthState = "CONNECTED" | "NOT_CONNECTED" | "NOT_SUPPORTED" | "ERROR";

export interface IntegrationStatusRow {
  def: IntegrationDef;
  state: HealthState;
  source: "ENV" | "VAULT" | "MIXED" | null;
  lastTestedAt: Date | null;
  lastError: string | null;
  usage: string | null;
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

/** Honest status for every catalogue entry. ERROR only when the last real test failed and nothing changed since. */
export async function integrationStatuses(): Promise<IntegrationStatusRow[]> {
  await hydrateVault();
  const rows = process.env.DATABASE_URL ? await db.integration.findMany({ where: { key: { startsWith: "center:" } } }) : [];
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const usage = await usageSummary().catch(() => new Map<string, string>());
  return INTEGRATIONS.map((def) => {
    const h = byKey.get(healthKey(def.key));
    const sources = new Set(def.fields.map((f) => secretSource(f.name)).filter(Boolean));
    const source = sources.size > 1 ? "MIXED" : ((sources.values().next().value as "ENV" | "VAULT" | undefined) ?? null);
    const state: HealthState = def.support === "NOT_SUPPORTED" ? "NOT_SUPPORTED" : !configured(def) ? "NOT_CONNECTED" : h?.status === "ERROR" ? "ERROR" : "CONNECTED";
    return { def, state, source, lastTestedAt: h?.lastSyncAt ?? null, lastError: h?.status === "ERROR" ? h.lastError : null, usage: usage.get(def.key) ?? null };
  });
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

/** A real, read-only API call with the stored credentials. Records the outcome; never returns secrets. */
export async function testIntegration(key: string): Promise<{ state: HealthState; message: string }> {
  await hydrateVault(true);
  const def = integrationByKey(key);
  if (!def) return { state: "ERROR", message: "Unknown integration." };
  if (def.support === "NOT_SUPPORTED") return { state: "NOT_SUPPORTED", message: def.note ?? "Not supported in this release." };
  if (!configured(def)) return { state: "NOT_CONNECTED", message: "Credentials are missing." };
  let ok = false;
  let message = "";
  try {
    const r = await probe(def);
    ok = r.ok;
    message = r.message;
  } catch (e) {
    message = (e as Error).name === "TimeoutError" ? "Timed out." : "Network error.";
  }
  await db.integration.upsert({ where: { key: healthKey(key) }, update: { status: ok ? "CONNECTED" : "ERROR", lastSyncAt: new Date(), lastError: ok ? null : message.slice(0, 300) }, create: { key: healthKey(key), status: ok ? "CONNECTED" : "ERROR", lastSyncAt: new Date(), lastError: ok ? null : message.slice(0, 300) } });
  return { state: ok ? "CONNECTED" : "ERROR", message };
}

async function get(url: string, headers: Record<string, string> = {}) {
  const res = await trackedFetch(url, { headers, signal: AbortSignal.timeout(15_000), cache: "no-store" });
  return res.status;
}

async function probe(def: IntegrationDef): Promise<{ ok: boolean; message: string }> {
  const status = (s: number, name: string) => (s >= 200 && s < 300 ? { ok: true, message: `${name} accepted the credentials.` } : { ok: false, message: `${name} returned HTTP ${s}${s === 401 || s === 403 ? " (credentials rejected)" : ""}.` });
  switch (def.key) {
    case "anthropic":
      return status(await get("https://api.anthropic.com/v1/models?limit=1", { "x-api-key": secretValue("ANTHROPIC_API_KEY"), "anthropic-version": "2023-06-01" }), "Anthropic");
    case "openai":
      return status(await get("https://api.openai.com/v1/models", { Authorization: `Bearer ${secretValue("OPENAI_API_KEY")}` }), "OpenAI");
    case "apollo":
      return status(await get("https://api.apollo.io/v1/auth/health", { "X-Api-Key": secretValue("APOLLO_API_KEY") }), "Apollo");
    case "hunter":
      return status(await get(`https://api.hunter.io/v2/account?api_key=${encodeURIComponent(secretValue("HUNTER_API_KEY"))}`), "Hunter");
    case "neverbounce":
      return status(await get(`https://api.neverbounce.com/v4/account/info?key=${encodeURIComponent(secretValue("NEVERBOUNCE_API_KEY"))}`), "NeverBounce");
    case "gemini":
      return status(await get(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(secretValue("GEMINI_API_KEY"))}`), "Gemini");
    case "google-app": {
      const t = await googleAccessToken();
      return t ? { ok: true, message: "Google issued an access token from the stored refresh token." } : { ok: false, message: "Google did not issue an access token (sign in again)." };
    }
    case "ga4": {
      const r = await ga4Summary(7);
      return r.ok ? { ok: true, message: `GA4 responded: ${r.data.sessions.toLocaleString("en-US")} sessions in 7 days.` } : { ok: false, message: r.error };
    }
    case "gsc": {
      const r = await gscSummary(28);
      return r.ok ? { ok: true, message: `Search Console responded: ${r.data.clicks.toLocaleString("en-US")} clicks in 28 days.` } : { ok: false, message: r.error };
    }
    case "meta-app":
      return status(await get(`https://graph.facebook.com/${secretValue("META_GRAPH_VERSION") || "v21.0"}/me?fields=id&access_token=${encodeURIComponent(secretValue("META_USER_ACCESS_TOKEN"))}`), "Meta");
    case "x-app":
      return status(await get("https://api.x.com/2/users/me", { Authorization: `Bearer ${secretValue("X_ACCESS_TOKEN")}` }), "X");
    case "linkedin-app":
      return probe(integrationByKey("linkedin")!);
    case "meta-ads":
    case "google-ads":
    case "linkedin-ads": {
      const r = await adsProviders[def.key === "meta-ads" ? "meta" : def.key === "google-ads" ? "google" : "linkedin"].account();
      return r.ok ? { ok: true, message: `${def.name} account reachable: ${r.data.name} (${r.data.currency}).` } : { ok: false, message: r.error };
    }
    default: {
      const platform = SOCIAL[def.key];
      if (platform) {
        const r = await SOCIAL_PROVIDERS[platform].followers();
        return r.ok ? { ok: true, message: `${def.name} responded (followers: ${r.data.followers.toLocaleString("en-US")}).` } : { ok: false, message: r.error };
      }
      if (def.key === "email" || def.key === "tts" || def.key === "whatsapp" || def.key === "web-search") return { ok: true, message: "Configuration present. This integration has no read-only test call; it is exercised when used." };
      return { ok: false, message: "No test is available for this integration." };
    }
  }
}

