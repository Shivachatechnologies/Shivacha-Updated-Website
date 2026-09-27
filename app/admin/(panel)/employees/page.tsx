import Link from "next/link";
import { db } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { audit } from "@/lib/audit";
import { bulkEmployeesAction } from "@/lib/workforce/employee-actions";
import { directoryFilters } from "@/lib/workforce/directory";
import { liveWorkforce } from "@/lib/workforce/attendance";
import { EMPLOYMENT_STATUSES, EMPLOYMENT_TYPES, WORK_MODES } from "@/lib/workforce/constants";
import { ListView, StatusBadge, enumOptions, pageOf, qs, PAGE_SIZE, type SP } from "@/components/admin/os";
import { fmtDate, inputCls, label } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/forms";
import { SubmitButton } from "@/components/admin/client";
import { AttendanceBadge, PersonCell } from "@/components/admin/workforce/ui";

export const metadata = { title: "Employees" };

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireAccess("employees:view");
  const sp = await searchParams;
  const { values, where } = directoryFilters(sp);
  const page = pageOf(sp);
  const [total, rows, departments, teams, offices, managers, shifts] = await Promise.all([
    db.employee.count({ where }),
    db.employee.findMany({ where, orderBy: { fullName: "asc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { department: { select: { name: true } }, manager: { select: { id: true, fullName: true } }, user: { select: { role: true, lastLoginAt: true } } } }),
    db.department.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.team.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.officeLocation.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.employee.findMany({ where: { reports: { some: {} } }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true } }),
    db.shift.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const live = new Map((await liveWorkforce({ id: { in: rows.map((r) => r.id) } })).map((r) => [r.id, r]));
  await audit({ userId: user.id, action: "employee.directory.viewed", metadata: { count: rows.length } });
  const manage = can(user.role, "employees:manage");
  const exportHref = `/admin/employees/export${qs({ ...values, page: undefined })}`;
  return (
    <ListView
      title="Employees"
      description="Human workforce directory. AI employees are managed separately under AI Workforce."
      crumbs={[{ label: "Human Workforce" }, { label: "Employees" }]}
      actions={
        <>
          {can(user.role, "employees:export") && <a href={exportHref} className="btn-secondary h-9 px-3 text-[13px]">Export CSV</a>}
          {manage && <Link href="/admin/employees/new" className="btn-primary h-9 px-3 text-[13px]">Add employee</Link>}
        </>
      }
      filters={[
        { type: "search", name: "q", placeholder: "Name, ID, email, designation…" },
        { type: "select", name: "department", label: "Any department", options: departments.map((d) => [d.id, d.name] as const) },
        { type: "select", name: "team", label: "Any team", options: teams.map((d) => [d.id, d.name] as const) },
        { type: "select", name: "status", label: "Any status", options: enumOptions(EMPLOYMENT_STATUSES) },
        { type: "select", name: "type", label: "Any type", options: enumOptions(EMPLOYMENT_TYPES) },
        { type: "select", name: "mode", label: "Any work mode", options: enumOptions(WORK_MODES) },
        { type: "select", name: "office", label: "Any office", options: offices.map((d) => [d.id, d.name] as const) },
        { type: "select", name: "manager", label: "Any manager", options: managers.map((d) => [d.id, d.fullName] as const) },
        { type: "date", name: "joinedFrom", label: "Joined from" },
        { type: "date", name: "joinedTo", label: "to" },
        { type: "select", name: "archived", label: "Current staff", options: [["1", "Archived"]] as const },
      ]}
      values={values}
      rows={rows}
      total={total}
      page={page}
      basePath="/admin/employees"
      empty={{ title: "No employees yet", description: "Add your first employee to start tracking attendance, leave and performance.", action: manage ? <Link href="/admin/employees/new" className="btn-primary h-9 px-3 text-[13px]">Add employee</Link> : undefined }}
      above={
        manage && rows.length > 0 ? (
          <ActionForm id="bulk" action={bulkEmployeesAction} className="mb-3 flex flex-wrap items-center gap-2 text-[13px]">
            <span className="text-dim">Bulk update selected:</span>
            <select name="op" aria-label="Bulk action" className={`${inputCls} w-auto`} defaultValue="">
              <option value="" disabled>Choose…</option>
              <option value="status">Set status</option>
              <option value="workMode">Set work mode</option>
              <option value="department">Set department</option>
              <option value="office">Set office</option>
              <option value="shift">Set shift</option>
            </select>
            <select name="value" aria-label="Value" className={`${inputCls} w-auto`} defaultValue="">
              <option value="" disabled>Value…</option>
              <optgroup label="Status">{EMPLOYMENT_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</optgroup>
              <optgroup label="Work mode">{WORK_MODES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</optgroup>
              <optgroup label="Department">{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</optgroup>
              <optgroup label="Office">{offices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</optgroup>
              <optgroup label="Shift">{shifts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</optgroup>
            </select>
            <SubmitButton variant="secondary">Apply</SubmitButton>
          </ActionForm>
        ) : undefined
      }
      columns={[
        ...(manage ? [{ header: "", className: "w-8", cell: (e: (typeof rows)[number]) => <input type="checkbox" name="ids" value={e.id} form="bulk" aria-label={`Select ${e.fullName}`} className="size-4" /> }] : []),
        { header: "Employee", cell: (e) => <PersonCell name={e.fullName} src={e.photoUrl} sub={e.employeeCode} href={`/admin/employees/${e.id}`} /> },
        { header: "Designation", cell: (e) => <span className="text-muted">{e.designation ?? e.jobTitle ?? "—"}</span> },
        { header: "Department", cell: (e) => <span className="text-muted">{e.department?.name ?? "—"}</span> },
        { header: "Status", cell: (e) => <StatusBadge value={e.status} /> },
        { header: "Work mode", cell: (e) => <span className="text-muted">{label(e.workMode)}</span> },
        { header: "Today", cell: (e) => (live.get(e.id) ? <AttendanceBadge state={live.get(e.id)!.state} /> : <span className="text-dim">—</span>) },
        { header: "Last active", cell: (e) => <span className="text-muted">{fmtDate(live.get(e.id)?.lastActivityAt ?? e.user?.lastLoginAt ?? null, true)}</span> },
        { header: "Manager", cell: (e) => (e.manager ? <Link href={`/admin/employees/${e.manager.id}`} className="text-muted hover:text-fg">{e.manager.fullName}</Link> : <span className="text-dim">—</span>) },
      ]}
    />
  );
}
