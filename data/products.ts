import type { DivisionId, Product } from "./types";
import { fintechProducts } from "./products/fintech";
import { web3Products } from "./products/web3";
import { aiProducts, digitalProducts, cloudProducts } from "./products/ai-digital-cloud";

export type { Product };

export const products: Product[] = [...aiProducts, ...digitalProducts, ...fintechProducts, ...web3Products, ...cloudProducts];

const bySlug = new Map(products.map((p) => [p.slug, p]));
export const getProduct = (slug: string) => bySlug.get(slug);

export const productCategories: { id: DivisionId; label: string }[] = [
  { id: "ai", label: "AI" },
  { id: "digital", label: "Digital" },
  { id: "fintech", label: "FinTech" },
  { id: "web3", label: "Web3" },
  { id: "cloud", label: "Cloud" },
];

/** A demo URL is only rendered when it is an absolute https URL. Anything else falls back to Request Demo. */
export const hasLiveDemo = (p: Product) => typeof p.demoUrl === "string" && /^https:\/\/[^\s]+$/.test(p.demoUrl);
