import Link from "next/link";
import { db } from "@/lib/db/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { decideTimesheetAction } from "@/lib/workforce/work-actions";
import { fmtMinutes } from "@/lib/workforce/time";
import { Kpi, KpiGrid, ListView, StatusBadge, pageOf, pick, str, PAGE_SIZE, type SP } from "@/components/admin/os";
import { ActionForm } from "@/components/admin/forms";
import { SubmitButton } from "@/components/admin/client";
import { PersonCell } from "@/components/admin/workforce/ui";

export const metadata = { title: "Timesheets" };

export default async function TimesheetsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireAccess("timesheets:view");
  const sp = await searchParams;
  const values = { employee: str(sp, "employee", 40), project: str(sp, "project", 40), status: pick(sp, "status", ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"] as const), billable: pick(sp, "billable", ["1", "0"] as const), from: str(sp, "from", 10), to: str(sp, "to", 10), page: str(sp, "page") };
  const d = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00Z`) : undefined);
  const where: Prisma.TimesheetWhereInput = { ...(values.employee && { employeeId: values.employee }), ...(values.project && { projectId: values.project }), ...(values.status && { status: values.status }), ...(values.billable && { billable: values.billable === "1" }), ...((values.from || values.to) && { date: { gte: d(values.from), lte: d(values.to) } }) };
  const page = pageOf(sp);
  const [total, rows, sums, employees, projects] = await Promise.all([
    db.timesheet.count({ where }),
    db.timesheet.findMany({ where, orderBy: { date: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { employee: { select: { id: true, fullName: true, photoUrl: true, employeeCode: true } }, project: { select: { id: true, name: true } }, task: { select: { title: true } } } }),
    db.timesheet.groupBy({ by: ["billable"], where, _sum: { minutes: true } }),
    db.employee.findMany({ orderBy: { fullName: "asc" }, select: { id: true, fullName: true } }),
    db.project.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const approve = can(user.role, "timesheets:approve");
  const billable = sums.find((s) => s.billable)?._sum.minutes ?? 0;
  const non = sums.find((s) => !s.billable)?._sum.minutes ?? 0;
  return (
    <ListView
      title="Timesheets"
      description="Time employees logged against projects and tasks."
      crumbs={[{ label: "Human Workforce" }, { label: "Timesheets" }]}
      above={<div className="mb-4"><KpiGrid cols={3}><Kpi label="Billable" value={fmtMinutes(billable)} /><Kpi label="Non-billable" value={fmtMinutes(non)} /><Kpi label="Entries" value={total} /></KpiGrid></div>}
      filters={[
        { type: "select", name: "employee", label: "All employees", options: employees.map((e) => [e.id, e.fullName] as const) },
        { type: "select", name: "project", label: "All projects", options: projects.map((e) => [e.id, e.name] as const) },
        { type: "select", name: "status", label: "Any status", options: [["SUBMITTED", "Submitted"], ["APPROVED", "Approved"], ["REJECTED", "Rejected"]] as const },
        { type: "select", name: "billable", label: "Billable or not", options: [["1", "Billable"], ["0", "Non-billable"]] as const },
        { type: "date", name: "from", label: "From" },
        { type: "date", name: "to", label: "To" },
      ]}
      values={values}
      rows={rows}
      total={total}
      page={page}
      basePath="/admin/timesheets"
      empty={{ title: "No data yet", description: "Employees log time from their portal (/employee/timesheets)." }}
      columns={[
        { header: "Date", cell: (r) => r.date.toISOString().slice(0, 10) },
        { header: "Employee", cell: (r) => <PersonCell name={r.employee.fullName} src={r.employee.photoUrl} sub={r.employee.employeeCode} href={`/admin/employees/${r.employee.id}?tab=timesheets`} /> },
        { header: "Project", cell: (r) => (r.project ? <Link href={`/admin/projects/${r.project.id}`} className="hover:text-brand-blue">{r.project.name}</Link> : "—") },
        { header: "Task", cell: (r) => <span className="text-muted">{r.task?.title ?? "—"}</span> },
        { header: "Time", cell: (r) => `${r.startAt ? `${r.startAt.toISOString().slice(11, 16)}–${r.endAt?.toISOString().slice(11, 16)} · ` : ""}${fmtMinutes(r.minutes)}` },
        { header: "Billable", cell: (r) => (r.billable ? "Yes" : "No") },
        { header: "Notes", cell: (r) => <span className="text-muted">{r.notes ?? "—"}</span> },
        { header: "Status", cell: (r) => <StatusBadge value={r.status} /> },
        { header: "", cell: (r) => (approve && r.status === "SUBMITTED" ? <div className="flex gap-1"><ActionForm action={decideTimesheetAction.bind(null, r.id, "APPROVED")}><SubmitButton className="h-8 px-2 text-xs">Approve</SubmitButton></ActionForm><ActionForm action={decideTimesheetAction.bind(null, r.id, "REJECTED")}><SubmitButton variant="danger" className="h-8 px-2 text-xs">Reject</SubmitButton></ActionForm></div> : null) },
      ]}
    />
  );
}
