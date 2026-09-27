import { db } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { employeeWhere } from "@/lib/workforce/access";
import { saveGoalAction, updateGoalProgressAction } from "@/lib/workforce/work-actions";
import { GOAL_STATUSES } from "@/lib/workforce/constants";
import { DataTable, SelectField, StatusBadge, TextField, enumOptions } from "@/components/admin/os";
import { PageHeader, Panel, fmtDate, inputCls, label } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/forms";
import { SubmitButton } from "@/components/admin/client";
import { NoData, PersonCell } from "@/components/admin/workforce/ui";

export const metadata = { title: "Goals & OKRs" };

export default async function GoalsPage() {
  const user = await requireAccess("performance:view");
  const scope = can(user.role, "performance:manage") ? {} : await employeeWhere(user);
  const [goals, people, projects, deals] = await Promise.all([
    db.performanceGoal.findMany({ where: { employee: scope }, orderBy: [{ status: "asc" }, { dueDate: { sort: "asc", nulls: "last" } }], take: 300, include: { employee: { select: { id: true, fullName: true, photoUrl: true } } } }),
    db.employee.findMany({ where: { ...scope, archivedAt: null }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true } }),
    db.project.findMany({ where: { deletedAt: null, status: { in: ["PLANNED", "ACTIVE"] } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.deal.findMany({ where: { deletedAt: null, stage: { notIn: ["WON", "LOST"] } }, orderBy: { name: "asc" }, select: { id: true, name: true }, take: 200 }),
  ]);
  const canSet = people.length > 0 && (can(user.role, "performance:manage") || can(user.role, "team:view"));
  return (
    <>
      <PageHeader title="Goals & OKRs" description="Progress is entered by the goal owner or their manager. Linked projects and deals are for context." crumbs={[{ label: "Performance", href: "/admin/performance" }, { label: "Goals" }]} />
      {goals.length ? (
        <DataTable
          rows={goals}
          columns={[
            { header: "Owner", cell: (g) => <PersonCell name={g.employee.fullName} src={g.employee.photoUrl} href={`/admin/employees/${g.employee.id}?tab=performance`} /> },
            { header: "Objective", cell: (g) => <span className="font-medium">{g.objective}</span> },
            { header: "Key result", cell: (g) => <span className="text-muted">{g.keyResult ?? "—"}</span> },
            { header: "Progress", cell: (g) => (g.target ? `${Number(g.current)} / ${Number(g.target)} ${g.unit ?? ""} (${Math.min(100, Math.round((Number(g.current) / Number(g.target)) * 100))}%)` : `${Number(g.current)} ${g.unit ?? ""}`) },
            { header: "Due", cell: (g) => fmtDate(g.dueDate) },
            { header: "Status", cell: (g) => <StatusBadge value={g.status} text={label(g.status)} /> },
            {
              header: "Update",
              cell: (g) => (
                <ActionForm action={updateGoalProgressAction.bind(null, g.id)} className="flex gap-1">
                  <input name="current" type="number" step="any" defaultValue={Number(g.current)} aria-label="Current value" className={`${inputCls} h-8 w-20`} />
                  <select name="status" defaultValue={g.status} aria-label="Status" className={`${inputCls} h-8 w-28 text-xs`}>{GOAL_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select>
                  <SubmitButton variant="secondary" className="h-8 px-2 text-xs">Save</SubmitButton>
                </ActionForm>
              ),
            },
          ]}
        />
      ) : (
        <NoData>No goals yet.</NoData>
      )}
      {canSet && (
        <Panel title="Set a goal" className="mt-4">
          <ActionForm action={saveGoalAction.bind(null, null)} resetOnOk className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <SelectField name="employeeId" label="Owner" required blank="Choose…" options={people.map((p) => [p.id, p.fullName] as const)} />
            <TextField name="objective" label="Objective" required className="lg:col-span-3" />
            <TextField name="keyResult" label="Key result" className="lg:col-span-2" />
            <TextField name="target" type="number" label="Target" />
            <TextField name="unit" label="Unit" placeholder="deals, %, INR…" />
            <TextField name="dueDate" type="date" label="Due" />
            <SelectField name="status" label="Status" options={enumOptions(GOAL_STATUSES)} defaultValue="NOT_STARTED" />
            <SelectField name="projectId" label="Linked project" blank="—" options={projects.map((p) => [p.id, p.name] as const)} />
            <SelectField name="dealId" label="Linked deal" blank="—" options={deals.map((p) => [p.id, p.name] as const)} />
            <div className="flex items-end"><SubmitButton>Save goal</SubmitButton></div>
          </ActionForm>
        </Panel>
      )}
    </>
  );
}
