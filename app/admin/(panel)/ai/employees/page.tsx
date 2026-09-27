import Link from "next/link";
import { db } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { employeeDirectory } from "@/lib/ai/workforce/employees";
import { EMPLOYEE_STATUSES } from "@/lib/ai/workforce/profiles";
import { pumpSoon } from "@/lib/ai/workforce/scheduler";
import { PageHeader } from "@/components/admin/ui";
import { pick, type SP } from "@/components/admin/os";
import { EmployeeCardView, EmployeeStatusPill, WorkforceNav } from "@/components/admin/ai/workforce";
import { AutoRefresh } from "@/components/admin/ai/auto-refresh";
import { cn } from "@/lib/cn";

export const metadata = { title: "AI Employee Directory" };

export default async function EmployeeDirectory({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireAccess("ai:view", "AI_WORKFORCE");
  const sp = await searchParams;
  const status = pick(sp, "status", EMPLOYEE_STATUSES);
  const dept = typeof sp.dept === "string" ? sp.dept.slice(0, 60) : "";
  const now = new Date();
  const [all, pendingApprovals] = await Promise.all([employeeDirectory(now), db.aIApproval.count({ where: { status: "PENDING" } })]);
  pumpSoon();
  const departments = [...new Set(all.map((e) => e.department))].sort();
  const rows = all.filter((e) => (!status || e.status === status) && (!dept || e.department === dept));
  const link = (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams(Object.entries({ status, dept: dept || undefined, ...patch }).filter(([, v]) => v) as [string, string][]).toString();
    return `/admin/ai/employees${q ? `?${q}` : ""}`;
  };
  return (
    <>
      <PageHeader
        title="AI Employee Directory"
        description="Your digital employees. Each one has a role, a manager, goals, explicit permissions and a work queue. Assign work the way you would to a person."
        crumbs={[{ label: "AI", href: "/admin/ai/command-center" }, { label: "Employees" }]}
        actions={can(user.role, "ai:execute") ? <Link href="/admin/ai/tasks?new=1" className="btn-primary h-9 px-3.5 text-[13px]">Assign task</Link> : undefined}
      />
      <WorkforceNav active="employees" counts={{ approvals: pendingApprovals }} />
      <AutoRefresh active={all.some((e) => e.status === "WORKING")} every={6000} />
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <Link href={link({ status: undefined })} className={cn("rounded-full border px-2.5 py-1 text-[12px]", !status ? "border-brand-blue text-fg" : "border-line text-muted hover:text-fg")}>All · {all.length}</Link>
        {EMPLOYEE_STATUSES.map((s) => {
          const n = all.filter((e) => e.status === s).length;
          return (
            <Link key={s} href={link({ status: status === s ? undefined : s })} className={cn("rounded-full border px-1 py-0.5", status === s ? "border-brand-blue" : "border-transparent")}>
              <EmployeeStatusPill status={s} className={n ? "" : "opacity-50"} /> <span className="mr-1.5 font-mono text-[11px] text-dim">{n}</span>
            </Link>
          );
        })}
        <span className="mx-1 h-4 w-px bg-line" aria-hidden />
        {departments.map((d) => (
          <Link key={d} href={link({ dept: dept === d ? undefined : d })} className={cn("rounded-full border px-2.5 py-1 text-[12px]", dept === d ? "border-brand-blue text-fg" : "border-line text-muted hover:text-fg")}>{d}</Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No employees match these filters.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {rows.map((e) => <li key={e.slug}><EmployeeCardView e={e} now={now} /></li>)}
        </ul>
      )}
    </>
  );
}
