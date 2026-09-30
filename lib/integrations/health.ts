import "server-only";
import { db } from "@/lib/db/client";
import { mailMode } from "@/lib/email/mailer";
import { openaiVoice } from "@/lib/voice/provider";
import { analyticsConnections } from "@/lib/marketing/attribution";
import { webSearchEnabled } from "@/lib/ai/provider";
import { channels } from "@/lib/communication/providers";
import { SOCIAL_PROVIDERS } from "@/lib/growth/providers";
import type { SocialPlatform } from "@/lib/growth/policy";
import { INTEGRATIONS, integrationByKey, type IntegrationDef } from "./catalog";
import { hydrateVault, secretSource, secretValue } from "./vault";

export type HealthState = "CONNECTED" | "NOT_CONNECTED" | "NOT_SUPPORTED" | "ERROR";

export interface IntegrationStatusRow {
  def: IntegrationDef;
  state: HealthState;
  source: "ENV" | "VAULT" | "MIXED" | null;
  lastTestedAt: Date | null;
  lastError: string | null;
  usage: string | null;
}

const SOCIAL: Record<string, SocialPlatform> = { linkedin: "LINKEDIN", facebook: "FACEBOOK", instagram: "INSTAGRAM", x: "X", youtube: "YOUTUBE" };
const healthKey = (k: string) => `center:${k}`;

/** Credentials present for this integration (required fields only). */
function configured(d: IntegrationDef): boolean {
  switch (d.key) {
    case "email": return mailMode() !== "none";
    case "tts": return openaiVoice.configured();
    case "ga4": return analyticsConnections().some((a) => /ga4|google analytics/i.test(`${a.key} ${a.name}`) && a.connected);
    case "whatsapp": return channels().some((c) => /whatsapp/i.test(c.key) && c.connected);
    case "web-search": return webSearchEnabled();
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
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000), cache: "no-store" });
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
    default: {
      const platform = SOCIAL[def.key];
      if (platform) {
        const r = await SOCIAL_PROVIDERS[platform].followers();
        return r.ok ? { ok: true, message: `${def.name} responded (followers: ${r.data.followers.toLocaleString("en-US")}).` } : { ok: false, message: r.error };
      }
      if (def.key === "email" || def.key === "tts" || def.key === "ga4" || def.key === "whatsapp" || def.key === "web-search") return { ok: true, message: "Configuration present. This integration has no read-only test call; it is exercised when used." };
      return { ok: false, message: "No test is available for this integration." };
    }
  }
}

