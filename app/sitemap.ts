import type { MetadataRoute } from "next";
import { siteConfig } from "@/data/siteConfig";
import { allRoutes } from "@/lib/routes";
import { getCmsCaseStudies, getCmsPageSlugs, getCmsPosts, getCmsProducts, getCmsServices, getSeoEntries, getSeoSettings } from "@/lib/cms/public";

export const revalidate = 3600;

/** Built-in routes plus published CMS content; URLs marked noindex in the SEO module are left out. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date().toISOString();
  const [seo, entries, svc, prod, posts, cases, pages] = await Promise.all([getSeoSettings(), getSeoEntries(), getCmsServices(), getCmsProducts(), getCmsPosts(), getCmsCaseStudies(), getCmsPageSlugs()]);
  if (!seo.allowIndexing) return [];
  const iso = (d: Date | string) => new Date(d).toISOString();
  const routes = new Map(allRoutes().map((r) => [r.path, { path: r.path, priority: r.priority, lastModified: r.lastModified ?? now }]));
  const add = (path: string, priority: number, updated: Date | string) => routes.set(path, { path, priority: routes.get(path)?.priority ?? priority, lastModified: iso(updated) });
  svc.forEach((s) => add(`/services/${s.slug}`, 0.8, s.updatedAt));
  prod.forEach((p) => add(`/products/${p.slug}`, 0.8, p.updatedAt));
  posts.forEach((p) => add(`/insights/${p.slug}`, 0.6, p.updatedAt));
  cases.forEach((c) => add(`/work/${c.slug}`, 0.6, c.updatedAt));
  pages.forEach((p) => add(`/${p.slug}`, 0.6, p.updatedAt));
  return [...routes.values()]
    .filter((r) => !entries[r.path]?.noindex)
    .map((r) => ({
      url: `${siteConfig.url}${r.path === "/" ? "" : r.path}`,
      lastModified: r.lastModified,
      changeFrequency: r.priority >= 0.8 ? "weekly" : "monthly",
      priority: r.priority,
    }));
}
