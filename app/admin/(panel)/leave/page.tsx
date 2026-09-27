import { db } from "@/lib/db/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { adjustBalanceAction, allocateBalancesAction, decideLeaveAction, deleteHolidayAction, saveHolidayAction, saveLeaveTypeAction } from "@/lib/workforce/leave-actions";
import { LEAVE_STATUSES } from "@/lib/workforce/constants";
import { CheckField, DataTable, FilterBar, SelectField, StatusBadge, Tabs, TextField, enumOptions, pick, str, type SP } from "@/components/admin/os";
import { PageHeader, Panel, inputCls, label } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/forms";
import { ConfirmButton, SubmitButton } from "@/components/admin/client";
import { NoData, PersonCell } from "@/components/admin/workforce/ui";
import { DecideLeave } from "@/components/admin/workforce/decide";

export const metadata = { title: "Leave" };

export default async function LeavePage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireAccess("leave:view");
  const sp = await searchParams;
  const tab = pick(sp, "tab", ["requests", "types", "holidays", "balances"] as const) ?? "requests";
  const manage = can(user.role, "leave:manage");
  const tabs = <Tabs active={tab} items={[{ key: "requests", label: "Requests", href: "/admin/leave" }, { key: "balances", label: "Balances", href: "/admin/leave?tab=balances" }, { key: "types", label: "Leave types", href: "/admin/leave?tab=types" }, { key: "holidays", label: "Holidays", href: "/admin/leave?tab=holidays" }]} />;
  const header = <PageHeader title="Leave" description="Requests go to the employee's manager first, then HR when the leave type requires it." crumbs={[{ label: "Human Workforce" }, { label: "Leave" }]} />;

  if (tab === "types") {
    const types = await db.leaveType.findMany({ orderBy: { name: "asc" } });
    return (
      <>
        {header}
        {tabs}
        {types.length ? <DataTable rows={types} columns={[{ header: "Type", cell: (t) => <span className="font-medium">{t.name} <span className="text-xs text-dim">{t.code}</span></span> }, { header: "Days / year", cell: (t) => Number(t.annualQuota) }, { header: "Paid", cell: (t) => (t.paid ? "Yes" : "No") }, { header: "HR approval", cell: (t) => (t.requiresHrApproval ? "Required" : "Manager only") }, { header: "Active", cell: (t) => (t.active ? "Yes" : "No") }]} /> : <NoData>No leave types yet.</NoData>}
        {manage && (
          <Panel title="Add leave type" className="mt-4">
            <ActionForm action={saveLeaveTypeAction.bind(null, null)} resetOnOk className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <TextField name="name" label="Name" required placeholder="Casual leave" />
              <TextField name="code" label="Code" required placeholder="CL" />
              <TextField name="annualQuota" type="number" label="Days per year" defaultValue={12} />
              <CheckField name="paid" label="Paid" defaultChecked />
              <CheckField name="requiresHrApproval" label="Needs HR approval" />
              <CheckField name="active" label="Active" defaultChecked />
              <div><SubmitButton>Add</SubmitButton></div>
            </ActionForm>
          </Panel>
        )}
      </>
    );
  }

  if (tab === "holidays") {
    const [holidays, offices] = await Promise.all([db.holiday.findMany({ orderBy: { date: "asc" }, where: { date: { gte: new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1)) } }, include: { office: { select: { name: true } } } }), db.officeLocation.findMany({ where: { active: true }, select: { id: true, name: true } })]);
    return (
      <>
        {header}
        {tabs}
        {holidays.length ? <DataTable rows={holidays} columns={[{ header: "Date", cell: (h) => h.date.toISOString().slice(0, 10) }, { header: "Holiday", cell: (h) => h.name }, { header: "Office", cell: (h) => h.office?.name ?? "All offices" }, { header: "Optional", cell: (h) => (h.optional ? "Yes" : "No") }, ...(manage ? [{ header: "", cell: (h: (typeof holidays)[number]) => <ActionForm action={deleteHolidayAction.bind(null, h.id)}><ConfirmButton message="Remove this holiday?" confirmLabel="Remove" className="text-xs text-red-700">Remove</ConfirmButton></ActionForm> }] : [])]} /> : <NoData>No holidays this year.</NoData>}
        {manage && (
          <Panel title="Add holiday" className="mt-4">
            <ActionForm action={saveHolidayAction} resetOnOk className="grid gap-3 sm:grid-cols-5">
              <TextField name="date" type="date" label="Date" required />
              <TextField name="name" label="Name" required />
              <SelectField name="officeId" label="Office" blank="All offices" options={offices.map((o) => [o.id, o.name] as const)} />
              <CheckField name="optional" label="Optional holiday" />
              <div><SubmitButton>Add</SubmitButton></div>
            </ActionForm>
          </Panel>
        )}
      </>
    );
  }

  if (tab === "balances") {
    const year = Number(str(sp, "year", 4)) || new Date().getUTCFullYear();
    const balances = await db.leaveBalance.findMany({ where: { year }, orderBy: [{ employee: { fullName: "asc" } }], include: { employee: { select: { id: true, fullName: true, employeeCode: true, photoUrl: true } }, leaveType: { select: { name: true } } }, take: 2000 });
    return (
      <>
        {header}
        {tabs}
        {manage && (
          <ActionForm action={allocateBalancesAction} className="mb-4 flex flex-wrap items-end gap-2">
            <TextField name="year" type="number" label="Allocate balances for year" defaultValue={year} />
            <SubmitButton variant="secondary">Allocate from quotas</SubmitButton>
            <p className="text-xs text-dim">Creates missing balances only; existing balances are never lowered.</p>
          </ActionForm>
        )}
        {balances.length ? <DataTable rows={balances} columns={[{ header: "Employee", cell: (b) => <PersonCell name={b.employee.fullName} src={b.employee.photoUrl} sub={b.employee.employeeCode} href={`/admin/employees/${b.employee.id}?tab=leave`} /> }, { header: "Type", cell: (b) => b.leaveType.name }, { header: "Used", cell: (b) => Number(b.used) }, { header: "Remaining", cell: (b) => Number(b.allocated) - Number(b.used) }, { header: "Allocated", cell: (b) => (manage ? <ActionForm action={adjustBalanceAction.bind(null, b.id)} className="flex gap-1"><input name="allocated" type="number" step="0.5" defaultValue={Number(b.allocated)} aria-label="Allocated days" className={`${inputCls} h-8 w-20`} /><SubmitButton variant="secondary" className="h-8 px-2 text-xs">Set</SubmitButton></ActionForm> : Number(b.allocated)) }]} /> : <NoData>No balances for {year}.</NoData>}
      </>
    );
  }

  const status = pick(sp, "status", LEAVE_STATUSES);
  const where: Prisma.LeaveRequestWhereInput = status ? { status } : { status: { in: ["PENDING_MANAGER", "PENDING_HR"] } };
  const requests = await db.leaveRequest.findMany({ where, orderBy: { startDate: "asc" }, take: 200, include: { leaveType: { select: { name: true } }, employee: { select: { id: true, fullName: true, employeeCode: true, photoUrl: true, manager: { select: { fullName: true } } } } } });
  return (
    <>
      {header}
      {tabs}
      <FilterBar filters={[{ type: "select", name: "status", label: "Pending", options: enumOptions(LEAVE_STATUSES) }]} values={{ status }} />
      {requests.length ? (
        <DataTable
          rows={requests}
          columns={[
            { header: "Employee", cell: (r) => <PersonCell name={r.employee.fullName} src={r.employee.photoUrl} sub={r.employee.manager ? `Manager: ${r.employee.manager.fullName}` : "No manager"} href={`/admin/employees/${r.employee.id}?tab=leave`} /> },
            { header: "Type", cell: (r) => r.leaveType.name },
            { header: "Dates", cell: (r) => `${r.startDate.toISOString().slice(0, 10)} → ${r.endDate.toISOString().slice(0, 10)}${r.halfDay ? " (half)" : ""}` },
            { header: "Days", cell: (r) => Number(r.days) },
            { header: "Reason", cell: (r) => <span className="text-muted">{r.reason ?? "—"}</span> },
            { header: "Status", cell: (r) => <StatusBadge value={r.status} text={label(r.status)} /> },
            { header: "", cell: (r) => (manage && (r.status === "PENDING_MANAGER" || r.status === "PENDING_HR") ? <DecideLeave approve={decideLeaveAction.bind(null, r.id, "APPROVE")} reject={decideLeaveAction.bind(null, r.id, "REJECT")} /> : null) },
          ]}
        />
      ) : (
        <NoData>{status ? "No requests with this status." : "No pending requests."}</NoData>
      )}
    </>
  );
}
