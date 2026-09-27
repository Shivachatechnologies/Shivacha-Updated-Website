import "server-only";
import { services } from "@/data/services";
import { products } from "@/data/products";
import { productLaunch } from "@/data/launch";

export interface CatalogItem {
  kind: "SERVICE" | "PRODUCT";
  slug: string;
  name: string;
  description: string;
  /** Delivery timeline from the published launch data (products only). No prices exist in the catalogue. */
  timeline?: string;
  modules?: string[];
}

let cache: CatalogItem[] | null = null;

/** Shivacha services and products (names/descriptions only — prices are always entered by a person). */
export function getCatalog(): CatalogItem[] {
  if (cache) return cache;
  cache = [
    ...services.map((s) => ({ kind: "SERVICE" as const, slug: s.slug, name: s.name, description: s.summary, modules: s.capabilities.slice(0, 8).map((c) => c.title) })),
    ...products.map((p) => ({ kind: "PRODUCT" as const, slug: p.slug, name: p.name, description: p.tagline, timeline: productLaunch[p.slug]?.timeline, modules: (productLaunch[p.slug]?.keyModules ?? p.modules.map((m) => m.title)).slice(0, 10) })),
  ].sort((a, b) => a.name.localeCompare(b.name));
  return cache;
}

export const findCatalogItem = (name: string) => {
  const n = name.trim().toLowerCase();
  return getCatalog().find((c) => c.name.toLowerCase() === n || c.slug === n) ?? getCatalog().find((c) => c.name.toLowerCase().includes(n) && n.length > 3);
};
