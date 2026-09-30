import "server-only";
import { db } from "@/lib/db/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { hydrateVault, secretValue } from "@/lib/integrations/vault";
import { trackedFetch } from "@/lib/integrations/usage";
import { PLATFORM_LABELS, SOCIAL_PLATFORMS, type SocialPlatform } from "./policy";

/**
 * Post-level performance from the platforms' own APIs, for posts that were published with a platform ID.
 * Only numbers the platform returned are stored; a metric the platform does not expose stays null (UNAVAILABLE).
 */

export interface PostMetrics {
  impressions: number | null;
  reach: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  clicks: number | null;
}
const empty = (): PostMetrics => ({ impressions: null, reach: null, views: null, likes: null, comments: null, shares: null, clicks: null });
const n = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

async function get(url: string, headers: Record<string, string> = {}) {
  const res = await trackedFetch(url, { headers, signal: AbortSignal.timeout(15_000), cache: "no-store" });
  return { ok: res.ok, status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

type Fetcher = (id: string) => Promise<{ ok: true; m: PostMetrics } | { ok: false; error: string }>;
const GRAPH = () => `https://graph.facebook.com/${secretValue("META_GRAPH_VERSION") || "v21.0"}`;

const FETCHERS: Record<SocialPlatform, { ready: () => boolean; fetch: Fetcher }> = {
  FACEBOOK: {
    ready: () => !!secretValue("META_PAGE_ACCESS_TOKEN"),
    fetch: async (id) => {
      const r = await get(`${GRAPH()}/${encodeURIComponent(id)}?fields=shares,likes.summary(true),comments.summary(true),insights.metric(post_impressions,post_clicks)&access_token=${encodeURIComponent(secretValue("META_PAGE_ACCESS_TOKEN"))}`);
      if (!r.ok) return { ok: false, error: `Facebook HTTP ${r.status}` };
      const ins = (r.body.insights as { data?: { name: string; values: { value: number }[] }[] } | undefined)?.data ?? [];
      const metric = (name: string) => n(ins.find((x) => x.name === name)?.values?.[0]?.value);
      return { ok: true, m: { ...empty(), impressions: metric("post_impressions"), clicks: metric("post_clicks"), likes: n((r.body.likes as { summary?: { total_count?: number } } | undefined)?.summary?.total_count), comments: n((r.body.comments as { summary?: { total_count?: number } } | undefined)?.summary?.total_count), shares: n((r.body.shares as { count?: number } | undefined)?.count ?? 0) } };
    },
  },
  INSTAGRAM: {
    ready: () => !!secretValue("META_PAGE_ACCESS_TOKEN"),
    fetch: async (id) => {
      const r = await get(`${GRAPH()}/${encodeURIComponent(id)}/insights?metric=reach,likes,comments,shares,saved&access_token=${encodeURIComponent(secretValue("META_PAGE_ACCESS_TOKEN"))}`);
      if (!r.ok) return { ok: false, error: `Instagram HTTP ${r.status}` };
      const d = (r.body.data as { name: string; values: { value: number }[] }[] | undefined) ?? [];
      const metric = (name: string) => n(d.find((x) => x.name === name)?.values?.[0]?.value);
      return { ok: true, m: { ...empty(), reach: metric("reach"), likes: metric("likes"), comments: metric("comments"), shares: metric("shares") } };
    },
  },
  X: {
    ready: () => !!secretValue("X_ACCESS_TOKEN"),
    fetch: async (id) => {
      const r = await get(`https://api.x.com/2/tweets/${encodeURIComponent(id)}?tweet.fields=public_metrics`, { Authorization: `Bearer ${secretValue("X_ACCESS_TOKEN")}` });
      if (!r.ok) return { ok: false, error: `X HTTP ${r.status}` };
      const m = (r.body.data as { public_metrics?: Record<string, number> } | undefined)?.public_metrics ?? {};
      return { ok: true, m: { ...empty(), impressions: n(m.impression_count), likes: n(m.like_count), comments: n(m.reply_count), shares: m.retweet_count == null ? null : Number(m.retweet_count) + Number(m.quote_count ?? 0) } };
    },
  },
  LINKEDIN: {
    ready: () => !!secretValue("LINKEDIN_ACCESS_TOKEN"),
    fetch: async (id) => {
      const r = await get(`https://api.linkedin.com/rest/socialActions/${encodeURIComponent(id)}`, { Authorization: `Bearer ${secretValue("LINKEDIN_ACCESS_TOKEN")}`, "LinkedIn-Version": secretValue("LINKEDIN_API_VERSION") || "202409", "X-Restli-Protocol-Version": "2.0.0" });
      if (!r.ok) return { ok: false, error: `LinkedIn HTTP ${r.status}` };
      return { ok: true, m: { ...empty(), likes: n((r.body.likesSummary as { totalLikes?: number } | undefined)?.totalLikes), comments: n((r.body.commentsSummary as { totalFirstLevelComments?: number } | undefined)?.totalFirstLevelComments) } };
    },
  },
  YOUTUBE: {
    ready: () => !!secretValue("YOUTUBE_API_KEY"),
    fetch: async (id) => {
      const r = await get(`https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${encodeURIComponent(id)}&key=${encodeURIComponent(secretValue("YOUTUBE_API_KEY"))}`);
      const st = (r.body.items as { statistics?: Record<string, string> }[] | undefined)?.[0]?.statistics;
      if (!r.ok || !st) return { ok: false, error: r.ok ? "YouTube returned no statistics for this video ID." : `YouTube HTTP ${r.status}` };
      return { ok: true, m: { ...empty(), views: n(st.viewCount), likes: n(st.likeCount), comments: n(st.commentCount) } };
    },
  },
};

/** Syncs metrics for recently published posts (each at most every 6 hours). Returns counts and honest errors. */
export async function syncPostMetrics(limit = 50): Promise<{ synced: number; skipped: string[]; errors: string[] }> {
  await hydrateVault();
  const posts = await db.socialPost.findMany({ where: { status: "PUBLISHED", externalId: { not: null }, publishedAt: { gte: new Date(Date.now() - 45 * 86400_000) }, OR: [{ metricsAt: null }, { metricsAt: { lt: new Date(Date.now() - 6 * 3600_000) } }] }, orderBy: { publishedAt: "desc" }, take: limit, select: { id: true, platform: true, externalId: true } });
  const out = { synced: 0, skipped: [] as string[], errors: [] as string[] };
  for (const p of posts) {
    const f = FETCHERS[p.platform as SocialPlatform];
    if (!f) continue;
    if (!f.ready()) {
      if (!out.skipped.includes(p.platform)) out.skipped.push(p.platform);
      continue;
    }
    const r = await f.fetch(p.externalId!).catch(() => ({ ok: false as const, error: "network error" }));
    if (!r.ok) {
      out.errors.push(`${PLATFORM_LABELS[p.platform as SocialPlatform] ?? p.platform}: ${r.error}`);
      continue;
    }
    await db.socialPost.update({ where: { id: p.id }, data: { metrics: r.m as unknown as Prisma.InputJsonValue, metricsAt: new Date() } });
    out.synced++;
  }
  return out;
}

export const parseMetrics = (v: unknown): PostMetrics | null => (v && typeof v === "object" && !Array.isArray(v) ? { ...empty(), ...(v as Partial<PostMetrics>) } : null);
export const engagementOf = (m: PostMetrics | null) => (m ? (m.likes ?? 0) + (m.comments ?? 0) + (m.shares ?? 0) + (m.clicks ?? 0) : null);

/* ───────────────────────── strategy ───────────────────────── */

export interface SocialStrategy {
  pillars: string[];
  audience: string;
  tone: string;
  /** Planned posts per week per platform. */
  cadence: Partial<Record<SocialPlatform, number>>;
}

export function parseStrategy(v: unknown): SocialStrategy {
  const o = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const cad = o.cadence && typeof o.cadence === "object" ? (o.cadence as Record<string, unknown>) : {};
  return {
    pillars: Array.isArray(o.pillars) ? o.pillars.map(String).filter(Boolean).slice(0, 10) : [],
    audience: typeof o.audience === "string" ? o.audience.slice(0, 500) : "",
    tone: typeof o.tone === "string" ? o.tone.slice(0, 300) : "",
    cadence: Object.fromEntries(SOCIAL_PLATFORMS.map((p) => [p, Number(cad[p])]).filter(([, x]) => Number.isInteger(x) && (x as number) >= 0 && (x as number) <= 50)) as SocialStrategy["cadence"],
  };
}

export async function getSocialStrategy(): Promise<SocialStrategy> {
  const row = process.env.DATABASE_URL ? await db.setting.findUnique({ where: { key: "socialStrategy" } }).catch(() => null) : null;
  return parseStrategy(row?.value);
}
