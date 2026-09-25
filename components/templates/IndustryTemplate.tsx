import type { Industry } from "@/data/types";
import { getSolution } from "@/data/solutions";
import { pick, productsForIndustry, relatedCaseStudies, relatedInsights } from "@/lib/relations";
import { serviceSchema } from "@/lib/jsonld";
import { PageHero } from "@/components/sections/PageHero";
import { ChipLinks, PointsGrid, RelatedSection } from "@/components/sections/blocks";
import { FAQ } from "@/components/sections/FAQ";
import { CTABand } from "@/components/sections/CTABand";
import { DivisionBadge, JsonLd, LinkButton, LinkCard, Section, SectionHeader } from "@/components/ui/primitives";
import { Icon, industryIcon } from "@/components/ui/Icon";
import { toCaseItem, toInsightItem, toProductItem, toServiceItem, toTechItem } from "./mappers";

export function IndustryTemplate({ industry }: { industry: Industry }) {
  const services = pick.services(industry.services);
  const products = [...pick.products(industry.products), ...productsForIndustry(industry.slug)].filter((p, i, a) => a.findIndex((x) => x.slug === p.slug) === i).slice(0, 6);
  const techs = pick.technologies(industry.technologies);
  const sols = industry.solutionsLinks.map(getSolution).filter(Boolean) as NonNullable<ReturnType<typeof getSolution>>[];
  const cases = relatedCaseStudies({ industry: industry.slug, services: industry.services }, 2);
  const insights = relatedInsights({ services: industry.services, technologies: industry.technologies }, 3);

  return (
    <>
      <JsonLd data={serviceSchema({ name: `Technology services for ${industry.name}`, description: industry.summary, path: `/industries/${industry.slug}`, category: industry.name })} />
      <PageHero
        crumbs={[{ name: "Industries", href: "/industries" }, { name: industry.name, href: `/industries/${industry.slug}` }]}
        eyebrow={
          <span className="eyebrow">
            <Icon name={industryIcon[industry.slug] ?? "Building2"} className="size-3.5" /> {industry.name}
          </span>
        }
        title={industry.h1}
        lede={industry.summary}
      >
        <LinkButton href="/start-a-project" track={`cta:industry-${industry.slug}`}>
          Start a Project
        </LinkButton>
        <LinkButton href="/book-a-meeting" variant="secondary">
          Talk to an expert
        </LinkButton>
      </PageHero>

      <Section>
        <div className="grid gap-12 lg:grid-cols-[1fr_300px]">
          <div className="prose-sh">
            {industry.overview.map((p) => (
              <p key={p.slice(0, 32)}>{p}</p>
            ))}
          </div>
          <aside className="card h-fit p-6">
            <p className="eyebrow mb-4">Divisions involved</p>
            <div className="flex flex-wrap gap-2">
              {industry.divisions.map((d) => (
                <DivisionBadge key={d} division={d} />
              ))}
            </div>
          </aside>
        </div>
      </Section>

      <Section>
        <SectionHeader eyebrow="Industry problems" title={`Challenges in ${industry.name.toLowerCase() === "saas" ? "SaaS" : industry.name}`} />
        <PointsGrid points={industry.challenges} columns={4} />
      </Section>

      <Section>
        <SectionHeader eyebrow="Solutions" title="How we address them" />
        <PointsGrid points={industry.solutions} columns={4} />
        {sols.length > 0 && (
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {sols.map((s) => (
              <LinkCard key={s.slug} href={`/solutions/${s.slug}`} title={s.name} description={s.summary} eyebrow="Solution" />
            ))}
          </div>
        )}
      </Section>

      <RelatedSection eyebrow="Services" title={`Services for ${industry.name}`} items={services.map(toServiceItem)} />
      <RelatedSection eyebrow="Products" title="Ready-to-launch platforms" items={products.map(toProductItem)} action={{ label: "All products", href: "/products" }} />

      <Section>
        <p className="eyebrow mb-5">Technologies</p>
        <ChipLinks items={techs.map(toTechItem)} />
      </Section>

      <RelatedSection eyebrow="Work & insights" title="Related thinking" items={[...cases.map(toCaseItem), ...insights.map(toInsightItem)].slice(0, 6)} />
      <FAQ items={industry.faqs} />
      <CTABand title={`Build for ${industry.name}.`} lede="Tell us about your initiative and we will propose an approach, team and plan." />
    </>
  );
}
