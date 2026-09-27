import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Capability, Division } from "@/data/types";
import { getGroup } from "@/data/serviceGroups";
import { caseStudiesByDivision } from "@/data/caseStudies";
import { pick, servicesForGroup, servicesForDivision, productsForDivision, relatedInsights, relatedResources } from "@/lib/relations";
import { PageHero } from "@/components/sections/PageHero";
import { ArchitectureDiagram, ChipLinks, PointsGrid, PointsList, ProcessSteps, RelatedSection, TechGrid } from "@/components/sections/blocks";
import { DivisionArt } from "@/components/graphics/DivisionArt";
import { AutoIcon } from "@/components/graphics/autoIcon";
import { FAQ } from "@/components/sections/FAQ";
import { CTABand } from "@/components/sections/CTABand";
import { DivisionBadge, LinkButton, Section, SectionHeader, JsonLd } from "@/components/ui/primitives";
import { divisionTone } from "@/components/ui/division";
import { HybridFintechDiagram } from "@/components/visuals/HybridFintechDiagram";
import { serviceSchema } from "@/lib/jsonld";
import { cn } from "@/lib/cn";
import { LAUNCH_DISCLAIMER, launchFor } from "@/data/launch";
import { PlatformCard } from "@/components/sections/Launch";
import { toCaseItem, toInsightItem, toProductItem, toResourceItem, toIndustryLink, nonNull } from "./mappers";

