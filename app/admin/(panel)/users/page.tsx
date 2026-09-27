import Link from "next/link";
import { Plus } from "lucide-react";
import { db } from "@/lib/db/client";
import { requirePermission } from "@/lib/auth/session";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { Badge, PageHeader, TableWrap, fmtDate, td, th } from "@/components/admin/ui";

export const metadata = { title: "Users" };

export default async function UsersPage() {
  await requirePermission("users:manage");
  const users = await db.user.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }], select: { id: true, name: true, email: true, role: true, active: true, lastLoginAt: true, lockedUntil: true, createdAt: true } });
  const now = new Date();
  return (
    <>
      <PageHeader title="Users" description="Admin accounts and roles. Permissions are enforced on the server for every page and action." crumbs={[{ label: "Users" }]} actions={<Link href="/admin/users/new" className="btn-primary h-9 px-3.5 text-[13px]"><Plus className="size-4" aria-hidden /> Invite user</Link>} />
      <TableWrap>
        <thead>
          <tr><th className={th}>Name</th><th className={th}>Role</th><th className={th}>Status</th><th className={th}>Last sign-in</th><th className={th}>Created</th></tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="hover:bg-ink-850">
              <td className={td}>
                <Link href={`/admin/users/${u.id}`} className="font-medium text-fg hover:text-brand-blue">{u.name}</Link>
                <span className="block text-xs text-dim">{u.email}</span>
              </td>
              <td className={`${td} text-muted`}>{ROLE_LABELS[u.role]}</td>
              <td className={td}>{!u.active ? <Badge tone="red">Disabled</Badge> : u.lockedUntil && u.lockedUntil > now ? <Badge tone="amber">Locked</Badge> : <Badge tone="green">Active</Badge>}</td>
              <td className={`${td} whitespace-nowrap text-muted`}>{fmtDate(u.lastLoginAt, true)}</td>
              <td className={`${td} whitespace-nowrap text-muted`}>{fmtDate(u.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </>
  );
}
