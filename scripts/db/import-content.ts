/**
 * Copies the website's built-in content into the CMS so it can be edited in the admin panel.
 * Idempotent: only creates entries whose slug does not exist yet; never overwrites or deletes.
 *
 *   npm run db:import                      # imports as DRAFT (the live site is unchanged)
 *   npm run db:import -- --status PUBLISHED  # imported entries immediately drive the public pages
 *
 * Only real, existing site content is imported — nothing is invented.
 */
import { prisma } from "./prisma-node";
import { services } from "../../data/services";
import { products } from "../../data/products";
import { insights } from "../../data/insights";
import { caseStudies } from "../../data/caseStudies";
import { industries } from "../../data/industries";
import { technologies } from "../../data/technologies";
import { getGroup } from "../../data/serviceGroups";
import type { DivisionId } from "../../data/types";

/** Plain content arrays → Prisma JSON input. */
const J = <T,>(v: T) => v as unknown as object[];

const statusArg = process.argv[process.argv.indexOf("--status") + 1];
const status = process.argv.includes("--status") && statusArg === "PUBLISHED" ? "PUBLISHED" : "DRAFT";
const publishedAt = status === "PUBLISHED" ? new Date() : null;

const DIV: Record<DivisionId, "WEB3" | "FINTECH" | "DIGITAL_ASSETS" | "AI" | "CLOUD" | "DIGITAL"> = { web3: "WEB3", fintech: "FINTECH", "digital-assets": "DIGITAL_ASSETS", ai: "AI", cloud: "CLOUD", digital: "DIGITAL" };
const TECH: Record<string, "FRONTEND" | "BACKEND" | "MOBILE" | "BLOCKCHAIN" | "WEB3" | "AI" | "CLOUD" | "DATABASE" | "DEVOPS" | "OTHER"> = { frontend: "FRONTEND", backend: "BACKEND", mobile: "MOBILE", ai: "AI", blockchain: "BLOCKCHAIN", "web3-stack": "WEB3", "token-standards": "WEB3", cloud: "CLOUD", devops: "DEVOPS", databases: "DATABASE", data: "DATABASE" };

async function createMissing<T extends { slug: string }>(label: string, items: T[], existing: () => Promise<{ slug: string }[]>, create: (x: T) => Promise<unknown>) {
  const have = new Set((await existing()).map((e) => e.slug));
  let n = 0;
  for (const it of items) {
    if (have.has(it.slug)) continue;
    await create(it);
    n++;
  }
  console.log(`${label.padEnd(14)} ${n} created, ${items.length - n} already present`);
}

async function main() {
  console.log(`Importing built-in content as ${status}…`);
  await createMissing("Services", services, () => prisma.service.findMany({ select: { slug: true } }), (s) =>
    prisma.service.create({
      data: {
        slug: s.slug,
        name: s.name,
        division: DIV[getGroup(s.group)?.division ?? "digital"],
        shortDescription: s.summary,
        description: s.overview,
        benefits: J(s.useCases),
        features: J(s.capabilities),
        technologies: s.technologies ?? [],
        faqs: J(s.faqs),
        status,
        publishedAt,
      },
    }),
  );
  await createMissing("Products", products, () => prisma.product.findMany({ select: { slug: true } }), (p) =>
    prisma.product.create({
      data: {
        slug: p.slug,
        name: p.name,
        category: p.category,
        division: DIV[p.division],
        heroTitle: p.tagline,
        heroDescription: p.description,
        description: [p.description, p.solution].filter(Boolean).join("\n\n"),
        screenshots: p.screenshots,
        features: p.features,
        modules: J(p.modules),
        techStack: p.technologies,
        integrations: p.integrations,
        architecture: J(p.architecture.map((a) => ({ title: a.name, description: a.items.join(", ") }))),
        deployment: p.deploymentOptions,
        customization: p.customizationOptions,
        relatedServices: p.services,
        faqs: J(p.faqs),
        status,
        publishedAt,
      },
    }),
  );
  await createMissing("Blog posts", insights, () => prisma.blogPost.findMany({ select: { slug: true } }), (i) =>
    prisma.blogPost.create({
      data: {
        slug: i.slug,
        title: i.title,
        excerpt: i.excerpt,
        content: i.sections.map((s) => [`## ${s.heading}`, ...s.body, ...(s.bullets ?? []).map((b) => `- ${b}`)].join("\n\n")).join("\n\n"),
        authorName: i.author,
        category: i.category,
        tags: i.tags,
        readingTime: parseInt(i.readingTime, 10) || null,
        status,
        publishedAt: new Date(`${i.date}T09:00:00Z`),
      },
    }),
  );
  await createMissing("Case studies", caseStudies, () => prisma.caseStudy.findMany({ select: { slug: true } }), (c) =>
    prisma.caseStudy.create({
      data: {
        slug: c.slug,
        title: c.title,
        client: c.client ?? null,
        challenge: [c.summary, c.challenge].join("\n\n"),
        solution: c.approach.map((a) => `- ${a.title} — ${a.description}`).join("\n"),
        architecture: c.architecture.map((a) => `- ${a.name}: ${a.items.join(", ")}`).join("\n"),
        technologies: c.technologies,
        deliverables: c.implementation.map((x) => x.title),
        results: c.outcome,
        status,
        publishedAt,
      },
    }),
  );
  await createMissing("Industries", industries, () => prisma.industry.findMany({ select: { slug: true } }), (i) =>
    prisma.industry.create({ data: { slug: i.slug, name: i.name, heroTitle: i.h1, description: i.summary, content: i.overview.join("\n\n"), services: i.services, products: i.products, technologies: i.technologies, faqs: J(i.faqs), status, publishedAt } }),
  );
  await createMissing("Technologies", technologies, () => prisma.technology.findMany({ select: { slug: true } }), (t) =>
    prisma.technology.create({ data: { slug: t.slug, name: t.name, category: TECH[t.category] ?? "OTHER", description: [t.summary, t.overview].join("\n\n"), status, publishedAt } }),
  );
  console.log("Done. Nothing existing was changed.");
}

main()
  .catch((e) => {
    console.error("Import failed:", e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