export function CapabilityTemplate({ cap, division }: { cap: Capability; division: Division }) {
  const tone = divisionTone[division.id];
  const allServices = servicesForDivision(division.id);
  const products = pick.products(cap.products);
  const moreProducts = productsForDivision(division.id).filter((p) => !cap.products.includes(p.slug));
  const technologies = pick.technologies(cap.technologies);
  const cases = caseStudiesByDivision(division.id);
  const insights = relatedInsights({ division: division.id, technologies: cap.technologies }, 3);
  const resources = relatedResources({ division: division.id }, 3);
  const platforms = productsForDivision(division.id)
    .map((p) => ({ product: p, launch: launchFor(p.slug) }))
    .filter((x): x is { product: typeof x.product; launch: NonNullable<typeof x.launch> } => !!x.launch)
    .slice(0, 6);

  return (
    <>
      <JsonLd data={serviceSchema({ name: division.name, description: cap.metaDescription, path: `/capabilities/${division.id}`, category: cap.metaTitle })} />
      <PageHero
        crumbs={[{ name: "Capabilities", href: "/capabilities" }, { name: division.short, href: `/capabilities/${division.id}` }]}
        eyebrow={<DivisionBadge division={division.id} />}
        title={cap.h1}
        lede={cap.lede}
        accent={tone.hex}
        aside={<DivisionArt division={division.id} label={`${division.name} illustration`} priority />}
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
        <div className="grid gap-12 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div>
            <p className="eyebrow mb-4">Overview</p>
            <p className="text-xl leading-relaxed text-fg sm:text-[1.35rem]">{cap.overview[0]}</p>
            {cap.overview[1] && <p className="mt-5 text-[15px] leading-relaxed text-muted">{cap.overview[1]}</p>}
          </div>
          <dl className="grid grid-cols-2 gap-4">
            {[
              [allServices.length, "Services"],
              [cap.pillars.flatMap((p) => p.groups).length, "Service areas"],
              [productsForDivision(division.id).length, "Ready products"],
              [cases.length, "Reference architectures"],
            ]
              .filter(([v]) => Number(v) > 0)
              .map(([v, k], i, all) => (
              <div key={String(k)} className={cn("card flex flex-col-reverse p-6", i === 0 && "band-brand", i === 0 && all.length % 2 === 1 && "col-span-2")} data-theme={i === 0 ? "dark" : undefined}>
                <dt className="mt-1.5 text-sm text-muted">{k}</dt>
                <dd className="text-4xl font-semibold tracking-tight text-fg">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Section>

      {/* Flagships & launch timelines */}
      <Section id="launch">
        <div className="grid gap-10 lg:grid-cols-[1.3fr_1fr] lg:items-start">
          <div>
            <SectionHeader eyebrow="Flagship offerings" title={`What ${division.name} launches.`} className="mb-6" />
            <ul className="flex flex-wrap gap-2">
              {division.flagships.map((f) => (
                <li key={f} className={cn("rounded-full border px-3 py-1.5 text-sm", tone.border, "text-fg")}>
                  {f}
                </li>
              ))}
            </ul>
          </div>
          <div className="card p-6">
            <p className="eyebrow mb-4">Typical implementation</p>
            <dl className="space-y-3">
              {division.launch.map(([what, range]) => (
                <div key={what} className="flex items-baseline justify-between gap-4 border-b border-line pb-3 last:border-0 last:pb-0">
                  <dt className="text-[15px] text-muted">{what}</dt>
                  <dd className="shrink-0 text-lg font-semibold text-fg tabular-nums">{range}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-5 text-xs leading-relaxed text-dim">{LAUNCH_DISCLAIMER}</p>
          </div>
        </div>
      </Section>

      {platforms.length > 0 && (
        <Section id="platforms">
          <SectionHeader eyebrow="White-label platforms" title="Ready-to-launch foundations." action={{ label: "All products", href: `/products?category=${division.id}` }} />
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {platforms.map(({ product, launch }) => (
              <PlatformCard key={product.slug} product={product} launch={launch} />
            ))}
          </div>
        </Section>
      )}

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
              <div className="flex items-start gap-4 border-b border-line p-6 lg:p-7">
                <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", tone.bg, tone.text)}>
                  <AutoIcon title={pillar.title} hint={pillar.description} className="size-5" />
                </span>
                <div>
                  <h3 className="text-xl font-semibold text-fg">{pillar.title}</h3>
                  <p className="mt-1 max-w-3xl text-[15px] leading-relaxed text-muted">{pillar.description}</p>
                </div>
              </div>
              <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3">
                {pillar.groups.map((gid) => {
                  const g = getGroup(gid)!;
                  const list = servicesForGroup(gid);
                  return (
                    <div key={gid} className="rounded-xl border border-line bg-ink-850 p-5">
                      <div className="mb-3 flex items-baseline justify-between gap-3">
                        <p className="font-semibold text-fg">{g.name}</p>
                        <span className="shrink-0 text-xs text-dim">{list.length}</span>
                      </div>
                      <ServiceLinks items={list.slice(0, 5)} />
                      {list.length > 5 && (
                        <details className="group/more">
                          <summary className="mt-2 cursor-pointer list-none text-sm font-medium text-brand-blue [&::-webkit-details-marker]:hidden">
                            <span className="group-open/more:hidden">+ {list.length - 5} more</span>
                            <span className="hidden group-open/more:inline">Show less</span>
                          </summary>
                          <ServiceLinks items={list.slice(5)} className="mt-2" />
                        </details>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {division.id === "fintech" && (
        <Section tone="brand">
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
        <div className="grid gap-12 lg:grid-cols-[1fr_1.15fr] lg:items-start">
          <div>
            <SectionHeader eyebrow="Architecture" title="A reference architecture, adapted to you." lede={`How we typically structure ${division.short} systems, adapted to your landscape and partners.`} className="mb-8" />
            <PointsList points={cap.outcomes.slice(0, 4)} />
          </div>
          <ArchitectureDiagram layers={cap.architecture} division={division.id} title={`${division.name} · reference stack`} />
        </div>
      </Section>

      {/* Approach */}
      <Section>
        <SectionHeader eyebrow="Approach" title="How we deliver." />
        <ProcessSteps steps={cap.approach} />
      </Section>

      {platforms.length === 0 && (<RelatedSection eyebrow="Products" title={`Ready-to-launch ${division.short} platforms`} items={[...products, ...moreProducts].slice(0, 3).map(toProductItem)} action={{ label: "All products", href: "/products" }} />)}

      <Section>
        <SectionHeader eyebrow="Technology" title="Our stack for this practice" action={{ label: "Technology directory", href: "/technologies" }} />
        <TechGrid items={technologies.slice(0, 12)} />
        <div className="mt-8 flex flex-wrap items-center gap-2">
          <span className="mr-2 text-sm font-medium text-muted">Industries:</span>
          <ChipLinks items={nonNull(cap.industries.map(toIndustryLink))} />
        </div>
      </Section>

      <RelatedSection eyebrow="Work & insights" title="Go deeper" items={[...cases.map(toCaseItem), ...insights.map(toInsightItem), ...resources.map(toResourceItem)].slice(0, 3)} action={{ label: "All work", href: `/work/${division.id}` }} />
      <FAQ items={cap.faqs} />
      <CTABand title={`${division.cta}.`} lede={division.tagline} primary={{ label: division.cta, href: division.ctaHref }} />
    </>
  );
}

function ServiceLinks({ items, className }: { items: { slug: string; name: string }[]; className?: string }) {
  return (
    <ul className={cn("space-y-1.5", className)}>
      {items.map((s) => (
        <li key={s.slug}>
          <Link href={`/services/${s.slug}`} className="group inline-flex items-center gap-1.5 text-sm text-muted hover:text-brand-blue">
            {s.name}
            <ArrowRight className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
