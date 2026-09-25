import Link from "next/link";
import { resources, resourceCategories } from "@/data/resources";
import { divisions } from "@/data/capabilities";
import { technologies } from "@/data/technologies";
import { industries } from "@/data/industries";
import { buildMetadata } from "@/lib/seo";
import { PageHero } from "@/components/sections/PageHero";
import { CTABand } from "@/components/sections/CTABand";
import { Section } from "@/components/ui/primitives";
import { ResourceLibrary } from "@/components/sections/ResourceLibrary";

export const metadata = buildMetadata({
  title: "Resource Library: Guides, Architectures, Checklists & Templates",
  description: "Technical guides, reference architectures, checklists, templates and product overviews from Shivacha engineers — covering AI, fintech, Web3 and cloud.",
  path: "/resources",
});

export default function ResourcesPage() {
  const usedTech = [...new Set(resources.flatMap((r) => r.technologies))];
  const usedInd = [...new Set(resources.flatMap((r) => r.industries))];
  const typeLabel = (t: string) => resourceCategories.find((c) => c.type === t)?.name ?? t;
  return (
    <>
      <PageHero crumbs={[{ name: "Resources", href: "/resources" }]} eyebrow={<span className="eyebrow">{resources.length} resources</span>} title="Technical material from our engineers." lede="Guides, reference architectures, checklists and templates you can use — whether or not you work with us." />
      <Section bordered={false} className="pt-0">
        <nav aria-label="Resource categories" className="mb-10 flex flex-wrap gap-2">
          {resourceCategories.map((c) => (
            <Link key={c.slug} href={`/resources/${c.slug}`} className="chip">
              {c.name}
            </Link>
          ))}
        </nav>
        <ResourceLibrary
          items={resources.map((r) => ({ slug: r.slug, href: `/resources/${r.category}/${r.slug}`, title: r.title, summary: r.summary, type: r.type, typeLabel: typeLabel(r.type), division: r.division, readingTime: r.readingTime, difficulty: r.difficulty, gated: r.gated, featured: !!r.featured, date: r.date, technologies: r.technologies, industries: r.industries }))}
          types={[...new Set(resources.map((r) => r.type))].map((t) => ({ id: t, label: typeLabel(t) }))}
          divisions={divisions.map((d) => ({ id: d.id, label: d.short }))}
          technologies={technologies.filter((t) => usedTech.includes(t.slug)).map((t) => ({ id: t.slug, label: t.name }))}
          industries={industries.filter((i) => usedInd.includes(i.slug)).map((i) => ({ id: i.slug, label: i.name }))}
        />
      </Section>
      <CTABand />
    </>
  );
}
