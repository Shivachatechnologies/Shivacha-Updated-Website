import { db } from "@/lib/db/client";
import { requirePermission } from "@/lib/auth/session";
import { deleteRedirectAction, saveRedirectAction } from "@/lib/admin/system-actions";
import { Badge, EmptyState, PageHeader, Pagination, Panel, TableWrap, inputCls, labelCls, td, th } from "@/components/admin/ui";
import { ConfirmButton, SubmitButton } from "@/components/admin/client";
import { ActionForm, FieldError } from "@/components/admin/forms";

export const metadata = { title: "Redirects" };
const PAGE = 50;

function Fields({ r }: { r?: { id: string; source: string; destination: string; statusCode: number; active: boolean } }) {
  const id = r?.id ?? "new";
  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_1fr_140px_auto] sm:items-end">
      <div>
        <label className={labelCls} htmlFor={`s-${id}`}>From</label>
        <input id={`s-${id}`} name="source" defaultValue={r?.source} placeholder="/old-page" className={inputCls} />
        <FieldError name="source" />
      </div>
      <div>
        <label className={labelCls} htmlFor={`d-${id}`}>To</label>
        <input id={`d-${id}`} name="destination" defaultValue={r?.destination} placeholder="/new-page or https://…" className={inputCls} />
        <FieldError name="destination" />
      </div>
      <div>
        <label className={labelCls} htmlFor={`c-${id}`}>Type</label>
        <select id={`c-${id}`} name="statusCode" defaultValue={r?.statusCode ?? 308} className={inputCls}>
          <option value="308">308 Permanent</option>
          <option value="301">301 Permanent</option>
          <option value="307">307 Temporary</option>
          <option value="302">302 Temporary</option>
        </select>
      </div>
      <label className="flex h-9 items-center gap-2 text-sm text-fg">
        <input type="checkbox" name="active" defaultChecked={r?.active ?? true} className="size-4" /> Active
      </label>
    </div>
  );
}

export default async function RedirectsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  await requirePermission("redirects:manage");
  const sp = await searchParams;
  const q = sp.q?.trim().slice(0, 100) ?? "";
  const page = Math.max(1, Number(sp.page) || 1);
  const where = q ? { OR: [{ source: { contains: q.toLowerCase() } }, { destination: { contains: q } }] } : {};
  const [total, rows] = await Promise.all([db.redirect.count({ where }), db.redirect.findMany({ where, orderBy: { source: "asc" }, skip: (page - 1) * PAGE, take: PAGE })]);
  return (
    <>
      <PageHeader title="Redirects" description="301/308 permanent and 302/307 temporary redirects, applied before the page renders. Built-in legacy redirects in next.config.ts still apply." crumbs={[{ label: "Redirects" }]} />
      <Panel title="Add redirect" className="mb-4">
        <ActionForm action={saveRedirectAction.bind(null, null)} resetOnOk className="space-y-3">
          <Fields />
          <SubmitButton>Add redirect</SubmitButton>
        </ActionForm>
      </Panel>
      <form method="get" role="search" className="mb-3 flex gap-2">
        <input name="q" defaultValue={q} placeholder="Search paths…" aria-label="Search redirects" className={`${inputCls} max-w-xs`} />
        <button className="btn-secondary h-9 px-3 text-[13px]">Search</button>
      </form>
      {rows.length === 0 ? (
        <div className="rounded-lg border border-line bg-ink-900"><EmptyState title={q ? "No redirects match" : "No redirects yet"} /></div>
      ) : (
        <TableWrap>
          <thead>
            <tr><th className={th}>From</th><th className={th}>To</th><th className={th}>Type</th><th className={th}>Hits</th><th className={th}>Status</th><th className={th}><span className="sr-only">Actions</span></th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="align-top">
                <td className={`${td} max-w-[260px] truncate font-mono text-[12.5px]`}>{r.source}</td>
                <td className={`${td} max-w-[300px] truncate font-mono text-[12.5px] text-muted`}>{r.destination}</td>
                <td className={`${td} text-muted`}>{r.statusCode}</td>
                <td className={`${td} text-muted tabular-nums`}>{r.hits.toLocaleString()}</td>
                <td className={td}>{r.active ? <Badge tone="green">Active</Badge> : <Badge>Off</Badge>}</td>
                <td className={`${td} w-[1%]`}>
                  <details>
                    <summary className="btn-secondary h-8 cursor-pointer list-none px-2.5 text-xs">Edit</summary>
                    <div className="mt-3 w-[min(80vw,720px)] space-y-3 rounded-lg border border-line bg-ink-900 p-3">
                      <ActionForm action={saveRedirectAction.bind(null, r.id)} className="space-y-3">
                        <Fields r={r} />
                        <SubmitButton>Save</SubmitButton>
                      </ActionForm>
                      <form action={deleteRedirectAction.bind(null, r.id)}>
                        <ConfirmButton message={`Delete the redirect from ${r.source}?`} confirmLabel="Delete" className="h-8 text-xs">Delete</ConfirmButton>
                      </form>
                    </div>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
      <Pagination page={page} pages={Math.max(1, Math.ceil(total / PAGE))} total={total} makeHref={(p) => `/admin/redirects?${new URLSearchParams({ ...(q && { q }), page: String(p) })}`} />
    </>
  );
}
