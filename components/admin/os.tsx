import Link from "next/link";
import type { ReactNode } from "react";
import { PlugZap } from "lucide-react";
import { cn } from "@/lib/cn";
import { Badge, EmptyState, PageHeader, Pagination, TableWrap, fmtDate, inputCls, label, labelCls, td, th } from "./ui";
import { AutoSubmit } from "./client";
import { FieldError } from "./forms";

/* ───────── status tones ───────── */

type Tone = "gray" | "blue" | "green" | "amber" | "red" | "violet";
const TONES: Record<string, Tone> = {
  // generic
  DRAFT: "gray", ACTIVE: "green", INACTIVE: "gray", ARCHIVED: "gray", PENDING: "amber", CANCELLED: "gray", FAILED: "red", COMPLETED: "green", DONE: "green",
  // deals
  DISCOVERY: "blue", QUALIFICATION: "blue", SOLUTION: "violet", PROPOSAL: "violet", NEGOTIATION: "amber", CONTRACT: "amber", WON: "green", LOST: "red",
  // proposals / quotes / contracts
  INTERNAL_REVIEW: "amber", SENT: "blue", VIEWED: "violet", ACCEPTED: "green", REJECTED: "red", EXPIRED: "gray", SIGNED: "green", TERMINATED: "red", NOT_REQUESTED: "gray", DECLINED: "red", VOIDED: "gray",
  // clients / projects
  ONBOARDING: "blue", CHURNED: "red", PLANNED: "blue", ON_HOLD: "amber", GREEN: "green", AMBER: "amber", RED: "red",
  TODO: "gray", IN_PROGRESS: "blue", REVIEW: "violet", BLOCKED: "red", MISSED: "red", OPEN: "blue", RESOLVED: "green", CLOSED: "gray", PROPOSED: "blue", UNDER_REVIEW: "amber", APPROVED: "green", IMPLEMENTED: "green",
  // finance
  ISSUED: "blue", PARTIALLY_PAID: "amber", PAID: "green", VOID: "gray", OVERDUE: "red", CONFIRMED: "green", REFUNDED: "gray", PARTIALLY_REFUNDED: "amber", REQUESTED: "amber", PROCESSING: "blue", APPLIED: "green", NOT_INVOICED: "gray", INVOICED: "blue",
  // support
  WAITING_FOR_CLIENT: "amber",
  // priority
  LOW: "gray", MEDIUM: "blue", HIGH: "amber", URGENT: "red", CRITICAL: "red",
  // comms / runs / AI
  QUEUED: "gray", DELIVERED: "green", READ: "green", RECEIVED: "blue", LOGGED: "gray", SCHEDULED: "blue", PENDING_APPROVAL: "amber", RUNNING: "blue", SUCCEEDED: "green", PARTIAL: "amber", SKIPPED: "gray",
  AWAITING_APPROVAL: "amber", EXECUTED: "green", DISMISSED: "gray", ACTED: "green", OBSERVE: "gray", ASSIST: "blue", AUTONOMOUS: "violet",
  CONNECTED: "green", NOT_CONNECTED: "gray", ERROR: "red", MISSED_CALL: "red", NO_ANSWER: "amber", BUSY: "amber", RINGING: "blue", VOICEMAIL: "violet", PAUSED: "amber",
  PUBLISHED: "green", INTERNAL: "gray", CLIENT: "blue", PUBLIC: "green",
  // growth
  NOT_SUPPORTED: "gray", NOT_IMPLEMENTED: "gray", MANUAL: "blue", AUTOMATED: "violet", DISABLED: "gray",
  SALES_READY: "green", QUALIFIED: "blue", NURTURE: "amber", LOW_FIT: "gray", NEW: "blue", RESEARCHED: "violet", CONTACTED: "violet", REPLIED: "green", CONVERTED: "green", DISQUALIFIED: "gray", PUBLISHING: "blue", IN_REVIEW: "amber", STOPPED: "gray", PROSPECT: "gray", ENDED: "gray",
};

export function StatusBadge({ value, text }: { value: string | null | undefined; text?: string }) {
  if (!value) return <span className="text-dim">—</span>;
  return <Badge tone={TONES[value] ?? "gray"}>{text ?? label(value)}</Badge>;
}

