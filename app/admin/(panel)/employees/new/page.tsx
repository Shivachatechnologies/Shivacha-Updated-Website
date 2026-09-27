import { requireAccess } from "@/lib/os/guard";
import { saveEmployeeAction } from "@/lib/workforce/employee-actions";
import { employeeFormOptions } from "@/lib/workforce/options";
import { PageHeader } from "@/components/admin/ui";
import { EmployeeForm } from "@/components/admin/workforce/employee-form";

export const metadata = { title: "Add employee" };

export default async function NewEmployeePage() {
  await requireAccess("employees:manage");
  return (
    <>
      <PageHeader title="Add employee" description="The employee ID is assigned automatically. Compensation and documents are added on the profile." crumbs={[{ label: "Employees", href: "/admin/employees" }, { label: "New" }]} />
      <EmployeeForm action={saveEmployeeAction.bind(null, null)} options={await employeeFormOptions()} submit="Create employee" />
    </>
  );
}
