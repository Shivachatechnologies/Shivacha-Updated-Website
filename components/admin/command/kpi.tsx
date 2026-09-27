import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/cn";

/** Tiny trend line (server-rendered SVG). The last point is marked so "now" is always visible. */
export function Sparkline({ data, className, tone = "blue", label }: { data: number[]; className?: string; tone?: "blue" | "violet" | "amber" | "red" | "green"; label: string }) {
  const W = 120;
  const H = 32;
  if (data.length < 2 || !data.some((d) => d)) {
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className={cn("h-8 w-full", className)} role="img" aria-label={`${label}: no activity in the last 12 months`}>
        <line x1="0" x2={W} y1={H - 2} y2={H - 2} stroke="currentColor" className="text-line-strong" strokeDasharray="2 3" />
      </svg>
    );
  }
  const max = Math.max(...data);
  const min = Math.min(0, ...data);
  const x = (i: number) => (i / (data.length - 1)) * (W - 4) + 2;
  const y = (v: number) => H - 3 - ((v - min) / (max - min || 1)) * (H - 8);
  const pts = data.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const color = { blue: "#0b73d9", violet: "#6d4fe0", amber: "#c27a07", red: "#d03b3b", green: "#0f8a5f" }[tone];
  const id = `spk-${label.replace(/\W+/g, "")}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={cn("h-8 w-full overflow-visible", className)} role="img" aria-label={`${label}, last 12 months: ${data.join(", ")}`}>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`M${pts[0]} L${pts.join(" L")} L${x(data.length - 1)},${H} L${x(0)},${H} Z`} fill={`url(#${id})`} />
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={x(data.length - 1)} cy={y(data[data.length - 1]!)} r="2.4" fill={color} stroke="white" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export interface KpiTileProps {
  label: string;
  icon: ReactNode;
  value: ReactNode;
  /** Percent change vs the comparison period; null = no comparison available. */
  delta: number | null;
  deltaLabel: string;
  /** "%" for relative change, " pts" for percentage-point change. */
  deltaSuffix?: string;
  /** Whether a rise is good (revenue) or bad (overdue). Neutral skips colouring. */
  polarity?: "up" | "down" | "neutral";
  spark: number[];
  sparkTone?: "blue" | "violet" | "amber" | "red" | "green";
  context: ReactNode;
  contextTone?: "neutral" | "good" | "warn" | "bad";
  href: string;
}

/** Command-center KPI: value, period comparison, trend indicator, 12-month sparkline, context line and drill-down. */
export function KpiTile({ label, icon, value, delta, deltaLabel, deltaSuffix = "%", polarity = "up", spark, sparkTone = "blue", context, contextTone = "neutral", href }: KpiTileProps) {
  const dir = delta == null || delta === 0 ? 0 : delta > 0 ? 1 : -1;
  const good = polarity === "neutral" || dir === 0 ? null : (dir > 0) === (polarity === "up");
  const Arrow = dir > 0 ? ArrowUpRight : dir < 0 ? ArrowDownRight : ArrowRight;
  return (
    <Link href={href} className="group relative flex min-w-0 flex-col overflow-hidden rounded-lg border border-line bg-ink-900 px-3.5 pt-3 pb-2.5 shadow-[0_1px_2px_rgb(11_20_36/0.04)] transition-[border-color,box-shadow] hover:border-brand-blue/40 hover:shadow-[0_10px_28px_-18px_rgb(1_104_179/0.55)]">
      <div className="flex items-center gap-2">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-ink-850 text-muted ring-1 ring-line group-hover:text-brand-blue">{icon}</span>
        <p className="min-w-0 truncate font-mono text-[10.5px] font-medium tracking-[0.1em] text-dim uppercase">{label}</p>
        <ArrowUpRight className="ml-auto size-3.5 shrink-0 text-dim opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
      </div>
      <p className="mt-2 truncate text-[22px] leading-none font-semibold tracking-[-0.02em] text-fg tabular-nums">{value}</p>
      <div className="mt-1.5 flex min-w-0 items-center gap-1.5 text-[11.5px]">
        {delta == null ? (
          <span className="truncate text-dim">{deltaLabel}</span>
        ) : (
          <>
            <span className={cn("inline-flex shrink-0 items-center gap-0.5 rounded px-1 font-medium tabular-nums", good == null ? "bg-ink-850 text-muted" : good ? "bg-emerald-500/10 text-emerald-700" : "bg-red-500/10 text-red-700")}>
              <Arrow className="size-3" aria-hidden />
              {Math.abs(delta)}{deltaSuffix}
            </span>
            <span className="truncate text-dim">{deltaLabel}</span>
          </>
        )}
      </div>
      <Sparkline data={spark} tone={sparkTone} label={label} className="mt-2" />
      <p className={cn("mt-1.5 truncate border-t border-line pt-1.5 text-[11.5px]", contextTone === "bad" ? "text-red-700" : contextTone === "warn" ? "text-amber-700" : contextTone === "good" ? "text-emerald-700" : "text-muted")}>{context}</p>
    </Link>
  );
}
