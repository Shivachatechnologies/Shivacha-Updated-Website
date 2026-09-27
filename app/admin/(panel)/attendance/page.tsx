import Link from "next/link";
import { requireAccess } from "@/lib/os/guard";
import { liveWorkforce, summarize } from "@/lib/workforce/attendance";
import { fmtMinutes } from "@/lib/workforce/time";
import { DataTable, Kpi, KpiGrid, Section } from "@/components/admin/os";
import { PageHeader, fmtDate, label } from "@/components/admin/ui";
import { AutoRefresh } from "@/components/admin/ai/auto-refresh";
import { AttendanceBadge, GeofenceBadge, NoData, PersonCell } from "@/components/admin/workforce/ui";

export const metadata = { title: "Attendance" };

export default async function AttendancePage() {
  await requireAccess("attendance:view");
  const rows = await liveWorkforce({});
  const s = summarize(rows);
  const exceptions = rows.filter((r) => r.late > 0 || r.state === "ABSENT" || r.geofence === "OUTSIDE" || r.geofence === "NO_LOCATION");
  return (
    <>
      <AutoRefresh active every={60_000} />
      <PageHeader
        title="Attendance"
        description="Today, per employee time zone. Counted from check-ins; nothing is estimated."
        crumbs={[{ label: "Human Workforce" }, { label: "Attendance" }]}
        actions={
          <>
            <Link href="/admin/attendance/live" className="btn-secondary h-9 px-3 text-[13px]">Live workforce</Link>
            <Link href="/admin/attendance/history" className="btn-secondary h-9 px-3 text-[13px]">History</Link>
            <Link href="/admin/attendance/calendar" className="btn-secondary h-9 px-3 text-[13px]">Calendar</Link>
          </>
        }
      />
      {rows.length === 0 ? (
        <NoData>No employees yet. <Link href="/admin/employees/new" className="text-brand-blue">Add an employee</Link>.</NoData>
      ) : (
        <>
          <KpiGrid cols={6}>
            <Kpi label="Employees" value={s.total} href="/admin/employees" />
            <Kpi label="Present" value={s.present} tone="green" />
            <Kpi label="Absent" value={s.absent} tone={s.absent ? "red" : undefined} hint={`${s.notYet} not checked in yet`} />
            <Kpi label="Late" value={s.late} tone={s.late ? "amber" : undefined} />
            <Kpi label="On leave" value={s.onLeave} />
            <Kpi label="Remote" value={s.remote} hint={`${s.office} in office`} />
            <Kpi label="Active now" value={s.working} href="/admin/attendance/live" />
            <Kpi label="On break" value={s.onBreak} />
            <Kpi label="Away" value={s.away} tone={s.away ? "amber" : undefined} />
            <Kpi label="Checked out" value={s.checkedOut} />
            <Kpi label="Location exceptions" value={s.outsideGeofence} tone={s.outsideGeofence ? "red" : undefined} />
          </KpiGrid>
          <Section title={`Exceptions today (${exceptions.length})`}>
            {exceptions.length ? (
              <DataTable
                rows={exceptions}
                columns={[
                  { header: "Employee", cell: (r) => <PersonCell name={r.name} src={r.photoUrl} sub={r.department ?? r.code} href={`/admin/employees/${r.id}?tab=attendance`} /> },
                  { header: "State", cell: (r) => <AttendanceBadge state={r.state} /> },
                  { header: "Late", cell: (r) => (r.late ? `${r.late} min` : "—") },
                  { header: "Check-in", cell: (r) => fmtDate(r.checkInAt, true) },
                  { header: "Geofence", cell: (r) => <GeofenceBadge value={r.geofence} /> },
                ]}
              />
            ) : (
              <NoData>No exceptions today.</NoData>
            )}
          </Section>
          <Section title="Everyone today">
            <DataTable
              rows={rows}
              columns={[
                { header: "Employee", cell: (r) => <PersonCell name={r.name} src={r.photoUrl} sub={r.department ?? r.code} href={`/admin/employees/${r.id}?tab=attendance`} /> },
                { header: "State", cell: (r) => <AttendanceBadge state={r.state} /> },
                { header: "Mode", cell: (r) => label(r.dayWorkMode ?? r.workMode) },
                { header: "In", cell: (r) => fmtDate(r.checkInAt, true) },
                { header: "Out", cell: (r) => fmtDate(r.checkOutAt, true) },
                { header: "Worked", cell: (r) => (r.checkInAt ? fmtMinutes(r.workedMinutes) : "—") },
              ]}
            />
          </Section>
        </>
      )}
    </>
  );
}
