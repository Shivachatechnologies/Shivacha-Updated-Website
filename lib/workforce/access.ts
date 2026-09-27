import "server-only";
import { cache } from "react";
import { db } from "@/lib/db/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { can } from "@/lib/auth/permissions";
import { AuthError, type SessionUser } from "@/lib/auth/session";

/**
 * Record-level access for the human workforce:
 *  - employees:view (HR, admins)        → every employee
 *  - team:view (managers, dept heads)   → their whole reporting line + departments they head
 *  - anyone                             → their own record (self-service)
 * Compensation, documents and location each need their own permission on top of this.
 */

/** The signed-in person's employee record, if they are staff. */
export const myEmployee = cache(async (userId: string) =>
  db.employee.findUnique({ where: { userId }, include: { office: true, shift: true, department: { select: { id: true, name: true } }, team: { select: { id: true, name: true } }, manager: { select: { id: true, fullName: true, userId: true } } } }),
);

/** Every employee below `rootId` in the reporting line (breadth-first, bounded depth). */
export async function reportingLine(rootId: string, maxDepth = 8): Promise<string[]> {
  const out = new Set<string>();
  let frontier = [rootId];
  for (let depth = 0; depth < maxDepth && frontier.length; depth++) {
    const rows = await db.employee.findMany({ where: { managerId: { in: frontier } }, select: { id: true } });
    frontier = rows.map((r) => r.id).filter((id) => !out.has(id) && id !== rootId);
    frontier.forEach((id) => out.add(id));
  }
  return [...out];
}

/** Employee ids a manager may see: reporting line plus members of departments they head. */
export const managedIds = cache(async (userId: string): Promise<string[]> => {
  const me = await myEmployee(userId);
  if (!me) return [];
  const [line, dept] = await Promise.all([reportingLine(me.id), db.employee.findMany({ where: { department: { headId: me.id } }, select: { id: true } })]);
  return [...new Set([...line, ...dept.map((d) => d.id)])].filter((id) => id !== me.id);
});

export type Scope = "all" | "team" | "self";

export async function scopeOf(user: SessionUser): Promise<Scope> {
  if (can(user.role, "employees:view")) return "all";
  if (can(user.role, "team:view")) return "team";
  return "self";
}

/** Prisma filter for the employees `user` may list. */
export async function employeeWhere(user: SessionUser, opts: { includeSelf?: boolean } = {}): Promise<Prisma.EmployeeWhereInput> {
  const scope = await scopeOf(user);
  if (scope === "all") return {};
  const me = await myEmployee(user.id);
  const ids = scope === "team" ? await managedIds(user.id) : [];
  if (opts.includeSelf && me) ids.push(me.id);
  return { id: { in: ids } };
}

/** Throws unless `user` may see this employee (HR, their manager chain, or themselves). */
export async function assertEmployeeAccess(user: SessionUser, employeeId: string, mode: "view" | "manage" = "view") {
  if (can(user.role, mode === "view" ? "employees:view" : "employees:manage")) return;
  const me = await myEmployee(user.id);
  if (mode === "view" && me?.id === employeeId) return;
  if (mode === "view" && can(user.role, "team:view") && (await managedIds(user.id)).includes(employeeId)) return;
  throw new AuthError("FORBIDDEN");
}

/** True when `user` is in the approval chain for this employee (direct manager, manager's manager, or dept head). */
export async function isManagerOf(user: SessionUser, employeeId: string) {
  if (!can(user.role, "team:view")) return false;
  return (await managedIds(user.id)).includes(employeeId);
}
