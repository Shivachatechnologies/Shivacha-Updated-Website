import "server-only";
import { getService } from "@/data/services";
import { getProduct } from "@/data/products";
import { insights, getInsight } from "@/data/insights";
import { caseStudies, getCaseStudy } from "@/data/caseStudies";
import type { FAQ } from "@/data/types";
import { getCmsCaseStudies, getCmsFaqs, getCmsPosts, getCmsProducts, getCmsServices } from "./public";
import { toCaseStudy, toInsight, toProduct, toService } from "./mappers";

/**
 * Resolves public content: built-in entries merged with published CMS entries of the same slug,
 * plus CMS-only entries. Without a database this returns exactly the built-in content.
 */
const faqsFor = async (key: "serviceSlug" | "productSlug", slug: string): Promise<FAQ[]> => (await getCmsFaqs()).filter((f) => f[key] === slug).map((f) => ({ q: f.question, a: f.answer }));

export async function resolveService(slug: string) {
  const [row, extra] = await Promise.all([getCmsServices().then((r) => r.find((s) => s.slug === slug)), faqsFor("serviceSlug", slug)]);
  const base = getService(slug);
  if (!row) return base ? { service: extra.length ? { ...base, faqs: [...base.faqs, ...extra] } : base, cms: null } : null;
  return { service: toService(row, base, extra), cms: row };
}

export async function resolveProduct(slug: string) {
  const [row, extra] = await Promise.all([getCmsProducts().then((r) => r.find((s) => s.slug === slug)), faqsFor("productSlug", slug)]);
  const base = getProduct(slug);
  if (!row) return base ? { product: extra.length ? { ...base, faqs: [...base.faqs, ...extra] } : base, cms: null } : null;
  return { product: toProduct(row, base, extra), cms: row };
}

export async function allInsights() {
  const posts = await getCmsPosts();
  const cms = posts.map(toInsight);
  const slugs = new Set(cms.map((c) => c.slug));
  return [...cms, ...insights.filter((i) => !slugs.has(i.slug))];
}

export async function resolveInsight(slug: string) {
  const row = (await getCmsPosts()).find((p) => p.slug === slug);
  if (row) return { insight: toInsight(row), cms: row };
  const base = getInsight(slug);
  return base ? { insight: base, cms: null } : null;
}

export async function allCaseStudies() {
  const rows = await getCmsCaseStudies();
  const cms = rows.map((r) => toCaseStudy(r, getCaseStudy(r.slug)));
  const slugs = new Set(cms.map((c) => c.slug));
  return [...caseStudies.filter((c) => !slugs.has(c.slug)), ...cms];
}

export async function resolveCaseStudy(slug: string) {
  const row = (await getCmsCaseStudies()).find((c) => c.slug === slug);
  const base = getCaseStudy(slug);
  if (row) return { study: toCaseStudy(row, base), cms: row };
  return base ? { study: base, cms: null } : null;
}
