import Link from "next/link";
import { db } from "@/lib/db/client";
import { requireAccess } from "@/lib/os/guard";
import { FilterBar, str, type SP } from "@/components/admin/os";
import { PageHeader, Panel } from "@/components/admin/ui";
import { cn } from "@/lib/cn";

export const metadata = { title: "Attendance calendar" };

const LEGEND: [string, string][] = [["present", "bg-emerald-500/70"], ["late", "bg-amber-500/70"], ["half", "bg-amber-300/70"], ["leave", "bg-indigo-500/60"], ["absent", "bg-red-500/70"], ["holiday", "bg-sky-500/50"]];

export default async function AttendanceCalendarPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAccess("attendance:view");
  const sp = await searchParams;
  const m = /^\d{4}-\d{2}$/.test(str(sp, "month", 7)) ? str(sp, "month", 7) : new Date().toISOString().slice(0, 7);
  const employee = str(sp, "employee", 40);
  const start = new Date(`${m}-01T00:00:00Z`);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
  const [days, holidays, employees, emp] = await Promise.all([
    db.attendanceDay.findMany({ where: { date: { gte: start, lte: end }, ...(employee && { employeeId: employee }) }, select: { date: true, status: true, lateMinutes: true, halfDay: true, checkInAt: true } }),
    db.holiday.findMany({ where: { date: { gte: start, lte: end } }, select: { date: true, name: true } }),
    db.employee.findMany({ where: { archivedAt: null }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true } }),
    employee ? db.employee.findUnique({ where: { id: employee }, select: { fullName: true } }) : null,
  ]);
  const byDay = new Map<string, { present: number; late: number; half: number; leave: number; absent: number }>();
  for (const d of days) {
    const k = d.date.toISOString().slice(0, 10);
    const c = byDay.get(k) ?? { present: 0, late: 0, half: 0, leave: 0, absent: 0 };
    if (d.checkInAt) c.present++;
    if (d.lateMinutes > 0) c.late++;
    if (d.halfDay) c.half++;
    if (d.status === "ON_LEAVE") c.leave++;
    if (d.status === "ABSENT") c.absent++;
    byDay.set(k, c);
  }
  const hol = new Map(holidays.map((h) => [h.date.toISOString().slice(0, 10), h.name]));
  const lead = (start.getUTCDay() + 6) % 7;
  const cells = [...Array(lead).fill(null), ...Array.from({ length: end.getUTCDate() }, (_, i) => new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), i + 1)))];
  const shift = (n: number) => new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + n, 1)).toISOString().slice(0, 7);
  const q = (month: string) => `?month=${month}${employee ? `&employee=${employee}` : ""}`;
  return (
    <>
      <PageHeader title="Attendance calendar" description={emp ? `${emp.fullName} — ${m}` : `Organisation — ${m}`} crumbs={[{ label: "Attendance", href: "/admin/attendance" }, { label: "Calendar" }]} actions={<><Link href={q(shift(-1))} className="btn-secondary h-9 px-3 text-[13px]">← Previous</Link><Link href={q(shift(1))} className="btn-secondary h-9 px-3 text-[13px]">Next →</Link></>} />
      <FilterBar filters={[{ type: "select", name: "employee", label: "Whole organisation", options: employees.map((e) => [e.id, e.fullName] as const) }]} values={{ employee }} hidden={{ month: m }} />
      <Panel>
        <div className="mb-3 flex flex-wrap gap-3 text-xs text-muted">{LEGEND.map(([l, c]) => <span key={l} className="flex items-center gap-1.5"><span className={cn("size-2.5 rounded-sm", c)} /> {l}</span>)}</div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-dim">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d}>{d}</div>)}</div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (!d) return <div key={`b${i}`} />;
            const k = d.toISOString().slice(0, 10);
            const c = byDay.get(k);
            return (
              <div key={k} className={cn("min-h-16 rounded-md border border-line p-1.5 text-left", hol.has(k) && "bg-sky-500/10")}>
                <p className="text-[11px] font-medium text-fg">{d.getUTCDate()}</p>
                {hol.has(k) && <p className="truncate text-[10px] text-sky-700">{hol.get(k)}</p>}
                {c && (
                  <div className="mt-1 flex flex-wrap gap-1 text-[10px] tabular-nums">
                    {c.present > 0 && <span className="rounded bg-emerald-500/15 px-1 text-emerald-700">{employee ? "present" : c.present}</span>}
                    {c.late > 0 && <span className="rounded bg-amber-500/15 px-1 text-amber-700">{employee ? "late" : `${c.late} late`}</span>}
                    {c.half > 0 && <span className="rounded bg-amber-300/20 px-1 text-amber-700">{employee ? "half day" : `${c.half} half`}</span>}
                    {c.leave > 0 && <span className="rounded bg-indigo-500/15 px-1 text-indigo-700">{employee ? "leave" : `${c.leave} leave`}</span>}
                    {c.absent > 0 && <span className="rounded bg-red-500/15 px-1 text-red-700">{employee ? "absent" : `${c.absent} absent`}</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Panel>
    </>
  );
}
