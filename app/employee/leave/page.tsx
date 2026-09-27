import { db } from "@/lib/db/client";
import { requireSelf } from "@/lib/workforce/portal";
import { applyLeaveAction, cancelLeaveAction } from "@/lib/workforce/leave-actions";
import { CheckField, DataTable, SelectField, StatusBadge, TextArea, TextField } from "@/components/admin/os";
import { Panel, label } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/forms";
import { ConfirmButton, SubmitButton } from "@/components/admin/client";

export const metadata = { title: "Leave" };

export default async function MyLeavePage() {
  const { me } = await requireSelf();
  if (!me) return null;
  const year = new Date().getUTCFullYear();
  const [types, balances, requests, holidays] = await Promise.all([
    db.leaveType.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.leaveBalance.findMany({ where: { employeeId: me.id, year }, include: { leaveType: { select: { name: true } } } }),
    db.leaveRequest.findMany({ where: { employeeId: me.id }, orderBy: { startDate: "desc" }, take: 50, include: { leaveType: { select: { name: true } } } }),
    db.holiday.findMany({ where: { date: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) }, OR: [{ officeId: null }, { officeId: me.officeId ?? undefined }] }, orderBy: { date: "asc" } }),
  ]);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Request leave">
          {types.length ? (
            <ActionForm action={applyLeaveAction} resetOnOk className="grid gap-3 sm:grid-cols-2">
              <SelectField name="leaveTypeId" label="Leave type" required options={types.map((t) => [t.id, t.name] as const)} />
              <div className="flex items-end"><CheckField name="halfDay" label="Half day" /></div>
              <TextField name="startDate" type="date" label="From" required />
              <TextField name="endDate" type="date" label="To" required />
              <div className="sm:col-span-2"><TextArea name="reason" label="Reason (optional)" rows={2} /></div>
              <div><SubmitButton>Submit request</SubmitButton></div>
              <p className="text-xs text-dim sm:col-span-2">{me.manager ? `Goes to ${me.manager.fullName} first, then HR if the leave type needs it.` : "Goes to HR (no manager is set on your record)."} Weekends and holidays are not counted.</p>
            </ActionForm>
          ) : (
            <p className="text-sm text-muted">HR has not set up leave types yet.</p>
          )}
        </Panel>
        <Panel title={`Balances ${year}`}>
          {balances.length ? (
            <DataTable rows={balances} columns={[{ header: "Type", cell: (b) => b.leaveType.name }, { header: "Allocated", cell: (b) => Number(b.allocated) }, { header: "Used", cell: (b) => Number(b.used) }, { header: "Remaining", cell: (b) => <strong>{Number(b.allocated) - Number(b.used)}</strong> }]} />
          ) : (
            <p className="text-sm text-muted">No balances allocated for {year} yet.</p>
          )}
        </Panel>
      </div>
      <Panel title="My requests">
        {requests.length ? (
          <DataTable
            rows={requests}
            columns={[
              { header: "Type", cell: (r) => r.leaveType.name },
              { header: "Dates", cell: (r) => `${r.startDate.toISOString().slice(0, 10)} → ${r.endDate.toISOString().slice(0, 10)}${r.halfDay ? " (half)" : ""}` },
              { header: "Days", cell: (r) => Number(r.days) },
              { header: "Status", cell: (r) => <StatusBadge value={r.status} text={label(r.status)} /> },
              { header: "Note", cell: (r) => <span className="text-muted">{r.hrNote ?? r.managerNote ?? "—"}</span> },
              { header: "", cell: (r) => (r.status === "PENDING_MANAGER" || r.status === "PENDING_HR" ? <ActionForm action={cancelLeaveAction.bind(null, r.id)}><ConfirmButton message="Cancel this leave request?" confirmLabel="Cancel request" className="text-xs text-red-700">Cancel</ConfirmButton></ActionForm> : null) },
            ]}
          />
        ) : (
          <p className="text-sm text-muted">No leave requests yet.</p>
        )}
      </Panel>
      <Panel title={`Holidays ${year}`}>
        {holidays.length ? (
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {holidays.map((h) => (
              <li key={h.id}><span className="text-dim">{h.date.toISOString().slice(0, 10)}</span> {h.name}{h.optional ? " (optional)" : ""}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No holidays published.</p>
        )}
      </Panel>
    </div>
  );
}
