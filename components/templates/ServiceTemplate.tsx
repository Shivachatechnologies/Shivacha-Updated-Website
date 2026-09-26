import Link from "next/link";
import { Handshake, Info, Layers, Users } from "lucide-react";
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
import { FactStrip, PageHero } from "@/components/sections/PageHero";
import { ArchitectureDiagram, ChipLinks, PointsGrid, PointsList, ProcessSteps, RelatedSection, TechGrid } from "@/components/sections/blocks";
import { DivisionArt } from "@/components/graphics/DivisionArt";
import { AutoIcon } from "@/components/graphics/autoIcon";
import { Icon } from "@/components/ui/Icon";
import { FAQ } from "@/components/sections/FAQ";
import { DivisionBadge, JsonLd, LinkButton, Section, SectionHeader } from "@/components/ui/primitives";
import { divisionTone } from "@/components/ui/division";
import { toCaseItem, toInsightItem, toProductItem, toResourceItem, toServiceItem } from "./mappers";
import { BookCallButton } from "@/components/leads/BookCall";
import { LeadPanel } from "@/components/leads/LeadPanel";
import { QuickAnswers } from "@/components/sections/QuickAnswers";
import { ctaFor, divisionAnswers, serviceOption } from "@/data/serviceAnswers";

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
  const answers = divisionAnswers[division.id];
  const cta = ctaFor(service.name, group.name, division.id, division.cta);
  const quick = [
    { q: `What is ${service.name.toLowerCase()}?`, a: service.summary },
    { q: "Who is it for?", a: `Typically ${answers.whoFor}.` },
    { q: "What does Shivacha provide?", a: service.capabilities.map((c) => c.title) },
    { q: "Which technologies are used?", a: techs.length ? `${techs.slice(0, 6).map((t) => t.name).join(", ")} — chosen to fit your stack and constraints.` : "Chosen to fit your existing stack, team and constraints." },
    { q: "How does the process work?", a: group.process.map((p) => p.title).join(" → ") + "." },
    { q: "What affects the cost?", a: answers.costFactors },
    { q: "How long does it take?", a: answers.timeline },
    { q: "How do I get started?", a: "Share a short brief in the form below, book a 30-minute call or message us on WhatsApp. A senior engineer replies within one business day; NDA on request." },
  ];

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
        aside={<DivisionArt division={division.id} topic={`${service.name} ${group.name}`} label={`${service.name} illustration`} priority />}
        footer={
          <FactStrip
            items={[
              { icon: <Icon name={division.icon} className="size-5" />, label: "Division", value: <Link href={`/capabilities/${division.id}`} className="hover:underline">{division.name}</Link> },
              { icon: <Layers className="size-5" />, label: "Service area", value: group.name },
              { icon: <Users className="size-5" />, label: "Team", value: team ? <Link href={`/dedicated-teams/${team.slug}`} className="hover:underline">{team.name}</Link> : "Cross-functional squad" },
              { icon: <Handshake className="size-5" />, label: "Engagement", value: "Project · Team · Managed" },
            ]}
          />
        }
      >
        <LinkButton href="#enquire" track={`cta:service-${service.slug}`}>
          {cta}
        </LinkButton>
        <BookCallButton label="Talk to an Expert" variant="secondary" source={`service:${service.slug}`} />
      </PageHero>

      <Section>
        <div className="grid gap-12 lg:grid-cols-[1.1fr_1fr] lg:items-start">
          <div>
            <p className="eyebrow mb-4">Overview</p>
            <p className="text-xl leading-relaxed text-fg sm:text-[1.35rem]">{service.overview}</p>
            {service.note && (
              <div className="mt-6 flex gap-3 rounded-xl border border-brand-blue/20 bg-brand-blue/5 p-4 text-sm text-muted">
                <Info className="mt-0.5 size-4 shrink-0 text-brand-blue" aria-hidden />
                <p>{service.note}</p>
              </div>
            )}
          </div>
          <div className="card p-6 sm:p-7">
            <h2 className="mb-5 text-lg font-semibold text-fg">Common use cases</h2>
            <ul className="space-y-4">
              {service.useCases.map((u) => (
                <li key={u.title} className="flex gap-3.5">
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-blue/10 text-brand-blue">
                    <AutoIcon title={u.title} hint={u.description} className="size-[18px]" />
                  </span>
                  <span>
                    <span className="block font-medium text-fg">{u.title}</span>
                    <span className="block text-sm text-muted">{u.description}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <QuickAnswers title={`${service.name} at a glance`} items={quick} />

      <Section>
        <SectionHeader eyebrow="Capabilities" title="What we deliver" />
        <PointsGrid points={service.capabilities} />
      </Section>

      <Section>
        <div className="grid gap-12 lg:grid-cols-[1fr_1.15fr] lg:items-start">
          <div>
            <SectionHeader eyebrow="Architecture" title="Engineered right from day one" lede={`The layers we typically design for ${group.name.toLowerCase()}, adapted to your stack and partners.`} className="mb-8" />
            <PointsList points={group.considerations.slice(0, 4)} />
          </div>
          <ArchitectureDiagram layers={group.architecture} division={division.id} title={`${group.name} · reference architecture`} />
        </div>
      </Section>

      <Section>
        <SectionHeader eyebrow="Delivery" title="How an engagement runs" />
        <ProcessSteps steps={group.process} />
      </Section>

      <Section>
        <SectionHeader eyebrow="Security" title="Security built into delivery" lede="Controls we apply by default on this kind of work — not a separate phase at the end." />
        <PointsGrid points={answers.security} columns={4} />
      </Section>

      <Section>
        <SectionHeader eyebrow="Technology" title="Tools we use for this" />
        <TechGrid items={techs} />
        {inds.length > 0 && (
          <div className="mt-8 flex flex-wrap items-center gap-2">
            <span className="mr-2 text-sm font-medium text-muted">Industries:</span>
            <ChipLinks items={inds.map((i) => ({ label: i.name, href: `/industries/${i.slug}` }))} />
          </div>
        )}
      </Section>

      <RelatedSection eyebrow="Products" title="Start from a platform" items={products.slice(0, 3).map(toProductItem)} action={{ label: "All products", href: "/products" }} />
      <RelatedSection eyebrow="Related services" title="Often combined with" items={related.slice(0, 3).map(toServiceItem)} />
      {team && (
        <Section>
          <div className="card flex flex-col items-start justify-between gap-6 p-8 md:flex-row md:items-center">
            <div className="flex gap-5">
              <span className="icon-tile hidden size-14 sm:inline-flex">
                <Users className="size-6" />
              </span>
              <div>
              <p className="eyebrow mb-3">Dedicated team</p>
              <p className="text-2xl font-semibold text-fg">{team.name}</p>
              <p className="mt-2 max-w-2xl text-muted">{team.summary}</p>
              </div>
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
      <RelatedSection eyebrow="Work & insights" title="Related thinking" items={[...cases.map(toCaseItem), ...insights.map(toInsightItem), ...resources.map(toResourceItem)].slice(0, 3)} />
      <FAQ items={faqs} />
      <LeadPanel
        title={`${cta}.`}
        lede={`Tell us about your ${service.name.toLowerCase()} requirements — goals, timeline and constraints. We will reply with questions, an approach and next steps.`}
        service={serviceOption(service.name, division.id)}
        source={`service:${service.slug}`}
        whatsappText={`Hi Shivacha, I'd like to discuss ${service.name.toLowerCase()}.`}
      />
    </>
  );
}
