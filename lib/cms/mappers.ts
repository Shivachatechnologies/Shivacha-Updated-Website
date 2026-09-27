import type { CaseStudy, DivisionId, FAQ, Insight, InsightSection, Point, Product, Service } from "@/data/types";
import { serviceGroups } from "@/data/serviceGroups";

/** Converts CMS rows into the site's content types so existing templates can render them. */

type Json = unknown;
const arr = <T,>(v: Json): T[] => (Array.isArray(v) ? (v as T[]) : []);
const strs = (v: Json) => arr<unknown>(v).map(String).filter(Boolean);
const points = (v: Json): Point[] => arr<{ title?: string; description?: string }>(v).filter((p) => p?.title).map((p) => ({ title: String(p.title), description: String(p.description ?? "") }));
const faqs = (v: Json): FAQ[] => arr<{ q?: string; a?: string }>(v).filter((f) => f?.q && f?.a).map((f) => ({ q: String(f.q), a: String(f.a) }));
const nonEmpty = <T,>(a: T[], b: T[]) => (a.length ? a : b);

export const DIVISION_ID: Record<string, DivisionId> = { WEB3: "web3", FINTECH: "fintech", DIGITAL_ASSETS: "digital-assets", AI: "ai", CLOUD: "cloud", DIGITAL: "digital" };

