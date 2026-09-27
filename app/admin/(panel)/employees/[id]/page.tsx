import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { can, defaultCan, PERMISSIONS, ROLE_LABELS, type RoleName } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { assertEmployeeAccess } from "@/lib/workforce/access";
import { liveWorkforce } from "@/lib/workforce/attendance";
import { addCompensationAction, archiveEmployeeAction, deleteEmployeeDocumentAction, saveEmployeeAction, uploadEmployeeDocumentAction } from "@/lib/workforce/employee-actions";
import { overrideAttendanceAction } from "@/lib/workforce/attendance-actions";
import { HR_DOC_KINDS } from "@/lib/workforce/documents";
import { employeeMetrics } from "@/lib/workforce/metrics";
import { employeeFormOptions } from "@/lib/workforce/options";
import { fmtMinutes } from "@/lib/workforce/time";

import { CURRENCIES, fmtMoney as formatMoney } from "@/lib/os/money";
import { AuthError } from "@/lib/auth/session";
import { DataTable, KV, Kpi, KpiGrid, Section, SelectField, StatusBadge, Tabs, TextArea, TextField, Timeline, enumOptions, type SP } from "@/components/admin/os";
import { Badge, PageHeader, Panel, fmtDate, label } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/forms";
import { ConfirmButton, SubmitButton } from "@/components/admin/client";
import { AttendanceBadge, Avatar, GeofenceBadge, NoData } from "@/components/admin/workforce/ui";
import { EmployeeForm } from "@/components/admin/workforce/employee-form";

export const metadata = { title: "Employee" };

const TABS = ["overview", "personal", "employment", "attendance", "leave", "timesheets", "tasks", "performance", "payroll", "documents", "activity", "permissions"] as const;
type Tab = (typeof TABS)[number];

