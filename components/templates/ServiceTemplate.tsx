import Link from "next/link";
import { Info } from "lucide-react";
import type { Service } from "@/data/types";
import { getGroup } from "@/data/serviceGroups";
import { getDivision } from "@/data/capabilities";
import {
  groupTeam,
  relatedCaseStudies,
  relatedInsights,
  relatedResources,
  relatedServices,
  serviceIndustries,
  serviceProducts,
  serviceTechnologies,
} from "@/lib/relations";
import { serviceSchema } from "@/lib/jsonld";
import { PageHero } from "@/components/sections/PageHero";
import { ArchitectureDiagram, ChipLinks, PointsGrid, ProcessSteps, RelatedSection } from "@/components/sections/blocks";
import { FAQ } from "@/components/sections/FAQ";
import { CTABand } from "@/components/sections/CTABand";
import { DivisionBadge, JsonLd, LinkButton, Section, SectionHeader } from "@/components/ui/primitives";
import { divisionTone } from "@/components/ui/division";
import { toCaseItem, toInsightItem, toProductItem, toResourceItem, toServiceItem, toTechItem } from "./mappers";

export function ServiceTemplate({ service }: { service: Service }) {
  const group = getGroup(service.group)!;
  const division = getDivision(group.division);
  const tone = divisionTone[division.id];
  const related = relatedServices(service, 6);
  const products = serviceProducts(service, 6);
  const techs = serviceTechnologies(service, 8);
  const inds = serviceIndustries(service, 6);
  const team = groupTeam(group);
  const svcSlugs = [service.slug, ...related.map((r) => r.slug)];
  const cases = relatedCaseStudies({ division: division.id, services: svcSlugs, products: products.map((p) => p.slug) }, 2);
  const insights = relatedInsights({ division: division.id, services: svcSlugs, technologies: techs.map((t) => t.slug) }, 3);
  const resources = relatedResources({ division: division.id, services: svcSlugs }, 3);
  const faqs = [...service.faqs, ...group.faqs];

  return (
    <>
      <JsonLd data={serviceSchema({ name: service.name, description: service.summary, path: `/services/${service.slug}`, category: group.name })} />
      <PageHero
        crumbs={[
          { name: "Services", href: "/services" },
          { name: division.short, href: `/capabilities/${division.id}` },
          { name: service.name, href: `/services/${service.slug}` },
        ]}
        eyebrow={
          <div className="flex flex-wrap items-center gap-2">
            <DivisionBadge division={division.id} />
            <span className="rounded-full border border-line px-2.5 py-1 text-[11px] text-muted">{group.track ?? group.name}</span>
          </div>
        }
        title={service.name}
        lede={service.summary}
        accent={tone.hex}
        aside={
          <div className="card p-6">
            <p className="eyebrow">Engagement snapshot</p>
            <dl className="mt-5 space-y-3.5 text-sm">
              <Row k="Division" v={<Link href={`/capabilities/${division.id}`} className="hover:underline">{division.name}</Link>} />
              <Row k="Service area" v={group.name} />
              {group.track && <Row k="Track" v={group.track} />}
              {team && <Row k="Team" v={<Link href={`/dedicated-teams/${team.slug}`} className="hover:underline">{team.name}</Link>} />}
              <Row k="Engagement" v="Project · Dedicated team · Managed" />
            </dl>
            <div className="mt-6 flex flex-wrap gap-2">
              {techs.slice(0, 5).map((t) => (
                <Link key={t.slug} href={`/technologies/${t.slug}`} className="chip">
                  {t.name}
                </Link>
              ))}
            </div>
          </div>
        }
      >
        <LinkButton href={`${division.ctaHref}&service=${service.slug}`} track={`cta:service-${service.slug}`}>
          {division.cta}
        </LinkButton>
        <LinkButton href="/book-a-meeting" variant="secondary">
          Talk to an engineer
        </LinkButton>
      </PageHero>

      <Section>
        <div className="grid gap-12 lg:grid-cols-[1fr_1fr]">
          <div>
            <p className="eyebrow mb-4">Overview</p>
            <p className="text-xl leading-relaxed text-fg">{service.overview}</p>
          </div>
          <div>
            <p className="eyebrow mb-4">Context · {group.name}</p>
            <p className="text-[15px] leading-relaxed text-muted">{group.intro}</p>
            {service.note && (
              <div className="mt-6 flex gap-3 rounded-xl border border-line bg-white/[0.02] p-4 text-sm text-muted">
                <Info className="mt-0.5 size-4 shrink-0 text-brand-blue" aria-hidden />
                <p>{service.note}</p>
              </div>
            )}
          </div>
        </div>
      </Section>

      <Section>
        <SectionHeader eyebrow="Use cases" title={`${service.name}: common use cases`} />
        <PointsGrid points={service.useCases} columns={4} />
      </Section>

      <Section>
        <SectionHeader eyebrow="Capabilities" title="What we deliver" />
        <PointsGrid points={service.capabilities} numbered />
      </Section>

      <Section>
        <div className="grid gap-12 lg:grid-cols-[1fr_1.25fr] lg:items-start">
          <SectionHeader eyebrow="Architecture" title="Reference architecture" lede={`The layers we typically design for ${group.name.toLowerCase()} systems, adapted to your stack and partners.`} className="mb-0" />
          <ArchitectureDiagram layers={group.architecture} division={division.id} title={group.name} />
        </div>
      </Section>

      <Section>
        <SectionHeader eyebrow="Delivery" title="How an engagement runs" />
        <ProcessSteps steps={group.process} />
      </Section>

      <Section>
        <SectionHeader eyebrow="Engineering considerations" title="What we get right from day one" />
        <PointsGrid points={group.considerations} columns={4} />
      </Section>

      <Section>
        <div className="grid gap-12 md:grid-cols-2">
          <div>
            <p className="eyebrow mb-5">Technologies</p>
            <ChipLinks items={techs.map(toTechItem)} />
          </div>
          <div>
            <p className="eyebrow mb-5">Industries</p>
            <ChipLinks items={inds.map((i) => ({ label: i.name, href: `/industries/${i.slug}` }))} />
          </div>
        </div>
      </Section>

      <RelatedSection eyebrow="Products" title="Start from a platform" items={products.map(toProductItem)} action={{ label: "All products", href: "/products" }} />
      <RelatedSection eyebrow="Related services" title="Often combined with" items={related.map(toServiceItem)} />
      {team && (
        <Section>
          <div className="card flex flex-col items-start justify-between gap-6 p-8 md:flex-row md:items-center">
            <div>
              <p className="eyebrow mb-3">Dedicated team</p>
              <p className="text-2xl font-semibold text-fg">{team.name}</p>
              <p className="mt-2 max-w-2xl text-muted">{team.summary}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <LinkButton href={`/dedicated-teams/${team.slug}`} variant="secondary">
                View team
              </LinkButton>
              <LinkButton href={`/hire-developers?team=${encodeURIComponent(team.name)}`}>Build This Team</LinkButton>
            </div>
          </div>
        </Section>
      )}
      <RelatedSection eyebrow="Work & insights" title="Related thinking" items={[...cases.map(toCaseItem), ...insights.map(toInsightItem), ...resources.map(toResourceItem)].slice(0, 6)} />
      <FAQ items={faqs} />
      <CTABand title={`${division.cta}.`} lede={`Tell us about your ${service.name.toLowerCase()} requirements. We will propose an approach, team and plan.`} primary={{ label: division.cta, href: division.ctaHref }} />
    </>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line pb-3 last:border-0 last:pb-0">
      <dt className="text-dim">{k}</dt>
      <dd className="text-right text-fg">{v}</dd>
    </div>
  );
}
