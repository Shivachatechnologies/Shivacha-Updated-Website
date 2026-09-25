import Link from "next/link";
import { teams, engagementModels, teamPrinciples } from "@/data/teams";
import { buildMetadata } from "@/lib/seo";
import { PageHero } from "@/components/sections/PageHero";
import { CTABand } from "@/components/sections/CTABand";
import { LinkButton, Section, SectionHeader } from "@/components/ui/primitives";
import { divisionLabel, divisionTone } from "@/components/ui/division";
import { cn } from "@/lib/cn";

export const metadata = buildMetadata({
  title: "Dedicated Engineering Teams: AI, FinTech, Web3, Cloud & Software",
  description: "Build your engineering organisation with Shivacha — dedicated specialists, pods and teams for AI, software, fintech, payments, blockchain, cloud, security, design and QA.",
  path: "/dedicated-teams",
});

const order = ["digital", "ai", "fintech", "web3", "cloud", "product"] as const;

export default function TeamsPage() {
  return (
    <>
      <PageHero crumbs={[{ name: "Dedicated Teams", href: "/dedicated-teams" }]} eyebrow={<span className="eyebrow">{teams.length} team types · 6 engagement models</span>} title="Build your engineering organization with Shivacha." lede="Dedicated specialists, pods and complete teams that work inside your roadmap, tools and rituals — with the domain depth that is hardest to hire.">
        <LinkButton href="/hire-developers" track="cta:teams-build">
          Build Your Engineering Team
        </LinkButton>
        <LinkButton href="/book-a-meeting?topic=engineering-advisor" variant="secondary">
          Talk to an Engineering Advisor
        </LinkButton>
      </PageHero>
      {order.map((d) => {
        const list = teams.filter((t) => t.division === d);
        return (
          <Section key={d}>
            <p className={cn("mb-6 font-mono text-[11px] tracking-[0.16em] uppercase", divisionTone[d].text)}>{divisionLabel[d]}</p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((t) => (
                <Link key={t.slug} href={`/dedicated-teams/${t.slug}`} className="card card-hover group flex flex-col p-6">
                  <h2 className="text-lg font-semibold text-fg">{t.name}</h2>
                  <p className="mt-2 text-sm text-muted">{t.summary}</p>
                  <p className="mt-auto pt-5 text-xs text-dim">{t.roles.slice(0, 3).join(" · ")}</p>
                </Link>
              ))}
            </div>
          </Section>
        );
      })}
      <Section>
        <SectionHeader eyebrow="Engagement models" title="From one specialist to managed engineering" />
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-line bg-white/[0.02] text-xs text-dim">
              <tr>
                <th className="p-4 font-medium">Model</th>
                <th className="p-4 font-medium">Size</th>
                <th className="p-4 font-medium">Composition</th>
                <th className="p-4 font-medium">Best for</th>
              </tr>
            </thead>
            <tbody>
              {engagementModels.map((m) => (
                <tr key={m.name} className="border-b border-line last:border-0">
                  <td className="p-4 font-medium text-fg">{m.name}</td>
                  <td className="p-4 font-mono text-xs text-muted">{m.size}</td>
                  <td className="p-4 text-muted">{m.composition}</td>
                  <td className="p-4 text-muted">{m.bestFor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      <Section>
        <SectionHeader eyebrow="How it works" title="Clear responsibilities, secure delivery" />
        <div className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {teamPrinciples.map((p) => (
            <div key={p.title} className="bg-ink-950 p-6">
              <h3 className="font-semibold text-fg">{p.title}</h3>
              <p className="mt-2 text-sm text-muted">{p.description}</p>
            </div>
          ))}
        </div>
      </Section>
      <CTABand title="Build your engineering team." primary={{ label: "Build Your Engineering Team", href: "/hire-developers" }} secondary={{ label: "Talk to an Engineering Advisor", href: "/book-a-meeting?topic=engineering-advisor" }} />
    </>
  );
}