export default async function EmployeeProfile({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  try {
    await assertEmployeeAccess(user, id, "view");
  } catch (e) {
    if (e instanceof AuthError) notFound();
    throw e;
  }
  const emp = await db.employee.findUnique({
    where: { id },
    include: { department: true, team: true, manager: { select: { id: true, fullName: true } }, office: true, shift: true, user: { select: { id: true, name: true, email: true, role: true, active: true, lastLoginAt: true } }, reports: { select: { id: true, fullName: true, designation: true }, where: { archivedAt: null } } },
  });
  if (!emp) notFound();
  const tab: Tab = (TABS as readonly string[]).includes(String(sp.tab)) ? (sp.tab as Tab) : "overview";
  const hr = can(user.role, "employees:view");
  const manage = can(user.role, "employees:manage");
  const canPay = can(user.role, "compensation:view");
  const canDocs = can(user.role, "employeeDocs:view");
  const visible: Tab[] = TABS.filter((t) => (t === "payroll" ? canPay : t === "documents" ? canDocs : t === "permissions" || t === "activity" ? hr : true));
  const active = visible.includes(tab) ? tab : "overview";
  await audit({ userId: user.id, action: active === "payroll" ? "employee.salary.viewed" : "employee.viewed", entity: "Employee", entityId: id, metadata: { tab: active } });
  const base = `/admin/employees/${id}`;
  const [live] = await liveWorkforce({ id });

  return (
    <>
      <PageHeader
        title={emp.fullName}
        description={[emp.employeeCode, emp.designation ?? emp.jobTitle, emp.department?.name].filter(Boolean).join(" · ")}
        crumbs={[{ label: "Employees", href: hr ? "/admin/employees" : "/admin/team" }, { label: emp.fullName }]}
        actions={
          <div className="flex items-center gap-3">
            <Avatar name={emp.fullName} src={emp.photoUrl} size={40} />
            <StatusBadge value={emp.status} />
            {live && <AttendanceBadge state={live.state} />}
            {emp.archivedAt && <Badge tone="red">Archived</Badge>}
            {can(user.role, "employees:archive") && (
              <ActionForm action={archiveEmployeeAction.bind(null, id, !emp.archivedAt)}>
                <ConfirmButton message={emp.archivedAt ? "Restore this employee?" : "Archive this employee? Their records are kept."} confirmLabel={emp.archivedAt ? "Restore" : "Archive"} danger={!emp.archivedAt} className="btn-secondary h-9 px-3 text-[13px]">
                  {emp.archivedAt ? "Restore" : "Archive"}
                </ConfirmButton>
              </ActionForm>
            )}
          </div>
        }
      />
      <Tabs active={active} items={visible.map((t) => ({ key: t, label: label(t), href: `${base}?tab=${t}` }))} />
      {active === "overview" && <Overview emp={emp} live={live} />}
      {(active === "personal" || active === "employment") &&
        (manage ? (
          <EmployeeForm action={saveEmployeeAction.bind(null, id)} employee={emp} options={await employeeFormOptions()} show={active === "personal" ? ["identity"] : ["employment", "organization"]} />
        ) : (
          <Panel>
            <KV
              cols={3}
              items={
                active === "personal"
                  ? [["Work email", emp.workEmail], ["Gender", emp.gender], ["Emergency contact", [emp.emergencyName, emp.emergencyRelation].filter(Boolean).join(" · ")]]
                  : [["Designation", emp.designation], ["Type", label(emp.employmentType)], ["Joining date", fmtDate(emp.joiningDate)], ["Manager", emp.manager?.fullName], ["Office", emp.office?.name], ["Work mode", label(emp.workMode)], ["Shift", emp.shift?.name]]
              }
            />
          </Panel>
        ))}
      {active === "attendance" && <AttendanceTab id={id} canOverride={can(user.role, "attendance:override")} canLocation={can(user.role, "attendance:location")} />}
      {active === "leave" && <LeaveTab id={id} />}
      {active === "timesheets" && <TimesheetTab id={id} />}
      {active === "tasks" && <TasksTab userId={emp.userId} />}
      {active === "performance" && <PerformanceTab emp={emp} />}
      {active === "payroll" && <PayrollTab id={id} canManage={can(user.role, "compensation:manage")} />}
      {active === "documents" && <DocumentsTab id={id} canManage={can(user.role, "employeeDocs:manage")} />}
      {active === "activity" && <ActivityTab id={id} />}
      {active === "permissions" && <PermissionsTab emp={emp} />}
    </>
  );
}

type Emp = NonNullable<Awaited<ReturnType<typeof loadEmp>>>;
const loadEmp = (id: string) => db.employee.findUnique({ where: { id }, include: { department: true, team: true, manager: { select: { id: true, fullName: true } }, office: true, shift: true, user: { select: { id: true, name: true, email: true, role: true, active: true, lastLoginAt: true } }, reports: { select: { id: true, fullName: true, designation: true } } } });

async function Overview({ emp, live }: { emp: Emp; live: Awaited<ReturnType<typeof liveWorkforce>>[number] | undefined }) {
  const uid = emp.userId;
  const year = new Date().getUTCFullYear();
  const [balances, openTasks, deals, proposals, tickets, projects] = await Promise.all([
    db.leaveBalance.findMany({ where: { employeeId: emp.id, year }, include: { leaveType: { select: { name: true } } } }),
    uid ? db.task.count({ where: { assigneeId: uid, status: { not: "DONE" } } }) : 0,
    uid ? db.deal.count({ where: { ownerId: uid, deletedAt: null, stage: { notIn: ["WON", "LOST"] } } }) : 0,
    uid ? db.proposal.count({ where: { createdById: uid } }) : 0,
    uid ? db.ticket.count({ where: { assigneeId: uid, status: { in: ["OPEN", "IN_PROGRESS", "WAITING_FOR_CLIENT"] } } }) : 0,
    uid ? db.project.count({ where: { managerId: uid, deletedAt: null, status: { in: ["PLANNED", "ACTIVE"] } } }) : 0,
  ]);
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Panel title="Today">
          {live ? (
            <KV cols={3} items={[["State", <AttendanceBadge key="s" state={live.state} />], ["Check-in", fmtDate(live.checkInAt, true)], ["Worked", fmtMinutes(live.workedMinutes)], ["Late", live.late ? `${live.late} min` : "No"], ["Mode today", live.dayWorkMode ? label(live.dayWorkMode) : "—"], ["Geofence", <GeofenceBadge key="g" value={live.geofence} />]]} />
          ) : (
            <NoData>Not scheduled today (inactive status).</NoData>
          )}
        </Panel>
        <Panel title="Work across Shivacha OS">
          {uid ? (
            <KpiGrid cols={5}>
              <Kpi label="Open tasks" value={openTasks} href={`/admin/tasks?mine=`} />
              <Kpi label="Open deals" value={deals} />
              <Kpi label="Proposals" value={proposals} />
              <Kpi label="Open tickets" value={tickets} />
              <Kpi label="Active projects" value={projects} />
            </KpiGrid>
          ) : (
            <p className="text-sm text-muted">No login is linked, so CRM, projects, support and tasks cannot be attributed to this person. Link a login on the Employment tab.</p>
          )}
        </Panel>
        <Panel title="Direct reports">{emp.reports.length ? <ul className="grid gap-1 sm:grid-cols-2">{emp.reports.map((r) => <li key={r.id}><Link href={`/admin/employees/${r.id}`} className="text-sm text-fg hover:text-brand-blue">{r.fullName}</Link> <span className="text-xs text-dim">{r.designation}</span></li>)}</ul> : <NoData>No direct reports.</NoData>}</Panel>
      </div>
      <div className="space-y-4">
        <Panel title="Profile">
          <KV cols={1} items={[["Employee ID", emp.employeeCode], ["Work email", emp.workEmail], ["Department", emp.department?.name], ["Team", emp.team?.name], ["Manager", emp.manager ? <Link key="m" href={`/admin/employees/${emp.manager.id}`} className="hover:text-brand-blue">{emp.manager.fullName}</Link> : null], ["Office", emp.office?.name], ["Work mode", label(emp.workMode)], ["Shift", emp.shift ? `${emp.shift.name} (${emp.shift.startTime}–${emp.shift.endTime} ${emp.shift.timezone})` : null], ["Joined", fmtDate(emp.joiningDate)], ["Type", label(emp.employmentType)]]} />
        </Panel>
        <Panel title={`Leave balance ${year}`}>{balances.length ? <ul className="space-y-1 text-sm">{balances.map((b) => <li key={b.id} className="flex justify-between"><span className="text-muted">{b.leaveType.name}</span><span className="tabular-nums text-fg">{Number(b.allocated) - Number(b.used)} / {Number(b.allocated)}</span></li>)}</ul> : <NoData>No balances allocated.</NoData>}</Panel>
      </div>
    </div>
  );
}

