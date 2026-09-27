import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, Plus } from "lucide-react";
import { db } from "@/lib/db/client";
import { requirePermission } from "@/lib/auth/session";
import { RESOURCES, toFormValue, type Field, type Resource, type ResourceKey } from "@/lib/admin/resources";
import { deleteResourceAction, duplicateResourceAction, saveResourceAction, setResourceStatusAction } from "@/lib/admin/resource-actions";
import { Badge, CONTENT_TONE, EmptyState, PageHeader, Pagination, Panel, TableWrap, fmtDate, inputCls, label, labelCls, td, th } from "./ui";
import { AutoSubmit, ConfirmButton, SubmitButton } from "./client";
import { ActionForm, FieldError } from "./forms";

type Row = Record<string, unknown> & { id: string };
type ListDelegate = { count: (a: object) => Promise<number>; findMany: (a: object) => Promise<Row[]>; findUnique: (a: object) => Promise<Row | null> };
const delegate = (r: Resource) => (db as unknown as Record<string, ListDelegate>)[r.model];
const PAGE = 25;

export async function ResourceListPage({ k, searchParams }: { k: ResourceKey; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const r = RESOURCES[k];
  await requirePermission(r.permission);
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const status = typeof sp.status === "string" && ["DRAFT", "PUBLISHED", "ARCHIVED"].includes(sp.status) ? sp.status : "";
  const page = Math.max(1, Math.min(1000, Number(sp.page) || 1));
  const where = { ...(q && { OR: [{ [r.titleField]: { contains: q, mode: "insensitive" } }, ...(r.slug ? [{ slug: { contains: q.toLowerCase() } }] : [])] }), ...(status && { status }) };
  const model = delegate(r);
  const orderBy = r.sortable ? [{ sortOrder: "asc" }, { updatedAt: "desc" }] : [{ updatedAt: "desc" }];
  const [total, rows] = await Promise.all([model.count({ where }), model.findMany({ where, orderBy, skip: (page - 1) * PAGE, take: PAGE })]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const optionLabel = (field: string, v: unknown) => r.fields.find((f) => f.name === field)?.options?.find(([o]) => o === v)?.[1] ?? String(v ?? "—");
  const qs = (p: number) => new URLSearchParams({ ...(q && { q }), ...(status && { status }), page: String(p) }).toString();

  return (
    <>
      <PageHeader
        title={r.title}
        description={r.description}
        crumbs={[{ label: r.title }]}
        actions={
          <Link href={`/admin/${r.key}/new`} className="btn-primary h-9 px-3.5 text-[13px]">
            <Plus className="size-4" aria-hidden /> New {r.singular.toLowerCase()}
          </Link>
        }
      />
      <form method="get" role="search" className="mb-4 flex flex-wrap gap-2">
        <AutoSubmit />
        <input name="q" defaultValue={q} placeholder={`Search ${r.title.toLowerCase()}…`} aria-label={`Search ${r.title}`} className={`${inputCls} max-w-xs`} />
        {r.status && (
          <select name="status" defaultValue={status} aria-label="Status" className="h-9 rounded-md border border-line-strong bg-ink-900 px-2 text-[13px] text-fg">
            <option value="">All statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="PUBLISHED">Published</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        )}
        <button type="submit" className="btn-secondary h-9 px-3 text-[13px]">Search</button>
      </form>
      {rows.length === 0 ? (
        <div className="rounded-lg border border-line bg-ink-900">
          <EmptyState
            title={q || status ? "Nothing matches" : `No ${r.title.toLowerCase()} in the CMS yet`}
            description={q || status ? "Try a different search." : r.key === "services" || r.key === "products" || r.key === "blog" ? "The website currently shows its built-in content. Add an entry here to override it or create a new page, or run npm run db:import to copy the built-in content into the CMS." : undefined}
            action={<Link href={`/admin/${r.key}/new`} className="btn-secondary h-9 px-3 text-[13px]">Create the first one</Link>}
          />
        </div>
      ) : (
        <>
          <TableWrap>
            <thead>
              <tr>
                <th className={th}>{label(r.titleField)}</th>
                {r.columns.map((c) => (
                  <th key={c.field} className={th}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-ink-850">
                  <td className={`${td} max-w-[360px]`}>
                    <Link href={`/admin/${r.key}/${row.id}`} className="block truncate font-medium text-fg hover:text-brand-blue">
                      {String(row[r.titleField] ?? "Untitled")}
                    </Link>
                    {r.slug && <span className="block truncate font-mono text-[11.5px] text-dim">{r.publicPath ? r.publicPath(String(row.slug)) : String(row.slug)}</span>}
                  </td>
                  {r.columns.map((c) => (
                    <td key={c.field} className={`${td} whitespace-nowrap text-muted`}>
                      {c.format === "badge" ? <Badge tone={CONTENT_TONE[String(row[c.field])]}>{label(String(row[c.field]))}</Badge> : c.format === "date" ? fmtDate(row[c.field] as Date) : c.format === "option" ? optionLabel(c.field, row[c.field]) : String(row[c.field] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </TableWrap>
          <Pagination page={page} pages={pages} total={total} makeHref={(p) => `/admin/${r.key}?${qs(p)}`} />
        </>
      )}
    </>
  );
}

function FieldControl({ f, value }: { f: Field; value: string }) {
  const id = `f-${f.name}`;
  const common = { id, name: f.name, defaultValue: value, "aria-describedby": f.help ? `${id}-help` : undefined };
  let control;
  if (f.type === "select")
    control = (
      <select {...common} className={inputCls} required={f.required}>
        {!f.required && <option value="">—</option>}
        {f.options?.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    );
  else if (["textarea", "markdown", "list", "pairs", "faqs"].includes(f.type))
    control = <textarea {...common} rows={f.type === "markdown" ? 12 : f.type === "textarea" ? 3 : 5} className={`${inputCls} h-auto py-2 ${f.type === "markdown" || f.type === "pairs" || f.type === "faqs" ? "font-mono text-[13px]" : ""}`} />;
  else control = <input {...common} type={f.type === "number" ? "number" : f.type === "datetime" ? "datetime-local" : f.type === "url" ? "text" : "text"} list={f.type === "image" ? "media-urls" : undefined} placeholder={f.type === "image" ? "/uploads/… or https://…" : undefined} className={inputCls} maxLength={f.max} />;
  const wide = ["textarea", "markdown", "list", "pairs", "faqs"].includes(f.type);
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <label htmlFor={id} className={labelCls}>
        {f.label}
        {f.required && <span className="text-red-600"> *</span>}
      </label>
      {control}
      {f.help && (
        <p id={`${id}-help`} className="mt-1 text-xs text-dim">
          {f.help}
        </p>
      )}
      <FieldError name={f.name} />
    </div>
  );
}

export async function ResourceEditPage({ k, id, children }: { k: ResourceKey; id?: string; children?: React.ReactNode }) {
  const r = RESOURCES[k];
  await requirePermission(r.permission);
  const record = id ? await delegate(r).findUnique({ where: { id } }) : null;
  if (id && !record) notFound();
  const media = await db.media.findMany({ where: { mimeType: { startsWith: "image/" } }, orderBy: { createdAt: "desc" }, take: 200, select: { url: true, filename: true } });
  const groups = ["Content", "Details", "Media", "SEO", "Publishing"] as const;
  const title = record ? String(record[r.titleField] ?? r.singular) : `New ${r.singular.toLowerCase()}`;
  const defaults: Record<string, unknown> = { status: "DRAFT", sortOrder: 0 };
  const live = record && record.status === "PUBLISHED" && r.publicPath && record.slug ? r.publicPath(String(record.slug)) : null;
  const scheduled = record && record.status === "PUBLISHED" && record.publishedAt && (record.publishedAt as Date) > new Date();

  return (
    <>
      <PageHeader
        title={title}
        description={record ? `Last updated ${fmtDate(record.updatedAt as Date, true)}` : r.description}
        crumbs={[{ label: r.title, href: `/admin/${r.key}` }, { label: record ? "Edit" : "New" }]}
        actions={
          record && (
            <>
              {r.status && <Badge tone={scheduled ? "amber" : CONTENT_TONE[String(record.status)]}>{scheduled ? "Scheduled" : label(String(record.status))}</Badge>}
              {(r.key === "blog" || r.key === "pages") && (
                <a href={`/admin/preview/${r.key}/${record.id}`} target="_blank" rel="noopener" className="btn-secondary h-9 px-3 text-[13px]">
                  Preview <ExternalLink className="size-3.5" aria-hidden />
                </a>
              )}
              {live && !scheduled && (
                <a href={live} target="_blank" rel="noopener" className="btn-secondary h-9 px-3 text-[13px]">
                  View live <ExternalLink className="size-3.5" aria-hidden />
                </a>
              )}
            </>
          )
        }
      />
      <datalist id="media-urls">
        {media.map((m) => (
          <option key={m.url} value={m.url}>{m.filename}</option>
        ))}
      </datalist>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <ActionForm action={saveResourceAction.bind(null, r.key, record?.id ?? null)} className="min-w-0 space-y-5">
          {groups.map((g) => {
            const fields = r.fields.filter((f) => (f.group ?? "Content") === g);
            if (!fields.length) return null;
            return (
              <Panel key={g} title={g}>
                <div className="grid gap-4 sm:grid-cols-2">
                  {fields.map((f) => (
                    <FieldControl key={f.name} f={f} value={toFormValue(f, record ? record[f.name] : defaults[f.name])} />
                  ))}
                </div>
              </Panel>
            );
          })}
          <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-2 border-t border-line bg-ink-950/95 px-1 py-3 backdrop-blur">
            <SubmitButton>{record ? "Save changes" : `Create ${r.singular.toLowerCase()}`}</SubmitButton>
            <Link href={`/admin/${r.key}`} className="btn-secondary h-9 px-3 text-[13px]">Cancel</Link>
          </div>
        </ActionForm>
        {record && (
          <div className="min-w-0 space-y-5">
            {r.status && (
              <Panel title="Publishing">
                <div className="flex flex-wrap gap-2">
                  {record.status !== "PUBLISHED" && (
                    <form action={setResourceStatusAction.bind(null, r.key, record.id, "PUBLISHED")}>
                      <SubmitButton>Publish</SubmitButton>
                    </form>
                  )}
                  {record.status !== "DRAFT" && (
                    <form action={setResourceStatusAction.bind(null, r.key, record.id, "DRAFT")}>
                      <SubmitButton variant="secondary">{record.status === "PUBLISHED" ? "Unpublish" : "Restore to draft"}</SubmitButton>
                    </form>
                  )}
                  {record.status !== "ARCHIVED" && (
                    <form action={setResourceStatusAction.bind(null, r.key, record.id, "ARCHIVED")}>
                      <SubmitButton variant="secondary">Archive</SubmitButton>
                    </form>
                  )}
                </div>
                <p className="mt-3 text-xs text-dim">Publishing updates the public site immediately. Unsaved form changes are not included — save first.</p>
              </Panel>
            )}
            {children}
            <Panel title="More">
              <div className="flex flex-wrap gap-2">
                <form action={duplicateResourceAction.bind(null, r.key, record.id)}>
                  <SubmitButton variant="secondary">Duplicate</SubmitButton>
                </form>
                <form action={deleteResourceAction.bind(null, r.key, record.id)}>
                  <ConfirmButton message={`Delete “${title}” permanently? This cannot be undone.`} confirmLabel="Delete">
                    Delete
                  </ConfirmButton>
                </form>
              </div>
            </Panel>
          </div>
        )}
      </div>
    </>
  );
}
