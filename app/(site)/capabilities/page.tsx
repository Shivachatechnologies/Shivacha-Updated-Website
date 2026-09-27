import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { capabilities, divisions } from "@/data/capabilities";
import { engagementWays } from "@/data/company";
import { buildMetadata } from "@/lib/seo";
import { withSeo } from "@/lib/cms/seo";
import { servicesForDivision, productsForDivision } from "@/lib/relations";
import { PageHero } from "@/components/sections/PageHero";
import { CTABand } from "@/components/sections/CTABand";
import { Section, SectionHeader } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";
import { divisionTone } from "@/components/ui/division";
import { cn } from "@/lib/cn";
import { EcosystemVisual } from "@/components/visuals/SystemVisuals";

export const generateMetadata = () => withSeo(buildMetadata({
  title: "Divisions: Web3, FinTech, Digital Assets, AI & Cloud",
  description: "Explore Shivacha's five divisions — Web3, FinTech, Digital Assets, AI and Cloud — each pairing white-label, ready-to-launch platforms with custom engineering and dedicated teams.",
  path: "/capabilities",
}));

export default function CapabilitiesPage() {
  return (
    <>
      <PageHero
        crumbs={[{ name: "Capabilities", href: "/capabilities" }]}
        eyebrow={<span className="eyebrow">Capabilities</span>}
        title="Five divisions. One product engineering partner."
        lede="Shivacha Web3, FinTech, Digital Assets, AI and Cloud each combine ready-to-launch foundations with custom engineering — backed by a product engineering practice for web, mobile and SaaS."
        aside={<EcosystemVisual />}
      />
      <Section className="pt-0">
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
                  <p className={cn("text-xs font-semibold", t.text)}>{d.name}</p>
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
                    {servicesForDivision(d.id).length} services · {productsForDivision(d.id).length} products{d.launch[0] ? ` · ${d.launch[0][0]}: ${d.launch[0][1]}` : ""}
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
