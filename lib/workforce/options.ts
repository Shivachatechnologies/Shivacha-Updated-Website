import "server-only";
import { db } from "@/lib/db/client";
import type { EmployeeFormOptions } from "@/components/admin/workforce/employee-form";

export async function employeeFormOptions(): Promise<EmployeeFormOptions> {
  const [departments, teams, offices, shifts, managers, logins] = await Promise.all([
    db.department.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.team.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.officeLocation.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.shift.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.employee.findMany({ where: { archivedAt: null }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true } }),
    db.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, email: true } }),
  ]);
  return { departments, teams, offices, shifts, managers, logins };
}
