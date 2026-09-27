import { db } from "@/lib/db/client";
import { getSessionUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { audit } from "@/lib/audit";
import { toCsvRow } from "@/lib/admin/csv";
import { directoryFilters } from "@/lib/workforce/directory";

export const dynamic = "force-dynamic";

/** Employee directory CSV. Never includes compensation, documents or location. */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!can(user.role, "employees:view") || !can(user.role, "employees:export")) return new Response("Forbidden", { status: 403 });
  const sp = Object.fromEntries(new URL(req.url).searchParams.entries());
  const { where } = directoryFilters(sp);
  const rows = await db.employee.findMany({ where, orderBy: { fullName: "asc" }, take: 10_000, include: { department: { select: { name: true } }, team: { select: { name: true } }, manager: { select: { fullName: true } }, office: { select: { name: true } }, shift: { select: { name: true } } } });
  let csv = toCsvRow(["Employee ID", "Name", "Work email", "Designation", "Job title", "Department", "Team", "Employment type", "Status", "Joining date", "Manager", "Office", "Work mode", "Shift"]);
  for (const e of rows) csv += toCsvRow([e.employeeCode, e.fullName, e.workEmail, e.designation, e.jobTitle, e.department?.name, e.team?.name, e.employmentType, e.status, e.joiningDate?.toISOString().slice(0, 10), e.manager?.fullName, e.office?.name, e.workMode, e.shift?.name]);
  await audit({ userId: user.id, action: "employee.exported", metadata: { count: rows.length } });
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="employees-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" } });
}