async function AttendanceTab({ id, canOverride, canLocation }: { id: string; canOverride: boolean; canLocation: boolean }) {
  const days = await db.attendanceDay.findMany({ where: { employeeId: id }, orderBy: { date: "desc" }, take: 45, include: { events: { orderBy: { at: "asc" }, select: { id: true, type: true, at: true, method: true, geofence: true, distanceM: true, accuracyM: true, device: true, browser: true } } } });
  return (
    <div className="space-y-4">
      {days.length ? (
        <DataTable
          rows={days}
          columns={[
            { header: "Date", cell: (d) => d.date.toISOString().slice(0, 10) },
            { header: "Status", cell: (d) => <AttendanceBadge state={d.halfDay ? "HALF_DAY" : d.status} /> },
            { header: "In", cell: (d) => fmtDate(d.checkInAt, true) },
            { header: "Out", cell: (d) => fmtDate(d.checkOutAt, true) },
            { header: "Break", cell: (d) => fmtMinutes(d.breakMinutes) },
            { header: "Worked", cell: (d) => fmtMinutes(d.workMinutes) },
            { header: "Late", cell: (d) => (d.lateMinutes ? `${d.lateMinutes}m` : "—") },
            { header: "Mode", cell: (d) => (d.workMode ? label(d.workMode) : "—") },
            ...(canLocation ? [{ header: "Geofence", cell: (d: (typeof days)[number]) => <GeofenceBadge value={d.geofence} /> }] : []),
            { header: "Source", cell: (d) => <span className="text-xs text-dim">{d.source ?? "—"}{d.events.length ? ` · ${d.events.map((e) => e.device).filter(Boolean)[0] ?? ""}` : ""}</span> },
          ]}
        />
      ) : (
        <NoData />
      )}
      {canOverride && (
        <Panel title="Attendance override">
          <ActionForm action={overrideAttendanceAction} className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <input type="hidden" name="employeeId" value={id} />
            <TextField name="date" type="date" label="Date" required />
            <TextField name="checkIn" type="time" label="Check-in (local)" />
            <TextField name="checkOut" type="time" label="Check-out (local)" />
            <TextField name="breakMinutes" type="number" label="Break (min)" defaultValue={0} />
            <SelectField name="status" label="Status" blank="From times" options={enumOptions(["WORKING", "CHECKED_OUT", "ABSENT", "HALF_DAY", "ON_LEAVE", "HOLIDAY"])} />
            <TextField name="reason" label="Reason" required className="sm:col-span-3 lg:col-span-5" />
            <div className="flex items-end"><SubmitButton>Save override</SubmitButton></div>
          </ActionForm>
          <p className="mt-2 text-xs text-dim">Original check-in events are kept. The override is recorded as its own event and in the audit log.</p>
        </Panel>
      )}
    </div>
  );
}

