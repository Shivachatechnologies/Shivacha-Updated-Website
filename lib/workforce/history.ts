import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { pick, str, type SP } from "@/components/admin/os";

export const HISTORY_STATUSES = ["WORKING", "ON_BREAK", "CHECKED_OUT", "ABSENT", "ON_LEAVE", "HALF_DAY", "HOLIDAY", "NOT_CHECKED_IN"] as const;

export function historyFilters(sp: SP) {
  const values = { employee: str(sp, "employee", 40), department: str(sp, "department", 40), team: str(sp, "team", 40), from: str(sp, "from", 10), to: str(sp, "to", 10), status: pick(sp, "status", HISTORY_STATUSES), office: str(sp, "office", 40), mode: pick(sp, "mode", ["OFFICE", "REMOTE"] as const), late: str(sp, "late", 1), page: str(sp, "page") };
  const d = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00Z`) : undefined);
  const from = d(values.from) ?? new Date(Date.now() - 30 * 86_400_000);
  const to = d(values.to);
  const where: Prisma.AttendanceDayWhereInput = {
    date: { gte: from, lte: to },
    ...(values.employee && { employeeId: values.employee }),
    ...(values.status === "HALF_DAY" ? { halfDay: true } : values.status ? { status: values.status } : {}),
    ...(values.office && { officeId: values.office }),
    ...(values.mode && { workMode: values.mode }),
    ...(values.late && { lateMinutes: { gt: 0 } }),
    ...((values.department || values.team) && { employee: { ...(values.department && { departmentId: values.department }), ...(values.team && { teamId: values.team }) } }),
  };
  return { values, where };
}
