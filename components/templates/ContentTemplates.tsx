import Link from "next/link";
import { Info, Lock } from "lucide-react";
import type { CaseStudy, Insight, Job, Market, Resource } from "@/data/types";
import { markets } from "@/data/markets";
import { getInsightCategory, insights } from "@/data/insights";
import { getResourceCategory, resources } from "@/data/resources";
import { getDepartment, jobs } from "@/data/careers";
import { caseStudies } from "@/data/caseStudies";
import { pick } from "@/lib/relations";
import { articleSchema } from "@/lib/jsonld";
import { PageHero } from "@/components/sections/PageHero";
import { ArchitectureDiagram, CheckList, ChipLinks, PointsGrid, ProcessSteps, RelatedSection } from "@/components/sections/blocks";
import { CTABand } from "@/components/sections/CTABand";
import { DivisionBadge, JsonLd, LinkButton, Section, SectionHeader } from "@/components/ui/primitives";
import { LeadForm } from "@/components/forms/LeadForm";
import { toCaseItem, toInsightItem, toProductItem, toResourceItem, toServiceItem, toTechItem, toIndustryLink, nonNull } from "./mappers";

/* ───────────────────────── Case study ───────────────────────── */
export function CaseStudyTemplate({ cs }: { cs: CaseStudy }) {
  const techs = pick.technologies(cs.technologies);
  const others = caseStudies.filter((c) => c.slug !== cs.slug && c.division === cs.division).concat(caseStudies.filter((c) => c.division !== cs.division)).slice(0, 3);
  return (
    <>
      <JsonLd data={articleSchema({ title: cs.title, description: cs.summary, path: `/work/${cs.slug}`, date: "2026-09-01", author: "Shivacha Engineering" })} />
      <PageHero
        crumbs={[{ name: "Work", href: "/work" }, { name: cs.title, href: `/work/${cs.slug}` }]}
        eyebrow={
          <div className="flex flex-wrap gap-2">
            <DivisionBadge division={cs.division} />
            <span className="rounded-full border border-line px-2.5 py-1 text-[11px] text-muted">{cs.kind === "client" ? `Client: ${cs.client}` : "Reference architecture"}</span>
          </div>
        }
        title={cs.title}
        lede={cs.summary}
      />
      {cs.kind === "reference-architecture" && (
        <div className="container-x -mt-6 mb-4">
          <div className="flex gap-3 rounded-xl border border-line bg-white/[0.02] p-4 text-sm text-muted">
            <Info className="mt-0.5 size-4 shrink-0 text-brand-blue" aria-hidden />
            <p>This is a reference architecture describing how Shivacha approaches this class of system. It does not describe a specific client engagement and contains no client names or results.</p>
          </div>
        </div>
      )}
      <Section>
        <div className="grid gap-12 md:grid-cols-2">
          <div>
            <p className="eyebrow mb-4">Challenge</p>
            <p className="text-lg leading-relaxed text-fg">{cs.challenge}</p>
          </div>
          <div>
            <p className="eyebrow mb-4">Context</p>
            <p className="text-[15px] leading-relaxed text-muted">{cs.context}</p>
          </div>
        </div>
      </Section>
      <Section>
        <SectionHeader eyebrow="Approach" title="How we approach it" />
        <ProcessSteps steps={cs.approach} />
      </Section>
      <Section>
        <div className="grid gap-12 lg:grid-cols-[1fr_1.25fr] lg:items-start">
          <div>
            <SectionHeader eyebrow="Architecture" title="System design" className="mb-8" />
            <p className="eyebrow mb-4">Technology</p>
            <ChipLinks items={techs.map(toTechItem)} />
          </div>
          <ArchitectureDiagram layers={cs.architecture} division={cs.division} title={cs.title} />
        </div>
      </Section>
      <Section>
        <SectionHeader eyebrow="Implementation" title="Key implementation elements" />
        <PointsGrid points={cs.implementation} columns={4} />
      </Section>
      <Section>
        <div className="grid gap-12 md:grid-cols-2">
          <div>
            <p className="eyebrow mb-4">Outcome</p>
            <p className="text-lg leading-relaxed text-fg">{cs.outcome}</p>
          </div>
          <div>
            <p className="eyebrow mb-4">Lessons</p>
            <CheckList items={cs.lessons} className="sm:grid-cols-1" />
          </div>
        </div>
      </Section>
      <RelatedSection eyebrow="Services" title="Services involved" items={pick.services(cs.services).map(toServiceItem)} />
      <RelatedSection eyebrow="Products" title="Related products" items={pick.products(cs.products).map(toProductItem)} />
      <RelatedSection eyebrow="More work" title="Other reference architectures" items={others.map(toCaseItem)} />
      <CTABand />
    </>
  );
}

