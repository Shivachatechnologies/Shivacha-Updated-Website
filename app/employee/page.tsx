import Link from "next/link";
import { db } from "@/lib/db/client";
import { requireSelf } from "@/lib/workforce/portal";
import { getWorkforcePolicy } from "@/lib/workforce/settings";
import { needsLocation } from "@/lib/workforce/policy";
import { employeeTz } from "@/lib/workforce/attendance";
import { fmtMinutes, minutesBetween, workDate } from "@/lib/workforce/time";
import { KV, StatusBadge } from "@/components/admin/os";
import { Panel, fmtDate, label } from "@/components/admin/ui";
import { CheckInPanel } from "@/components/employee/checkin";
import { AttendanceBadge } from "@/components/admin/workforce/ui";

export const metadata = { title: "Today" };

export default async function EmployeeHome() {
  const { user, me } = await requireSelf();
  if (!me) return null;
  const policy = await getWorkforcePolicy();
  const tz = employeeTz(me);
  const now = new Date();
  const today = workDate(now, tz);
  const [day, announcements, tasks, goals, leave, pendingReviews] = await Promise.all([
    db.attendanceDay.findUnique({ where: { employeeId_date: { employeeId: me.id, date: today } }, include: { events: { orderBy: { at: "asc" } } } }),
    db.announcement.findMany({ where: { AND: [{ OR: [{ departmentId: null }, { departmentId: me.departmentId ?? undefined }] }, { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }] }, orderBy: { publishedAt: "desc" }, take: 5 }),
    db.task.findMany({ where: { assigneeId: user.id, status: { not: "DONE" } }, orderBy: [{ dueDate: "asc" }], take: 8, select: { id: true, title: true, status: true, dueDate: true, project: { select: { id: true, name: true } } } }),
    db.performanceGoal.findMany({ where: { employeeId: me.id, status: { notIn: ["ACHIEVED", "CANCELLED"] } }, orderBy: { dueDate: "asc" }, take: 5 }),
    db.leaveRequest.findMany({ where: { employeeId: me.id, endDate: { gte: today }, status: { in: ["PENDING_MANAGER", "PENDING_HR", "APPROVED"] } }, orderBy: { startDate: "asc" }, take: 5, include: { leaveType: { select: { name: true } } } }),
    db.performanceReview.count({ where: { employeeId: me.id, status: "SELF_REVIEW" } }),
  ]);
  const status = day?.status ?? "NOT_CHECKED_IN";
  const worked = day?.checkInAt ? (day.checkOutAt ? day.workMinutes : Math.max(0, minutesBetween(day.checkInAt, now) - day.breakMinutes)) : 0;
  const mode = me.workMode as "OFFICE" | "REMOTE" | "HYBRID";
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Panel title={`Today · ${today.toISOString().slice(0, 10)}`} action={<AttendanceBadge state={status} />}>
          <CheckInPanel status={status} askLocation={needsLocation(policy, mode)} purpose={policy.locationPurpose} hybrid={mode === "HYBRID"} periodic={{ enabled: policy.locationPolicy === "PERIODIC", minutes: policy.periodicMinutes }} />
          <div className="mt-4">
            <KV
              cols={3}
              items={[
                ["Checked in", fmtDate(day?.checkInAt, true)],
                ["Checked out", fmtDate(day?.checkOutAt, true)],
                ["Worked", day?.checkInAt ? fmtMinutes(worked) : "—"],
                ["Breaks", day ? fmtMinutes(day.breakMinutes) : "—"],
                ["Late by", day?.lateMinutes ? `${day.lateMinutes} min` : "—"],
                ["Shift", me.shift ? `${me.shift.name} (${me.shift.startTime}–${me.shift.endTime})` : "Not assigned"],
              ]}
            />
          </div>
          {policy.locationPolicy !== "NONE" && (
            <p className="mt-3 text-xs text-dim">Location policy: {policy.locationPolicy === "PERIODIC" ? "work-location updates while checked in, only when you turn them on below." : "checked only when you check in or out."} Your manager and HR can see the result of each check.</p>
          )}
        </Panel>
        <Panel title="Announcements">
          {announcements.length ? (
            <ul className="space-y-3">
              {announcements.map((a) => (
                <li key={a.id}>
                  <p className="text-sm font-medium">{a.title}</p>
                  <p className="whitespace-pre-line text-sm text-muted">{a.body}</p>
                  <p className="text-xs text-dim">{fmtDate(a.publishedAt)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No announcements.</p>
          )}
        </Panel>
      </div>
      {pendingReviews > 0 && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          You have a self-review to complete. <Link href="/employee/performance" className="font-medium text-brand-blue">Open performance</Link>
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="My open tasks">
          {tasks.length ? (
            <ul className="space-y-2 text-sm">
              {tasks.map((t) => (
                <li key={t.id} className="flex items-start justify-between gap-2">
                  <span>
                    {t.title}
                    {t.project && <span className="block text-xs text-dim">{t.project.name}</span>}
                  </span>
                  <span className="shrink-0 text-right text-xs">
                    <StatusBadge value={t.status} text={label(t.status)} />
                    {t.dueDate && <span className="block text-dim">Due {fmtDate(t.dueDate)}</span>}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No open tasks assigned to you.</p>
          )}
        </Panel>
        <Panel title="My goals" action={<Link href="/employee/performance" className="text-xs text-brand-blue">All goals</Link>}>
          {goals.length ? (
            <ul className="space-y-2 text-sm">
              {goals.map((g) => (
                <li key={g.id}>
                  {g.objective}
                  <span className="block text-xs text-dim">
                    {g.target ? `${Number(g.current)} / ${Number(g.target)} ${g.unit ?? ""}` : label(g.status)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No active goals.</p>
          )}
        </Panel>
        <Panel title="Upcoming leave" action={<Link href="/employee/leave" className="text-xs text-brand-blue">Request leave</Link>}>
          {leave.length ? (
            <ul className="space-y-2 text-sm">
              {leave.map((l) => (
                <li key={l.id} className="flex justify-between gap-2">
                  <span>
                    {l.leaveType.name}
                    <span className="block text-xs text-dim">{l.startDate.toISOString().slice(0, 10)} → {l.endDate.toISOString().slice(0, 10)}</span>
                  </span>
                  <StatusBadge value={l.status} text={label(l.status)} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Nothing upcoming.</p>
          )}
        </Panel>
      </div>
      {day?.events.length ? (
        <Panel title="Today's punches">
          <ul className="space-y-1 text-sm">
            {day.events.map((e) => (
              <li key={e.id} className="flex flex-wrap gap-x-3 text-muted">
                <span className="text-fg">{fmtDate(e.at, true)}</span>
                <span>{label(e.type)}</span>
                {e.geofence && <span>Location: {label(e.geofence)}{e.distanceM != null ? ` (${e.distanceM} m from office)` : ""}</span>}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
