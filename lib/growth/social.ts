import "server-only";
import { db } from "@/lib/db/client";
import { contentQa, qaBlocks } from "./content";
import { SOCIAL_PLATFORMS, type SocialPlatform } from "./policy";
import { SOCIAL_PROVIDERS } from "./providers";
import { getGrowthSettings, growthStop } from "./settings";
import { budgetGate, recordUsage, utcDay } from "./engine";

/**
 * Social publishing through official APIs only. A post publishes only after a human approved it (approvedById);
 * the PUBLISHING transition is atomic, so a retried job can never publish the same post twice.
 */
export async function publishPost(postId: string, opts: { autonomous: boolean }): Promise<{ ok: boolean; message: string }> {
  const post = await db.socialPost.findUnique({ where: { id: postId } });
  if (!post) return { ok: false, message: "Post not found." };
  if (post.status === "PUBLISHED") return { ok: true, message: "Already published." };
  if (!post.approvedById || !["APPROVED", "SCHEDULED"].includes(post.status)) return { ok: false, message: "A person must approve the post before it is published." };
  const platform = post.platform as SocialPlatform;
  if (!SOCIAL_PLATFORMS.includes(platform)) return { ok: false, message: "Unknown platform." };
  const stop = await growthStop({ kind: "channel", channel: "social", autonomous: opts.autonomous, platform });
  if (stop) return { ok: false, message: stop };
  const s = await getGrowthSettings();
  const qa = contentQa(post.body, platform, { bannedPhrases: s.bannedPhrases, mediaUrl: post.mediaUrl });
  if (qaBlocks(qa)) {
    await db.socialPost.update({ where: { id: post.id }, data: { qa: JSON.parse(JSON.stringify(qa)), error: "Blocked by content QA." } });
    return { ok: false, message: "Blocked by content QA." };
  }
  const budget = await budgetGate("socialDaily", 1);
  if (!budget.ok) return { ok: false, message: `Social budget: ${budget.reason}` };

  const previous = post.status;
  const claimed = await db.socialPost.updateMany({ where: { id: post.id, status: previous }, data: { status: "PUBLISHING" } });
  if (claimed.count !== 1) return { ok: false, message: "The post is already being published." };
  const r = await SOCIAL_PROVIDERS[platform].publish({ body: post.body, link: post.link, mediaUrl: post.mediaUrl, format: post.format });
  if (r.ok) {
    await db.socialPost.update({ where: { id: post.id }, data: { status: "PUBLISHED", publishedAt: new Date(), externalId: r.data.externalId, error: null, qa: JSON.parse(JSON.stringify(qa)) } });
    await recordUsage("socialDaily", 1);
    return { ok: true, message: `Published to ${platform}.` };
  }
  // Not connected / not supported: nothing was published, so the post returns to its approved state with the reason.
  await db.socialPost.update({ where: { id: post.id }, data: { status: r.code === "PROVIDER_ERROR" ? "FAILED" : previous, error: r.error } });
  return { ok: false, message: r.error };
}

/** Publishes approved posts whose scheduled time has passed. */
export async function publishDue(opts: { autonomous: boolean; limit?: number }) {
  const stop = await growthStop({ kind: "channel", channel: "social", autonomous: opts.autonomous });
  if (stop) return { published: 0, failed: 0, blocked: stop };
  const due = await db.socialPost.findMany({ where: { status: "SCHEDULED", approvedById: { not: null }, scheduledAt: { lte: new Date() } }, select: { id: true }, orderBy: { scheduledAt: "asc" }, take: opts.limit ?? 50 });
  let published = 0;
  let failed = 0;
  for (const p of due) {
    const r = await publishPost(p.id, opts);
    if (r.ok) published++;
    else failed++;
  }
  return { published, failed, blocked: null as string | null };
}

/** Pulls today's follower counts from each connected platform. Only real API numbers are stored. */
export async function syncSocialMetrics(): Promise<{ platform: SocialPlatform; ok: boolean; followers?: number; error?: string }[]> {
  const date = utcDay();
  const out: { platform: SocialPlatform; ok: boolean; followers?: number; error?: string }[] = [];
  for (const platform of SOCIAL_PLATFORMS) {
    const p = SOCIAL_PROVIDERS[platform];
    if (!p.status().connected) continue;
    const r = await p.followers();
    if (!r.ok) {
      out.push({ platform, ok: false, error: r.error });
      continue;
    }
    await db.socialMetric.upsert({ where: { platform_date_source: { platform, date, source: "API" } }, create: { platform, date, followers: r.data.followers, source: "API" }, update: { followers: r.data.followers } });
    out.push({ platform, ok: true, followers: r.data.followers });
  }
  return out;
}
