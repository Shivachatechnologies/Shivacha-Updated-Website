import type { ReactNode } from "react";
import { Breadcrumbs, type Crumb } from "@/components/ui/Breadcrumbs";
import { cn } from "@/lib/cn";

export function PageHero({
  crumbs,
  eyebrow,
  title,
  lede,
  children,
  aside,
  accent = "#0195ff",
  footer,
}: {
  crumbs: Crumb[];
  eyebrow?: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  children?: ReactNode;
  aside?: ReactNode;
  accent?: string;
  /** Optional strip rendered under the hero (e.g. quick facts). */
  footer?: ReactNode;
}) {
  return (
    <header className="relative overflow-hidden pt-28 pb-14 sm:pt-32 sm:pb-16 lg:pt-36">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[480px] opacity-[0.16]"
        style={{ background: `radial-gradient(55% 70% at 75% 0%, ${accent}, transparent 70%)` }}
      />
      <div className="container-x relative">
        <Breadcrumbs items={crumbs} />
        <div className={cn("grid gap-10 lg:gap-14", !!aside && "lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:items-center")}>
          <div>
            {eyebrow && <div className="mb-5">{eyebrow}</div>}
            <h1 className="h-page text-fg">{title}</h1>
            {lede && <p className="lede mt-5 max-w-2xl">{lede}</p>}
            {children && <div className="mt-8 flex flex-wrap gap-3">{children}</div>}
          </div>
          {aside && <div className="relative min-w-0">{aside}</div>}
        </div>
        {footer && <div className="mt-12">{footer}</div>}
      </div>
    </header>
  );
}

/** Horizontal strip of key facts shown under a hero. */
export function FactStrip({ items }: { items: { icon: ReactNode; label: string; value: ReactNode }[] }) {
  return (
    <ul className="grid overflow-hidden rounded-2xl border border-line bg-ink-900 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-3.5 border-line p-5 not-last:border-b sm:not-last:border-r lg:not-last:border-b-0">
          <span className="icon-tile size-10">{it.icon}</span>
          <div className="min-w-0">
            <p className="text-xs text-dim">{it.label}</p>
            <p className="mt-0.5 text-sm leading-snug font-semibold text-balance break-words text-fg">{it.value}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
