import { db } from "@/lib/db/client";
import { getSessionUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { audit } from "@/lib/audit";
import { toCsvRow } from "@/lib/admin/csv";
import { historyFilters } from "@/lib/workforce/history";

export const dynamic = "force-dynamic";

/** Attendance history CSV. Coordinates are never exported. */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!can(user.role, "attendance:view") || !can(user.role, "employees:export")) return new Response("Forbidden", { status: 403 });
  const { where } = historyFilters(Object.fromEntries(new URL(req.url).searchParams.entries()));
  const rows = await db.attendanceDay.findMany({ where, orderBy: [{ date: "desc" }], take: 50_000, include: { employee: { select: { fullName: true, employeeCode: true } }, office: { select: { name: true } } } });
  let csv = toCsvRow(["Date", "Employee ID", "Employee", "Check-in (UTC)", "Check-out (UTC)", "Break minutes", "Worked minutes", "Status", "Half day", "Work mode", "Office", "Geofence", "Late minutes", "Early checkout", "Source"]);
  for (const r of rows) csv += toCsvRow([r.date.toISOString().slice(0, 10), r.employee.employeeCode, r.employee.fullName, r.checkInAt, r.checkOutAt, r.breakMinutes, r.workMinutes, r.status, r.halfDay, r.workMode, r.office?.name, r.geofence, r.lateMinutes, r.earlyCheckout, r.source]);
  await audit({ userId: user.id, action: "attendance.exported", metadata: { count: rows.length } });
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="attendance-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" } });
}
