import type { SocialPlatform } from "./policy";

/**
 * Content QA and repurposing rules (pure). QA never "fixes" content silently: it returns issues for the reviewer.
 * Blocking issues stop publishing; warnings are shown to the approver.
 */

export const PLATFORM_LIMITS: Record<SocialPlatform, { chars: number; hashtags: number; needsMedia: boolean }> = {
  LINKEDIN: { chars: 3000, hashtags: 5, needsMedia: false },
  INSTAGRAM: { chars: 2200, hashtags: 15, needsMedia: true },
  FACEBOOK: { chars: 5000, hashtags: 5, needsMedia: false },
  X: { chars: 280, hashtags: 3, needsMedia: false },
  YOUTUBE: { chars: 5000, hashtags: 10, needsMedia: true },
};

export const POST_FORMATS = ["POST", "CAROUSEL", "REEL", "VIDEO", "STORY", "THREAD"] as const;
export const ASSET_KINDS = ["ARTICLE", "VIDEO_SCRIPT", "REEL_SCRIPT", "IMAGE_BRIEF", "CAROUSEL", "CASE_STUDY", "NEWSLETTER"] as const;

export interface QaIssue {
  level: "block" | "warn";
  code: string;
  message: string;
}

const GUARANTEE = /\b(guarantee[ds]?|100\s?%\s?(safe|secure|success|results?)|risk[- ]free|zero risk|assured returns?|get rich|double your)\b/i;
const FINANCIAL_PROMISE = /\b(\d+\s?%\s?(returns?|roi|profit|apy|apr|yield))\b/i;
const FAKE_SOCIAL = /\b(follow for follow|f4f|like for like|l4l|sub4sub|comment for comment)\b/i;
const URL = /https?:\/\/[^\s)]+/g;

export function contentQa(body: string, platform: SocialPlatform, opts: { bannedPhrases?: string[]; mediaUrl?: string | null } = {}): QaIssue[] {
  const issues: QaIssue[] = [];
  const text = body.trim();
  const lim = PLATFORM_LIMITS[platform];
  if (!text) issues.push({ level: "block", code: "EMPTY", message: "The post is empty." });
  if (text.length > lim.chars) issues.push({ level: "block", code: "TOO_LONG", message: `${text.length} characters; ${platform} allows ${lim.chars}.` });
  if (lim.needsMedia && !opts.mediaUrl) issues.push({ level: "block", code: "MEDIA_REQUIRED", message: `${platform} posts need an image or video.` });
  for (const p of opts.bannedPhrases ?? []) if (p && text.toLowerCase().includes(p.toLowerCase())) issues.push({ level: "block", code: "BANNED_PHRASE", message: `Contains banned phrase “${p}”.` });
  if (GUARANTEE.test(text)) issues.push({ level: "block", code: "GUARANTEE_CLAIM", message: "Makes a guarantee or risk-free claim." });
  if (FINANCIAL_PROMISE.test(text)) issues.push({ level: "block", code: "FINANCIAL_PROMISE", message: "Promises a financial return; not allowed in marketing copy." });
  if (FAKE_SOCIAL.test(text)) issues.push({ level: "block", code: "ENGAGEMENT_BAIT", message: "Engagement-exchange bait (follow-for-follow etc.) is not allowed." });
  const tags = text.match(/#[\p{L}\d_]+/gu) ?? [];
  if (tags.length > lim.hashtags) issues.push({ level: "warn", code: "HASHTAGS", message: `${tags.length} hashtags; keep to ${lim.hashtags} or fewer on ${platform}.` });
  if (/\b\d{2,}(\.\d+)?\s?(%|x\b|k\+?(?!\w)|m\+?(?!\w))/i.test(text)) issues.push({ level: "warn", code: "NUMERIC_CLAIM", message: "Contains a numeric claim — confirm it comes from a real, citable source." });
  for (const u of text.match(URL) ?? []) if (/shivacha\.com/i.test(u) && !/utm_campaign=/.test(u)) issues.push({ level: "warn", code: "NO_UTM", message: "Link to the site has no UTM tags, so leads will not be attributed." });
  return issues;
}

export const qaBlocks = (issues: QaIssue[]) => issues.some((i) => i.level === "block");

/** Deterministic repurposing plan: which derivative posts to draft from one long-form asset (drafts, never auto-published). */
export function repurposePlan(kind: (typeof ASSET_KINDS)[number]): { platform: SocialPlatform; format: (typeof POST_FORMATS)[number] }[] {
  switch (kind) {
    case "ARTICLE":
    case "CASE_STUDY":
      return [{ platform: "LINKEDIN", format: "POST" }, { platform: "LINKEDIN", format: "CAROUSEL" }, { platform: "X", format: "THREAD" }, { platform: "FACEBOOK", format: "POST" }];
    case "VIDEO_SCRIPT":
    case "REEL_SCRIPT":
      return [{ platform: "INSTAGRAM", format: "REEL" }, { platform: "YOUTUBE", format: "VIDEO" }, { platform: "LINKEDIN", format: "POST" }];
    case "IMAGE_BRIEF":
    case "CAROUSEL":
      return [{ platform: "INSTAGRAM", format: "CAROUSEL" }, { platform: "LINKEDIN", format: "CAROUSEL" }];
    case "NEWSLETTER":
      return [{ platform: "LINKEDIN", format: "POST" }, { platform: "X", format: "POST" }];
  }
}

/** Short excerpt for a derivative post: first paragraph(s) within the platform limit, never cut mid-word. */
export function excerptFor(body: string, platform: SocialPlatform, link?: string): string {
  const limit = PLATFORM_LIMITS[platform].chars - (link ? link.length + 2 : 0);
  const paras = body.replace(/\r/g, "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  let out = "";
  for (const p of paras) {
    if ((out ? out.length + 2 : 0) + p.length > limit) break;
    out = out ? `${out}\n\n${p}` : p;
  }
  if (!out) {
    out = body.slice(0, Math.max(0, limit - 1));
    out = out.slice(0, out.lastIndexOf(" ") > 0 ? out.lastIndexOf(" ") : out.length) + "…";
  }
  return link ? `${out}\n\n${link}` : out;
}