async function LeaveTab({ id }: { id: string }) {
  const [requests, balances] = await Promise.all([db.leaveRequest.findMany({ where: { employeeId: id }, orderBy: { startDate: "desc" }, take: 50, include: { leaveType: { select: { name: true } } } }), db.leaveBalance.findMany({ where: { employeeId: id }, orderBy: [{ year: "desc" }], include: { leaveType: { select: { name: true } } } })]);
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2">{requests.length ? <DataTable rows={requests} columns={[{ header: "Type", cell: (r) => r.leaveType.name }, { header: "From", cell: (r) => r.startDate.toISOString().slice(0, 10) }, { header: "To", cell: (r) => r.endDate.toISOString().slice(0, 10) }, { header: "Days", cell: (r) => Number(r.days) }, { header: "Status", cell: (r) => <StatusBadge value={r.status} text={label(r.status)} /> }, { header: "Reason", cell: (r) => <span className="text-muted">{r.reason ?? "—"}</span> }]} /> : <NoData>No leave requests.</NoData>}</div>
      <Panel title="Balances">{balances.length ? <ul className="space-y-1 text-sm">{balances.map((b) => <li key={b.id} className="flex justify-between"><span className="text-muted">{b.year} · {b.leaveType.name}</span><span className="tabular-nums">{Number(b.used)} used / {Number(b.allocated)}</span></li>)}</ul> : <NoData>No balances.</NoData>}</Panel>
    </div>
  );
}

async function TimesheetTab({ id }: { id: string }) {
  const rows = await db.timesheet.findMany({ where: { employeeId: id }, orderBy: { date: "desc" }, take: 60, include: { project: { select: { id: true, name: true } }, task: { select: { title: true } } } });
  return rows.length ? <DataTable rows={rows} columns={[{ header: "Date", cell: (r) => r.date.toISOString().slice(0, 10) }, { header: "Project", cell: (r) => (r.project ? <Link href={`/admin/projects/${r.project.id}`} className="hover:text-brand-blue">{r.project.name}</Link> : "—") }, { header: "Task", cell: (r) => r.task?.title ?? "—" }, { header: "Duration", cell: (r) => fmtMinutes(r.minutes) }, { header: "Billable", cell: (r) => (r.billable ? "Yes" : "No") }, { header: "Status", cell: (r) => <StatusBadge value={r.status} /> }, { header: "Notes", cell: (r) => <span className="text-muted">{r.notes ?? "—"}</span> }]} /> : <NoData>No time logged.</NoData>;
}

