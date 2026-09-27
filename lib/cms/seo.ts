import "server-only";
import type { Metadata } from "next";
import { siteConfig } from "@/data/siteConfig";
import { getSeoEntries, getSeoSettings } from "./public";

/**
 * Applies admin SEO settings to a page's metadata: the per-URL override from the SEO module
 * (matched on the page's canonical path), the default Open Graph image and the global indexing switch.
 * Falls back to the page's own metadata when the database is unavailable.
 */
export async function withSeo(meta: Metadata): Promise<Metadata> {
  const canonical = typeof meta.alternates?.canonical === "string" ? meta.alternates.canonical : undefined;
  const path = canonical ? new URL(canonical, siteConfig.url).pathname.replace(/\/+$/, "") || "/" : undefined;
  const [entries, seo] = await Promise.all([getSeoEntries(), getSeoSettings()]);
  const e = path ? entries[path.toLowerCase()] : undefined;
  if (!e && seo.allowIndexing && !seo.defaultOgImage && !seo.defaultDescription) return meta;

  const out: Metadata = { ...meta, openGraph: { ...meta.openGraph }, twitter: { ...meta.twitter } };
  if (!out.description && seo.defaultDescription) out.description = seo.defaultDescription;
  if (e?.title) {
    out.title = e.title;
    out.openGraph!.title = `${e.title} | ${siteConfig.shortName}`;
    out.twitter!.title = `${e.title} | ${siteConfig.shortName}`;
  }
  if (e?.description) {
    out.description = e.description;
    out.openGraph!.description = e.description;
    out.twitter!.description = e.description;
  }
  if (e?.canonical) {
    out.alternates = { ...meta.alternates, canonical: e.canonical };
    out.openGraph!.url = e.canonical;
  }
  const og = e?.ogImage || (!meta.openGraph?.images && seo.defaultOgImage) || null;
  if (og) {
    out.openGraph!.images = [{ url: og }];
    out.twitter!.images = [og];
  }
  if (e?.noindex || !seo.allowIndexing) out.robots = { index: false, follow: true };
  return out;
}
