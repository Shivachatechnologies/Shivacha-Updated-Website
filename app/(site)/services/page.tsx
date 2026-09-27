import Link from "next/link";
import { divisions } from "@/data/capabilities";
import { services } from "@/data/services";
import { buildMetadata } from "@/lib/seo";
import { withSeo } from "@/lib/cms/seo";
import { groupsForDivision, servicesForGroup } from "@/lib/relations";
import { PageHero } from "@/components/sections/PageHero";
import { CTABand } from "@/components/sections/CTABand";
import { Section } from "@/components/ui/primitives";
import { divisionTone } from "@/components/ui/division";
import { cn } from "@/lib/cn";
import { ArrowRight, Plus } from "lucide-react";

export const generateMetadata = () => withSeo(buildMetadata({
  title: "Services: Web3, FinTech, Digital Assets, AI & Cloud Engineering",
  description: `${services.length}+ Shivacha engineering services organised by division and category — Web3 infrastructure, FinTech, digital asset platforms, AI systems, cloud, DevSecOps and product engineering.`,
  path: "/services",
}));

const anchor = (id: string) => (id === "cybersecurity" ? "cybersecurity" : id);

export default function ServicesPage() {
  return (
    <>
      <PageHero
        crumbs={[{ name: "Services", href: "/services" }]}
        eyebrow={<span className="eyebrow">{services.length} services</span>}
        title="Engineering services, organised by the systems you are building."
        lede="Every service is delivered by the division that owns it — and combined across divisions when your platform needs it."
      >
        <nav aria-label="Jump to division" className="flex flex-wrap gap-2">
          {divisions.map((d) => (
            <a key={d.id} href={`#${d.id}`} className="chip">
              <span className={cn("size-1.5 rounded-full", divisionTone[d.id].dot)} /> {d.short}
            </a>
          ))}
        </nav>
      </PageHero>
      {divisions.map((d) => {
        const groups = groupsForDivision(d.id);
        return (
          <Section key={d.id} id={d.id}>
            <div className="grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)] lg:gap-16">
              <div className="lg:sticky lg:top-24 lg:self-start">
                <p className="label-tech flex items-center gap-2">
                  <span className={cn("size-1.5 rounded-full", divisionTone[d.id].dot)} aria-hidden /> {d.name}
                </p>
                <h2 className="mt-3 text-[1.75rem] leading-[1.15] font-medium tracking-[-0.03em] text-fg sm:text-[2rem]">{d.tagline}</h2>
                <p className="mt-4 text-[15px] leading-relaxed text-muted">{d.description}</p>
                <Link href={`/capabilities/${d.id}`} className="group mt-6 inline-flex items-center gap-1.5 border-b border-line-strong pb-0.5 text-sm font-medium text-fg hover:border-fg">
                  Explore {d.name} <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </Link>
              </div>
              <ul className="divide-y divide-line border-y border-line">
                {groups.map((g) => {
                  const list = servicesForGroup(g.id);
                  const top = list.slice(0, 5);
                  const rest = list.slice(5);
                  return (
                    <li key={g.id} id={anchor(g.id)} className="scroll-mt-24 py-6">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                        <h3 className="text-lg font-medium tracking-[-0.015em] text-fg">
                          {g.track && <span className="label-tech mr-2 align-middle">{g.track}</span>}
                          {g.name}
                        </h3>
                        <span className="font-mono text-[11.5px] text-dim">{list.length} services</span>
                      </div>
                      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
                        {top.map((sv) => (
                          <li key={sv.slug}>
                            <Link href={`/services/${sv.slug}`} className="text-[14.5px] text-muted transition-colors hover:text-fg">
                              {sv.name}
                            </Link>
                          </li>
                        ))}
                      </ul>
                      {rest.length > 0 && (
                        <details className="group mt-3">
                          <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-[13px] font-medium text-fg [&::-webkit-details-marker]:hidden">
                            <Plus className="size-3.5 transition-transform group-open:rotate-45" aria-hidden /> {rest.length} more in {g.name}
                          </summary>
                          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
                            {rest.map((sv) => (
                              <li key={sv.slug}>
                                <Link href={`/services/${sv.slug}`} className="text-[14px] text-muted transition-colors hover:text-fg">
                                  {sv.name}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </Section>
        );
      })}
      <CTABand />
    </>
  );
}