async function TasksTab({ userId }: { userId: string | null }) {
  if (!userId) return <NoData>No login linked — tasks are assigned to logins.</NoData>;
  const rows = await db.task.findMany({ where: { assigneeId: userId }, orderBy: [{ status: "asc" }, { dueDate: { sort: "asc", nulls: "last" } }], take: 60, include: { project: { select: { id: true, name: true } }, createdBy: { select: { name: true } } } });
  return rows.length ? (
    <DataTable
      rows={rows}
      columns={[
        { header: "Task", cell: (t) => <span className="font-medium">{t.title}</span> },
        { header: "Project", cell: (t) => (t.project ? <Link href={`/admin/projects/${t.project.id}?tab=tasks`} className="hover:text-brand-blue">{t.project.name}</Link> : "—") },
        { header: "Status", cell: (t) => <StatusBadge value={t.status} /> },
        { header: "Due", cell: (t) => fmtDate(t.dueDate) },
        { header: "Created by", cell: (t) => (t.source?.startsWith("ai:") ? <Badge tone="violet">AI · {t.source.slice(3)}</Badge> : <span className="text-muted">{t.createdBy?.name ?? t.source ?? "—"}</span>) },
      ]}
    />
  ) : (
    <NoData>No tasks assigned.</NoData>
  );
}

async function PerformanceTab({ emp }: { emp: Emp }) {
  const from = new Date(Date.now() - 90 * 86_400_000);
  const [m, goals, reviews] = await Promise.all([employeeMetrics(emp, from), db.performanceGoal.findMany({ where: { employeeId: emp.id }, orderBy: { createdAt: "desc" } }), db.performanceReview.findMany({ where: { employeeId: emp.id }, orderBy: { periodStart: "desc" } })]);
  return (
    <div className="space-y-4">
      <p className="text-xs text-dim">Last 90 days, counted from records. These are facts for a review conversation, not a score or an employment decision.</p>
      <KpiGrid cols={6}>
        <Kpi label="Days present" value={m.attendance.present} />
        <Kpi label="Punctuality" value={m.attendance.punctualityPct == null ? "—" : `${m.attendance.punctualityPct}%`} hint={`${m.attendance.late} late day(s)`} />
        <Kpi label="Tasks done" value={m.linked ? m.tasks.done : "—"} hint={m.linked ? `${m.tasks.overdue} overdue` : "No login linked"} />
        <Kpi label="Projects completed" value={m.linked ? m.projectsCompleted : "—"} />
        <Kpi label="Tickets resolved" value={m.linked ? m.support.resolved : "—"} />
        <Kpi label="Time logged" value={fmtMinutes(m.loggedMinutes)} />
      </KpiGrid>
      {m.sales.won.length > 0 && <Panel title="Deals won (90 days)"><ul className="text-sm">{m.sales.won.map((w) => <li key={w.currency}>{w.count} deal(s) · {formatMoney(w.value, w.currency)}</li>)}</ul></Panel>}
      <Section title="Goals" action={<Link href="/admin/performance/goals" className="text-xs text-brand-blue">Manage goals</Link>}>
        {goals.length ? <DataTable rows={goals} columns={[{ header: "Objective", cell: (g) => <span className="font-medium">{g.objective}</span> }, { header: "Key result", cell: (g) => g.keyResult ?? "—" }, { header: "Progress", cell: (g) => (g.target ? `${Number(g.current)} / ${Number(g.target)} ${g.unit ?? ""}` : Number(g.current)) }, { header: "Status", cell: (g) => <StatusBadge value={g.status} text={label(g.status)} /> }, { header: "Due", cell: (g) => fmtDate(g.dueDate) }]} /> : <NoData>No goals set.</NoData>}
      </Section>
      <Section title="Reviews">{reviews.length ? <DataTable rows={reviews} columns={[{ header: "Period", cell: (r) => <Link href={`/admin/performance/reviews/${r.id}`} className="hover:text-brand-blue">{label(r.period)} · {r.periodStart.toISOString().slice(0, 10)}</Link> }, { header: "Stage", cell: (r) => <StatusBadge value={r.status} text={label(r.status)} /> }, { header: "Rating", cell: (r) => r.rating ?? "—" }]} /> : <NoData>No reviews yet.</NoData>}</Section>
    </div>
  );
}