/** Markdown subset → sections: "## Heading" starts a section, blank lines split paragraphs, "- " lines are bullets. */
export function markdownToSections(md: string | null | undefined, fallbackHeading = "Overview"): InsightSection[] {
  const out: InsightSection[] = [];
  let cur: InsightSection | null = null;
  let para: string[] = [];
  const flush = () => {
    if (para.length) {
      cur ??= { heading: fallbackHeading, body: [] };
      cur.body.push(para.join(" "));
      para = [];
    }
  };
  for (const raw of (md ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    const h = /^#{1,3}\s+(.+)/.exec(line);
    if (h) {
      flush();
      if (cur) out.push(cur);
      cur = { heading: h[1].trim(), body: [] };
    } else if (/^[-*]\s+/.test(line)) {
      flush();
      cur ??= { heading: fallbackHeading, body: [] };
      (cur.bullets ??= []).push(line.replace(/^[-*]\s+/, ""));
    } else if (!line) flush();
    else para.push(line);
  }
  flush();
  if (cur) out.push(cur);
  return out;
}

export const paragraphs = (md: string | null | undefined) => markdownToSections(md).flatMap((s) => s.body);

type ServiceRow = { slug: string; name: string; division: string; shortDescription: string | null; description: string | null; heroTitle: string | null; heroDescription: string | null; benefits: Json; features: Json; technologies: Json; faqs: Json };

/** CMS service → Service. Overrides the built-in entry field by field when one exists with the same slug. */
export function toService(row: ServiceRow, base?: Service, extraFaqs: FAQ[] = []): Service {
  const division = DIVISION_ID[row.division] ?? "digital";
  const group = base?.group ?? serviceGroups.find((g) => g.division === division)?.id ?? serviceGroups[0].id;
  return {
    ...(base ?? { useCases: [], capabilities: [], faqs: [], related: [] }),
    slug: row.slug,
    name: row.name,
    group,
    summary: row.shortDescription || row.heroDescription || base?.summary || "",
    overview: paragraphs(row.description).join("\n\n") || base?.overview || "",
    useCases: nonEmpty(points(row.benefits), base?.useCases ?? []),
    capabilities: nonEmpty(points(row.features), base?.capabilities ?? []),
    technologies: nonEmpty(strs(row.technologies), base?.technologies ?? []),
    faqs: [...nonEmpty(faqs(row.faqs), base?.faqs ?? []), ...extraFaqs],
  };
}

type ProductRow = { slug: string; name: string; category: string | null; division: string; description: string | null; heroTitle: string | null; heroDescription: string | null; screenshots: Json; features: Json; modules: Json; techStack: Json; integrations: Json; architecture: Json; deployment: Json; customization: Json; relatedServices: Json; faqs: Json };

export function toProduct(row: ProductRow, base?: Product, extraFaqs: FAQ[] = []): Product {
  const desc = paragraphs(row.description);
  const architecture = points(row.architecture).map((p) => ({ name: p.title, items: p.description.split(",").map((s) => s.trim()).filter(Boolean) }));
  const defaults: Omit<Product, "slug" | "name" | "division" | "category" | "tagline" | "description"> = {
    heroImage: "",
    screenshots: [],
    features: [],
    technologies: [],
    integrations: [],
    industries: [],
    deploymentOptions: [],
    customizationOptions: [],
    security: [],
    faqs: [],
    relatedProducts: [],
    caseStudies: [],
    requestDemo: true,
    ctaType: "request-demo",
    problem: "",
    solution: "",
    modules: [],
    useCases: [],
    architecture: [],
    preview: "portal",
    services: [],
  };
  return {
    ...defaults,
    ...base,
    slug: row.slug,
    name: row.name,
    division: DIVISION_ID[row.division] ?? base?.division ?? "digital",
    category: row.category || base?.category || "Platform",
    tagline: row.heroTitle || base?.tagline || row.name,
    description: row.heroDescription || desc[0] || base?.description || "",
    ...(desc.length > 1 && { solution: desc.slice(1).join("\n\n") }),
    screenshots: nonEmpty(strs(row.screenshots), base?.screenshots ?? []),
    features: nonEmpty(strs(row.features), base?.features ?? []),
    modules: nonEmpty(points(row.modules), base?.modules ?? []),
    technologies: nonEmpty(strs(row.techStack), base?.technologies ?? []),
    integrations: nonEmpty(strs(row.integrations), base?.integrations ?? []),
    architecture: nonEmpty(architecture, base?.architecture ?? []),
    deploymentOptions: nonEmpty(strs(row.deployment), base?.deploymentOptions ?? []),
    customizationOptions: nonEmpty(strs(row.customization), base?.customizationOptions ?? []),
    services: nonEmpty(strs(row.relatedServices), base?.services ?? []),
    faqs: [...nonEmpty(faqs(row.faqs), base?.faqs ?? []), ...extraFaqs],
  };
}

type PostRow = { slug: string; title: string; excerpt: string | null; content: string | null; authorName: string | null; category: string | null; tags: string[]; readingTime: number | null; publishedAt: Date | null; createdAt: Date };

export function toInsight(row: PostRow): Insight {
  return {
    slug: row.slug,
    title: row.title,
    category: row.category || "software-engineering",
    excerpt: row.excerpt || paragraphs(row.content)[0]?.slice(0, 240) || "",
    date: new Date(row.publishedAt ?? row.createdAt).toISOString().slice(0, 10),
    readingTime: `${row.readingTime ?? Math.max(1, Math.round((row.content ?? "").split(/\s+/).length / 220))} min`,
    author: row.authorName || "Shivacha Engineering",
    sections: markdownToSections(row.content, "Introduction"),
    services: [],
    technologies: [],
    tags: row.tags ?? [],
  };
}

type CaseRow = { slug: string; title: string; client: string | null; industry: string | null; challenge: string | null; solution: string | null; architecture: string | null; technologies: Json; deliverables: Json; results: string | null };

export function toCaseStudy(row: CaseRow, base?: CaseStudy): CaseStudy {
  const sol = markdownToSections(row.solution, "Approach");
  const defaults: Omit<CaseStudy, "slug" | "title" | "kind" | "summary" | "challenge" | "approach" | "technologies" | "implementation" | "outcome" | "industries"> = { division: "digital", context: "", lessons: [], services: [], products: [], architecture: [] };
  return {
    ...defaults,
    ...base,
    slug: row.slug,
    title: row.title,
    kind: row.client ? "client" : "reference-architecture",
    client: row.client ?? undefined,
    summary: paragraphs(row.challenge)[0] ?? base?.summary ?? "",
    challenge: paragraphs(row.challenge).join("\n\n") || base?.challenge || "",
    approach: sol.length ? sol.flatMap((s) => (s.bullets?.length ? s.bullets.map((b) => ({ title: b.split(/[—:-]/)[0].trim(), description: b })) : s.body.map((b) => ({ title: s.heading, description: b })))) : (base?.approach ?? []),
    technologies: nonEmpty(strs(row.technologies), base?.technologies ?? []),
    implementation: nonEmpty(strs(row.deliverables).map((d) => ({ title: d, description: "" })), base?.implementation ?? []),
    outcome: paragraphs(row.results).join("\n\n") || base?.outcome || "",
    industries: row.industry ? [row.industry.toLowerCase().replace(/[^a-z0-9]+/g, "-")] : (base?.industries ?? []),
  };
}
