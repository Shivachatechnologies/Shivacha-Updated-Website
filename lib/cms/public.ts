import "server-only";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db/client";
import type { NavColumn } from "@/data/types";
import { SETTING_DEFAULTS, type SeoSettings, type SiteSettings } from "@/lib/admin/settings";

/**
 * Public-site readers for CMS data. Every reader returns an empty value when the database is not
 * configured or unreachable, so the website always falls back to its code-managed content.
 * Cached with tags; admin actions invalidate them immediately (see lib/admin/revalidate.ts).
 */
const safe = async <T,>(fn: () => Promise<T>, fallback: T): Promise<T> => {
  if (!process.env.DATABASE_URL) return fallback;
  try {
    return await fn();
  } catch (e) {
    console.error("[cms] read failed", (e as Error).message);
    return fallback;
  }
};

const HOUR = 3600;
const published = { status: "PUBLISHED" as const };

export const getFooterNav = unstable_cache(
  async (): Promise<NavColumn[] | undefined> =>
    safe(async () => {
      const cols = await db.navigationItem.findMany({ where: { menu: "FOOTER", parentId: null, active: true }, orderBy: { order: "asc" }, include: { children: { where: { active: true }, orderBy: { order: "asc" } } } });
      if (!cols.length) return undefined;
      return cols.map((c) => ({ title: c.label, links: c.children.map((l) => ({ label: l.label, href: l.url })) }));
    }, undefined),
  ["cms-footer-nav"],
  { tags: ["cms:navigation"], revalidate: HOUR },
);

const getSettingRaw = unstable_cache(async (key: string) => safe(async () => (await db.setting.findUnique({ where: { key } }))?.value ?? null, null), ["cms-setting"], { tags: ["cms:settings"], revalidate: HOUR });
export const getSiteSettings = async (): Promise<SiteSettings> => ({ ...SETTING_DEFAULTS.site, ...((await getSettingRaw("site")) as object | null) });
export const getSeoSettings = async (): Promise<SeoSettings> => ({ ...SETTING_DEFAULTS.seo, ...((await getSettingRaw("seo")) as object | null) });

export const getSeoEntries = unstable_cache(
  async () => safe(async () => Object.fromEntries((await db.seoEntry.findMany()).map((e) => [e.path, { title: e.title, description: e.description, canonical: e.canonical, ogImage: e.ogImage, noindex: e.noindex }])), {} as Record<string, { title: string | null; description: string | null; canonical: string | null; ogImage: string | null; noindex: boolean }>),
  ["cms-seo-entries"],
  { tags: ["cms:seo"], revalidate: HOUR },
);

export const getCmsServices = unstable_cache(async () => safe(() => db.service.findMany({ where: published, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }), []), ["cms-services"], { tags: ["cms:services"], revalidate: HOUR });
export const getCmsProducts = unstable_cache(async () => safe(() => db.product.findMany({ where: published, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }), []), ["cms-products"], { tags: ["cms:products"], revalidate: HOUR });
export const getCmsFaqs = unstable_cache(async () => safe(() => db.faq.findMany({ where: published, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }), []), ["cms-faqs"], { tags: ["cms:faqs"], revalidate: HOUR });
export const getCmsCaseStudies = unstable_cache(async () => safe(() => db.caseStudy.findMany({ where: published, orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }] }), []), ["cms-case-studies"], { tags: ["cms:case-studies"], revalidate: HOUR });
export const getCmsIndustries = unstable_cache(async () => safe(() => db.industry.findMany({ where: published }), []), ["cms-industries"], { tags: ["cms:industries"], revalidate: HOUR });
export const getCmsTechnologies = unstable_cache(async () => safe(() => db.technology.findMany({ where: published }), []), ["cms-technologies"], { tags: ["cms:technologies"], revalidate: HOUR });

/** Published posts whose publish date has passed. Cached for 5 minutes so scheduled posts go live on time. */
const getCmsPostsRaw = unstable_cache(async () => safe(() => db.blogPost.findMany({ where: published, orderBy: { publishedAt: "desc" } }), []), ["cms-posts"], { tags: ["cms:blog"], revalidate: 300 });
export const getCmsPosts = async () => {
  const now = Date.now();
  return (await getCmsPostsRaw()).filter((p) => !p.publishedAt || new Date(p.publishedAt).getTime() <= now);
};

export const getCmsPage = unstable_cache(
  async (slug: string) => safe(() => db.page.findFirst({ where: { slug, ...published }, include: { sections: { where: { hidden: false }, orderBy: { order: "asc" } } } }), null),
  ["cms-page"],
  { tags: ["cms:pages"], revalidate: HOUR },
);
export const getCmsPageSlugs = unstable_cache(async () => safe(async () => (await db.page.findMany({ where: published, select: { slug: true, updatedAt: true } })), []), ["cms-page-slugs"], { tags: ["cms:pages"], revalidate: HOUR });
