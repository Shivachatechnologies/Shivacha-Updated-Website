import { technologies, techCategories } from "@/data/technologies";
import { buildMetadata } from "@/lib/seo";
import { PageHero } from "@/components/sections/PageHero";
import { CTABand } from "@/components/sections/CTABand";
import { Section } from "@/components/ui/primitives";
import { TechnologyExplorer } from "@/components/sections/TechnologyExplorer";

export const metadata = buildMetadata({
  title: "Technology Directory: Frontend, Backend, AI, Blockchain, Cloud & Data",
  description: `Explore the ${technologies.length} technologies Shivacha engineers with — React, Next.js, Python, LLMs, RAG, Ethereum, Solidity, ERC-3643, Kubernetes, AWS, PostgreSQL, Kafka and more.`,
  path: "/technologies",
});

export default function TechnologiesPage() {
  return (
    <>
      <PageHero crumbs={[{ name: "Technologies", href: "/technologies" }]} eyebrow={<span className="eyebrow">{technologies.length} technologies · {techCategories.length} categories</span>} title="The technology directory." lede="Every technology we build with, why we use it and where it fits — linked to the services, products and teams that use it." />
      <Section bordered={false} className="pt-0">
        <TechnologyExplorer items={technologies.map((t) => ({ slug: t.slug, name: t.name, category: t.category, summary: t.summary }))} categories={techCategories} />
      </Section>
      <CTABand />
    </>
  );
}
