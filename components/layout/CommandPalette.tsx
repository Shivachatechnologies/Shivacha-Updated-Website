"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, CornerDownLeft, Search } from "lucide-react";
import type { SearchEntry } from "@/lib/search";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/cn";

const QUICK: { t: string; h: string }[] = [
  { t: "I need an AI agent", h: "/services/ai-agents" },
  { t: "I need a payment gateway", h: "/products/payment-gateway" },
  { t: "I need RWA tokenization", h: "/services/rwa-tokenization" },
  { t: "I need Web2 + Web3 fintech", h: "/solutions/web2-web3-fintech" },
  { t: "I need an engineering team", h: "/dedicated-teams" },
  { t: "I need a product demo", h: "/request-demo" },
];

function score(e: SearchEntry, terms: string[]) {
  const t = e.t.toLowerCase();
  const hay = `${t} ${e.d.toLowerCase()} ${(e.x ?? "").toLowerCase()} ${e.k.toLowerCase()}`;
  let s = 0;
  for (const term of terms) {
    if (!hay.includes(term)) return 0;
    if (t.startsWith(term)) s += 6;
    else if (t.includes(term)) s += 4;
    else s += 1;
  }
  if (e.k === "Capability" || e.k === "Product") s += 1;
  return s;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [index, setIndex] = useState<SearchEntry[] | null>(null);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const load = useCallback(async () => {
    if (index) return;
    try {
      const res = await fetch("/search-index.json");
      setIndex(await res.json());
    } catch {
      setIndex([]);
    }
  }, [index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("shivacha:search", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("shivacha:search", onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      load();
      setTimeout(() => inputRef.current?.focus(), 10);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
      setQ("");
      setActive(0);
    }
  }, [open, load]);

  const results = useMemo(() => {
    const terms = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!terms.length || !index) return [];
    return index
      .map((e) => ({ e, s: score(e, terms) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 12)
      .map((r) => r.e);
  }, [q, index]);

  const list = q ? results.map((r) => ({ t: r.t, h: r.h, k: r.k, d: r.d })) : QUICK.map((x) => ({ ...x, k: "Suggested", d: "" }));

  const go = (href: string) => {
    if (q) track("search", { query: q, result: href });
    setOpen(false);
    router.push(href);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/60 px-4 pt-[12vh] backdrop-blur-sm" onMouseDown={() => setOpen(false)} role="dialog" aria-modal="true" aria-label="Search">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-line-strong bg-ink-900 shadow-2xl shadow-black/60" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="size-4 text-dim" aria-hidden />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, list.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter" && list[active]) {
                go(list[active].h);
              }
            }}
            placeholder="Search products, services, technologies, industries…"
            className="h-14 flex-1 bg-transparent text-[15px] text-fg placeholder:text-dim focus:outline-none"
            aria-label="Search query"
            aria-controls="search-results"
          />
          <kbd className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-dim">ESC</kbd>
        </div>
        <ul id="search-results" role="listbox" className="max-h-[55vh] overflow-y-auto p-2">
          {q && index && !results.length && <li className="px-3 py-8 text-center text-sm text-dim">No results for “{q}”. Try a broader term.</li>}
          {q && !index && <li className="px-3 py-8 text-center text-sm text-dim">Loading index…</li>}
          {list.map((r, i) => (
            <li key={r.h + i} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => go(r.h)}
                className={cn("flex w-full items-center gap-4 rounded-xl px-3 py-2.5 text-left", i === active ? "bg-white/[0.06]" : "")}
              >
                <span className="w-20 shrink-0 font-mono text-[10px] tracking-wider text-dim uppercase">{r.k}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-fg">{r.t}</span>
                  {r.d && <span className="block truncate text-xs text-dim">{r.d}</span>}
                </span>
                {i === active ? <CornerDownLeft className="size-3.5 text-dim" /> : <ArrowRight className="size-3.5 text-transparent" />}
              </button>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-[11px] text-dim">
          <span>↑↓ to navigate · ↵ to open</span>
          <span>{index ? `${index.length} pages indexed` : ""}</span>
        </div>
      </div>
    </div>
  );
}