async function PayrollTab({ id, canManage }: { id: string; canManage: boolean }) {
  const [rows, payslips] = await Promise.all([db.employeeCompensation.findMany({ where: { employeeId: id }, orderBy: { effectiveFrom: "desc" } }), db.employeeDocument.findMany({ where: { employeeId: id, kind: "PAYSLIP" }, orderBy: { createdAt: "desc" } })]);
  return (
    <div className="space-y-4">
      <p className="text-xs text-dim">Restricted: visible only with compensation permission. Every view of this tab is recorded in the audit log.</p>
      {rows.length ? <DataTable rows={rows} columns={[{ header: "Effective", cell: (c) => c.effectiveFrom.toISOString().slice(0, 10) }, { header: "Salary", cell: (c) => `${formatMoney(c.salary.toString(), c.currency)} ${label(c.salaryType)}` }, { header: "Pay frequency", cell: (c) => label(c.payFrequency) }, { header: "Bonus", cell: (c) => (c.bonus ? formatMoney(c.bonus.toString(), c.currency) : "—") }, { header: "Commission", cell: (c) => c.commission ?? "—" }, { header: "Joining", cell: (c) => (c.joiningBonus ? formatMoney(c.joiningBonus.toString(), c.currency) : "—") }]} /> : <NoData>No compensation recorded.</NoData>}
      {canManage && (
        <Panel title="Record compensation change">
          <ActionForm action={addCompensationAction.bind(null, id)} resetOnOk className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <TextField name="salary" label="Salary" required />
            <SelectField name="salaryType" label="Salary type" options={enumOptions(["ANNUAL", "MONTHLY", "HOURLY", "DAILY"])} defaultValue="ANNUAL" />
            <SelectField name="currency" label="Currency" options={CURRENCIES.map((c) => [c, c] as const)} defaultValue="INR" />
            <SelectField name="payFrequency" label="Pay frequency" options={enumOptions(["MONTHLY", "BIWEEKLY", "WEEKLY"])} defaultValue="MONTHLY" />
            <TextField name="bonus" label="Bonus" />
            <TextField name="commission" label="Commission terms" />
            <TextField name="joiningBonus" label="Joining compensation" />
            <TextField name="effectiveFrom" type="date" label="Effective from" required />
            <TextArea name="notes" label="Notes" rows={2} className="sm:col-span-3 lg:col-span-4" />
            <div><SubmitButton>Save</SubmitButton></div>
          </ActionForm>
        </Panel>
      )}
      <Section title="Payslips">{payslips.length ? <ul className="space-y-1 text-sm">{payslips.map((p) => <li key={p.id}><a href={`/admin/employees/documents/${p.id}`} className="text-brand-blue">{p.name}</a> <span className="text-xs text-dim">{fmtDate(p.createdAt)}</span></li>)}</ul> : <NoData>No payslips uploaded (upload them on the Documents tab as “Payslip”).</NoData>}</Section>
    </div>
  );
}

