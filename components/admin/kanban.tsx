"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useToast } from "./client";

export interface KanbanColumn {
  key: string;
  label: string;
  count: number;
  /** Pre-formatted column total (e.g. "$120K"). */
  total?: string;
}

export interface KanbanCard {
  id: string;
  column: string;
  title: string;
  href: string;
  sub?: string;
  meta?: string;
  badge?: string;
  tone?: "red" | "amber" | "green";
}

/**
 * Pipeline board. Drag a card between columns, or use its "Move to" menu (keyboard accessible).
 * `move` is a server action that re-checks permissions; the UI optimistically moves the card and reverts on error.
 */
export function Kanban({ columns, cards, move, readOnly, footer }: { columns: KanbanColumn[]; cards: KanbanCard[]; move?: (id: string, to: string) => Promise<{ ok: boolean; error?: string }>; readOnly?: boolean; footer?: (col: string) => ReactNode }) {
  const [items, setItems] = useState(cards);
  const [prevCards, setPrevCards] = useState(cards);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  if (prevCards !== cards) {
    setPrevCards(cards);
    setItems(cards);
  }

  const doMove = (id: string, to: string) => {
    const card = items.find((c) => c.id === id);
    if (!card || card.column === to || !move) return;
    const from = card.column;
    setItems((xs) => xs.map((c) => (c.id === id ? { ...c, column: to } : c)));
    start(async () => {
      const r = await move(id, to);
      if (!r.ok) {
        setItems((xs) => xs.map((c) => (c.id === id ? { ...c, column: from } : c)));
        toast("error", r.error ?? "Could not move the card.");
      } else {
        toast("ok", `Moved to ${columns.find((c) => c.key === to)?.label ?? to}.`);
        router.refresh();
      }
    });
  };

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-3 sm:-mx-6 sm:px-6">
      <div className="flex min-w-max gap-3">
        {columns.map((col) => {
          const colCards = items.filter((c) => c.column === col.key);
          const delta = colCards.length - cards.filter((c) => c.column === col.key).length;
          return (
            <section
              key={col.key}
              aria-label={col.label}
              onDragOver={(e) => {
                if (readOnly) return;
                e.preventDefault();
                setOver(col.key);
              }}
              onDragLeave={() => setOver((o) => (o === col.key ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const id = e.dataTransfer.getData("text/plain");
                if (id) doMove(id, col.key);
              }}
              className={cn("flex w-[272px] shrink-0 flex-col rounded-lg border bg-ink-900", over === col.key ? "border-brand-blue" : "border-line")}
            >
              <header className="flex items-baseline justify-between gap-2 border-b border-line px-3 py-2.5">
                <h2 className="text-[12.5px] font-semibold text-fg">
                  {col.label} <span className="ml-1 font-mono text-[11px] text-dim tabular-nums">{col.count + delta}</span>
                </h2>
                {col.total && <span className="truncate font-mono text-[11px] text-muted tabular-nums">{col.total}</span>}
              </header>
              <ul className="flex max-h-[68vh] min-h-24 flex-col gap-2 overflow-y-auto p-2">
                {colCards.map((c) => (
                  <li
                    key={c.id}
                    draggable={!readOnly}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", c.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDragging(c.id);
                    }}
                    onDragEnd={() => setDragging(null)}
                    className={cn("rounded-md border border-line bg-ink-950 p-2.5 text-sm shadow-[0_1px_0_rgb(11_20_36/0.04)]", !readOnly && "cursor-grab", dragging === c.id && "opacity-50")}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <Link href={c.href} className="min-w-0 truncate font-medium text-fg hover:text-brand-blue">{c.title}</Link>
                      {c.badge && <span className={cn("shrink-0 rounded px-1.5 font-mono text-[10.5px]", c.tone === "red" ? "bg-red-500/12 text-red-700" : c.tone === "amber" ? "bg-amber-500/15 text-amber-700" : c.tone === "green" ? "bg-emerald-500/12 text-emerald-700" : "bg-ink-800 text-muted")}>{c.badge}</span>}
                    </div>
                    {c.sub && <p className="mt-0.5 truncate text-xs text-muted">{c.sub}</p>}
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <span className="truncate text-[11px] text-dim">{c.meta}</span>
                      {!readOnly && move && (
                        <select aria-label={`Move ${c.title}`} value={c.column} onChange={(e) => doMove(c.id, e.target.value)} className="h-6 max-w-[110px] rounded border border-line bg-ink-900 px-1 text-[11px] text-muted">
                          {columns.map((o) => (
                            <option key={o.key} value={o.key}>{o.label}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  </li>
                ))}
                {colCards.length === 0 && <li className="py-6 text-center text-xs text-dim">Empty</li>}
              </ul>
              {footer?.(col.key)}
            </section>
          );
        })}
      </div>
    </div>
  );
}
