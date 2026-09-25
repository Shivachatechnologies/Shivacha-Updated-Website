import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { capabilities, divisions } from "@/data/capabilities";
import { engagementWays } from "@/data/company";
import { buildMetadata } from "@/lib/seo";
import { servicesForDivision, productsForDivision } from "@/lib/relations";
import { PageHero } from "@/components/sections/PageHero";
import { CTABand } from "@/components/sections/CTABand";
import { Section, SectionHeader } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";
import { divisionTone } from "@/components/ui/division";
import { cn } from "@/lib/cn";

export const metadata = buildMetadata({
  title: "Capabilities: AI, Digital, FinTech, Web3 & Cloud",
  description: "Explore Shivacha's five divisions — AI, Digital, FinTech, Web3 and Cloud — and how they combine to build, transform and scale technology for ambitious companies.",
  path: "/capabilities",
});

export default function CapabilitiesPage() {
  return (
    <>
      <PageHero
        crumbs={[{ name: "Capabilities", href: "/capabilities" }]}
        eyebrow={<span className="eyebrow">Capabilities</span>}
        title="Five divisions. One engineering organisation."
        lede="Shivacha AI, Digital, FinTech, Web3 and Cloud are deep practices on their own — and designed to work together on the problems that cross them."
      />
      <Section bordered={false} className="pt-0">
        <div className="space-y-4">
          {divisions.map((d) => {
            const cap = capabilities.find((c) => c.division === d.id)!;
            const t = divisionTone[d.id];
            return (
              <Link key={d.id} href={`/capabilities/${d.id}`} className="card card-hover group grid gap-6 p-6 sm:p-8 lg:grid-cols-[80px_1.2fr_1fr_auto] lg:items-center">
                <div className={cn("flex size-14 items-center justify-center rounded-2xl border", t.border, t.bg)}>
                  <Icon name={d.icon} className={cn("size-6", t.text)} />
                </div>
                <div>
                  <p className={cn("font-mono text-[11px] tracking-[0.16em] uppercase", t.text)}>{d.name}</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-fg">{d.tagline}</h2>
                  <p className="mt-2 text-sm text-muted">{cap.lede}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {cap.pillars.map((p) => (
                    <span key={p.title} className="rounded-full border border-line px-2.5 py-1 text-xs text-muted">
                      {p.title}
                    </span>
                  ))}
                  <span className="w-full pt-2 text-xs text-dim">
                    {servicesForDivision(d.id).length} services · {productsForDivision(d.id).length} products
                  </span>
                </div>
                <ArrowUpRight className="size-5 text-dim transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-fg" />
              </Link>
            );
          })}
        </div>
      </Section>
      <Section>
        <SectionHeader eyebrow="Ways to work with us" title="Five engagement models" />
        <div className="grid gap-4 md:grid-cols-5">
          {engagementWays.map((w) => (
            <Link key={w.n} href={w.href} className="card card-hover p-6">
              <span className="font-mono text-xs text-dim">{w.n}</span>
              <h3 className="mt-4 font-semibold text-fg">{w.title}</h3>
              <p className="mt-2 text-sm text-muted">{w.description}</p>
            </Link>
          ))}
        </div>
      </Section>
      <CTABand />
    </>
  );
}
