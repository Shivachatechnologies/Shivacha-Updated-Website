import "server-only";
import { db } from "@/lib/db/client";
import { setPermissionOverrides } from "./permissions";

const TTL_MS = 30_000;
let loadedAt = 0;
let loading: Promise<void> | null = null;

/**
 * Loads the permission-matrix overrides (RolePermission rows) into the RBAC module. Called on every authenticated
 * request (cached for 30 s per server instance). A failed read keeps the last good set; with none, code defaults apply.
 */
export async function ensurePermissionOverrides(force = false) {
  if (!force && Date.now() - loadedAt < TTL_MS) return;
  loading ??= db.rolePermission
    .findMany({ select: { role: true, permission: true, granted: true } })
    .then((rows) => {
      setPermissionOverrides(rows);
      loadedAt = Date.now();
    })
    .catch((e) => console.error("[rbac] could not load permission overrides", (e as Error).message))
    .finally(() => {
      loading = null;
    });
  await loading;
}
