import Link from "next/link";
import { db } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/session";
import { NOTIFICATION_TYPES, type NotificationType } from "@/lib/os/notify";
import { markNotificationsReadAction, saveNotificationPrefsAction } from "@/lib/os/platform-actions";
import { EmptyState, PageHeader, Pagination, Panel, fmtDate } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/client";
import { ActionForm } from "@/components/admin/forms";
import { Tabs, pageOf, type SP } from "@/components/admin/os";
import { mailMode } from "@/lib/email/mailer";

export const metadata = { title: "Notifications" };
const PAGE = 30;

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const view = sp.view === "unread" ? "unread" : sp.view === "settings" ? "settings" : "all";
  const page = pageOf(sp);
  const where = { userId: user.id, ...(view === "unread" ? { readAt: null } : {}) };
  const [total, rows, unread, prefs] = await Promise.all([
    db.notification.count({ where }),
    db.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE }),
    db.notification.count({ where: { userId: user.id, readAt: null } }),
    db.notificationPreference.findMany({ where: { userId: user.id } }),
  ]);
  const pref = new Map(prefs.map((p) => [p.type, p]));
  return (
    <>
      <PageHeader
        title="Notifications"
        description="In-app alerts from the CRM, sales, finance, support, automations and the AI workforce."
        crumbs={[{ label: "Notifications" }]}
        actions={
          unread > 0 && (
            <form action={markNotificationsReadAction.bind(null, undefined)}>
              <SubmitButton variant="secondary">Mark all as read</SubmitButton>
            </form>
          )
        }
      />
      <Tabs
        active={view}
        items={[
          { key: "all", label: "All", href: "/admin/notifications" },
          { key: "unread", label: "Unread", href: "/admin/notifications?view=unread", count: unread },
          { key: "settings", label: "Preferences", href: "/admin/notifications?view=settings" },
        ]}
      />
      {view === "settings" ? (
        <Panel>
          <ActionForm action={saveNotificationPrefsAction} className="space-y-3">
            <p className="text-sm text-muted">Email copies are sent only when outgoing email is configured{mailMode() === "none" ? " (currently not configured)" : ""}.</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-dim uppercase">
                    <th className="py-2">Event</th>
                    <th className="py-2">In-app</th>
                    <th className="py-2">Email</th>
                  </tr>
                </thead>
                <tbody>
                  {(Object.keys(NOTIFICATION_TYPES) as NotificationType[]).map((t) => (
                    <tr key={t} className="border-t border-line">
                      <td className="py-2 text-fg">{NOTIFICATION_TYPES[t]}</td>
                      <td className="py-2"><input type="checkbox" name={`${t}:inApp`} defaultChecked={pref.get(t)?.inApp ?? true} aria-label={`${NOTIFICATION_TYPES[t]} in-app`} className="size-4 accent-[var(--color-brand-blue)]" /></td>
                      <td className="py-2"><input type="checkbox" name={`${t}:email`} defaultChecked={pref.get(t)?.email ?? false} aria-label={`${NOTIFICATION_TYPES[t]} email`} className="size-4 accent-[var(--color-brand-blue)]" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <SubmitButton>Save preferences</SubmitButton>
          </ActionForm>
        </Panel>
      ) : rows.length === 0 ? (
        <Panel><EmptyState title={view === "unread" ? "You're all caught up" : "No notifications yet"} description="Alerts appear here when something needs your attention." /></Panel>
      ) : (
        <>
          <ul className="divide-y divide-line rounded-lg border border-line bg-ink-900">
            {rows.map((n) => (
              <li key={n.id} className="flex items-start gap-3 px-4 py-3">
                <span aria-hidden className={`mt-1.5 size-2 shrink-0 rounded-full ${n.readAt ? "bg-ink-800" : "bg-brand-blue"}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-fg">
                    {n.href ? <Link href={n.href} className="font-medium hover:text-brand-blue">{n.title}</Link> : <span className="font-medium">{n.title}</span>}
                  </p>
                  {n.body && <p className="mt-0.5 truncate text-xs text-muted">{n.body}</p>}
                  <p className="mt-0.5 text-[11px] text-dim">{NOTIFICATION_TYPES[n.type as NotificationType] ?? n.type} · {fmtDate(n.createdAt, true)}</p>
                </div>
                {!n.readAt && (
                  <form action={markNotificationsReadAction.bind(null, [n.id])}>
                    <button type="submit" className="text-xs text-muted hover:text-fg">Mark read</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
          <Pagination page={page} pages={Math.max(1, Math.ceil(total / PAGE))} total={total} makeHref={(p) => `/admin/notifications?${view !== "all" ? `view=${view}&` : ""}page=${p}`} />
        </>
      )}
    </>
  );
}
