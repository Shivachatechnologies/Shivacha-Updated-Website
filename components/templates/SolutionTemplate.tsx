import type { Solution } from "@/data/types";
import { divisions } from "@/data/capabilities";
import { pick, relatedCaseStudies, relatedInsights, relatedResources } from "@/lib/relations";
import { serviceSchema } from "@/lib/jsonld";
import { PageHero } from "@/components/sections/PageHero";
import { CheckList, ChipLinks, PointsGrid, ProcessSteps, RelatedSection } from "@/components/sections/blocks";
import { FAQ } from "@/components/sections/FAQ";
import { CTABand } from "@/components/sections/CTABand";
import { DivisionBadge, JsonLd, LinkButton, Section, SectionHeader } from "@/components/ui/primitives";
import { HybridFintechDiagram } from "@/components/visuals/HybridFintechDiagram";
import { toCaseItem, toInsightItem, toProductItem, toResourceItem, toServiceItem, toTechItem, toIndustryLink, nonNull } from "./mappers";

export function SolutionTemplate({ solution }: { solution: Solution }) {
  const services = pick.services(solution.services);
  const products = pick.products(solution.products);
  const techs = pick.technologies(solution.technologies);
  const primary = divisions.find((d) => d.id === solution.divisions[0])!;
  const cases = relatedCaseStudies({ services: solution.services, products: solution.products }, 2);
  const insights = relatedInsights({ services: solution.services, technologies: solution.technologies }, 3);
  const resources = relatedResources({ services: solution.services }, 3);
  const cta = solution.cta ?? "Start a Project";
  const isHybrid = solution.slug === "web2-web3-fintech";

  return (
    <>
      <JsonLd data={serviceSchema({ name: `${solution.name} solutions`, description: solution.summary, path: `/solutions/${solution.slug}`, category: "Technology solution" })} />
      <PageHero
        crumbs={[{ name: "Solutions", href: "/solutions" }, { name: solution.name, href: `/solutions/${solution.slug}` }]}
        eyebrow={
          <div className="flex flex-wrap gap-2">
            {solution.divisions.map((d) => (
              <DivisionBadge key={d} division={d} />
            ))}
          </div>
        }
        title={solution.h1}
        lede={solution.summary}
        accent={isHybrid ? "#14c8b0" : "#0195ff"}
      >
        <LinkButton href={`/start-a-project?division=${primary.id}`} track={`cta:solution-${solution.slug}`}>
          {cta}
        </LinkButton>
        <LinkButton href="/book-a-meeting" variant="secondary">
          Book a Meeting
        </LinkButton>
      </PageHero>

      <Section>
        <div className="grid gap-12 lg:grid-cols-[1fr_320px]">
          <div className="prose-sh">
            {solution.overview.map((p) => (
              <p key={p.slice(0, 32)}>{p}</p>
            ))}
          </div>
          <aside className="card h-fit p-6">
            <p className="eyebrow">Built for</p>
            <p className="mt-3 text-sm leading-relaxed text-fg">{solution.audience}</p>
          </aside>
        </div>
      </Section>

      {isHybrid && (
        <Section>
          <SectionHeader eyebrow="Architecture" title="Traditional finance, digital assets and the layer between them." />
          <HybridFintechDiagram />
        </Section>
      )}

      <Section>
        <SectionHeader eyebrow="Challenges" title="What stands in the way" />
        <PointsGrid points={solution.challenges} columns={4} />
      </Section>

      <Section>
        <SectionHeader eyebrow="Approach" title="How Shivacha helps" />
        <ProcessSteps steps={solution.approach} />
      </Section>

      <Section>
        <div className="grid gap-12 lg:grid-cols-2">
          <div>
            <p className="eyebrow mb-5">Deliverables</p>
            <CheckList items={solution.deliverables} className="sm:grid-cols-1" />
          </div>
          <div className="space-y-10">
            <div>
              <p className="eyebrow mb-5">Technologies</p>
              <ChipLinks items={techs.map(toTechItem)} />
            </div>
            <div>
              <p className="eyebrow mb-5">Industries</p>
              <ChipLinks items={nonNull(solution.industries.map(toIndustryLink))} />
            </div>
          </div>
        </div>
      </Section>

      <RelatedSection eyebrow="Services" title="Services in this solution" items={services.map(toServiceItem)} />
      <RelatedSection eyebrow="Products" title="Platforms that accelerate delivery" items={products.map(toProductItem)} />
      <RelatedSection eyebrow="Learn more" title="Related work and thinking" items={[...cases.map(toCaseItem), ...insights.map(toInsightItem), ...resources.map(toResourceItem)].slice(0, 6)} />
      <FAQ items={solution.faqs} />
      <CTABand title={`${cta}.`} primary={{ label: cta, href: `/start-a-project?division=${primary.id}` }} />
    </>
  );
}
