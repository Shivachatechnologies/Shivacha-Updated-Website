import { db } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { saveShiftAction } from "@/lib/workforce/employee-actions";
import { WEEKDAYS } from "@/lib/workforce/constants";
import { CheckField, DataTable, SelectField, TextField } from "@/components/admin/os";
import { PageHeader, Panel } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/forms";
import { SubmitButton } from "@/components/admin/client";
import { NoData } from "@/components/admin/workforce/ui";

export const metadata = { title: "Shifts" };

export default async function ShiftsPage() {
  const user = await requireAccess("employees:view");
  const manage = can(user.role, "attendance:manage");
  const [shifts, offices] = await Promise.all([db.shift.findMany({ orderBy: { name: "asc" }, include: { office: { select: { name: true } }, _count: { select: { employees: true } } } }), db.officeLocation.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } })]);
  const dayNames = (d: number[]) => WEEKDAYS.filter(([n]) => d.includes(n)).map(([, l]) => l).join(" ");
  return (
    <>
      <PageHeader title="Shifts" description="Working hours per time zone. Late arrivals are measured against the start time plus the grace period." crumbs={[{ label: "Human Workforce" }, { label: "Shifts" }]} />
      {shifts.length ? <DataTable rows={shifts} columns={[{ header: "Shift", cell: (s) => <span className="font-medium">{s.name}</span> }, { header: "Hours", cell: (s) => `${s.startTime}–${s.endTime}` }, { header: "Time zone", cell: (s) => s.timezone }, { header: "Grace", cell: (s) => `${s.graceMinutes} min` }, { header: "Break", cell: (s) => `${s.breakMinutes} min` }, { header: "Days", cell: (s) => dayNames(s.weekDays) }, { header: "Office", cell: (s) => s.office?.name ?? "Any" }, { header: "Remote", cell: (s) => (s.remoteEligible ? "Eligible" : "No") }, { header: "People", cell: (s) => s._count.employees }]} /> : <NoData>No shifts yet.</NoData>}
      {manage && (
        <Panel title="Add shift" className="mt-4">
          <ActionForm action={saveShiftAction.bind(null, null)} resetOnOk className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <TextField name="name" label="Name" required placeholder="General (IST)" />
            <TextField name="startTime" type="time" label="Start" required defaultValue="09:30" />
            <TextField name="endTime" type="time" label="End" required defaultValue="18:30" />
            <TextField name="graceMinutes" type="number" label="Grace (min)" defaultValue={10} />
            <TextField name="breakMinutes" type="number" label="Break (min)" defaultValue={60} />
            <TextField name="timezone" label="Time zone" defaultValue="Asia/Kolkata" />
            <SelectField name="officeId" label="Office" blank="Any" options={offices.map((o) => [o.id, o.name] as const)} />
            <div className="sm:col-span-2 lg:col-span-4">
              <p className="mb-1 text-[12.5px] font-medium text-fg">Working days</p>
              <div className="flex flex-wrap gap-3">{WEEKDAYS.map(([n, l]) => <label key={n} className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="weekDays" value={n} defaultChecked={n <= 5} className="size-4" /> {l}</label>)}</div>
            </div>
            <CheckField name="remoteEligible" label="Remote eligible" defaultChecked />
            <div className="flex items-end"><SubmitButton>Add shift</SubmitButton></div>
          </ActionForm>
        </Panel>
      )}
    </>
  );
}
