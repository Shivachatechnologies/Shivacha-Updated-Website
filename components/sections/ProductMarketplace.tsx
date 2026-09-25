"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Search } from "lucide-react";
import type { DivisionId } from "@/data/types";
import { cn } from "@/lib/cn";
import { divisionLabel, divisionTone } from "@/components/ui/division";

export interface ProductCard {
  slug: string;
  name: string;
  division: DivisionId;
  category: string;
  tagline: string;
  live: boolean;
}

const tabs: { id: DivisionId | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "fintech", label: "FinTech" },
  { id: "web3", label: "Web3" },
  { id: "ai", label: "AI" },
  { id: "digital", label: "Digital" },
  { id: "cloud", label: "Cloud" },
];

export function ProductMarketplace({ items }: { items: ProductCard[] }) {
  const [tab, setTab] = useState<DivisionId | "all">("all");
  const [cat, setCat] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get("category");
    // Deep-link support (?category=web3), read after hydration so static HTML is unchanged.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (c && tabs.some((t) => t.id === c)) setTab(c as DivisionId);
  }, []);

  const cats = useMemo(() => [...new Set(items.filter((i) => tab === "all" || i.division === tab).map((i) => i.category))], [items, tab]);
  const list = items.filter(
    (i) =>
      (tab === "all" || i.division === tab) &&
      (!cat || i.category === cat) &&
      (!q || `${i.name} ${i.tagline} ${i.category}`.toLowerCase().includes(q.toLowerCase())),
  );

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 scrollbar-none" role="tablist" aria-label="Product categories">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => {
                setTab(t.id);
                setCat(null);
              }}
              className={cn("shrink-0 rounded-full border px-4 py-2 text-sm transition-colors", tab === t.id ? "border-white/25 bg-white/[0.07] text-fg" : "border-line text-muted hover:text-fg")}
            >
              {t.label}
              <span className="ml-2 font-mono text-[10px] text-dim">{t.id === "all" ? items.length : items.filter((i) => i.division === t.id).length}</span>
            </button>
          ))}
        </div>
        <label className="relative block lg:w-72">
          <span className="sr-only">Search products</span>
          <Search className="absolute top-1/2 left-4 size-4 -translate-y-1/2 text-dim" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products" className="field rounded-full pl-10" />
        </label>
      </div>
      {cats.length > 1 && (
        <div className="mb-8 flex flex-wrap gap-2">
          <button onClick={() => setCat(null)} className={cn("chip", !cat && "border-white/25 text-fg")}>
            All categories
          </button>
          {cats.map((c) => (
            <button key={c} onClick={() => setCat(c)} className={cn("chip", cat === c && "border-white/25 text-fg")}>
              {c}
            </button>
          ))}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((p) => (
          <Link key={p.slug} href={`/products/${p.slug}`} className="card card-hover group flex flex-col p-6">
            <div className="flex items-center justify-between gap-2">
              <span className={cn("inline-flex items-center gap-2 text-[11px]", divisionTone[p.division].text)}>
                <span className={cn("size-1.5 rounded-full", divisionTone[p.division].dot)} />
                {divisionLabel[p.division]}
              </span>
              <span className="font-mono text-[10px] tracking-wider text-dim uppercase">{p.category}</span>
            </div>
            <h3 className="mt-5 text-lg font-semibold text-fg">{p.name}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{p.tagline}</p>
            <div className="mt-auto flex items-center justify-between pt-6 text-sm">
              <span className="text-muted group-hover:text-fg">View product</span>
              <span className="flex items-center gap-1 text-xs text-dim">
                {p.live ? "Live demo" : "Request demo"} <ArrowRight className="size-3" />
              </span>
            </div>
          </Link>
        ))}
      </div>
      {!list.length && <p className="py-16 text-center text-muted">No products match your filters.</p>}
    </div>
  );
}
