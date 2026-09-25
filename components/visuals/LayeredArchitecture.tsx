"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/cn";

export interface ArchLayer {
  id: string;
  name: string;
  items: string[];
  description: string;
  links: { label: string; href: string }[];
  color: string;
}

/** The Shivacha technology stack as an interactive, layered architecture. */
export function LayeredArchitecture({ layers }: { layers: ArchLayer[] }) {
  const [active, setActive] = useState(layers[2]?.id ?? layers[0].id);
  const current = layers.find((l) => l.id === active)!;

  return (
    <div className="grid gap-8 lg:grid-cols-[1.35fr_1fr] lg:items-start">
      <div className="relative">
        <div className="absolute top-4 bottom-4 left-[19px] w-px bg-gradient-to-b from-white/5 via-white/20 to-white/5" aria-hidden />
        <ul className="space-y-2.5" role="tablist" aria-label="Architecture layers">
          {layers.map((l, i) => {
            const on = l.id === active;
            return (
              <li key={l.id} role="presentation">
                <button
                  type="button"
                  role="tab"
                  aria-selected={on}
                  aria-controls="arch-panel"
                  onMouseEnter={() => setActive(l.id)}
                  onFocus={() => setActive(l.id)}
                  onClick={() => setActive(l.id)}
                  className={cn(
                    "group relative flex w-full items-center gap-4 rounded-2xl border px-3 py-3 text-left transition-all duration-300 sm:px-4",
                    on ? "border-white/20 bg-white/[0.05]" : "border-line bg-white/[0.015] hover:border-line-strong",
                  )}
                  style={on ? { boxShadow: `0 0 0 1px ${l.color}33, 0 20px 50px -30px ${l.color}` } : undefined}
                >
                  <span
                    className="relative z-10 flex size-[18px] shrink-0 items-center justify-center rounded-full border bg-ink-950"
                    style={{ borderColor: on ? l.color : "rgba(255,255,255,.2)" }}
                  >
                    <span className="size-1.5 rounded-full" style={{ background: on ? l.color : "rgba(255,255,255,.3)" }} />
                  </span>
                  <span className="w-28 shrink-0 font-mono text-[11px] tracking-wider text-dim uppercase sm:w-36">
                    {String(i + 1).padStart(2, "0")} · {l.name}
                  </span>
                  <span className="hidden flex-1 flex-wrap gap-1.5 sm:flex">
                    {l.items.map((it) => (
                      <span key={it} className={cn("rounded-md border px-2 py-0.5 text-xs transition-colors", on ? "border-white/15 text-fg" : "border-line text-muted")}>
                        {it}
                      </span>
                    ))}
                  </span>
                  <span className="flex-1 truncate text-sm text-muted sm:hidden">{l.items.join(" · ")}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div id="arch-panel" role="tabpanel" className="card relative min-h-[280px] overflow-hidden p-7 lg:sticky lg:top-28">
        <div className="pointer-events-none absolute -top-24 -right-24 size-64 rounded-full opacity-30 blur-3xl transition-colors" style={{ background: current.color }} aria-hidden />
        <AnimatePresence mode="wait">
          <motion.div key={current.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }} className="relative">
            <p className="eyebrow">Layer</p>
            <h3 className="mt-3 text-2xl font-semibold tracking-tight text-fg">{current.name}</h3>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">{current.description}</p>
            <div className="mt-6 flex flex-wrap gap-2">
              {current.links.map((lnk) => (
                <Link key={lnk.href} href={lnk.href} className="chip">
                  {lnk.label}
                </Link>
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