/* ───────────────────────── Market ───────────────────────── */
export function MarketTemplate({ market }: { market: Market }) {
  const services = pick.services(market.services);
  const region = market.region ? markets.find((m) => m.slug === market.region) : undefined;
  const countries = (market.countries ?? []).map((c) => markets.find((m) => m.slug === c)).filter(Boolean) as Market[];
  const crumbs = [{ name: "Markets", href: "/markets" }, ...(region ? [{ name: region.name, href: `/markets/${region.slug}` }] : []), { name: market.name, href: `/markets/${market.slug}` }];
  return (
    <>
      <PageHero crumbs={crumbs} eyebrow={<span className="eyebrow">{market.type === "region" ? "Region" : "Market"}</span>} title={market.h1} lede={market.summary}>
        <LinkButton href="/start-a-project" track={`cta:market-${market.slug}`}>
          Start a Project
        </LinkButton>
        <LinkButton href="/book-a-meeting" variant="secondary">
          Book a Meeting
        </LinkButton>
      </PageHero>
      <Section>
        <div className="grid gap-12 lg:grid-cols-[1fr_320px]">
          <div className="prose-sh">
            {market.overview.map((p) => (
              <p key={p.slice(0, 32)}>{p}</p>
            ))}
          </div>
          <aside className="card h-fit p-6">
            <p className="eyebrow mb-3">Collaboration</p>
            <p className="text-sm leading-relaxed text-muted">{market.collaboration}</p>
            <p className="mt-4 text-xs text-dim">Shivacha delivers remotely and does not claim a physical office in this market.</p>
          </aside>
        </div>
      </Section>
      <Section>
        <SectionHeader eyebrow="Focus areas" title="Where we help most" />
        <PointsGrid points={market.focus} columns={4} />
      </Section>
      {countries.length > 0 && (
        <Section>
          <SectionHeader eyebrow="Markets" title={`Markets in ${market.name}`} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {countries.map((c) => (
              <Link key={c.slug} href={`/markets/${c.slug}`} className="card card-hover p-5 text-sm font-medium text-fg">
                {c.name} →
              </Link>
            ))}
          </div>
        </Section>
      )}
      <RelatedSection eyebrow="Services" title="Popular services" items={services.map(toServiceItem)} />
      <Section>
        <p className="eyebrow mb-5">Industries</p>
        <ChipLinks items={nonNull(market.industries.map(toIndustryLink))} />
      </Section>
      <CTABand title={`Technology partner for companies in ${market.name}.`} />
    </>
  );
}