async function DocumentsTab({ id, canManage }: { id: string; canManage: boolean }) {
  const docs = await db.employeeDocument.findMany({ where: { employeeId: id }, orderBy: { createdAt: "desc" } });
  return (
    <div className="space-y-4">
      {docs.length ? (
        <DataTable
          rows={docs}
          columns={[
            { header: "Document", cell: (d) => <a href={`/admin/employees/documents/${d.id}?inline=1`} target="_blank" rel="noreferrer" className="font-medium text-fg hover:text-brand-blue">{d.name}</a> },
            { header: "Kind", cell: (d) => HR_DOC_KINDS[d.kind as keyof typeof HR_DOC_KINDS] ?? d.kind },
            { header: "Size", cell: (d) => `${Math.ceil(d.size / 1024)} KB` },
            { header: "Employee can see", cell: (d) => (d.employeeVisible ? "Yes" : "No") },
            { header: "Uploaded", cell: (d) => fmtDate(d.createdAt) },
            ...(canManage ? [{ header: "", cell: (d: (typeof docs)[number]) => <ActionForm action={deleteEmployeeDocumentAction.bind(null, d.id)}><ConfirmButton message="Delete this document permanently?" confirmLabel="Delete" className="text-xs text-red-700">Delete</ConfirmButton></ActionForm> }] : []),
          ]}
        />
      ) : (
        <NoData>No documents.</NoData>
      )}
      {canManage && (
        <Panel title="Upload document">
          <ActionForm action={uploadEmployeeDocumentAction.bind(null, id)} resetOnOk className="grid gap-3 sm:grid-cols-4">
            <SelectField name="kind" label="Kind" options={Object.entries(HR_DOC_KINDS)} defaultValue="OTHER" />
            <TextField name="name" label="Name (optional)" />
            <div>
              <label htmlFor="f-file" className="mb-1 block text-[12.5px] font-medium text-fg">File (PDF, image, DOCX · max 4 MB)</label>
              <input id="f-file" name="file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.docx" required className="text-sm" />
            </div>
            <label className="flex items-end gap-2 text-sm"><input type="checkbox" name="employeeVisible" defaultChecked className="size-4" /> Visible to the employee</label>
            <div><SubmitButton>Upload</SubmitButton></div>
          </ActionForm>
        </Panel>
      )}
    </div>
  );
}

async function ActivityTab({ id }: { id: string }) {
  const logs = await db.auditLog.findMany({ where: { entity: "Employee", entityId: id }, orderBy: { createdAt: "desc" }, take: 80, include: { user: { select: { name: true } } } });
  return <Panel><Timeline items={logs.map((l) => ({ id: l.id, at: l.createdAt, title: label(l.action.replace(/\./g, "_")), who: l.user?.name ?? "System", detail: l.metadata && typeof l.metadata === "object" && "tab" in (l.metadata as object) ? `(${(l.metadata as { tab: string }).tab})` : undefined }))} /></Panel>;
}

function PermissionsTab({ emp }: { emp: Emp }) {
  if (!emp.user) return <NoData>No login linked. Link one on the Employment tab to give this person access to self-service.</NoData>;
  const role = emp.user.role as RoleName;
  const granted = PERMISSIONS.filter((p) => can(role, p));
  return (
    <div className="space-y-4">
      <Panel title="Login">
        <KV cols={3} items={[["Account", `${emp.user.name} (${emp.user.email})`], ["Role", ROLE_LABELS[role]], ["Active", emp.user.active ? "Yes" : "No"], ["Last login", fmtDate(emp.user.lastLoginAt, true)]]} />
        <p className="mt-3 text-xs text-dim">Change the role on the <Link href="/admin/users" className="text-brand-blue">Users</Link> page; change what a role can do in the <Link href="/admin/settings/permissions" className="text-brand-blue">permission matrix</Link>.</p>
      </Panel>
      <Panel title={`Effective permissions (${granted.length})`}>
        <div className="flex flex-wrap gap-1.5">{granted.map((p) => <Badge key={p} tone={defaultCan(role, p) ? "gray" : "violet"}>{p}</Badge>)}</div>
      </Panel>
    </div>
  );
}
