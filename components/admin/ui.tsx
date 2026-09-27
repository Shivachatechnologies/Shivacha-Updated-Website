import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import { cn } from "@/lib/cn";

export function PageHeader({ title, description, crumbs = [], actions }: { title: string; description?: string; crumbs?: { label: string; href?: string }[]; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {crumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="mb-2 flex flex-wrap items-center gap-1.5 text-xs text-dim">
            <Link href="/admin/dashboard" className="hover:text-fg">
              Admin
            </Link>
            {crumbs.map((c) => (
              <span key={c.label} className="flex items-center gap-1.5">
                <span aria-hidden>/</span>
                {c.href ? (
                  <Link href={c.href} className="hover:text-fg">
                    {c.label}
                  </Link>
                ) : (
                  <span className="text-muted">{c.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
        <h1 className="truncate text-2xl font-semibold tracking-[-0.02em] text-fg">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, action, children, className, bodyClassName }: { title?: string; action?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={cn("min-w-0 rounded-lg border border-line bg-ink-900", className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          {title && <h2 className="text-sm font-semibold text-fg">{title}</h2>}
          {action}
        </div>
      )}
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

const tones: Record<string, string> = {
  gray: "bg-ink-800 text-muted",
  blue: "bg-brand-blue/10 text-brand-blue",
  green: "bg-emerald-500/12 text-emerald-700",
  amber: "bg-amber-500/15 text-amber-700",
  red: "bg-red-500/12 text-red-700",
  violet: "bg-indigo-500/12 text-indigo-700",
};

export function Badge({ tone = "gray", children, className }: { tone?: keyof typeof tones; children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center rounded-md px-1.5 py-0.5 text-[11.5px] font-medium whitespace-nowrap", tones[tone], className)}>{children}</span>;
}

export const LEAD_STATUS_TONE: Record<string, keyof typeof tones> = { NEW: "blue", CONTACTED: "violet", QUALIFIED: "amber", MEETING: "violet", PROPOSAL_SENT: "amber", NEGOTIATION: "amber", WON: "green", LOST: "red", ON_HOLD: "gray" };
export const PRIORITY_TONE: Record<string, keyof typeof tones> = { LOW: "gray", MEDIUM: "blue", HIGH: "amber", URGENT: "red" };
export const CONTENT_TONE: Record<string, keyof typeof tones> = { DRAFT: "gray", PUBLISHED: "green", ARCHIVED: "red" };

export const label = (v: string) => v.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <span className="flex size-10 items-center justify-center rounded-lg border border-line text-dim">
        <Inbox className="size-5" aria-hidden />
      </span>
      <p className="mt-3 text-sm font-semibold text-fg">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Responsive table wrapper: scrolls horizontally inside its own box on small screens (never the page). */
export function TableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-ink-900">
      <table className="w-full min-w-[640px] text-left text-sm">{children}</table>
    </div>
  );
}
export const th = "border-b border-line bg-ink-850 px-3 py-2.5 text-[11.5px] font-semibold tracking-wide text-dim uppercase whitespace-nowrap";
export const td = "border-b border-line px-3 py-2.5 align-middle text-fg";

export function Pagination({ page, pages, total, makeHref }: { page: number; pages: number; total: number; makeHref: (p: number) => string }) {
  if (pages <= 1) return <p className="mt-3 text-xs text-dim">{total.toLocaleString()} result{total === 1 ? "" : "s"}</p>;
  return (
    <div className="mt-3 flex items-center justify-between gap-3 text-sm">
      <p className="text-xs text-dim">
        {total.toLocaleString()} results · page {page} of {pages}
      </p>
      <div className="flex gap-1.5">
        <Link aria-disabled={page <= 1} href={makeHref(Math.max(1, page - 1))} className={cn("btn-secondary h-8 px-2.5", page <= 1 && "pointer-events-none opacity-40")} aria-label="Previous page">
          <ChevronLeft className="size-4" />
        </Link>
        <Link aria-disabled={page >= pages} href={makeHref(Math.min(pages, page + 1))} className={cn("btn-secondary h-8 px-2.5", page >= pages && "pointer-events-none opacity-40")} aria-label="Next page">
          <ChevronRight className="size-4" />
        </Link>
      </div>
    </div>
  );
}

export function Stat({ label: l, value, hint, href }: { label: string; value: ReactNode; hint?: string; href?: string }) {
  const body = (
    <>
      <p className="text-[12px] font-medium text-dim">{l}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-fg tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </>
  );
  return href ? (
    <Link href={href} className="block rounded-lg border border-line bg-ink-900 p-4 transition-colors hover:border-line-strong">
      {body}
    </Link>
  ) : (
    <div className="rounded-lg border border-line bg-ink-900 p-4">{body}</div>
  );
}

export const inputCls = "h-9 w-full rounded-md border border-line-strong bg-ink-900 px-2.5 text-sm text-fg placeholder:text-dim focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20";
export const labelCls = "mb-1 block text-[12.5px] font-medium text-fg";

export const fmtDate = (d: Date | string | null | undefined, withTime = false) =>
  d ? new Intl.DateTimeFormat("en-GB", withTime ? { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" } : { dateStyle: "medium", timeZone: "UTC" }).format(new Date(d)) + (withTime ? " UTC" : "") : "—";
