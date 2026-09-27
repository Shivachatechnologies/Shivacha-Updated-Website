import Link from "next/link";
import { Download } from "lucide-react";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { LEAD_PRIORITIES, LEAD_STATUSES, filtersToQuery, leadFilterOptions, listLeads, type LeadFilters } from "@/lib/admin/leads";
import { bulkLeadsAction } from "@/lib/admin/lead-actions";
import { Badge, EmptyState, LEAD_STATUS_TONE, PRIORITY_TONE, PageHeader, Pagination, TableWrap, fmtDate, inputCls, label, td, th } from "@/components/admin/ui";
import { AutoSubmit } from "@/components/admin/client";
import { ActionForm, BulkControls, SelectAll } from "@/components/admin/forms";
import { db } from "@/lib/db/client";
import { deleteViewAction, saveViewAction } from "@/lib/crm/actions";
import { LIFECYCLE_STAGES } from "@/lib/crm/constants";
import { getFlags } from "@/lib/os/flags";

export const metadata = { title: "Leads" };

const KEYS = ["q", "status", "priority", "country", "service", "product", "source", "assigned", "from", "to", "archived", "sort", "page", "lifecycle", "tag"] as const;

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePermission("leads:view");
  const sp = await searchParams;
  const f: LeadFilters = Object.fromEntries(KEYS.map((k) => [k, typeof sp[k] === "string" ? (sp[k] as string) : undefined]).filter(([, v]) => v));
  const [{ rows, total, page, pages }, opts, views, flags] = await Promise.all([
    listLeads(f),
    leadFilterOptions(),
    db.savedView.findMany({ where: { module: "leads", OR: [{ userId: user.id }, { shared: true }] }, orderBy: { name: "asc" }, take: 40 }),
    getFlags(),
  ]);
  const currentQuery = filtersToQuery(f, { page: undefined });
  const caps = { edit: can(user.role, "leads:edit"), assign: can(user.role, "leads:assign"), archive: can(user.role, "leads:archive"), export: can(user.role, "leads:export") };
  const bulk = caps.edit || caps.assign || caps.archive;
  const archived = f.archived === "1";
  const sel = "h-9 rounded-md border border-line-strong bg-ink-900 px-2 text-[13px] text-fg min-w-0";
  const filtered = KEYS.some((k) => k !== "page" && k !== "sort" && f[k]);

  return (
    <>
      <PageHeader
        title={archived ? "Archived leads" : "Leads"}
        description="Every enquiry from the website's contact, project, demo and estimator forms."
        crumbs={[{ label: "Leads" }]}
        actions={
          <>
            {flags.ADVANCED_CRM && (
              <Link href="/admin/crm/pipeline" className="btn-secondary h-9 px-3 text-[13px]">Pipeline</Link>
            )}
            <Link href={archived ? "/admin/leads" : "/admin/leads?archived=1"} className="btn-secondary h-9 px-3 text-[13px]">
              {archived ? "Active leads" : "Archived"}
            </Link>
            {caps.export && (
              <a href={`/admin/leads/export?${filtersToQuery(f, { page: undefined })}`} className="btn-primary h-9 px-3.5 text-[13px]" data-testid="export-csv">
                <Download className="size-4" aria-hidden /> Export CSV
              </a>
            )}
            {can(user.role, "leads:create") && (
              <Link href="/admin/leads/new" className="btn-primary h-9 px-3.5 text-[13px]">New lead</Link>
            )}
          </>
        }
      />

      {flags.ADVANCED_CRM && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5" aria-label="Saved views">
          <span className="text-xs text-dim">Views:</span>
          {views.length === 0 && <span className="text-xs text-dim">none yet</span>}
          {views.map((v) => (
            <span key={v.id} className={`inline-flex items-center overflow-hidden rounded-md border text-[12.5px] ${v.query === currentQuery ? "border-brand-blue text-fg" : "border-line text-muted"}`}>
              <Link href={`/admin/leads?${v.query}`} className="px-2 py-1 hover:text-fg">{v.name}{v.shared ? " · shared" : ""}</Link>
              {v.userId === user.id && (
                <form action={deleteViewAction.bind(null, v.id)}>
                  <button type="submit" aria-label={`Delete view ${v.name}`} className="border-l border-line px-1.5 py-1 text-dim hover:text-red-700">×</button>
                </form>
              )}
            </span>
          ))}
          {currentQuery && (
            <ActionForm action={saveViewAction} className="flex items-center gap-1.5" resetOnOk>
              <input type="hidden" name="query" value={currentQuery} />
              <input name="name" required maxLength={60} placeholder="Save current filters as…" aria-label="View name" className="h-7 w-44 rounded-md border border-line-strong bg-ink-900 px-2 text-[12.5px]" />
              <label className="flex items-center gap-1 text-xs text-dim"><input type="checkbox" name="shared" className="size-3.5" /> shared</label>
              <button type="submit" className="btn-secondary h-7 px-2 text-xs">Save view</button>
            </ActionForm>
          )}
        </div>
      )}
      <form method="get" className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" role="search" aria-label="Filter leads">
        <AutoSubmit />
        {archived && <input type="hidden" name="archived" value="1" />}
        <input name="q" defaultValue={f.q} placeholder="Search name, email, company, ref…" aria-label="Search leads" className={`${inputCls} col-span-2 sm:col-span-3 lg:col-span-2`} />
        <select name="status" defaultValue={f.status ?? ""} aria-label="Status" className={sel}>
          <option value="">All statuses</option>
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>{label(s)}</option>
          ))}
        </select>
        <select name="priority" defaultValue={f.priority ?? ""} aria-label="Priority" className={sel}>
          <option value="">All priorities</option>
          {LEAD_PRIORITIES.map((s) => (
            <option key={s} value={s}>{label(s)}</option>
          ))}
        </select>
        <select name="assigned" defaultValue={f.assigned ?? ""} aria-label="Assigned to" className={sel}>
          <option value="">Anyone</option>
          <option value="unassigned">Unassigned</option>
          {opts.users.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
        <select name="lifecycle" defaultValue={f.lifecycle ?? ""} aria-label="Lifecycle stage" className={sel}>
          <option value="">All lifecycle stages</option>
          {LIFECYCLE_STAGES.map((s) => (
            <option key={s} value={s}>{label(s)}</option>
          ))}
        </select>
        <input name="tag" defaultValue={f.tag} placeholder="Tag" aria-label="Tag" className={`${inputCls} min-w-0`} />
        <select name="sort" defaultValue={f.sort ?? "newest"} aria-label="Sort" className={sel}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="name">Name A–Z</option>
          <option value="score">Highest score</option>
          <option value="priority">Priority</option>
          <option value="followup">Next follow-up</option>
        </select>
        {(
          [
            ["country", "All countries", opts.countries],
            ["service", "All services", opts.services],
            ["product", "All products", opts.products],
            ["source", "All sources", opts.sources],
          ] as const
        ).map(([name, all, list]) => (
          <select key={name} name={name} defaultValue={f[name] ?? ""} aria-label={label(name)} className={sel}>
            <option value="">{all}</option>
            {list.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        ))}
        <label className="flex min-w-0 items-center gap-1.5 text-xs text-dim">
          From <input type="date" name="from" defaultValue={f.from} className={`${inputCls} min-w-0 px-1.5`} />
        </label>
        <label className="flex min-w-0 items-center gap-1.5 text-xs text-dim">
          To <input type="date" name="to" defaultValue={f.to} className={`${inputCls} min-w-0 px-1.5`} />
        </label>
        <div className="col-span-2 flex items-center gap-2 sm:col-span-1 lg:col-span-4">
          <button type="submit" className="btn-secondary h-9 px-3 text-[13px]">Search</button>
          {filtered && (
            <Link href={archived ? "/admin/leads?archived=1" : "/admin/leads"} className="text-[13px] text-muted hover:text-fg">
              Clear filters
            </Link>
          )}
        </div>
      </form>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-line bg-ink-900">
          <EmptyState title={filtered ? "No leads match these filters" : archived ? "No archived leads" : "No leads yet"} description={filtered ? "Try removing a filter or widening the date range." : "Enquiries submitted through the website forms appear here automatically."} />
        </div>
      ) : (
        <>
          {bulk && (
            <ActionForm id="bulk" action={bulkLeadsAction} className="mb-2">
              <BulkControls statuses={LEAD_STATUSES} priorities={LEAD_PRIORITIES} users={opts.users} canAssign={caps.assign} canArchive={caps.archive} canEdit={caps.edit} archived={archived} />
            </ActionForm>
          )}
          <TableWrap>
            <thead>
              <tr>
                {bulk && (
                  <th className={`${th} w-8`}>
                    <SelectAll form="bulk" />
                  </th>
                )}
                <th className={th}>Lead</th>
                <th className={th}>Interest</th>
                <th className={th}>Country</th>
                <th className={th}>Budget</th>
                <th className={th}>Source</th>
                <th className={th}>Status</th>
                <th className={th}>Priority</th>
                <th className={th}>Owner</th>
                <th className={th}>Received</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id} className="hover:bg-ink-850">
                  {bulk && (
                    <td className={td}>
                      <input type="checkbox" name="ids" value={l.id} form="bulk" aria-label={`Select ${l.name}`} className="size-4 accent-[var(--color-brand-blue)]" />
                    </td>
                  )}
                  <td className={`${td} max-w-[240px]`}>
                    <Link href={`/admin/leads/${l.id}`} className="block truncate font-medium text-fg hover:text-brand-blue">
                      {l.name}
                    </Link>
                    <span className="block truncate text-xs text-dim">{[l.company, l.email].filter(Boolean).join(" · ")}</span>
                  </td>
                  <td className={`${td} max-w-[200px] truncate text-muted`}>{l.product ?? l.service ?? "—"}</td>
                  <td className={`${td} text-muted`}>{l.country ?? "—"}</td>
                  <td className={`${td} whitespace-nowrap text-muted`}>{l.budget ?? "—"}</td>
                  <td className={`${td} max-w-[140px] truncate text-muted`}>{l.source ?? "—"}</td>
                  <td className={td}>
                    <Badge tone={LEAD_STATUS_TONE[l.status]}>{label(l.status)}</Badge>
                  </td>
                  <td className={td}>
                    <Badge tone={PRIORITY_TONE[l.priority]}>{label(l.priority)}</Badge>
                  </td>
                  <td className={`${td} whitespace-nowrap text-muted`}>{l.assignedTo?.name ?? "—"}</td>
                  <td className={`${td} whitespace-nowrap text-muted`}>{fmtDate(l.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
          <Pagination page={page} pages={pages} total={total} makeHref={(p) => `/admin/leads?${filtersToQuery(f, { page: String(p) })}`} />
        </>
      )}
    </>
  );
}
