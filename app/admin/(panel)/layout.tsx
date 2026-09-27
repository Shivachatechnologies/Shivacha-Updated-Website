import Link from "next/link";
import { Bell, LogOut } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { can, ROLE_LABELS } from "@/lib/auth/permissions";
import { logoutAction } from "@/lib/auth/actions";
import { globalSearch } from "@/lib/admin/search";
import { ADMIN_NAV } from "@/lib/admin/nav";
import { GlobalSearch, SidebarNav } from "@/components/admin/client";
import { db, hasDatabase } from "@/lib/db/client";
import { getFlags } from "@/lib/os/flags";

export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  if (!hasDatabase()) return <DatabaseMissing />;
  const user = await requireUser();
  const [flags, unread] = await Promise.all([getFlags(), db.notification.count({ where: { userId: user.id, readAt: null } }).catch(() => 0)]);
  const groups = ADMIN_NAV.filter((g) => !g.flag || flags[g.flag])
    .map((g) => ({ title: g.title, items: g.items.filter((i) => can(user.role, i.permission) && (!i.flag || flags[i.flag])).map(({ label, href, icon }) => ({ label, href, icon })) }))
    .filter((g) => g.items.length);
  const footer = (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-fg">{user.name}</p>
        <p className="truncate text-[11.5px] text-dim">{ROLE_LABELS[user.role]}</p>
      </div>
      <form action={logoutAction}>
        <button type="submit" className="flex size-8 items-center justify-center rounded-md border border-line text-muted hover:text-fg" aria-label="Sign out" title="Sign out">
          <LogOut className="size-4" />
        </button>
      </form>
    </div>
  );
  return (
    <div className="lg:pl-60">
      {/* No backdrop-filter here: it would become the containing block of the fixed sidebar/drawer inside. */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-ink-950 px-4 sm:px-6">
        <SidebarNav groups={groups} footer={footer} />
        <div className="min-w-0 flex-1">
          <GlobalSearch search={globalSearch} ai={flags.AI_WORKFORCE && can(user.role, "ai:execute")} />
        </div>
        <Link href="/admin/notifications" className="relative flex size-9 items-center justify-center rounded-md border border-line text-muted hover:text-fg" aria-label={unread ? `${unread} unread notifications` : "Notifications"}>
          <Bell className="size-4" aria-hidden />
          {unread > 0 && <span className="absolute -top-1 -right-1 min-w-4 rounded-full bg-red-600 px-1 text-center text-[10px] leading-4 font-semibold text-white">{unread > 99 ? "99+" : unread}</span>}
        </Link>
        <a href="/" target="_blank" rel="noopener noreferrer" className="hidden text-[13px] text-muted hover:text-fg sm:inline">
          View site ↗
        </a>
      </header>
      <main id="admin-main" className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:py-8">
        {children}
      </main>
    </div>
  );
}

function DatabaseMissing() {
  return (
    <main className="mx-auto max-w-lg px-6 py-24">
      <h1 className="text-xl font-semibold text-fg">Database not configured</h1>
      <p className="mt-2 text-sm text-muted">Set the DATABASE_URL environment variable (Neon PostgreSQL) on the server, run the migrations and create the first Super Admin with <code className="font-mono">npm run admin:create</code>. See README → Admin panel.</p>
    </main>
  );
}
