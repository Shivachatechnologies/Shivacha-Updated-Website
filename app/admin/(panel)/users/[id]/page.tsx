import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { requirePermission } from "@/lib/auth/session";
import { assignableRoles, ROLE_LABELS } from "@/lib/auth/permissions";
import { revokeSessionsAction, saveUserAction, setUserPasswordAction, unlockUserAction } from "@/lib/admin/system-actions";
import { Badge, PageHeader, Panel, fmtDate, inputCls, labelCls } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/client";
import { ActionForm, FieldError } from "@/components/admin/forms";
import { UserFields } from "../fields";

export const metadata = { title: "User" };

export default async function EditUser({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePermission("users:manage");
  const { id } = await params;
  const user = await db.user.findUnique({ where: { id }, select: { id: true, name: true, email: true, role: true, active: true, lastLoginAt: true, lockedUntil: true, failedLoginCount: true, createdAt: true, _count: { select: { sessions: true, assignedLeads: true } } } });
  if (!user) notFound();
  const protectedTarget = user.role === "SUPER_ADMIN" && actor.role !== "SUPER_ADMIN";
  const logs = await db.auditLog.findMany({ where: { OR: [{ userId: id }, { entity: "user", entityId: id }] }, orderBy: { createdAt: "desc" }, take: 15 });
  const locked = user.lockedUntil && user.lockedUntil > new Date();

  return (
    <>
      <PageHeader title={user.name} description={`${user.email} · ${ROLE_LABELS[user.role]}`} crumbs={[{ label: "Users", href: "/admin/users" }, { label: user.name }]} actions={!user.active ? <Badge tone="red">Disabled</Badge> : locked ? <Badge tone="amber">Locked</Badge> : <Badge tone="green">Active</Badge>} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          <Panel title="Profile & role">
            {protectedTarget ? (
              <p className="text-sm text-muted">Only a Super Admin can edit a Super Admin account.</p>
            ) : (
              <ActionForm action={saveUserAction.bind(null, user.id)} className="space-y-4">
                <UserFields user={user} roles={assignableRoles(actor.role)} />
                <SubmitButton>Save user</SubmitButton>
              </ActionForm>
            )}
          </Panel>
          {!protectedTarget && (
            <Panel title="Set a new password">
              <ActionForm action={setUserPasswordAction.bind(null, user.id)} resetOnOk className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <label className={labelCls} htmlFor="np">New password</label>
                  <input id="np" name="password" type="password" autoComplete="new-password" className={inputCls} />
                  <FieldError name="password" />
                </div>
                <SubmitButton variant="secondary">Update password</SubmitButton>
              </ActionForm>
              <p className="mt-2 text-xs text-dim">All of this user&apos;s sessions are signed out when the password changes.</p>
            </Panel>
          )}
        </div>
        <div className="min-w-0 space-y-5">
          <Panel title="Security">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs text-dim">Last sign-in</dt><dd className="text-fg">{fmtDate(user.lastLoginAt, true)}</dd></div>
              <div><dt className="text-xs text-dim">Active sessions</dt><dd className="text-fg">{user._count.sessions}</dd></div>
              <div><dt className="text-xs text-dim">Failed attempts</dt><dd className="text-fg">{user.failedLoginCount}</dd></div>
              <div><dt className="text-xs text-dim">Assigned leads</dt><dd className="text-fg">{user._count.assignedLeads}</dd></div>
            </dl>
            {!protectedTarget && (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
                <form action={revokeSessionsAction.bind(null, user.id)}><SubmitButton variant="secondary">Sign out everywhere</SubmitButton></form>
                {locked && <form action={unlockUserAction.bind(null, user.id)}><SubmitButton variant="secondary">Unlock account</SubmitButton></form>}
              </div>
            )}
          </Panel>
          <Panel title="Recent activity">
            {logs.length === 0 ? <p className="text-sm text-dim">No activity.</p> : (
              <ul className="space-y-2 text-sm">
                {logs.map((l) => (
                  <li key={l.id}><span className="font-mono text-[12px] text-fg">{l.action}</span> <span className="block text-xs text-dim">{fmtDate(l.createdAt, true)}</span></li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
