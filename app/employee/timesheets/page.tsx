import { db } from "@/lib/db/client";
import { requireSelf } from "@/lib/workforce/portal";
import { deleteTimeAction, logTimeAction } from "@/lib/workforce/work-actions";
import { fmtMinutes } from "@/lib/workforce/time";
import { CheckField, DataTable, Kpi, KpiGrid, SelectField, StatusBadge, TextArea, TextField } from "@/components/admin/os";
import { Panel, label } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/forms";
import { ConfirmButton, SubmitButton } from "@/components/admin/client";

export const metadata = { title: "Timesheets" };

export default async function MyTimesheetsPage() {
  const { user, me } = await requireSelf();
  if (!me) return null;
  const since = new Date(new Date().getTime() - 30 * 86_400_000);
  const [projects, tasks, rows] = await Promise.all([
    db.project.findMany({ where: { deletedAt: null, OR: [{ managerId: user.id }, { members: { some: { userId: user.id } } }, { tasks: { some: { assigneeId: user.id } } }] }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.task.findMany({ where: { assigneeId: user.id, status: { not: "DONE" } }, orderBy: { updatedAt: "desc" }, take: 50, select: { id: true, title: true } }),
    db.timesheet.findMany({ where: { employeeId: me.id, date: { gte: since } }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 200, include: { project: { select: { name: true } }, task: { select: { title: true } } } }),
  ]);
  const total = rows.reduce((a, r) => a + r.minutes, 0);
  const billable = rows.filter((r) => r.billable).reduce((a, r) => a + r.minutes, 0);
  const approved = rows.filter((r) => r.status === "APPROVED").reduce((a, r) => a + r.minutes, 0);
  return (
    <div className="space-y-4">
      <KpiGrid cols={3}>
        <Kpi label="Logged (30 days)" value={fmtMinutes(total)} />
        <Kpi label="Billable" value={fmtMinutes(billable)} />
        <Kpi label="Approved" value={fmtMinutes(approved)} />
      </KpiGrid>
      <Panel title="Log time">
        <ActionForm action={logTimeAction} resetOnOk className="grid gap-3 sm:grid-cols-3">
          <TextField name="date" type="date" label="Date" required defaultValue={new Date().toISOString().slice(0, 10)} />
          <SelectField name="projectId" label="Project" blank="No project" options={projects.map((p) => [p.id, p.name] as const)} />
          <SelectField name="taskId" label="Task" blank="No task" options={tasks.map((t) => [t.id, t.title] as const)} />
          <TextField name="start" type="time" label="Start" />
          <TextField name="end" type="time" label="End" />
          <TextField name="minutes" type="number" label="…or minutes" />
          <div className="sm:col-span-2"><TextArea name="notes" label="What did you work on?" rows={2} /></div>
          <div className="flex items-end gap-3"><CheckField name="billable" label="Billable" defaultChecked /><SubmitButton>Log</SubmitButton></div>
        </ActionForm>
      </Panel>
      <Panel title="Last 30 days">
        {rows.length ? (
          <DataTable
            rows={rows}
            columns={[
              { header: "Date", cell: (r) => r.date.toISOString().slice(0, 10) },
              { header: "Project / task", cell: (r) => <span>{r.project?.name ?? "—"}{r.task && <span className="block text-xs text-dim">{r.task.title}</span>}</span> },
              { header: "Time", cell: (r) => fmtMinutes(r.minutes) },
              { header: "Billable", cell: (r) => (r.billable ? "Yes" : "No") },
              { header: "Notes", cell: (r) => <span className="text-muted">{r.notes ?? "—"}</span> },
              { header: "Status", cell: (r) => <StatusBadge value={r.status} text={label(r.status)} /> },
              { header: "", cell: (r) => (r.status !== "APPROVED" ? <ActionForm action={deleteTimeAction.bind(null, r.id)}><ConfirmButton message="Delete this entry?" confirmLabel="Delete" className="text-xs text-red-700">Delete</ConfirmButton></ActionForm> : null) },
            ]}
          />
        ) : (
          <p className="text-sm text-muted">Nothing logged in the last 30 days.</p>
        )}
      </Panel>
    </div>
  );
}
