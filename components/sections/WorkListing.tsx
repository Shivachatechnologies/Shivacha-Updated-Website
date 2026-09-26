import Link from "next/link";
import type { CaseStudy, DivisionId } from "@/data/types";
import { divisions } from "@/data/capabilities";
import { DivisionBadge } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { Cover } from "@/components/graphics/Cover";

export function WorkListing({ items, active }: { items: CaseStudy[]; active?: DivisionId | "case-studies" }) {
  return (
    <>
      <nav aria-label="Filter work" className="mb-10 flex flex-wrap gap-2">
        <Link href="/work" className={cn("chip", !active && "border-tint/25 text-fg")}>
          All
        </Link>
        <Link href="/work/case-studies" className={cn("chip", active === "case-studies" && "border-tint/25 text-fg")}>
          Case studies
        </Link>
        {divisions.map((d) => (
          <Link key={d.id} href={`/work/${d.id}`} className={cn("chip", active === d.id && "border-tint/25 text-fg")}>
            {d.short}
          </Link>
        ))}
      </nav>
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((c) => (
          <Link key={c.slug} href={`/work/${c.slug}`} className="card card-hover group flex flex-col overflow-hidden p-3">
            <Cover kind={c.division} label={c.kind === "client" ? "Client case study" : "Reference architecture"} className="aspect-[21/9]" />
            <div className="flex flex-1 flex-col p-4 pt-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <DivisionBadge division={c.division} />
              <span className="text-xs text-dim font-semibold">{c.kind === "client" ? "Client case study" : "Reference architecture"}</span>
            </div>
            <h2 className="mt-6 text-xl font-semibold text-fg">{c.title}</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">{c.summary}</p>
            <span className="mt-auto pt-6 text-sm font-semibold text-brand-blue">Read →</span>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
