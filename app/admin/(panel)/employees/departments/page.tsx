import { db } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { saveDepartmentAction, saveTeamAction } from "@/lib/workforce/employee-actions";
import { DataTable, SelectField, TextField } from "@/components/admin/os";
import { PageHeader, Panel } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/forms";
import { SubmitButton } from "@/components/admin/client";
import { NoData } from "@/components/admin/workforce/ui";

export const metadata = { title: "Departments & teams" };

export default async function DepartmentsPage() {
  const user = await requireAccess("employees:view");
  const manage = can(user.role, "employees:manage");
  const [departments, teams, people] = await Promise.all([
    db.department.findMany({ orderBy: { name: "asc" }, include: { head: { select: { fullName: true } }, _count: { select: { employees: { where: { archivedAt: null } }, teams: true } } } }),
    db.team.findMany({ orderBy: { name: "asc" }, include: { department: { select: { name: true } }, lead: { select: { fullName: true } }, _count: { select: { employees: { where: { archivedAt: null } } } } } }),
    db.employee.findMany({ where: { archivedAt: null }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true } }),
  ]);
  const peopleOpts = people.map((p) => [p.id, p.fullName] as const);
  return (
    <>
      <PageHeader title="Departments & teams" crumbs={[{ label: "Human Workforce" }, { label: "Departments & teams" }]} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Departments">
          {departments.length ? <DataTable rows={departments} columns={[{ header: "Department", cell: (d) => <span className="font-medium">{d.name}{d.code ? <span className="ml-1 text-xs text-dim">{d.code}</span> : null}</span> }, { header: "Head", cell: (d) => d.head?.fullName ?? "—" }, { header: "People", cell: (d) => d._count.employees }, { header: "Teams", cell: (d) => d._count.teams }]} /> : <NoData />}
          {manage && (
            <ActionForm action={saveDepartmentAction.bind(null, null)} resetOnOk className="mt-4 grid gap-3 sm:grid-cols-3">
              <TextField name="name" label="New department" required />
              <TextField name="code" label="Code" />
              <SelectField name="headId" label="Head" blank="—" options={peopleOpts} />
              <div><SubmitButton variant="secondary">Add department</SubmitButton></div>
            </ActionForm>
          )}
        </Panel>
        <Panel title="Teams">
          {teams.length ? <DataTable rows={teams} columns={[{ header: "Team", cell: (t) => <span className="font-medium">{t.name}</span> }, { header: "Department", cell: (t) => t.department?.name ?? "—" }, { header: "Lead", cell: (t) => t.lead?.fullName ?? "—" }, { header: "People", cell: (t) => t._count.employees }]} /> : <NoData />}
          {manage && (
            <ActionForm action={saveTeamAction.bind(null, null)} resetOnOk className="mt-4 grid gap-3 sm:grid-cols-3">
              <TextField name="name" label="New team" required />
              <SelectField name="departmentId" label="Department" blank="—" options={departments.map((d) => [d.id, d.name] as const)} />
              <SelectField name="leadId" label="Lead" blank="—" options={peopleOpts} />
              <div><SubmitButton variant="secondary">Add team</SubmitButton></div>
            </ActionForm>
          )}
        </Panel>
      </div>
    </>
  );
}
