import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Toaster } from "@/components/admin/client";
import { requireSelf } from "@/lib/workforce/portal";
import { can } from "@/lib/auth/permissions";
import { logoutAction } from "@/lib/auth/actions";
import { hasDatabase } from "@/lib/db/client";
import { PortalNav } from "@/components/employee/nav";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { default: "My workspace", template: "%s · Shivacha" }, robots: { index: false, follow: false } };

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  if (!hasDatabase()) return <main className="p-10 text-sm">Database not configured.</main>;
  const { user, me } = await requireSelf();
  return (
    <div data-theme="light" className="min-h-screen bg-ink-950 text-fg">
      <Suspense>
        <Toaster>
          <header className="border-b border-line bg-ink-900">
            <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3">
              <Link href="/employee" className="font-semibold">Shivacha · My workspace</Link>
              <span className="text-sm text-muted">{me?.fullName ?? user.name}{me ? ` · ${me.employeeCode}` : ""}</span>
              <div className="ml-auto flex items-center gap-2">
                {can(user.role, "dashboard:view") && <Link href="/admin/dashboard" className="btn-secondary h-8 px-3 text-xs">Shivacha OS</Link>}
                <form action={logoutAction}>
                  <button type="submit" className="h-8 rounded-md px-3 text-xs text-muted hover:bg-ink-850">Sign out</button>
                </form>
              </div>
            </div>
            <PortalNav />
          </header>
          <main className="mx-auto max-w-5xl px-4 py-6">
            {me ? children : <p className="rounded-lg border border-line bg-ink-900 p-6 text-sm text-muted">Your login is not linked to an employee record yet. Ask HR to link it from your employee profile in Shivacha OS.</p>}
          </main>
        </Toaster>
      </Suspense>
    </div>
  );
}
