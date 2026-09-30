import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db/client";

/**
 * Provider API usage and rate limiting, shared by every adapter.
 * - Every real HTTP call is counted per provider per UTC day (IntegrationUsage), with errors counted separately.
 * - A provider that answers 429 (optionally with Retry-After) is put in a cool-down: no further calls are made to it
 *   until the time passes — the caller gets an honest "rate limited" result instead of a network call.
 * - Daily call caps (DEFAULT_DAILY_CAPS, overridable per provider) stop a runaway loop from exhausting paid credits.
 */

export const DEFAULT_DAILY_CAPS: Record<string, number> = { apollo: 500, hunter: 500, neverbounce: 1000, linkedin: 500, meta: 1000, x: 300, youtube: 1000, google: 2000, "google-ads": 1000, "linkedin-ads": 500, anthropic: 5000, openai: 2000, gemini: 500 };

const HOSTS: [RegExp, string][] = [
  [/^api\.apollo\.io$/, "apollo"],
  [/^api\.hunter\.io$/, "hunter"],
  [/^api\.neverbounce\.com$/, "neverbounce"],
  [/^api\.linkedin\.com$/, "linkedin"],
  [/^graph\.facebook\.com$/, "meta"],
  [/^api\.(x|twitter)\.com$/, "x"],
  [/^youtube\.googleapis\.com$|^www\.googleapis\.com$/, "youtube"],
  [/^googleads\.googleapis\.com$/, "google-ads"],
  [/^(analyticsdata|searchconsole|oauth2)\.googleapis\.com$/, "google"],
  [/^api\.anthropic\.com$/, "anthropic"],
  [/^api\.openai\.com$/, "openai"],
  [/^generativelanguage\.googleapis\.com$/, "gemini"],
];

export function providerOfUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname;
    return HOSTS.find(([re]) => re.test(host))?.[1] ?? null;
  } catch {
    return null;
  }
}

const today = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};

async function row(provider: string) {
  const date = today();
  await db.$executeRaw`INSERT INTO "IntegrationUsage" ("id", "date", "provider", "calls", "errors") VALUES (${randomUUID()}, ${date}::date, ${provider}, 0, 0) ON CONFLICT ("date", "provider") DO NOTHING`;
  return date;
}

export async function dailyCap(provider: string): Promise<number> {
  const s = await db.setting.findUnique({ where: { key: "integrationCaps" } }).catch(() => null);
  const v = (s?.value as Record<string, unknown> | null)?.[provider];
  return typeof v === "number" && v > 0 ? v : (DEFAULT_DAILY_CAPS[provider] ?? 1000);
}

/**
 * Called before a provider request. Atomically counts the call if the provider is not cooling down and today's cap
 * is not reached; otherwise returns the reason and nothing is sent.
 */
export async function beginCall(provider: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!process.env.DATABASE_URL) return { ok: true };
  try {
    const date = await row(provider);
    const r = await db.integrationUsage.findUnique({ where: { date_provider: { date, provider } } });
    if (r?.coolUntil && r.coolUntil > new Date()) return { ok: false, reason: `${provider} asked us to slow down (rate limit) until ${r.coolUntil.toISOString().slice(11, 16)} UTC.` };
    const cap = await dailyCap(provider);
    const won = await db.$queryRaw<{ calls: number }[]>`UPDATE "IntegrationUsage" SET "calls" = "calls" + 1 WHERE "date" = ${date}::date AND "provider" = ${provider} AND "calls" < ${cap} RETURNING "calls"`;
    if (!won.length) return { ok: false, reason: `${provider} daily API limit reached (${cap} calls). It resets at 00:00 UTC.` };
    return { ok: true };
  } catch {
    // Usage accounting must never break a real integration; fail open for the count only.
    return { ok: true };
  }
}

/** Called after the response: counts errors and applies Retry-After / 429 cool-downs. */
export async function endCall(provider: string, status: number, retryAfter?: string | null) {
  if (!process.env.DATABASE_URL || (status >= 200 && status < 400)) return;
  try {
    const date = await row(provider);
    const secs = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) : retryAfter ? Math.max(0, (Date.parse(retryAfter) - Date.now()) / 1000) : 60;
    const coolUntil = status === 429 ? new Date(Date.now() + Math.min(3600, Math.max(30, secs || 60)) * 1000) : undefined;
    await db.integrationUsage.update({ where: { date_provider: { date, provider } }, data: { errors: { increment: 1 }, ...(coolUntil ? { coolUntil } : {}) } });
  } catch {
    /* accounting only */
  }
}

/**
 * fetch() with usage accounting, cool-down and one retry for transient failures (5xx / network) — never for 4xx.
 * Returns a synthetic 429 response (no request sent) while the provider is cooling down or over its daily cap.
 */
export async function trackedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const provider = providerOfUrl(url);
  if (!provider) return fetch(url, init);
  const gate = await beginCall(provider);
  if (!gate.ok) return new Response(JSON.stringify({ error: { message: gate.reason } }), { status: 429, headers: { "content-type": "application/json", "x-shivacha-local": "rate-limit" } });
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (e) {
    await endCall(provider, 599);
    if ((init.method ?? "GET").toUpperCase() !== "GET") throw e;
    await new Promise((r) => setTimeout(r, 1500));
    res = await fetch(url, init);
  }
  if (res.status >= 500 && (init.method ?? "GET").toUpperCase() === "GET") {
    await endCall(provider, res.status);
    await new Promise((r) => setTimeout(r, 1500));
    res = await fetch(url, init);
  }
  await endCall(provider, res.status, res.headers.get("retry-after"));
  return res;
}

export async function usageToday() {
  if (!process.env.DATABASE_URL) return [];
  return db.integrationUsage.findMany({ where: { date: today() } });
}

export async function usageSince(days: number) {
  const since = new Date(today().getTime() - (days - 1) * 86400_000);
  return db.integrationUsage.groupBy({ by: ["provider"], where: { date: { gte: since } }, _sum: { calls: true, errors: true } });
}
