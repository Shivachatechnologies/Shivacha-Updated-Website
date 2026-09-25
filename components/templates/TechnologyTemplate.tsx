import Link from "next/link";
import { Info } from "lucide-react";
import type { Technology } from "@/data/types";
import { techCategories } from "@/data/technologies";
import { pick, productsForTechnology, relatedInsights, servicesForTechnology, teamsForTechnology } from "@/lib/relations";
import { PageHero } from "@/components/sections/PageHero";
import { CheckList, ChipLinks, PointsGrid, RelatedSection } from "@/components/sections/blocks";
import { CTABand } from "@/components/sections/CTABand";
import { DivisionBadge, LinkButton, Section, SectionHeader } from "@/components/ui/primitives";
import { toInsightItem, toProductItem, toServiceItem, toTeamItem, toTechItem } from "./mappers";

export function TechnologyTemplate({ tech }: { tech: Technology }) {
  const cat = techCategories.find((c) => c.id === tech.category)!;
  const services = servicesForTechnology(tech, 9);
  const products = productsForTechnology(tech, 6);
  const teams = teamsForTechnology(tech, 3);
  const pairs = pick.technologies(tech.pairsWith);
  const insights = relatedInsights({ technologies: [tech.slug], services: services.map((s) => s.slug) }, 3);

  return (
    <>
      <PageHero
        crumbs={[{ name: "Technologies", href: "/technologies" }, { name: cat.name, href: `/technologies#${cat.id}` }, { name: tech.name, href: `/technologies/${tech.slug}` }]}
        eyebrow={
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-line px-2.5 py-1 text-[11px] text-muted">{cat.name}</span>
            {tech.divisions.map((d) => (
              <DivisionBadge key={d} division={d} />
            ))}
          </div>
        }
        title={`${tech.name} at Shivacha`}
        lede={tech.summary}
      >
        <LinkButton href={`/start-a-project?technology=${tech.slug}`} track={`cta:tech-${tech.slug}`}>
          Start a {tech.name} project
        </LinkButton>
        <LinkButton href={`/hire-developers?team=${encodeURIComponent(tech.name + " engineers")}`} variant="secondary">
          Hire {tech.name} engineers
        </LinkButton>
      </PageHero>

      <Section>
        <div className="grid gap-12 lg:grid-cols-[1.3fr_1fr]">
          <div>
            <p className="eyebrow mb-4">Overview</p>
            <p className="text-xl leading-relaxed text-fg">{tech.overview}</p>
            {tech.considerations && (
              <div className="mt-8 flex gap-3 rounded-xl border border-line bg-white/[0.02] p-4 text-sm text-muted">
                <Info className="mt-0.5 size-4 shrink-0 text-brand-blue" aria-hidden />
                <p>{tech.considerations}</p>
              </div>
            )}
          </div>
          <div className="card p-6">
            <p className="eyebrow mb-5">Why we use it</p>
            <CheckList items={tech.strengths} className="sm:grid-cols-1" />
          </div>
        </div>
      </Section>

      <Section>
        <SectionHeader eyebrow="How we use it" title={`${tech.name} in our engineering work`} />
        <PointsGrid points={tech.howWeUse} />
      </Section>

      <RelatedSection eyebrow="Services" title={`Services that use ${tech.name}`} items={services.map(toServiceItem)} />
      <RelatedSection eyebrow="Products" title={`Products built with ${tech.name}`} items={products.map(toProductItem)} />
      <RelatedSection eyebrow="Teams" title="Engineering teams" items={teams.map(toTeamItem)} />

      <Section>
        <div className="grid gap-10 md:grid-cols-2">
          <div>
            <p className="eyebrow mb-5">Pairs well with</p>
            <ChipLinks items={pairs.map(toTechItem)} />
          </div>
          <div>
            <p className="eyebrow mb-5">More in {cat.name}</p>
            <p className="text-sm text-muted">{cat.description}</p>
            <Link href={`/technologies#${cat.id}`} className="mt-3 inline-block text-sm text-fg hover:underline">
              Browse {cat.name.toLowerCase()} →
            </Link>
          </div>
        </div>
      </Section>

      <RelatedSection eyebrow="Insights" title="Related insights" items={insights.map(toInsightItem)} />
      <CTABand title={`Build with ${tech.name}.`} lede="Tell us about your project, or the engineers you need, and we will propose an approach." />
    </>
  );
}
