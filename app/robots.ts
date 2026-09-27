import type { MetadataRoute } from "next";
import { siteConfig } from "@/data/siteConfig";
import { getSeoSettings } from "@/lib/cms/public";

export const revalidate = 3600;

/** Search engines and AI assistants may crawl all public pages; APIs, admin and paid landing pages are excluded. */
const aiCrawlers = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "Claude-User", "PerplexityBot", "Perplexity-User", "Google-Extended", "Applebot-Extended", "CCBot"];

export default async function robots(): Promise<MetadataRoute.Robots> {
  const seo = await getSeoSettings();
  const disallow = ["/api/", "/lp/", "/admin/", ...seo.disallowPaths.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)];
  if (!seo.allowIndexing) return { rules: [{ userAgent: "*", disallow: "/" }], host: siteConfig.url };
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow },
      { userAgent: aiCrawlers, allow: "/", disallow },
    ],
    sitemap: `${siteConfig.url}/sitemap.xml`,
    host: siteConfig.url,
  };
}
