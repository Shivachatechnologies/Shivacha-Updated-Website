"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, Loader2, Plus, Trash2 } from "lucide-react";
import { SECTION_TYPES, type SectionInput, type SectionType } from "@/lib/admin/sections";
import { cn } from "@/lib/cn";
import { useToast } from "./client";

const input = "w-full rounded-md border border-line-strong bg-ink-900 px-2.5 py-2 text-sm text-fg focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20";

/** Page section builder: add, edit, reorder, duplicate, hide and delete sections, then save in one go. */
export function SectionBuilder({ initial, save }: { initial: SectionInput[]; save: (s: SectionInput[]) => Promise<{ ok?: string; error?: string }> }) {
  const [items, setItems] = useState(() => initial.map((s) => ({ ...s, key: Math.random().toString(36).slice(2) })));
  const [dirty, setDirty] = useState(false);
  const [adding, setAdding] = useState<SectionType>("text");
  const [pending, start] = useTransition();
  const toast = useToast();

  const update = (fn: (x: typeof items) => typeof items) => {
    setItems(fn);
    setDirty(true);
  };
  const move = (i: number, d: number) =>
    update((x) => {
      const j = i + d;
      if (j < 0 || j >= x.length) return x;
      const y = [...x];
      [y[i], y[j]] = [y[j], y[i]];
      return y;
    });

  return (
    <section className="mt-6 rounded-lg border border-line bg-ink-900" aria-labelledby="sections-h">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 id="sections-h" className="text-sm font-semibold text-fg">
          Sections <span className="font-normal text-dim">({items.length})</span>
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <select value={adding} onChange={(e) => setAdding(e.target.value as SectionType)} aria-label="Section type" className="h-9 rounded-md border border-line-strong bg-ink-900 px-2 text-[13px] text-fg">
            {Object.entries(SECTION_TYPES).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <button type="button" className="btn-secondary h-9 px-3 text-[13px]" onClick={() => update((x) => [...x, { key: Math.random().toString(36).slice(2), type: adding, hidden: false, data: {} }])}>
            <Plus className="size-4" aria-hidden /> Add section
          </button>
          <button
            type="button"
            disabled={pending || !dirty}
            className="btn-primary h-9 px-3.5 text-[13px] disabled:opacity-50"
            onClick={() =>
              start(async () => {
                const r = await save(items.map(({ type, hidden, data }) => ({ type, hidden, data })));
                if (r.error) toast("error", r.error);
                else {
                  toast("ok", r.ok ?? "Saved.");
                  setDirty(false);
                }
              })
            }
          >
            {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden />} Save sections
          </button>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-dim">No sections yet. Choose a type and add the first section.</p>
      ) : (
        <ol className="divide-y divide-line">
          {items.map((s, i) => {
            const def = SECTION_TYPES[s.type];
            return (
              <li key={s.key} className={cn("p-4", s.hidden && "bg-ink-850/60")}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-fg">
                    <span className="mr-2 font-mono text-xs text-dim">{i + 1}</span>
                    {def.label}
                    {s.hidden && <span className="ml-2 text-xs text-dim">(hidden)</span>}
                  </p>
                  <div className="flex gap-1">
                    {[
                      { icon: ArrowUp, label: "Move up", on: () => move(i, -1), disabled: i === 0 },
                      { icon: ArrowDown, label: "Move down", on: () => move(i, 1), disabled: i === items.length - 1 },
                      { icon: Copy, label: "Duplicate", on: () => update((x) => [...x.slice(0, i + 1), { ...s, data: { ...s.data }, key: Math.random().toString(36).slice(2) }, ...x.slice(i + 1)]) },
                      { icon: s.hidden ? Eye : EyeOff, label: s.hidden ? "Show" : "Hide", on: () => update((x) => x.map((y, j) => (j === i ? { ...y, hidden: !y.hidden } : y))) },
                      { icon: Trash2, label: "Delete", on: () => confirm("Delete this section?") && update((x) => x.filter((_, j) => j !== i)) },
                    ].map((b) => (
                      <button key={b.label} type="button" onClick={b.on} disabled={b.disabled} aria-label={`${b.label} section ${i + 1}`} title={b.label} className="flex size-8 items-center justify-center rounded-md border border-line text-muted hover:text-fg disabled:opacity-30">
                        <b.icon className="size-3.5" />
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {def.fields.map(([name, lbl, type]) => (
                    <label key={name} className={cn("block", type !== "text" && "sm:col-span-2")}>
                      <span className="mb-1 block text-[12.5px] font-medium text-fg">{lbl}</span>
                      {type === "text" ? (
                        <input value={s.data[name] ?? ""} onChange={(e) => update((x) => x.map((y, j) => (j === i ? { ...y, data: { ...y.data, [name]: e.target.value } } : y)))} className={input} />
                      ) : (
                        <textarea rows={type === "markdown" ? 6 : 3} value={s.data[name] ?? ""} onChange={(e) => update((x) => x.map((y, j) => (j === i ? { ...y, data: { ...y.data, [name]: e.target.value } } : y)))} className={cn(input, type === "markdown" && "font-mono text-[13px]")} />
                      )}
                    </label>
                  ))}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {dirty && <p className="border-t border-line px-4 py-2 text-xs text-amber-700">Unsaved section changes.</p>}
    </section>
  );
}
