import { Info } from "lucide-react";
import type { Technology } from "@/data/types";
import { techCategories } from "@/data/technologies";
import { pick, productsForTechnology, relatedInsights, servicesForTechnology, teamsForTechnology } from "@/lib/relations";
import { PageHero } from "@/components/sections/PageHero";
import { CheckList, PointsGrid, RelatedSection, TechGrid } from "@/components/sections/blocks";
import { TechOrbit } from "@/components/graphics/TechOrbit";
import { CTABand } from "@/components/sections/CTABand";
import { DivisionBadge, LinkButton, Section, SectionHeader } from "@/components/ui/primitives";
import { toInsightItem, toProductItem, toServiceItem, toTeamItem } from "./mappers";

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
        aside={<TechOrbit tech={tech} pairs={pairs} />}
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
              <div className="mt-8 flex gap-3 rounded-xl border border-brand-blue/20 bg-brand-blue/5 p-4 text-sm text-muted">
                <Info className="mt-0.5 size-4 shrink-0 text-brand-blue" aria-hidden />
                <p>{tech.considerations}</p>
              </div>
            )}
          </div>
          <div className="card p-6 sm:p-7">
            <h2 className="mb-5 text-lg font-semibold text-fg">Why we use it</h2>
            <CheckList items={tech.strengths} className="sm:grid-cols-1" />
          </div>
        </div>
      </Section>

      <Section>
        <SectionHeader eyebrow="How we use it" title={`${tech.name} in our engineering work`} />
        <PointsGrid points={tech.howWeUse} />
      </Section>

      <RelatedSection eyebrow="Services" title={`Services that use ${tech.name}`} items={services.slice(0, 6).map(toServiceItem)} />
      <RelatedSection eyebrow="Products" title={`Products built with ${tech.name}`} items={products.slice(0, 3).map(toProductItem)} />
      <RelatedSection eyebrow="Teams" title="Engineering teams" items={teams.map(toTeamItem)} />

      {pairs.length > 0 && (
        <Section>
          <SectionHeader eyebrow="Pairs well with" title={`What we combine with ${tech.name}`} lede={cat.description} action={{ label: `Browse ${cat.name.toLowerCase()}`, href: `/technologies#${cat.id}` }} />
          <TechGrid items={pairs} />
        </Section>
      )}

      <RelatedSection eyebrow="Insights" title="Related insights" items={insights.map(toInsightItem)} />
      <CTABand title={`Build with ${tech.name}.`} lede="Tell us about your project, or the engineers you need, and we will propose an approach." />
    </>
  );
}
