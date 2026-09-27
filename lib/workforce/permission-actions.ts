"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { audit } from "@/lib/audit";
import { authorize } from "@/lib/auth/session";
import { defaultCan, LOCKED, PERMISSIONS, ROLES, type Permission, type RoleName } from "@/lib/auth/permissions";
import { ensurePermissionOverrides } from "@/lib/auth/overrides";
import { fail, UserError, type ActionState } from "@/lib/os/action";

/** Sets one cell of the permission matrix: back to the default, or an explicit grant / revoke. */
export async function setRolePermissionAction(role: string, permission: string, value: "default" | "grant" | "revoke"): Promise<ActionState> {
  try {
    const user = await authorize("users:manage");
    const r = z.enum(ROLES).parse(role) as RoleName;
    const p = z.enum(PERMISSIONS).parse(permission) as Permission;
    if (r === "SUPER_ADMIN") throw new UserError("Super Admin always has every permission.");
    if (r === "ADMIN" && user.role !== "SUPER_ADMIN") throw new UserError("Only a Super Admin can change the Admin role.");
    if (value === "revoke" && LOCKED[r]?.includes(p)) throw new UserError("That permission cannot be removed (it would lock administrators out).");
    const before = await db.rolePermission.findUnique({ where: { role_permission: { role: r, permission: p } } });
    if (value === "default") await db.rolePermission.deleteMany({ where: { role: r, permission: p } });
    else {
      const granted = value === "grant";
      if (granted === defaultCan(r, p)) await db.rolePermission.deleteMany({ where: { role: r, permission: p } });
      else await db.rolePermission.upsert({ where: { role_permission: { role: r, permission: p } }, update: { granted, updatedById: user.id }, create: { role: r, permission: p, granted, updatedById: user.id } });
    }
    await ensurePermissionOverrides(true);
    await audit({ userId: user.id, action: "permission.changed", entity: "Role", entityId: r, metadata: { permission: p, value, before: before ? (before.granted ? "grant" : "revoke") : "default", default: defaultCan(r, p) } });
    revalidatePath("/admin/settings/permissions");
    return { ok: "Permission updated." };
  } catch (e) {
    return fail(e, "permissions");
  }
}
