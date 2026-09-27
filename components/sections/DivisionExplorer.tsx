import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { divisions, capabilities } from "@/data/capabilities";
import { getGroup } from "@/data/serviceGroups";
import { pick, servicesForGroup } from "@/lib/relations";
import { divisionTone } from "@/components/ui/division";
import { DivisionArt } from "@/components/graphics/DivisionArt";
import { DivisionSwitcher } from "./DivisionSwitcher";

/** Homepage division selector: visual, narrative, capabilities, service categories, technologies and CTA per division. */
export function DivisionExplorer() {
  const panels = divisions
    .filter((d) => d.primary)
    .map((d) => {
      const cap = capabilities.find((c) => c.division === d.id)!;
      const techs = pick.technologies(cap.technologies).slice(0, 8);
      const categories = cap.pillars.slice(0, 3).map((p) => ({
        title: p.title,
        services: p.groups.flatMap((g) => servicesForGroup(g)).slice(0, 4),
        href: `/capabilities/${d.id}#services`,
        group: getGroup(p.groups[0])?.name,
      }));
      return {
        id: d.id,
        label: d.short,
        color: divisionTone[d.id].hex,
        content: (
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-14">
            <div className="min-w-0">
              <p className="label-tech">{d.name}</p>
              <h3 className="mt-3 text-[1.65rem] leading-[1.15] font-medium tracking-[-0.03em] text-fg sm:text-[2rem]">{d.tagline}</h3>
              <p className="mt-4 max-w-xl text-[15.5px] leading-relaxed text-muted">{d.description}</p>

              <ul className="mt-7 flex flex-wrap gap-x-4 gap-y-2 text-[14px] text-fg" aria-label={`${d.short} capabilities`}>
                {d.flagships.map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <span className="size-1 rounded-full" style={{ background: divisionTone[d.id].hex }} aria-hidden /> {f}
                  </li>
                ))}
              </ul>

              <div className="mt-8 grid gap-6 border-t border-line pt-6 sm:grid-cols-3">
                {categories.map((c) => (
                  <div key={c.title} className="min-w-0">
                    <p className="text-[13px] font-semibold text-fg">{c.title}</p>
                    <ul className="mt-2 space-y-1">
                      {c.services.map((s) => (
                        <li key={s.slug}>
                          <Link href={`/services/${s.slug}`} className="text-[13.5px] leading-snug text-muted hover:text-fg">
                            {s.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
                <Link href={d.ctaHref} className="btn-primary" data-track={`cta:switcher-${d.id}`}>
                  {d.cta} <ArrowRight className="size-4" aria-hidden />
                </Link>
                <Link href={`/capabilities/${d.id}`} className="group inline-flex items-center gap-1.5 border-b border-line-strong pb-0.5 text-sm font-medium text-fg hover:border-fg">
                  Explore {d.name} <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </Link>
              </div>
            </div>

            <div className="min-w-0">
              <DivisionArt division={d.id} topic={d.id === "digital-assets" ? "exchange" : ""} />
              <div className="mt-5 grid gap-5 sm:grid-cols-[1fr_auto]">
                <div className="min-w-0">
                  <p className="label-tech mb-2">Technologies</p>
                  <p className="text-[13.5px] leading-relaxed text-muted">{techs.map((t) => t.name).join(" · ")}</p>
                </div>
                <dl className="min-w-0 space-y-1 sm:min-w-[220px]">
                  <dt className="label-tech mb-2">Typical implementation</dt>
                  {d.launch.slice(0, 3).map(([what, range]) => (
                    <dd key={what} className="flex items-baseline justify-between gap-4 text-[13.5px]">
                      <span className="text-muted">{what}</span>
                      <span className="font-medium text-fg tabular-nums">{range}</span>
                    </dd>
                  ))}
                </dl>
              </div>
            </div>
          </div>
        ),
      };
    });

  return <DivisionSwitcher panels={panels} />;
}
