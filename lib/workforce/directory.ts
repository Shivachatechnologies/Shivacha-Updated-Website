import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { pick, str, type SP } from "@/components/admin/os";
import { EMPLOYMENT_STATUSES, EMPLOYMENT_TYPES, WORK_MODES } from "./constants";

/** Employee directory filters shared by the list page and its CSV export. */
export function directoryFilters(sp: SP) {
  const values = {
    q: str(sp, "q", 80),
    department: str(sp, "department", 40),
    team: str(sp, "team", 40),
    status: pick(sp, "status", EMPLOYMENT_STATUSES),
    type: pick(sp, "type", EMPLOYMENT_TYPES),
    mode: pick(sp, "mode", WORK_MODES),
    office: str(sp, "office", 40),
    manager: str(sp, "manager", 40),
    joinedFrom: str(sp, "joinedFrom", 10),
    joinedTo: str(sp, "joinedTo", 10),
    archived: str(sp, "archived", 1),
    page: str(sp, "page"),
  };
  const date = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00Z`) : undefined);
  const where: Prisma.EmployeeWhereInput = {
    archivedAt: values.archived ? { not: null } : null,
    ...(values.department && { departmentId: values.department }),
    ...(values.team && { teamId: values.team }),
    ...(values.status && { status: values.status }),
    ...(values.type && { employmentType: values.type }),
    ...(values.mode && { workMode: values.mode }),
    ...(values.office && { officeId: values.office }),
    ...(values.manager && { managerId: values.manager }),
    ...((values.joinedFrom || values.joinedTo) && { joiningDate: { gte: date(values.joinedFrom), lte: date(values.joinedTo) } }),
    ...(values.q && { OR: [{ fullName: { contains: values.q, mode: "insensitive" } }, { employeeCode: { contains: values.q, mode: "insensitive" } }, { workEmail: { contains: values.q, mode: "insensitive" } }, { designation: { contains: values.q, mode: "insensitive" } }] }),
  };
  return { values, where };
}
