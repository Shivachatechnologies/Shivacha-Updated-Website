import { Fragment } from "react";
import { db } from "@/lib/db/client";
import { requireAccess } from "@/lib/os/guard";
import { audit } from "@/lib/audit";
import { can, overrideOf, PERMISSIONS, ROLE_LABELS, ROLES, type Permission } from "@/lib/auth/permissions";
import { PageHeader, fmtDate } from "@/components/admin/ui";
import { PermissionCell } from "@/components/admin/workforce/permission-cell";

export const metadata = { title: "Permission matrix" };

const LEVELS: [string, RegExp][] = [["View", /:view$/], ["Create", /:create$/], ["Edit", /:edit$|:assign$|:merge$/], ["Delete", /:archive$|:delete$/], ["Approve", /:approve$|:confirm$|:override$/], ["Export", /:export$|:import$/], ["Manage", /:manage$|:configure$|:execute$|:send$|:issue$|:use$|:location$/]];
const levelOf = (p: string) => LEVELS.find(([, re]) => re.test(p))?.[0] ?? "Access";

export default async function PermissionsPage() {
  const user = await requireAccess("users:manage");
  const overrides = await db.rolePermission.findMany({ orderBy: { updatedAt: "desc" }, take: 20 });
  await audit({ userId: user.id, action: "permission.matrix.viewed" });
  const groups = new Map<string, Permission[]>();
  for (const p of PERMISSIONS) {
    const mod = p.split(":")[0];
    groups.set(mod, [...(groups.get(mod) ?? []), p]);
  }
  return (
    <>
      <PageHeader title="Permission matrix" description="Roles are bundles of permissions; every permission is checked on the server. Outlined cells are overrides of the built-in defaults. Super Admin always has everything." crumbs={[{ label: "Settings", href: "/admin/settings" }, { label: "Permissions" }]} />
      <div className="overflow-x-auto rounded-lg border border-line bg-ink-900">
        <table className="min-w-full border-collapse text-[12.5px]">
          <thead className="sticky top-0 bg-ink-850">
            <tr>
              <th className="sticky left-0 z-10 bg-ink-850 px-3 py-2 text-left font-semibold text-dim">Permission</th>
              <th className="px-2 py-2 text-left font-semibold text-dim">Level</th>
              {ROLES.map((r) => <th key={r} className="px-1.5 py-2 text-center font-semibold whitespace-nowrap text-dim"><span className="inline-block max-w-20 truncate align-bottom" title={ROLE_LABELS[r]}>{ROLE_LABELS[r]}</span></th>)}
            </tr>
          </thead>
          <tbody>
            {[...groups.entries()].map(([mod, perms]) => (
              <Fragment key={mod}>
                <tr><td colSpan={ROLES.length + 2} className="border-t border-line bg-ink-850/60 px-3 py-1.5 text-[11px] font-semibold tracking-wide text-dim uppercase">{mod}</td></tr>
                {perms.map((p) => (
                  <tr key={p} className="border-t border-line/60 hover:bg-ink-850">
                    <td className="sticky left-0 bg-ink-900 px-3 py-1.5 font-mono text-[11.5px] whitespace-nowrap text-fg">{p}</td>
                    <td className="px-2 py-1.5 text-dim">{levelOf(p)}</td>
                    {ROLES.map((r) => (
                      <td key={r} className="px-1.5 py-1 text-center">
                        <PermissionCell role={r} permission={p} value={can(r, p)} isDefault={overrideOf(r, p) === undefined} locked={r === "SUPER_ADMIN" || (r === "ADMIN" && user.role !== "SUPER_ADMIN")} />
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-dim">Defaults: {PERMISSIONS.length} permissions × {ROLES.length} roles. Recent changes are listed in the audit log (action “permission.changed”).{overrides.length ? ` Last change ${fmtDate(overrides[0].updatedAt, true)}.` : ""}</p>
      <p className="mt-1 text-xs text-dim">Record-level rules still apply on top of this matrix: managers see only their reporting line; employees see only themselves; AI employees never exceed the permissions of the person who asked.</p>
    </>
  );
}
