"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Lock, Search } from "lucide-react";
import { cn } from "@/lib/cn";

export interface ResourceCard {
  slug: string;
  href: string;
  title: string;
  summary: string;
  type: string;
  typeLabel: string;
  division: string;
  readingTime: string;
  difficulty: string;
  gated: boolean;
  featured: boolean;
  date: string;
  technologies: string[];
  industries: string[];
}

type Opt = { id: string; label: string };

function Select({ label, value, onChange, opts }: { label: string; value: string; onChange: (v: string) => void; opts: Opt[] }) {
  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="field h-10 py-0 text-xs">
        <option value="">{label}: All</option>
        {opts.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ResourceLibrary({ items, types, divisions, technologies, industries }: { items: ResourceCard[]; types: Opt[]; divisions: Opt[]; technologies: Opt[]; industries: Opt[] }) {
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [division, setDivision] = useState("");
  const [tech, setTech] = useState("");
  const [industry, setIndustry] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [sort, setSort] = useState<"featured" | "latest">("featured");

  const list = useMemo(() => {
    const l = items.filter(
      (r) =>
        (!q || `${r.title} ${r.summary}`.toLowerCase().includes(q.toLowerCase())) &&
        (!type || r.type === type) &&
        (!division || r.division === division) &&
        (!tech || r.technologies.includes(tech)) &&
        (!industry || r.industries.includes(industry)) &&
        (!difficulty || r.difficulty === difficulty),
    );
    return sort === "latest" ? [...l].sort((a, b) => b.date.localeCompare(a.date)) : [...l].sort((a, b) => Number(b.featured) - Number(a.featured));
  }, [items, q, type, division, tech, industry, difficulty, sort]);

  return (
    <div>
      <div className="mb-8 grid gap-3 rounded-2xl border border-line p-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="relative block sm:col-span-2">
          <span className="sr-only">Search resources</span>
          <Search className="absolute top-1/2 left-4 size-4 -translate-y-1/2 text-dim" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search guides, checklists, architectures…" className="field h-10 py-0 pl-10" />
        </label>
        <Select label="Content type" value={type} onChange={setType} opts={types} />
        <Select label="Division" value={division} onChange={setDivision} opts={divisions} />
        <Select label="Technology" value={tech} onChange={setTech} opts={technologies} />
        <Select label="Industry" value={industry} onChange={setIndustry} opts={industries} />
        <Select label="Difficulty" value={difficulty} onChange={setDifficulty} opts={["Introductory", "Intermediate", "Advanced"].map((d) => ({ id: d, label: d }))} />
        <div className="flex gap-2">
          {(["featured", "latest"] as const).map((s) => (
            <button key={s} onClick={() => setSort(s)} className={cn("h-10 flex-1 rounded-xl border text-xs capitalize", sort === s ? "border-white/25 bg-white/[0.06] text-fg" : "border-line text-muted")}>
              {s}
            </button>
          ))}
        </div>
      </div>
      <p className="mb-5 text-xs text-dim">{list.length} resources</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((r) => (
          <Link key={r.slug} href={r.href} className="card card-hover group flex flex-col p-6">
            <div className="flex items-center justify-between gap-2 font-mono text-[10.5px] tracking-[0.14em] text-dim uppercase">
              <span>{r.typeLabel}</span>
              <span>{r.readingTime}</span>
            </div>
            <h3 className="mt-4 text-base font-semibold text-fg">{r.title}</h3>
            <p className="mt-2 line-clamp-3 text-sm text-muted">{r.summary}</p>
            <div className="mt-auto flex items-center justify-between pt-5 text-xs">
              <span className="text-dim">{r.difficulty}</span>
              <span className="flex items-center gap-1 text-muted group-hover:text-fg">
                {r.gated && <Lock className="size-3" />} {r.gated ? "Download" : "Read"} →
              </span>
            </div>
          </Link>
        ))}
      </div>
      {!list.length && <p className="py-16 text-center text-muted">No resources match these filters.</p>}
    </div>
  );
}
