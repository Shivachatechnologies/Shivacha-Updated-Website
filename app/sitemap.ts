import type { MetadataRoute } from "next";
import { siteConfig } from "@/data/siteConfig";
import { allRoutes } from "@/lib/routes";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date().toISOString();
  return allRoutes().map((r) => ({
    url: `${siteConfig.url}${r.path === "/" ? "" : r.path}`,
    lastModified: r.lastModified ?? now,
    changeFrequency: r.priority >= 0.8 ? "weekly" : "monthly",
    priority: r.priority,
  }));
}
