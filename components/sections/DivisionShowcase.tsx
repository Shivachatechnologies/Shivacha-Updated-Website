"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import type { DivisionId } from "@/data/types";
import { divisionTone } from "@/components/ui/division";
import { cn } from "@/lib/cn";
import { DivisionArt } from "@/components/graphics/DivisionArt";

export interface ShowcaseItem {
  id: DivisionId;
  short: string;
  name: string;
  tagline: string;
  href: string;
  count: number;
  icon: ReactNode;
  services: { name: string; href: string }[];
}

/** Tabbed tour of the five divisions: a list on the left, the selected division's scene on the right. */
export function DivisionShowcase({ items }: { items: ShowcaseItem[] }) {
  const [active, setActive] = useState(0);
  const cur = items[active];
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12">
      <div role="tablist" aria-label="Divisions" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
        {items.map((d, i) => {
          const on = i === active;
          const t = divisionTone[d.id];
          return (
            <button
              key={d.id}
              role="tab"
              aria-selected={on}
              aria-controls={`division-panel-${d.id}`}
              onClick={() => setActive(i)}
              onMouseEnter={() => setActive(i)}
              className={cn(
                "group flex shrink-0 items-center gap-4 rounded-2xl border p-3 text-left transition-all lg:p-4",
                on ? "border-line-strong bg-ink-900 shadow-[0_12px_32px_-20px_rgb(0_0_0/0.5)]" : "border-transparent hover:bg-ink-900/60",
              )}
            >
              <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl border", t.border, t.bg, t.text)}>{d.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold whitespace-nowrap text-fg">{d.name}</span>
                <span className="hidden text-sm text-muted lg:block">{d.tagline}</span>
              </span>
              <span className="hidden text-xs text-dim lg:block">{d.count}</span>
            </button>
          );
        })}
      </div>

      <div id={`division-panel-${cur.id}`} role="tabpanel" className="min-w-0">
        {/* Only the selected scene is rendered, keeping the page light. */}
        <div key={cur.id} className="animate-[fade-in_.4s_ease]">
          <DivisionArt division={cur.id} label={`${cur.name} illustration`} />
        </div>
        <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {cur.services.map((s) => (
              <Link key={s.href} href={s.href} className="chip">
                {s.name}
              </Link>
            ))}
          </div>
          <Link href={cur.href} className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-brand-blue hover:underline">
            Explore {cur.short} <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
