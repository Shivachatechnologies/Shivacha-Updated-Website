import type { Metadata } from "next";
import { siteConfig } from "@/data/siteConfig";

interface MetaInput {
  title: string;
  description: string;
  path: string;
  type?: "website" | "article";
  noindex?: boolean;
  publishedTime?: string;
  keywords?: string[];
}

/** Build unique, complete metadata for a page: title, description, canonical, Open Graph and Twitter. */
export function buildMetadata({ title, description, path, type = "website", noindex, publishedTime, keywords }: MetaInput): Metadata {
  const url = `${siteConfig.url}${path === "/" ? "" : path}`;
  const desc = description.length > 300 ? description.slice(0, 297) + "…" : description;
  return {
    title: path === "/" ? { absolute: title } : title,
    description: desc,
    keywords,
    alternates: { canonical: url },
    openGraph: {
      title: `${title} | ${siteConfig.shortName}`,
      description: desc,
      url,
      siteName: siteConfig.name,
      type,
      locale: "en_US",
      ...(publishedTime ? { publishedTime } : {}),
    },
    twitter: { card: "summary_large_image", title: `${title} | ${siteConfig.shortName}`, description: desc },
    robots: noindex ? { index: false, follow: true } : { index: true, follow: true },
  };
}