/* ───────── list pages ───────── */

export type SP = Record<string, string | string[] | undefined>;
export const str = (sp: SP, k: string, max = 120) => (typeof sp[k] === "string" ? (sp[k] as string).trim().slice(0, max) : "");
export const pick = <T extends string>(sp: SP, k: string, allowed: readonly T[]): T | undefined => {
  const v = str(sp, k);
  return (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
};
export const pageOf = (sp: SP) => Math.max(1, Math.min(10_000, Number(str(sp, "page")) || 1));
export const PAGE_SIZE = 25;

export const qs = (base: Record<string, string | undefined>, patch: Record<string, string | undefined> = {}) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...base, ...patch })) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `?${s}` : "";
};

export type FilterDef =
  | { type: "search"; name: string; placeholder: string }
  | { type: "select"; name: string; label: string; options: readonly (readonly [string, string])[] }
  | { type: "date"; name: string; label: string };

export interface Column<R> {
  header: string;
  cell: (r: R) => ReactNode;
  className?: string;
}

export function FilterBar({ filters, values, hidden }: { filters: FilterDef[]; values: Record<string, string | undefined>; hidden?: Record<string, string> }) {
  const sel = "h-9 min-w-0 rounded-md border border-line-strong bg-ink-900 px-2 text-[13px] text-fg";
  return (
    <form method="get" role="search" className="mb-4 flex flex-wrap items-center gap-2">
      <AutoSubmit />
      {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {filters.map((f) =>
        f.type === "search" ? (
          <input key={f.name} name={f.name} defaultValue={values[f.name]} placeholder={f.placeholder} aria-label={f.placeholder} className={`${inputCls} w-full sm:w-64`} />
        ) : f.type === "select" ? (
          <select key={f.name} name={f.name} defaultValue={values[f.name] ?? ""} aria-label={f.label} className={sel}>
            <option value="">{f.label}</option>
            {f.options.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        ) : (
          <label key={f.name} className="flex items-center gap-1.5 text-xs text-dim">
            {f.label}
            <input type="date" name={f.name} defaultValue={values[f.name]} className={`${inputCls} w-auto px-1.5`} />
          </label>
        ),
      )}
      <button type="submit" className="btn-secondary h-9 px-3 text-[13px]">Apply</button>
      {Object.entries(values).some(([k, v]) => v && k !== "page" && k !== "view" && !(hidden && k in hidden)) && (
        <Link href="?" className="text-[13px] text-muted hover:text-fg">Clear</Link>
      )}
    </form>
  );
}

export function DataTable<R extends { id: string }>({ rows, columns }: { rows: R[]; columns: Column<R>[] }) {
  return (
    <TableWrap>
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.header} className={cn(th, c.className)}>{c.header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="hover:bg-ink-850">
            {columns.map((c) => (
              <td key={c.header} className={cn(td, c.className)}>{c.cell(r)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </TableWrap>
  );
}

export function ListView<R extends { id: string }>(p: {
  title: string;
  description?: string;
  crumbs?: { label: string; href?: string }[];
  actions?: ReactNode;
  filters?: FilterDef[];
  values: Record<string, string | undefined>;
  hidden?: Record<string, string>;
  rows: R[];
  total: number;
  page: number;
  columns: Column<R>[];
  basePath: string;
  empty: { title: string; description?: string; action?: ReactNode };
  above?: ReactNode;
  tabs?: ReactNode;
}) {
  const pages = Math.max(1, Math.ceil(p.total / PAGE_SIZE));
  const filtered = Object.entries(p.values).some(([k, v]) => v && k !== "page" && k !== "view");
  return (
    <>
      <PageHeader title={p.title} description={p.description} crumbs={p.crumbs ?? [{ label: p.title }]} actions={p.actions} />
      {p.tabs}
      {p.above}
      {p.filters && <FilterBar filters={p.filters} values={p.values} hidden={p.hidden} />}
      {p.rows.length === 0 ? (
        <div className="rounded-lg border border-line bg-ink-900">
          <EmptyState title={filtered ? "Nothing matches these filters" : p.empty.title} description={filtered ? "Try removing a filter." : p.empty.description} action={filtered ? undefined : p.empty.action} />
        </div>
      ) : (
        <>
          <DataTable rows={p.rows} columns={p.columns} />
          <Pagination page={p.page} pages={pages} total={p.total} makeHref={(n) => `${p.basePath}${qs(p.values, { page: String(n) })}`} />
        </>
      )}
    </>
  );
}

/* ───────── tabs ───────── */

export function Tabs({ items, active }: { items: { key: string; label: string; href: string; count?: number }[]; active: string }) {
  return (
    <nav aria-label="Sections" className="-mt-2 mb-5 flex gap-1 overflow-x-auto border-b border-line">
      {items.map((t) => (
        <Link key={t.key} href={t.href} aria-current={t.key === active ? "page" : undefined} className={cn("-mb-px border-b-2 px-3 py-2 text-[13px] whitespace-nowrap", t.key === active ? "border-brand-blue font-medium text-fg" : "border-transparent text-muted hover:text-fg")}>
          {t.label}
          {t.count != null && <span className="ml-1.5 rounded bg-ink-800 px-1.5 text-[11px] text-dim tabular-nums">{t.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

/* ───────── key/value ───────── */

export function KV({ items, cols = 2 }: { items: [string, ReactNode][]; cols?: 1 | 2 | 3 }) {
  return (
    <dl className={cn("grid gap-x-4 gap-y-3", cols === 1 ? "" : cols === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3")}>
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-[11px] font-medium tracking-wide text-dim uppercase">{k}</dt>
          <dd className="mt-0.5 text-sm break-words text-fg">{v === null || v === undefined || v === "" ? "—" : v}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ───────── KPIs ───────── */

export function Kpi({ label: l, value, hint, href, tone }: { label: string; value: ReactNode; hint?: ReactNode; href?: string; tone?: "red" | "amber" | "green" }) {
  const body = (
    <>
      <p className="truncate text-[11.5px] font-medium tracking-wide text-dim uppercase">{l}</p>
      <p className={cn("mt-1 truncate text-xl font-semibold tracking-tight tabular-nums", tone === "red" ? "text-red-700" : tone === "amber" ? "text-amber-700" : tone === "green" ? "text-emerald-700" : "text-fg")}>{value}</p>
      {hint && <p className="mt-0.5 truncate text-xs text-muted">{hint}</p>}
    </>
  );
  const cls = "block min-w-0 rounded-lg border border-line bg-ink-900 px-3.5 py-3";
  return href ? <Link href={href} className={cn(cls, "transition-colors hover:border-line-strong")}>{body}</Link> : <div className={cls}>{body}</div>;
}

export function KpiGrid({ children, cols = 6 }: { children: ReactNode; cols?: 3 | 4 | 5 | 6 }) {
  const c = { 3: "md:grid-cols-3", 4: "md:grid-cols-4", 5: "md:grid-cols-3 xl:grid-cols-5", 6: "md:grid-cols-3 xl:grid-cols-6" }[cols];
  return <div className={cn("grid grid-cols-2 gap-2.5", c)}>{children}</div>;
}

/* ───────── integrations ───────── */

export function NotConnected({ name, env, docs, children }: { name: string; env?: string[]; docs?: string; children?: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-dashed border-line-strong bg-ink-900 p-4">
      <PlugZap className="mt-0.5 size-5 shrink-0 text-dim" aria-hidden />
      <div className="min-w-0 text-sm">
        <p className="font-semibold text-fg">{name}: Integration not connected</p>
        <p className="mt-0.5 text-muted">
          {children ?? "Nothing is simulated — this area stays empty until the integration is configured."}
          {env && env.length > 0 && (
            <>
              {" "}Set <span className="font-mono text-[12px]">{env.join(", ")}</span> in the server environment.
            </>
          )}
          {docs && <> {docs}</>}
        </p>
      </div>
    </div>
  );
}

/* ───────── timeline ───────── */

export interface TimelineItem {
  id: string;
  at: Date;
  title: ReactNode;
  detail?: ReactNode;
  who?: string | null;
  kind?: string;
}

export function Timeline({ items, empty = "No activity yet." }: { items: TimelineItem[]; empty?: string }) {
  if (!items.length) return <p className="text-sm text-dim">{empty}</p>;
  return (
    <ol className="relative space-y-3 border-l border-line pl-4">
      {items.map((a) => (
        <li key={a.id} className="relative">
          <span aria-hidden className="absolute top-1.5 -left-[21px] size-2 rounded-full bg-brand-blue" />
          <p className="text-sm text-fg">
            {a.kind && <span className="mr-1.5 font-mono text-[10.5px] text-dim uppercase">{a.kind}</span>}
            {a.title} {a.detail && <span className="text-muted">{a.detail}</span>}
          </p>
          <p className="text-xs text-dim">
            {a.who ?? "System"} · {fmtDate(a.at, true)}
          </p>
        </li>
      ))}
    </ol>
  );
}

/* ───────── form fields (server components; errors are filled in by <ActionForm>) ───────── */

type Base = { name: string; label: string; hint?: string; required?: boolean; className?: string; id?: string };

export function TextField({ type = "text", defaultValue, placeholder, maxLength, ...b }: Base & { type?: string; defaultValue?: string | number | null; placeholder?: string; maxLength?: number }) {
  const id = b.id ?? `f-${b.name}`;
  return (
    <div className={b.className}>
      <label htmlFor={id} className={labelCls}>
        {b.label}
        {b.required && <span className="text-red-700"> *</span>}
      </label>
      <input id={id} name={b.name} type={type} defaultValue={defaultValue ?? ""} placeholder={placeholder} maxLength={maxLength} required={b.required} step={type === "number" ? "any" : undefined} className={inputCls} />
      {b.hint && <p className="mt-1 text-xs text-dim">{b.hint}</p>}
      <FieldError name={b.name} />
    </div>
  );
}

export function TextArea({ defaultValue, rows = 4, placeholder, ...b }: Base & { defaultValue?: string | null; rows?: number; placeholder?: string }) {
  const id = b.id ?? `f-${b.name}`;
  return (
    <div className={b.className}>
      <label htmlFor={id} className={labelCls}>
        {b.label}
        {b.required && <span className="text-red-700"> *</span>}
      </label>
      <textarea id={id} name={b.name} rows={rows} defaultValue={defaultValue ?? ""} placeholder={placeholder} className={`${inputCls} h-auto py-2`} />
      {b.hint && <p className="mt-1 text-xs text-dim">{b.hint}</p>}
      <FieldError name={b.name} />
    </div>
  );
}

export function SelectField({ options, defaultValue, blank, ...b }: Base & { options: readonly (readonly [string, string])[]; defaultValue?: string | null; blank?: string }) {
  const id = b.id ?? `f-${b.name}`;
  return (
    <div className={b.className}>
      <label htmlFor={id} className={labelCls}>
        {b.label}
        {b.required && <span className="text-red-700"> *</span>}
      </label>
      <select id={id} name={b.name} defaultValue={defaultValue ?? ""} className={inputCls}>
        {blank !== undefined && <option value="">{blank}</option>}
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
      {b.hint && <p className="mt-1 text-xs text-dim">{b.hint}</p>}
      <FieldError name={b.name} />
    </div>
  );
}

export function CheckField({ name, label: l, defaultChecked, hint }: { name: string; label: string; defaultChecked?: boolean; hint?: string }) {
  return (
    <label className="flex items-start gap-2 text-sm text-fg">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5 size-4 accent-[var(--color-brand-blue)]" />
      <span>
        {l}
        {hint && <span className="block text-xs text-dim">{hint}</span>}
      </span>
    </label>
  );
}

export const enumOptions = (values: readonly string[]) => values.map((v) => [v, label(v)] as const);
export const userOptions = (users: { id: string; name: string }[]) => users.map((u) => [u.id, u.name] as const);

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-fg">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export const LinkCell = ({ href, children, sub }: { href: string; children: ReactNode; sub?: ReactNode }) => (
  <div className="max-w-[280px] min-w-0">
    <Link href={href} className="block truncate font-medium text-fg hover:text-brand-blue">{children}</Link>
    {sub && <span className="block truncate text-xs text-dim">{sub}</span>}
  </div>
);
