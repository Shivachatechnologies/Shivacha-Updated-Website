import Link from "next/link";
import { db } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { managedIds, myEmployee } from "@/lib/workforce/access";
import { liveWorkforce, summarize } from "@/lib/workforce/attendance";
import { decideLeaveAction } from "@/lib/workforce/leave-actions";
import { decideTimesheetAction } from "@/lib/workforce/work-actions";
import { fmtMinutes } from "@/lib/workforce/time";
import { DataTable, Kpi, KpiGrid, Section, StatusBadge, Tabs, pick, type SP } from "@/components/admin/os";
import { PageHeader, fmtDate, label } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/forms";
import { SubmitButton } from "@/components/admin/client";
import { AttendanceBadge, NoData, PersonCell } from "@/components/admin/workforce/ui";
import { DecideLeave } from "@/components/admin/workforce/decide";

export const metadata = { title: "My team" };

/** Managers see only their reporting line (and departments they head). No HR or finance data is shown here. */
export default async function TeamPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireAccess("team:view");
  const sp = await searchParams;
  const tab = pick(sp, "tab", ["overview", "approvals"] as const) ?? "overview";
  const me = await myEmployee(user.id);
  const ids = await managedIds(user.id);
  const header = <PageHeader title="My team" description={me ? `${ids.length} people in your reporting line.` : "Your login is not linked to an employee record, so no team can be shown."} crumbs={[{ label: "Human Workforce" }, { label: "My team" }]} />;
  if (!me || !ids.length) return <>{header}<NoData>No team members yet. HR sets reporting managers on each employee profile.</NoData></>;
  const [live, leaves, sheets, tasks, goals] = await Promise.all([
    liveWorkforce({ id: { in: ids } }),
    db.leaveRequest.findMany({ where: { employeeId: { in: ids }, status: "PENDING_MANAGER" }, orderBy: { startDate: "asc" }, include: { leaveType: { select: { name: true } }, employee: { select: { id: true, fullName: true, photoUrl: true } } } }),
    db.timesheet.findMany({ where: { employeeId: { in: ids }, status: "SUBMITTED" }, orderBy: { date: "desc" }, take: 100, include: { employee: { select: { id: true, fullName: true, photoUrl: true } }, project: { select: { name: true } } } }),
    db.employee.findMany({ where: { id: { in: ids }, userId: { not: null } }, select: { id: true, userId: true } }).then(async (rows) => {
      const counts = await db.task.groupBy({ by: ["assigneeId"], where: { assigneeId: { in: rows.map((r) => r.userId!) }, status: { not: "DONE" } }, _count: { _all: true } });
      const overdue = await db.task.groupBy({ by: ["assigneeId"], where: { assigneeId: { in: rows.map((r) => r.userId!) }, status: { not: "DONE" }, dueDate: { lt: new Date() } }, _count: { _all: true } });
      return new Map(rows.map((r) => [r.id, { open: counts.find((c) => c.assigneeId === r.userId)?._count._all ?? 0, overdue: overdue.find((c) => c.assigneeId === r.userId)?._count._all ?? 0 }]));
    }),
    db.performanceGoal.groupBy({ by: ["employeeId", "status"], where: { employeeId: { in: ids } }, _count: { _all: true } }),
  ]);
  const s = summarize(live);
  const approvals = leaves.length + sheets.length;
  return (
    <>
      {header}
      <Tabs active={tab} items={[{ key: "overview", label: "Overview", href: "/admin/team" }, { key: "approvals", label: "Pending approvals", href: "/admin/team?tab=approvals", count: approvals }]} />
      {tab === "overview" ? (
        <>
          <KpiGrid cols={6}>
            <Kpi label="Team" value={s.total} />
            <Kpi label="Present" value={s.present} tone="green" />
            <Kpi label="Absent" value={s.absent} tone={s.absent ? "red" : undefined} />
            <Kpi label="On leave" value={s.onLeave} />
            <Kpi label="Late" value={s.late} tone={s.late ? "amber" : undefined} />
            <Kpi label="Approvals" value={approvals} href="/admin/team?tab=approvals" tone={approvals ? "amber" : undefined} />
          </KpiGrid>
          <Section title="Team today">
            <DataTable
              rows={live}
              columns={[
                { header: "Person", cell: (r) => <PersonCell name={r.name} src={r.photoUrl} sub={r.department ?? r.code} href={`/admin/employees/${r.id}`} /> },
                { header: "Status", cell: (r) => <AttendanceBadge state={r.state} /> },
                { header: "Mode", cell: (r) => label(r.dayWorkMode ?? r.workMode) },
                { header: "Checked in", cell: (r) => fmtDate(r.checkInAt, true) },
                { header: "Worked", cell: (r) => (r.checkInAt ? fmtMinutes(r.workedMinutes) : "—") },
                { header: "Open tasks", cell: (r) => { const t = tasks.get(r.id); return t ? <span>{t.open}{t.overdue ? <span className="ml-1 text-red-700">({t.overdue} overdue)</span> : null}</span> : <span className="text-dim">no login</span>; } },
                { header: "Goals", cell: (r) => { const g = goals.filter((x) => x.employeeId === r.id); const n = g.reduce((a, x) => a + x._count._all, 0); const risk = g.filter((x) => x.status === "AT_RISK" || x.status === "OFF_TRACK").reduce((a, x) => a + x._count._all, 0); return n ? <span>{n}{risk ? <span className="ml-1 text-amber-700">({risk} at risk)</span> : null}</span> : "—"; } },
              ]}
            />
          </Section>
          <p className="mt-4 text-xs text-dim">Goals and reviews for your team: <Link href="/admin/performance/goals" className="text-brand-blue">Goals</Link> · <Link href="/admin/performance/reviews" className="text-brand-blue">Reviews</Link>. Compensation and HR documents are not visible to managers.</p>
        </>
      ) : (
        <>
          <Section title={`Leave requests (${leaves.length})`}>
            {leaves.length ? <DataTable rows={leaves} columns={[{ header: "Person", cell: (r) => <PersonCell name={r.employee.fullName} src={r.employee.photoUrl} /> }, { header: "Type", cell: (r) => r.leaveType.name }, { header: "Dates", cell: (r) => `${r.startDate.toISOString().slice(0, 10)} → ${r.endDate.toISOString().slice(0, 10)}` }, { header: "Days", cell: (r) => Number(r.days) }, { header: "Reason", cell: (r) => <span className="text-muted">{r.reason ?? "—"}</span> }, { header: "", cell: (r) => (can(user.role, "leave:approve") ? <DecideLeave approve={decideLeaveAction.bind(null, r.id, "APPROVE")} reject={decideLeaveAction.bind(null, r.id, "REJECT")} /> : null) }]} /> : <NoData>No pending leave.</NoData>}
          </Section>
          <Section title={`Timesheets (${sheets.length})`}>
            {sheets.length ? <DataTable rows={sheets} columns={[{ header: "Person", cell: (r) => <PersonCell name={r.employee.fullName} src={r.employee.photoUrl} /> }, { header: "Date", cell: (r) => r.date.toISOString().slice(0, 10) }, { header: "Project", cell: (r) => r.project?.name ?? "—" }, { header: "Time", cell: (r) => fmtMinutes(r.minutes) }, { header: "Billable", cell: (r) => (r.billable ? "Yes" : "No") }, { header: "Status", cell: (r) => <StatusBadge value={r.status} /> }, { header: "", cell: (r) => (can(user.role, "timesheets:approve") ? <div className="flex gap-1"><ActionForm action={decideTimesheetAction.bind(null, r.id, "APPROVED")}><SubmitButton className="h-8 px-2 text-xs">Approve</SubmitButton></ActionForm><ActionForm action={decideTimesheetAction.bind(null, r.id, "REJECTED")}><SubmitButton variant="danger" className="h-8 px-2 text-xs">Reject</SubmitButton></ActionForm></div> : null) }]} /> : <NoData>No timesheets waiting.</NoData>}
          </Section>
        </>
      )}
    </>
  );
}
