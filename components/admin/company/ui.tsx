import Link from "next/link";
import type { ReactNode } from "react";
import { Tabs } from "@/components/admin/os";
import { cn } from "@/lib/cn";

const ITEMS = [
  ["command", "Command Center", "/admin/company"],
  ["objectives", "Objectives", "/admin/company/objectives"],
  ["org", "Organization", "/admin/company/org"],
  ["briefing", "CEO Briefing", "/admin/company/briefing"],
  ["performance", "Performance", "/admin/company/performance"],
  ["tasks", "Tasks", "/admin/ai/tasks"],
  ["approvals", "Approvals", "/admin/ai/approvals"],
  ["settings", "Settings", "/admin/company/settings"],
] as const;

export function CompanyTabs({ active }: { active: (typeof ITEMS)[number][0] }) {
  return <Tabs active={active} items={ITEMS.map(([k, l, href]) => ({ key: k, label: l, href }))} />;
}

export const COMPANY_CRUMB = { label: "AI Company", href: "/admin/company" };

export function Meter({ pct, tone = "blue" }: { pct: number; tone?: "blue" | "green" | "amber" | "red" }) {
  const bar = { blue: "bg-brand-blue", green: "bg-emerald-500", amber: "bg-amber-500", red: "bg-red-500" }[tone];
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-800" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full", bar)} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

/** REAL / ESTIMATED / MANUAL / UNAVAILABLE marker next to a number. */
export function Nature({ value }: { value: "REAL" | "ESTIMATED" | "MANUAL" | "UNAVAILABLE" }) {
  const cls = { REAL: "text-emerald-700 border-emerald-500/30", ESTIMATED: "text-amber-700 border-amber-500/30", MANUAL: "text-sky-700 border-sky-500/30", UNAVAILABLE: "text-dim border-line" }[value];
  return <span className={cn("rounded border px-1 py-px font-mono text-[9.5px] tracking-wide", cls)}>{value}</span>;
}

export function Card({ title, href, children, action, className }: { title: ReactNode; href?: string; children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <section className={cn("min-w-0 rounded-lg border border-line bg-ink-900 p-4", className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-fg">{href ? <Link href={href} className="hover:underline">{title}</Link> : title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
