import { LogOut } from "lucide-react";
import { requirePortalUser } from "@/lib/portal/session";
import { portalLogoutAction } from "@/lib/portal/auth-actions";
import { isEnabled } from "@/lib/os/flags";
import { hasDatabase } from "@/lib/db/client";
import { PortalNav } from "@/components/portal-nav";

export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  if (!hasDatabase() || !(await isEnabled("CLIENT_PORTAL"))) {
    return (
      <main className="mx-auto max-w-lg px-6 py-24 text-center">
        <h1 className="text-xl font-semibold text-fg">The client portal is unavailable</h1>
        <p className="mt-2 text-sm text-muted">Please contact your Shivacha account manager.</p>
      </main>
    );
  }
  const u = await requirePortalUser();
  return (
    <div>
      <header className="border-b border-line bg-ink-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/shivacha-mark.svg" alt="" className="size-6 shrink-0" />
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold text-fg">{u.clientName}</p>
              <p className="truncate text-[11.5px] text-dim">Shivacha Client Portal · {u.name}</p>
            </div>
          </div>
          <form action={portalLogoutAction}>
            <button type="submit" className="btn-secondary h-8 px-2.5 text-xs" aria-label="Sign out"><LogOut className="size-3.5" aria-hidden /> Sign out</button>
          </form>
        </div>
        <div className="mx-auto max-w-6xl px-4 pb-2 sm:px-6"><PortalNav /></div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:py-8">{children}</main>
    </div>
  );
}
