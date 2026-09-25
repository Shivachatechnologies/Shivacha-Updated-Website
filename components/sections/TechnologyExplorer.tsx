"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/cn";

export interface TechItem {
  slug: string;
  name: string;
  category: string;
  summary: string;
}

export function TechnologyExplorer({ items, categories }: { items: TechItem[]; categories: { id: string; name: string; description: string }[] }) {
  const [active, setActive] = useState<string>("all");
  const [q, setQ] = useState("");
  const filtered = useMemo(
    () => items.filter((t) => (active === "all" || t.category === active) && (!q || `${t.name} ${t.summary}`.toLowerCase().includes(q.toLowerCase()))),
    [items, active, q],
  );
  const shown = categories.filter((c) => filtered.some((t) => t.category === c.id));

  return (
    <div>
      <div className="sticky top-16 z-20 -mx-4 mb-10 border-b border-line bg-ink-950/90 px-4 py-4 backdrop-blur-xl sm:mx-0 sm:rounded-2xl sm:border sm:px-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative block lg:w-64">
            <span className="sr-only">Search technologies</span>
            <Search className="absolute top-1/2 left-4 size-4 -translate-y-1/2 text-dim" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search technologies" className="field h-10 rounded-full py-0 pl-10" />
          </label>
          <div className="flex gap-2 overflow-x-auto scrollbar-none" role="tablist" aria-label="Technology categories">
            {[{ id: "all", name: "All" }, ...categories].map((c) => (
              <button
                key={c.id}
                role="tab"
                aria-selected={active === c.id}
                onClick={() => setActive(c.id)}
                className={cn("shrink-0 rounded-full border px-3 py-1.5 text-xs transition-colors", active === c.id ? "border-white/25 bg-white/[0.07] text-fg" : "border-line text-muted hover:text-fg")}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="space-y-14">
        {shown.map((c) => (
          <section key={c.id} id={c.id} className="scroll-mt-40">
            <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-xl font-semibold text-fg">{c.name}</h2>
              <p className="text-sm text-dim">{c.description}</p>
            </div>
            <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 scrollbar-none sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
              {filtered
                .filter((t) => t.category === c.id)
                .map((t) => (
                  <Link key={t.slug} href={`/technologies/${t.slug}`} className="card card-hover w-64 shrink-0 snap-start p-5 sm:w-auto">
                    <p className="font-semibold text-fg">{t.name}</p>
                    <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted">{t.summary}</p>
                  </Link>
                ))}
            </div>
          </section>
        ))}
        {!shown.length && <p className="py-12 text-center text-muted">No technologies match “{q}”.</p>}
      </div>
    </div>
  );
}