/* ───────────────────────── Resource ───────────────────────── */
export function ResourceTemplate({ resource }: { resource: Resource }) {
  const cat = getResourceCategory(resource.category)!;
  const services = pick.services(resource.services);
  const more = resources.filter((r) => r.slug !== resource.slug && (r.division === resource.division || r.category === resource.category)).slice(0, 3);
  return (
    <>
      <PageHero
        crumbs={[{ name: "Resources", href: "/resources" }, { name: cat.name, href: `/resources/${cat.slug}` }, { name: resource.title, href: `/resources/${cat.slug}/${resource.slug}` }]}
        eyebrow={
          <div className="flex flex-wrap gap-2">
            <DivisionBadge division={resource.division} />
            <span className="rounded-full border border-line px-2.5 py-1 text-[11px] text-muted capitalize">{resource.type.replace("-", " ")}</span>
            <span className="rounded-full border border-line px-2.5 py-1 text-[11px] text-muted">{resource.readingTime}</span>
            <span className="rounded-full border border-line px-2.5 py-1 text-[11px] text-muted">{resource.difficulty}</span>
          </div>
        }
        title={resource.title}
        lede={resource.summary}
      />
      <Section>
        <div className="grid gap-12 lg:grid-cols-[1fr_420px]">
          <div className="space-y-12">
            <div>
              <p className="eyebrow mb-4">Who it&apos;s for</p>
              <p className="text-lg text-fg">{resource.audience}</p>
            </div>
            <div>
              <p className="eyebrow mb-4">Contents</p>
              <ol className="divide-y divide-line border-y border-line">
                {resource.contents.map((c, i) => (
                  <li key={c} className="flex gap-4 py-3.5 text-[15px]">
                    <span className="font-mono text-xs text-dim">{String(i + 1).padStart(2, "0")}</span>
                    <span className="text-muted">{c}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div>
              <p className="eyebrow mb-4">Key takeaways</p>
              <CheckList items={resource.takeaways} />
            </div>
            <div>
              <p className="eyebrow mb-4">Technologies covered</p>
              <ChipLinks items={pick.technologies(resource.technologies).map(toTechItem)} />
            </div>
          </div>
          <aside className="h-fit lg:sticky lg:top-28">
            <div className="card p-6">
              {resource.gated ? (
                <>
                  <p className="flex items-center gap-2 text-sm font-semibold text-fg">
                    <Lock className="size-4" /> Get the {resource.type.replace("-", " ")}
                  </p>
                  <p className="mt-2 mb-5 text-sm text-muted">We&apos;ll send it to your business email.</p>
                  <LeadForm type="resource" hidden={{ resource: resource.title }} compact />
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold text-fg">Want the full working version?</p>
                  <p className="mt-2 mb-5 text-sm text-muted">Request the detailed document and we will email it with a short walkthrough offer.</p>
                  <LeadForm type="resource" hidden={{ resource: resource.title }} compact />
                </>
              )}
            </div>
          </aside>
        </div>
      </Section>
      <RelatedSection eyebrow="Services" title="Put it into practice" items={services.map(toServiceItem)} />
      <RelatedSection eyebrow="More resources" title="Keep reading" items={more.map(toResourceItem)} />
      <CTABand />
    </>
  );
}

/* ───────────────────────── Insight article ───────────────────────── */
export function InsightTemplate({ insight }: { insight: Insight }) {
  const cat = getInsightCategory(insight.category)!;
  const more = insights.filter((i) => i.slug !== insight.slug).sort((a, b) => (a.category === insight.category ? -1 : 0) - (b.category === insight.category ? -1 : 0)).slice(0, 3);
  const path = `/insights/${insight.slug}`;
  return (
    <>
      <JsonLd data={articleSchema({ title: insight.title, description: insight.excerpt, path, date: insight.date, author: insight.author })} />
      <PageHero
        crumbs={[{ name: "Insights", href: "/insights" }, { name: cat.name, href: `/insights/${cat.slug}` }, { name: insight.title, href: path }]}
        eyebrow={
          <span className="eyebrow">
            {cat.name} · {new Date(insight.date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })} · {insight.readingTime}
          </span>
        }
        title={insight.title}
        lede={insight.excerpt}
      />
      <Section>
        <div className="grid gap-12 lg:grid-cols-[220px_1fr_220px]">
          <nav aria-label="On this page" className="hidden lg:block">
            <div className="sticky top-28">
              <p className="eyebrow mb-4">On this page</p>
              <ul className="space-y-2 text-sm">
                {insight.sections.map((s, i) => (
                  <li key={s.heading}>
                    <a href={`#s${i}`} className="text-dim hover:text-fg">
                      {s.heading}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </nav>
          <article className="prose-sh max-w-[720px]">
            <p className="mb-8 text-sm text-dim">By {insight.author}</p>
            {insight.sections.map((s, i) => (
              <section key={s.heading} id={`s${i}`} className="scroll-mt-28">
                <h2>{s.heading}</h2>
                {s.body.map((p) => (
                  <p key={p.slice(0, 40)}>{p}</p>
                ))}
                {s.bullets && (
                  <ul>
                    {s.bullets.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </article>
          <aside className="hidden lg:block">
            <div className="sticky top-28 space-y-6">
              <div>
                <p className="eyebrow mb-3">Tags</p>
                <div className="flex flex-wrap gap-1.5">
                  {insight.tags.map((t) => (
                    <span key={t} className="rounded-full border border-line px-2.5 py-0.5 text-[11px] text-muted">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <p className="eyebrow mb-3">Technologies</p>
                <div className="flex flex-col gap-1.5">
                  {pick.technologies(insight.technologies).map((t) => (
                    <Link key={t.slug} href={`/technologies/${t.slug}`} className="text-sm text-dim hover:text-fg">
                      {t.name}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </aside>
        </div>
      </Section>
      <RelatedSection eyebrow="Services" title="Related services" items={pick.services(insight.services).map(toServiceItem)} />
      <RelatedSection eyebrow="Keep reading" title="More insights" items={more.map(toInsightItem)} />
      <CTABand />
    </>
  );
}

/* ───────────────────────── Career ───────────────────────── */
export function CareerTemplate({ job }: { job: Job }) {
  const dept = getDepartment(job.department)!;
  const more = jobs.filter((j) => j.slug !== job.slug).slice(0, 3);
  return (
    <>
      <PageHero
        crumbs={[{ name: "Careers", href: "/careers" }, { name: dept.name, href: `/careers/${dept.slug}` }, { name: job.title, href: `/careers/${job.slug}` }]}
        eyebrow={
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-line px-2.5 py-1 text-[11px] text-muted">{dept.name}</span>
            <span className="rounded-full border border-line px-2.5 py-1 text-[11px] text-muted">{job.location}</span>
            <span className="rounded-full border border-line px-2.5 py-1 text-[11px] text-muted">{job.type}</span>
          </div>
        }
        title={job.title}
        lede={job.summary}
      />
      <div className="container-x -mt-6 mb-4">
        <div className="flex gap-3 rounded-xl border border-line bg-white/[0.02] p-4 text-sm text-muted">
          <Info className="mt-0.5 size-4 shrink-0 text-brand-blue" aria-hidden />
          <p>This is an open application track. We hire continuously as client work grows; applications are reviewed for current and upcoming roles.</p>
        </div>
      </div>
      <Section>
        <div className="grid gap-12 lg:grid-cols-[1fr_440px]">
          <div className="space-y-10">
            <div>
              <p className="eyebrow mb-4">What you&apos;ll do</p>
              <CheckList items={job.responsibilities} className="sm:grid-cols-1" />
            </div>
            <div>
              <p className="eyebrow mb-4">What we&apos;re looking for</p>
              <CheckList items={job.requirements} className="sm:grid-cols-1" />
            </div>
            <div>
              <p className="eyebrow mb-4">Nice to have</p>
              <CheckList items={job.niceToHave} className="sm:grid-cols-1" />
            </div>
          </div>
          <aside className="h-fit lg:sticky lg:top-28">
            <div className="card p-6">
              <p className="mb-5 text-sm font-semibold text-fg">Apply for this track</p>
              <LeadForm type="job" hidden={{ job: job.title }} compact />
            </div>
          </aside>
        </div>
      </Section>
      <RelatedSection eyebrow="Careers" title="Other open tracks" items={more.map((j) => ({ href: `/careers/${j.slug}`, title: j.title, description: j.summary, eyebrow: getDepartment(j.department)?.name }))} />
    </>
  );
}
