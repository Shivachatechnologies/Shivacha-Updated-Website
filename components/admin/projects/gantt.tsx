import Link from "next/link";
import { cn } from "@/lib/cn";

export interface GanttRow {
  id: string;
  label: string;
  href?: string;
  start: Date | null;
  end: Date | null;
  kind: "project" | "milestone" | "task";
  status: string;
}

const DAY = 86400_000;

/** Server-rendered timeline: bars for dated items, diamonds for milestones, a "today" marker. */
export function Gantt({ rows, now = new Date() }: { rows: GanttRow[]; now?: Date }) {
  const dated = rows.filter((r) => r.start || r.end);
  if (!dated.length) return <p className="py-6 text-center text-sm text-dim">Add start and due dates to tasks and milestones to see the timeline.</p>;
  const times = dated.flatMap((r) => [r.start, r.end].filter(Boolean).map((d) => d!.getTime()));
  const min = Math.min(...times, now.getTime()) - 3 * DAY;
  const max = Math.max(...times, now.getTime()) + 3 * DAY;
  const span = max - min;
  const pct = (t: number) => ((t - min) / span) * 100;
  const months: { label: string; left: number }[] = [];
  const d = new Date(min);
  d.setUTCDate(1);
  for (let m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)); m.getTime() < max; m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1))) months.push({ label: m.toISOString().slice(0, 7), left: pct(m.getTime()) });
  const tone = (s: string) => (s === "DONE" || s === "COMPLETED" ? "bg-emerald-500/70" : s === "BLOCKED" || s === "MISSED" ? "bg-red-500/70" : s === "IN_PROGRESS" || s === "ACTIVE" ? "bg-brand-blue/80" : "bg-ink-700");
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[760px]">
        <div className="relative ml-56 h-6 border-b border-line text-[10.5px] text-dim">
          {months.map((m) => <span key={m.label} className="absolute top-1 -translate-x-1/2 font-mono" style={{ left: `${m.left}%` }}>{m.label}</span>)}
        </div>
        <ul className="relative">
          <span aria-hidden className="pointer-events-none absolute top-0 bottom-0 z-10 w-px bg-red-500/60" style={{ left: `calc(14rem + (100% - 14rem) * ${pct(now.getTime()) / 100})` }} />
          {dated.map((r) => {
            const s = (r.start ?? r.end)!.getTime();
            const e = (r.end ?? r.start)!.getTime();
            const late = r.end && r.end < now && !["DONE", "COMPLETED"].includes(r.status);
            return (
              <li key={r.id} className="flex h-8 items-center border-b border-line/60">
                <span className="w-56 shrink-0 truncate pr-3 text-[12.5px] text-fg">
                  {r.href ? <Link href={r.href} className="hover:text-brand-blue">{r.label}</Link> : r.label}
                </span>
                <span className="relative h-full flex-1">
                  {r.kind === "milestone" ? (
                    <span title={`${r.label} · ${r.end?.toISOString().slice(0, 10)}`} className={cn("absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rotate-45", late ? "bg-red-600" : tone(r.status))} style={{ left: `${pct(e)}%` }} />
                  ) : (
                    <span title={`${r.label} · ${r.start?.toISOString().slice(0, 10) ?? "?"} → ${r.end?.toISOString().slice(0, 10) ?? "?"}`} className={cn("absolute top-1/2 h-3.5 -translate-y-1/2 rounded-sm", late ? "bg-red-500/70" : tone(r.status), r.kind === "project" && "h-4 opacity-60")} style={{ left: `${pct(s)}%`, width: `${Math.max(0.6, pct(e + DAY) - pct(s))}%` }} />
                  )}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-[11px] text-dim">Red line = today. Red bars/diamonds are past due.</p>
      </div>
    </div>
  );
}
