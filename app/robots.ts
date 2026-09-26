import type { MetadataRoute } from "next";
import { siteConfig } from "@/data/siteConfig";

/** Search engines and AI assistants may crawl all public pages; APIs and paid landing pages are excluded. */
const aiCrawlers = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "Claude-User", "PerplexityBot", "Perplexity-User", "Google-Extended", "Applebot-Extended", "CCBot"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/api/", "/lp/"] },
      { userAgent: aiCrawlers, allow: "/", disallow: ["/api/", "/lp/"] },
    ],
    sitemap: `${siteConfig.url}/sitemap.xml`,
    host: siteConfig.url,
  };
}
