import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Capability, Division } from "@/data/types";
import { getGroup } from "@/data/serviceGroups";
import { caseStudiesByDivision } from "@/data/caseStudies";
import { pick, servicesForGroup, servicesForDivision, productsForDivision, relatedInsights, relatedResources } from "@/lib/relations";
import { PageHero } from "@/components/sections/PageHero";
import { ArchitectureDiagram, ChipLinks, PointsGrid, ProcessSteps, RelatedSection } from "@/components/sections/blocks";
import { FAQ } from "@/components/sections/FAQ";
import { CTABand } from "@/components/sections/CTABand";
import { DivisionBadge, LinkButton, Section, SectionHeader, JsonLd } from "@/components/ui/primitives";
import { divisionTone } from "@/components/ui/division";
import { HybridFintechDiagram } from "@/components/visuals/HybridFintechDiagram";
import { serviceSchema } from "@/lib/jsonld";
import { cn } from "@/lib/cn";
import { toCaseItem, toInsightItem, toProductItem, toResourceItem, toTechItem, toIndustryLink, nonNull } from "./mappers";

export function CapabilityTemplate({ cap, division }: { cap: Capability; division: Division }) {
  const tone = divisionTone[division.id];
  const allServices = servicesForDivision(division.id);
  const products = pick.products(cap.products);
  const moreProducts = productsForDivision(division.id).filter((p) => !cap.products.includes(p.slug));
  const technologies = pick.technologies(cap.technologies);
  const cases = caseStudiesByDivision(division.id);
  const insights = relatedInsights({ division: division.id, technologies: cap.technologies }, 3);
  const resources = relatedResources({ division: division.id }, 3);

  return (
    <>
      <JsonLd data={serviceSchema({ name: division.name, description: cap.metaDescription, path: `/capabilities/${division.id}`, category: cap.metaTitle })} />
      <PageHero
        crumbs={[{ name: "Capabilities", href: "/capabilities" }, { name: division.short, href: `/capabilities/${division.id}` }]}
        eyebrow={<DivisionBadge division={division.id} />}
        title={cap.h1}
        lede={cap.lede}
        accent={tone.hex}
        aside={<ArchitectureDiagram layers={cap.architecture} division={division.id} title={`${division.name} · reference stack`} />}
      >
        <LinkButton href={division.ctaHref} track={`cta:capability-${division.id}`}>
          {division.cta}
        </LinkButton>
        <LinkButton href="#services" variant="secondary">
          {allServices.length} services
        </LinkButton>
      </PageHero>

      {/* Overview */}
      <Section>
        <div className="grid gap-12 lg:grid-cols-[1fr_320px]">
          <div>
            <p className="eyebrow mb-4">Overview</p>
            <div className="prose-sh">
              {cap.overview.map((p) => (
                <p key={p.slice(0, 32)}>{p}</p>
              ))}
            </div>
          </div>
          <aside className="card h-fit p-6">
            <p className="eyebrow">At a glance</p>
            <dl className="mt-5 space-y-4 text-sm">
              {[
                ["Services", allServices.length],
                ["Service areas", cap.pillars.flatMap((p) => p.groups).length],
                ["Ready-to-launch products", productsForDivision(division.id).length],
                ["Reference architectures", cases.length],
              ].map(([k, v]) => (
                <div key={String(k)} className="flex items-baseline justify-between border-b border-line pb-3 last:border-0 last:pb-0">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-lg font-semibold text-fg">{v}</dd>
                </div>
              ))}
            </dl>
          </aside>
        </div>
      </Section>

      {/* Problems */}
      <Section>
        <SectionHeader eyebrow="Problems we solve" title={`Where ${division.short} initiatives usually break down.`} />
        <PointsGrid points={cap.problems} />
      </Section>

      {/* Pillars & services */}
      <Section id="services">
        <SectionHeader eyebrow="Services" title={`${division.name} services`} lede={division.description} />
        <div className="space-y-6">
          {cap.pillars.map((pillar) => (
            <div key={pillar.title} className="card overflow-hidden">
              <div className="grid gap-6 border-b border-line p-6 lg:grid-cols-[1fr_2fr] lg:p-8">
                <div>
                  <h3 className="text-xl font-semibold text-fg">{pillar.title}</h3>
                </div>
                <p className="text-[15px] leading-relaxed text-muted">{pillar.description}</p>
              </div>
              <div className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-3">
                {pillar.groups.map((gid) => {
                  const g = getGroup(gid)!;
                  return (
                    <div key={gid} className="bg-ink-950 p-6">
                      <p className={cn("mb-1 font-mono text-[10.5px] tracking-[0.16em] uppercase", tone.text)}>{g.track ?? "Service area"}</p>
                      <p className="mb-4 font-semibold text-fg">{g.name}</p>
                      <ul className="space-y-2">
                        {servicesForGroup(gid).map((s) => (
                          <li key={s.slug}>
                            <Link href={`/services/${s.slug}`} className="group inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
                              {s.name}
                              <ArrowRight className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {division.id === "fintech" && (
        <Section>
          <SectionHeader
            eyebrow="Hybrid FinTech"
            title="Web2, Web3 and the layer that connects them."
            lede="Web2 FinTech, Web3 FinTech and Hybrid FinTech are separate tracks with separate expertise — and one integration architecture when products span both."
            action={{ label: "Explore the solution", href: "/solutions/web2-web3-fintech" }}
          />
          <HybridFintechDiagram />
        </Section>
      )}

      {/* Architecture */}
      <Section>
        <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr] lg:items-start">
          <SectionHeader eyebrow="Architecture" title="A reference architecture, adapted to you." lede={`How we typically structure ${division.short} systems. Every engagement adapts the layers to your existing landscape, constraints and partners.`} className="mb-0" />
          <ArchitectureDiagram layers={cap.architecture} division={division.id} />
        </div>
      </Section>

      {/* Approach */}
      <Section>
        <SectionHeader eyebrow="Approach" title="How we deliver." />
        <ProcessSteps steps={cap.approach} />
      </Section>

      {/* Outcomes */}
      <Section>
        <SectionHeader eyebrow="Outcomes" title="What good looks like." />
        <PointsGrid points={cap.outcomes} columns={4} />
      </Section>

      <RelatedSection eyebrow="Products" title={`Ready-to-launch ${division.short} platforms`} items={[...products, ...moreProducts].slice(0, 6).map(toProductItem)} action={{ label: "All products", href: "/products" }} />

      <Section>
        <div className="grid gap-12 md:grid-cols-2">
          <div>
            <p className="eyebrow mb-5">Technologies</p>
            <ChipLinks items={technologies.map(toTechItem)} />
            <Link href="/technologies" className="mt-5 inline-flex items-center gap-1 text-sm text-dim hover:text-fg">
              Technology directory <ArrowRight className="size-3" />
            </Link>
          </div>
          <div>
            <p className="eyebrow mb-5">Industries</p>
            <ChipLinks items={nonNull(cap.industries.map(toIndustryLink))} />
          </div>
        </div>
      </Section>

      <RelatedSection eyebrow="Work" title="Reference architectures" items={cases.map(toCaseItem)} action={{ label: "All work", href: `/work/${division.id}` }} />
      <RelatedSection eyebrow="Resources" title="Go deeper" items={[...resources.map(toResourceItem), ...insights.map(toInsightItem)].slice(0, 6)} />
      <FAQ items={cap.faqs} />
      <CTABand title={`${division.cta}.`} lede={division.tagline} primary={{ label: division.cta, href: division.ctaHref }} />
    </>
  );
}
