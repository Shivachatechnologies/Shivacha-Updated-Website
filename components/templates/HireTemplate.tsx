import Link from "next/link";
import { lowerName } from "@/lib/cn";
import { BadgeCheck, ClipboardCheck, Clock3, UserCheck } from "lucide-react";
import type { HireRole } from "@/data/hire";
import { hireRoles } from "@/data/hire";
import { engagementModels, getTeam, teamPrinciples } from "@/data/teams";
import { pick } from "@/lib/relations";
import { serviceSchema } from "@/lib/jsonld";
import { FactStrip, PageHero } from "@/components/sections/PageHero";
import { DivisionArt } from "@/components/graphics/DivisionArt";
import { CheckList, ChipLinks, PointsGrid, RelatedSection } from "@/components/sections/blocks";
import { FAQ } from "@/components/sections/FAQ";
import { LeadPanel } from "@/components/leads/LeadPanel";
import { BookCallButton } from "@/components/leads/BookCall";
import { DivisionBadge, JsonLd, LinkButton, Section, SectionHeader } from "@/components/ui/primitives";
import { toServiceItem, toTechItem } from "./mappers";

const hiringSteps = [
  { title: "Share your requirement", description: "Roles, seniority, stack, time-zone overlap and what the developers will own." },
  { title: "Review profiles", description: "We shortlist engineers whose experience matches, and share profiles for your review." },
  { title: "Interview", description: "You interview every candidate. Nobody joins your project without your approval." },
  { title: "Onboard & start", description: "Access, rituals and first-sprint goals are agreed; the developer works in your tools." },
  { title: "Review & scale", description: "Regular check-ins on quality and velocity. Scale the team up or down as the roadmap changes." },
];

export function HireTemplate({ role }: { role: HireRole }) {
  const services = pick.services(role.services);
  const techs = pick.technologies(role.technologies);
  const team = role.team ? getTeam(role.team) : undefined;
  const others = hireRoles.filter((r) => r.slug !== role.slug).slice(0, 8);
  const path = `/${role.slug}`;

  return (
    <>
      <JsonLd data={serviceSchema({ name: `Hire ${role.role}`, description: role.summary, path, category: "Dedicated developers" })} />
      <PageHero
        crumbs={[{ name: "Hire Developers", href: "/hire-developers" }, { name: role.role, href: path }]}
        eyebrow={<DivisionBadge division={role.division} />}
        title={`Hire ${role.role}`}
        lede={role.summary}
        aside={<DivisionArt division={role.division} topic={role.role} label={`${role.role} illustration`} priority />}
        footer={
          <FactStrip
            items={[
              { icon: <UserCheck className="size-5" />, label: "You interview", value: "Every engineer" },
              { icon: <ClipboardCheck className="size-5" />, label: "Vetting", value: "Code review + practical" },
              { icon: <Clock3 className="size-5" />, label: "Overlap", value: "With your working hours" },
              { icon: <BadgeCheck className="size-5" />, label: "IP & NDA", value: "Assigned to you" },
            ]}
          />
        }
      >
        <LinkButton href="#enquire" track={`cta:hire-${role.slug}`}>
          {role.cta}
        </LinkButton>
        <BookCallButton label="Talk to an Engineering Advisor" variant="secondary" source={`hire:${role.slug}`} />
      </PageHero>

      <Section>
        <div className="grid gap-12 lg:grid-cols-[1.25fr_1fr]">
          <div>
            <p className="eyebrow mb-4">What a {role.short} does for you</p>
            <p className="text-xl leading-relaxed text-fg">{role.intro}</p>
          </div>
          <div className="card p-6 sm:p-7">
            <h2 className="mb-5 text-lg font-semibold text-fg">When to hire</h2>
            <CheckList items={role.whenToHire} className="sm:grid-cols-1" />
          </div>
        </div>
      </Section>

      <Section>
        <div className="grid gap-12 md:grid-cols-2">
          <div>
            <SectionHeader eyebrow="Responsibilities" title="What they will own" className="mb-6" />
            <CheckList items={role.responsibilities} className="sm:grid-cols-1" />
          </div>
          <div>
            <SectionHeader eyebrow="Skills" title="Typical skill set" className="mb-6" />
            <div className="flex flex-wrap gap-2">
              {role.skills.map((s) => (
                <span key={s} className="rounded-full border border-line bg-ink-900 px-3 py-1.5 text-sm text-muted">
                  {s}
                </span>
              ))}
            </div>
            {techs.length > 0 && (
              <>
                <p className="eyebrow mt-10 mb-4">Technologies</p>
                <ChipLinks items={techs.map(toTechItem)} />
              </>
            )}
          </div>
        </div>
      </Section>

      <Section>
        <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <SectionHeader eyebrow="Vetting" title={`How we assess every ${role.short}`} lede="Profiles are shared only after these checks. You then run your own interviews." className="mb-6" />
            <CheckList items={role.vetting} className="sm:grid-cols-1" />
          </div>
          <div>
            <SectionHeader eyebrow="Hiring process" title="From requirement to first sprint" className="mb-6" />
            <ol className="space-y-4">
              {hiringSteps.map((st, i) => (
                <li key={st.title} className="flex gap-4">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">{i + 1}</span>
                  <span>
                    <span className="block font-semibold text-fg">{st.title}</span>
                    <span className="mt-0.5 block text-sm text-muted">{st.description}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </Section>

      <Section>
        <SectionHeader eyebrow="Engagement models" title="Choose how the developers work with you" />
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
        <div className="mt-12">
          <PointsGrid points={teamPrinciples} columns={4} />
        </div>
        {team && (
          <p className="mt-8 text-sm text-muted">
            Need a whole squad instead? See the{" "}
            <Link href={`/dedicated-teams/${team.slug}`} className="font-medium text-brand-blue hover:underline">
              dedicated {lowerName(team.name)}
            </Link>
            .
          </p>
        )}
      </Section>

      <RelatedSection eyebrow="Services" title="What these developers deliver" items={services.map(toServiceItem)} />
      <FAQ items={role.faqs} />
      <LeadPanel
        title={`${role.cta}.`}
        lede={`Tell us about the roles, seniority and stack you need. We will reply with a proposed composition and profiles for review.`}
        service={role.service}
        source={`hire:${role.slug}`}
        whatsappText={`Hi Shivacha, I'd like to hire ${lowerName(role.role)}.`}
      />
      <Section>
        <p className="eyebrow mb-4">Other roles</p>
        <ChipLinks items={others.map((r) => ({ label: `Hire ${r.role}`, href: `/${r.slug}` }))} />
      </Section>
    </>
  );
}
