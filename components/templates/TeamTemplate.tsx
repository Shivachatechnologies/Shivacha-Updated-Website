import type { Team } from "@/data/types";
import { engagementModels, teamPrinciples, teams } from "@/data/teams";
import { pick } from "@/lib/relations";
import { serviceSchema } from "@/lib/jsonld";
import { PageHero } from "@/components/sections/PageHero";
import { CheckList, ChipLinks, RelatedSection } from "@/components/sections/blocks";
import { FAQ } from "@/components/sections/FAQ";
import { CTABand } from "@/components/sections/CTABand";
import { DivisionBadge, JsonLd, LinkButton, Section, SectionHeader } from "@/components/ui/primitives";
import { toServiceItem, toTeamItem, toTechItem } from "./mappers";

export function TeamTemplate({ team }: { team: Team }) {
  const services = pick.services(team.services);
  const techs = pick.technologies(team.technologies);
  const others = teams.filter((t) => t.division === team.division && t.slug !== team.slug).slice(0, 3);
  const hireHref = `/hire-developers?team=${encodeURIComponent(team.name)}`;

  return (
    <>
      <JsonLd data={serviceSchema({ name: `Dedicated ${team.name}`, description: team.summary, path: `/dedicated-teams/${team.slug}`, category: "Dedicated engineering team" })} />
      <PageHero
        crumbs={[{ name: "Dedicated Teams", href: "/dedicated-teams" }, { name: team.name, href: `/dedicated-teams/${team.slug}` }]}
        eyebrow={<DivisionBadge division={team.division} />}
        title={`Dedicated ${team.name}`}
        lede={team.summary}
      >
        <LinkButton href={hireHref} track={`cta:team-build-${team.slug}`}>
          Build This Team
        </LinkButton>
        <LinkButton href="/book-a-meeting?topic=engineering-advisor" variant="secondary" track={`cta:team-advisor-${team.slug}`}>
          Talk to an Engineering Advisor
        </LinkButton>
      </PageHero>

      <Section>
        <div className="grid gap-12 lg:grid-cols-[1.3fr_1fr]">
          <div>
            <p className="eyebrow mb-4">Overview</p>
            <p className="text-xl leading-relaxed text-fg">{team.overview}</p>
            <p className="eyebrow mt-10 mb-4">Ideal for</p>
            <CheckList items={team.idealFor} className="sm:grid-cols-1" />
          </div>
          <div className="card p-6">
            <p className="eyebrow mb-5">Typical composition</p>
            <ul className="space-y-3">
              {team.roles.map((r, i) => (
                <li key={r} className="flex items-center gap-3 border-b border-line pb-3 text-sm last:border-0 last:pb-0">
                  <span className="font-mono text-[11px] text-dim">{String(i + 1).padStart(2, "0")}</span>
                  <span className="text-fg">{r}</span>
                </li>
              ))}
            </ul>
            <p className="mt-5 text-xs text-dim">Composition is tailored to your roadmap; profiles are shared for your review before anyone starts.</p>
          </div>
        </div>
      </Section>

      <Section>
        <div className="grid gap-12 md:grid-cols-2">
          <div>
            <p className="eyebrow mb-5">Responsibilities</p>
            <CheckList items={team.responsibilities} className="sm:grid-cols-1" />
          </div>
          <div>
            <p className="eyebrow mb-5">Skills</p>
            <div className="flex flex-wrap gap-2">
              {team.skills.map((s) => (
                <span key={s} className="rounded-full border border-line px-3 py-1 text-xs text-muted">
                  {s}
                </span>
              ))}
            </div>
            {techs.length > 0 && (
              <>
                <p className="eyebrow mt-10 mb-5">Core technologies</p>
                <ChipLinks items={techs.map(toTechItem)} />
              </>
            )}
          </div>
        </div>
      </Section>

      <Section>
        <SectionHeader eyebrow="How it works" title="Communication, delivery, security and scaling" />
        <div className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {teamPrinciples.map((p) => (
            <div key={p.title} className="bg-ink-950 p-6">
              <h3 className="font-semibold text-fg">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{p.description}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section>
        <SectionHeader eyebrow="Engagement models" title="Choose how this team works with you" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {engagementModels.map((m) => (
            <div key={m.name} className="card p-6">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-semibold text-fg">{m.name}</h3>
                <span className="font-mono text-[11px] text-dim">{m.size}</span>
              </div>
              <p className="mt-3 text-sm text-muted">{m.description}</p>
              <p className="mt-3 text-xs text-dim">Best for: {m.bestFor}</p>
            </div>
          ))}
        </div>
      </Section>

      <RelatedSection eyebrow="Services" title="What this team delivers" items={services.map(toServiceItem)} />
      <RelatedSection eyebrow="Related teams" title="Often combined with" items={others.map(toTeamItem)} />
      <FAQ items={team.faqs} />
      <CTABand title="Build your engineering team." lede={`Tell us what your ${team.name.toLowerCase()} should own and we will propose a composition.`} primary={{ label: "Build This Team", href: hireHref }} secondary={{ label: "Talk to an Engineering Advisor", href: "/book-a-meeting?topic=engineering-advisor" }} />
    </>
  );
}
