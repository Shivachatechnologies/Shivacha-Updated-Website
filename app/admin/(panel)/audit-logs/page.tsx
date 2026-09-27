import { db } from "@/lib/db/client";
import { requirePermission } from "@/lib/auth/session";
import { AutoSubmit } from "@/components/admin/client";
import { EmptyState, PageHeader, Pagination, TableWrap, fmtDate, inputCls, td, th } from "@/components/admin/ui";

export const metadata = { title: "Audit logs" };
const PAGE = 50;

export default async function AuditLogsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission("audit:view");
  const sp = await searchParams;
  const page = Math.max(1, Math.min(2000, Number(sp.page) || 1));
  const action = sp.action?.trim().slice(0, 80);
  const user = sp.user?.slice(0, 40);
  const entity = sp.entity?.slice(0, 40);
  const where = { ...(action && { action: { contains: action } }), ...(user && { userId: user }), ...(entity && { entity }) };
  const [total, rows, users, entities] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE, include: { user: { select: { name: true, email: true } } } }),
    db.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.auditLog.groupBy({ by: ["entity"], where: { entity: { not: null } }, orderBy: { entity: "asc" } }),
  ]);
  const qs = (p: number) => new URLSearchParams({ ...(action && { action }), ...(user && { user }), ...(entity && { entity }), page: String(p) }).toString();
  const sel = "h-9 rounded-md border border-line-strong bg-ink-900 px-2 text-[13px] text-fg";
  return (
    <>
      <PageHeader title="Audit logs" description="Sign-ins, lead changes, content changes, uploads and settings changes. Credentials are never recorded." crumbs={[{ label: "Audit logs" }]} />
      <form method="get" role="search" className="mb-4 flex flex-wrap gap-2">
        <AutoSubmit />
        <input name="action" defaultValue={action} placeholder="Action contains… (e.g. login, lead.)" aria-label="Action" className={`${inputCls} max-w-xs`} />
        <select name="user" defaultValue={user ?? ""} aria-label="User" className={sel}>
          <option value="">All users</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <select name="entity" defaultValue={entity ?? ""} aria-label="Entity" className={sel}>
          <option value="">All entities</option>
          {entities.map((e) => <option key={e.entity} value={e.entity!}>{e.entity}</option>)}
        </select>
        <button className="btn-secondary h-9 px-3 text-[13px]">Filter</button>
      </form>
      {rows.length === 0 ? (
        <div className="rounded-lg border border-line bg-ink-900"><EmptyState title="No log entries" /></div>
      ) : (
        <TableWrap>
          <thead>
            <tr><th className={th}>Time (UTC)</th><th className={th}>User</th><th className={th}>Action</th><th className={th}>Entity</th><th className={th}>Details</th><th className={th}>IP</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="align-top">
                <td className={`${td} whitespace-nowrap text-muted`}>{fmtDate(r.createdAt, true)}</td>
                <td className={`${td} whitespace-nowrap`}>{r.user?.name ?? <span className="text-dim">System</span>}</td>
                <td className={`${td} font-mono text-[12px]`}>{r.action}</td>
                <td className={`${td} text-muted`}>{r.entity ?? "—"}</td>
                <td className={`${td} max-w-[360px]`}>
                  {r.metadata ? <code className="line-clamp-2 font-mono text-[11.5px] break-all text-muted">{JSON.stringify(r.metadata)}</code> : <span className="text-dim">—</span>}
                </td>
                <td className={`${td} font-mono text-[11.5px] whitespace-nowrap text-dim`}>{r.ip ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
      <Pagination page={page} pages={Math.max(1, Math.ceil(total / PAGE))} total={total} makeHref={(p) => `/admin/audit-logs?${qs(p)}`} />
    </>
  );
}
