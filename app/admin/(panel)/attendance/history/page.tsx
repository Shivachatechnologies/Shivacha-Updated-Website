import { db } from "@/lib/db/client";
import { requireAccess } from "@/lib/os/guard";
import { historyFilters, HISTORY_STATUSES } from "@/lib/workforce/history";
import { fmtMinutes } from "@/lib/workforce/time";
import { ListView, enumOptions, pageOf, qs, PAGE_SIZE, type SP } from "@/components/admin/os";
import { fmtDate, label } from "@/components/admin/ui";
import { AttendanceBadge, GeofenceBadge, PersonCell } from "@/components/admin/workforce/ui";

export const metadata = { title: "Attendance history" };

export default async function AttendanceHistoryPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAccess("attendance:view");
  const sp = await searchParams;
  const { values, where } = historyFilters(sp);
  const page = pageOf(sp);
  const [total, rows, employees, departments, teams, offices] = await Promise.all([
    db.attendanceDay.count({ where }),
    db.attendanceDay.findMany({ where, orderBy: [{ date: "desc" }, { employee: { fullName: "asc" } }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { employee: { select: { id: true, fullName: true, employeeCode: true, photoUrl: true } }, office: { select: { name: true } } } }),
    db.employee.findMany({ orderBy: { fullName: "asc" }, select: { id: true, fullName: true } }),
    db.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.team.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.officeLocation.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return (
    <ListView
      title="Attendance history"
      description={values.from ? undefined : "Last 30 days unless a date range is chosen."}
      crumbs={[{ label: "Attendance", href: "/admin/attendance" }, { label: "History" }]}
      actions={<a href={`/admin/attendance/export${qs({ ...values, page: undefined })}`} className="btn-secondary h-9 px-3 text-[13px]">Export CSV</a>}
      filters={[
        { type: "select", name: "employee", label: "All employees", options: employees.map((e) => [e.id, e.fullName] as const) },
        { type: "select", name: "department", label: "Any department", options: departments.map((e) => [e.id, e.name] as const) },
        { type: "select", name: "team", label: "Any team", options: teams.map((e) => [e.id, e.name] as const) },
        { type: "select", name: "status", label: "Any status", options: enumOptions(HISTORY_STATUSES) },
        { type: "select", name: "office", label: "Any office", options: offices.map((e) => [e.id, e.name] as const) },
        { type: "select", name: "mode", label: "Any mode", options: [["OFFICE", "Office"], ["REMOTE", "Remote"]] as const },
        { type: "select", name: "late", label: "On time or late", options: [["1", "Late only"]] as const },
        { type: "date", name: "from", label: "From" },
        { type: "date", name: "to", label: "To" },
      ]}
      values={values}
      rows={rows}
      total={total}
      page={page}
      basePath="/admin/attendance/history"
      empty={{ title: "No data yet", description: "Attendance appears here once employees check in." }}
      columns={[
        { header: "Date", cell: (r) => r.date.toISOString().slice(0, 10) },
        { header: "Employee", cell: (r) => <PersonCell name={r.employee.fullName} src={r.employee.photoUrl} sub={r.employee.employeeCode} href={`/admin/employees/${r.employee.id}?tab=attendance`} /> },
        { header: "In", cell: (r) => fmtDate(r.checkInAt, true) },
        { header: "Out", cell: (r) => fmtDate(r.checkOutAt, true) },
        { header: "Break", cell: (r) => fmtMinutes(r.breakMinutes) },
        { header: "Worked", cell: (r) => fmtMinutes(r.workMinutes) },
        { header: "Status", cell: (r) => <AttendanceBadge state={r.halfDay ? "HALF_DAY" : r.status} /> },
        { header: "Location", cell: (r) => <span className="flex items-center gap-1.5">{r.workMode ? label(r.workMode) : "—"} {r.office?.name ? <span className="text-xs text-dim">{r.office.name}</span> : null} <GeofenceBadge value={r.geofence} /></span> },
        { header: "Late", cell: (r) => (r.lateMinutes ? `${r.lateMinutes}m` : "—") },
        { header: "Early out", cell: (r) => (r.earlyCheckout ? "Yes" : "—") },
        { header: "Source", cell: (r) => <span className="text-xs text-dim">{r.source ?? "—"}</span> },
      ]}
    />
  );
}
