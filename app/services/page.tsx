import Link from "next/link";
import { divisions } from "@/data/capabilities";
import { services } from "@/data/services";
import { buildMetadata } from "@/lib/seo";
import { groupsForDivision, servicesForGroup } from "@/lib/relations";
import { PageHero } from "@/components/sections/PageHero";
import { CTABand } from "@/components/sections/CTABand";
import { Section } from "@/components/ui/primitives";
import { divisionTone } from "@/components/ui/division";
import { cn } from "@/lib/cn";

export const metadata = buildMetadata({
  title: "Services: AI, Software, FinTech, Web3, Cloud & Cybersecurity",
  description: `Browse ${services.length}+ Shivacha engineering services across AI, software, fintech (Web2, Web3, hybrid), Web3 infrastructure, cloud, DevOps and cybersecurity.`,
  path: "/services",
});

const anchor = (id: string) => (id === "cybersecurity" ? "cybersecurity" : id);

export default function ServicesPage() {
  return (
    <>
      <PageHero
        crumbs={[{ name: "Services", href: "/services" }]}
        eyebrow={<span className="eyebrow">{services.length} services</span>}
        title="Engineering services across the modern technology stack."
        lede="Every service is delivered by the division that owns it — and combined across divisions when your problem needs it."
      >
        <nav aria-label="Jump to division" className="flex flex-wrap gap-2">
          {divisions.map((d) => (
            <a key={d.id} href={`#${d.id}`} className="chip">
              <span className={cn("size-1.5 rounded-full", divisionTone[d.id].dot)} /> {d.short}
            </a>
          ))}
        </nav>
      </PageHero>
      {divisions.map((d) => (
        <Section key={d.id} id={d.id}>
          <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className={cn("font-mono text-[11px] tracking-[0.16em] uppercase", divisionTone[d.id].text)}>{d.name}</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-fg">{d.tagline}</h2>
            </div>
            <Link href={`/capabilities/${d.id}`} className="btn-secondary">
              {d.short} overview
            </Link>
          </div>
          <div className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
            {groupsForDivision(d.id).map((g) => (
              <div key={g.id} id={anchor(g.id)} className="scroll-mt-24 bg-ink-950 p-6">
                {g.track && <p className="mb-1 font-mono text-[10.5px] tracking-[0.16em] text-dim uppercase">{g.track}</p>}
                <h3 className="mb-4 font-semibold text-fg">{g.name}</h3>
                <ul className="space-y-2">
                  {servicesForGroup(g.id).map((s) => (
                    <li key={s.slug}>
                      <Link href={`/services/${s.slug}`} className="text-sm text-muted transition-colors hover:text-fg">
                        {s.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>
      ))}
      <CTABand />
    </>
  );
}
