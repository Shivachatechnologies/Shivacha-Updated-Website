import Link from "next/link";
import { ChevronRight } from "lucide-react";

export interface FunnelStage {
  key: string;
  label: string;
  href: string;
  count: number;
  value: number;
}

const SHADES = ["#0b73d9", "#1f68d1", "#3a5cc9", "#5451c0", "#1b8f63"];
const compact = (n: number) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);

/**
 * Leads → Qualified → Proposal → Negotiation → Won. Each stage counts leads that reached at least that stage
 * (from their current status); conversion is stage-over-previous-stage. Bars are centred to read as a funnel.
 */
export function PipelineFunnel({ stages, query }: { stages: FunnelStage[]; query: string }) {
  const top = Math.max(1, stages[0]?.count ?? 0);
  const overall = stages[0]?.count ? Math.round(((stages[stages.length - 1]?.count ?? 0) / stages[0].count) * 1000) / 10 : null;
  return (
    <div>
      <ol className="space-y-1.5">
        {stages.map((s, i) => {
          const prev = i > 0 ? stages[i - 1]!.count : null;
          const conv = prev ? Math.round((s.count / prev) * 1000) / 10 : null;
          const w = Math.max(6, (s.count / top) * 100);
          const href = `${s.href}${s.href.includes("?") ? "&" : "?"}${query}`.replace(/[?&]$/, "");
          return (
            <li key={s.key}>
              <Link href={href} className="group grid grid-cols-[88px_minmax(0,1fr)_76px] items-center gap-3 rounded-md px-1 py-1 transition-colors hover:bg-ink-850" title={`${s.label}: ${s.count.toLocaleString()} leads${conv != null ? ` · ${conv}% from ${stages[i - 1]!.label}` : ""}${s.value ? ` · est. ${compact(s.value)}` : ""}`}>
                <span className="truncate text-[12.5px] font-medium text-fg">{s.label}</span>
                <span className="relative flex h-8 items-center justify-center">
                  <span className="absolute inset-y-0 rounded-[4px] transition-[filter] group-hover:brightness-110" style={{ width: `${w}%`, background: SHADES[i] ?? SHADES[0], opacity: 0.92 }} />
                  <span className="relative font-mono text-[12px] font-semibold text-white tabular-nums drop-shadow-[0_1px_1px_rgb(0_0_0/0.25)]">{s.count.toLocaleString()}</span>
                </span>
                <span className="flex items-center justify-end gap-1 text-right">
                  {conv != null ? <span className="font-mono text-[11.5px] text-muted tabular-nums">{conv}%</span> : <span className="font-mono text-[11px] text-dim">entry</span>}
                  <ChevronRight className="size-3.5 text-dim opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3 text-[11.5px]">
        <div>
          <p className="text-dim">Lead → Won</p>
          <p className="mt-0.5 font-mono text-sm font-semibold text-fg tabular-nums">{overall != null ? `${overall}%` : "—"}</p>
        </div>
        <div>
          <p className="text-dim">Est. value in funnel</p>
          <p className="mt-0.5 font-mono text-sm font-semibold text-fg tabular-nums">{stages[0]?.value ? compact(stages[0].value) : "—"}</p>
        </div>
        <div>
          <p className="text-dim">Est. value won</p>
          <p className="mt-0.5 font-mono text-sm font-semibold text-fg tabular-nums">{stages[stages.length - 1]?.value ? compact(stages[stages.length - 1]!.value) : "—"}</p>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-dim">Stage counts use each lead&apos;s current status; values are the leads&apos; estimated values where recorded (no currency).</p>
    </div>
  );
}

export interface DealStageRow {
  stage: string;
  count: number;
  values: { currency: string; amount: number }[];
}

const money = (v: number, cur: string) => {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: cur, notation: "compact", maximumFractionDigits: 1 }).format(v);
  } catch {
    return `${cur} ${compact(v)}`;
  }
};

/** Open deals per stage as a segmented bar plus a compact legend table. */
export function DealStageBar({ rows }: { rows: DealStageRow[] }) {
  const total = rows.reduce((n, r) => n + r.count, 0);
  const shades = ["#9cc8f2", "#6aaeee", "#3d93e3", "#1a78d3", "#5451c0", "#3b3aa6"];
  if (!total) return <p className="text-sm text-dim">No open deals.</p>;
  return (
    <div>
      <div className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full">
        {rows.filter((r) => r.count).map((r) => (
          <Link key={r.stage} href={`/admin/deals?stage=${r.stage}`} title={`${r.stage.toLowerCase()}: ${r.count}`} style={{ flexGrow: r.count, background: shades[rows.indexOf(r)] }} className="h-full hover:opacity-80" />
        ))}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px] sm:grid-cols-3">
        {rows.map((r, i) => (
          <li key={r.stage}>
            <Link href={`/admin/deals?stage=${r.stage}`} className="flex items-center gap-1.5 hover:text-fg">
              <span className="size-2 shrink-0 rounded-[2px]" style={{ background: shades[i] }} />
              <span className="truncate text-muted capitalize">{r.stage.toLowerCase()}</span>
              <span className="ml-auto font-mono text-fg tabular-nums">{r.count}</span>
            </Link>
            <p className="truncate pl-3.5 font-mono text-[10.5px] text-dim tabular-nums">{r.values.length ? r.values.map((v) => money(v.amount, v.currency)).join(" · ") : "—"}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
