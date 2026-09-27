import { db } from "@/lib/db/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { requireAccess } from "@/lib/os/guard";
import { invitePortalUserAction, resendInviteAction, setPortalUserActiveAction } from "@/lib/portal/admin-actions";
import { PageHeader, Panel, Pagination, fmtDate, inputCls } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/client";
import { DataTable, FilterBar, LinkCell, StatusBadge, pageOf, str, PAGE_SIZE, type SP } from "@/components/admin/os";
import { SendLinkForm } from "@/components/admin/os-client";

export const metadata = { title: "Client portal users" };

export default async function PortalUsersPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAccess("portal:manage", "CLIENT_PORTAL");
  const sp = await searchParams;
  const q = str(sp, "q", 80);
  const page = pageOf(sp);
  const where: Prisma.PortalUserWhereInput = q ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }, { client: { name: { contains: q, mode: "insensitive" } } }] } : {};
  const [total, rows, clients] = await Promise.all([
    db.portalUser.count({ where }),
    db.portalUser.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { client: { select: { id: true, name: true } }, _count: { select: { sessions: true } } } }),
    db.client.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, take: 1000, select: { id: true, name: true } }),
  ]);
  return (
    <>
      <PageHeader title="Client portal users" description="Invite client contacts to the portal. Each user only ever sees their own company's projects, invoices, documents and tickets." crumbs={[{ label: "Clients", href: "/admin/clients" }, { label: "Client Portal" }]} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <FilterBar values={{ q }} filters={[{ type: "search", name: "q", placeholder: "Search name, email, client…" }]} />
          {rows.length === 0 ? <Panel><p className="py-6 text-center text-sm text-dim">No portal users yet.</p></Panel> : (
            <>
              <DataTable rows={rows} columns={[
                { header: "User", cell: (u) => <span><span className="font-medium text-fg">{u.name}</span><span className="block text-xs text-dim">{u.email}</span></span> },
                { header: "Client", cell: (u) => <LinkCell href={`/admin/clients/${u.client.id}`}>{u.client.name}</LinkCell> },
                { header: "Status", cell: (u) => <StatusBadge value={u.active ? (u.passwordHash ? "ACTIVE" : "PENDING") : "INACTIVE"} text={u.active ? (u.passwordHash ? "Active" : "Invited") : "Disabled"} /> },
                { header: "Last sign-in", cell: (u) => <span className="text-muted">{fmtDate(u.lastLoginAt, true)}</span> },
                { header: "Sessions", cell: (u) => <span className="tabular-nums text-muted">{u._count.sessions}</span> },
                { header: "", cell: (u) => (
                  <div className="flex items-center gap-2">
                    <form action={setPortalUserActiveAction.bind(null, u.id, !u.active)}><button type="submit" className="text-xs text-muted hover:text-fg">{u.active ? "Disable" : "Enable"}</button></form>
                    {u.active && (
                      <details><summary className="cursor-pointer text-xs text-brand-blue">{u.passwordHash ? "Reset link" : "Resend"}</summary>
                        <div className="mt-2 w-72"><SendLinkForm action={resendInviteAction.bind(null, u.id)}><SubmitButton variant="secondary">Create new link</SubmitButton></SendLinkForm></div>
                      </details>
                    )}
                  </div>
                ) },
              ]} />
              <Pagination page={page} pages={Math.max(1, Math.ceil(total / PAGE_SIZE))} total={total} makeHref={(p) => `/admin/portal-users?${new URLSearchParams({ ...(q && { q }), page: String(p) })}`} />
            </>
          )}
        </div>
        <Panel title="Invite a client user">
          <SendLinkForm action={invitePortalUserAction}>
            <select name="clientId" required aria-label="Client" defaultValue={str(sp, "clientId", 40)} className={inputCls}>
              <option value="">Client…</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input name="name" required maxLength={200} placeholder="Full name" aria-label="Name" className={inputCls} />
            <input name="email" type="email" required maxLength={160} placeholder="Email" aria-label="Email" className={inputCls} />
            <SubmitButton>Send invitation</SubmitButton>
            <p className="text-xs text-dim">The link sets their password and expires in 7 days. Only a hash of it is stored.</p>
          </SendLinkForm>
        </Panel>
      </div>
    </>
  );
}
