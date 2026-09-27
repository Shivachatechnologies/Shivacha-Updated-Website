import "server-only";
import { redirect } from "next/navigation";
import { authorize, AuthError, requirePermission, type SessionUser } from "@/lib/auth/session";
import type { Permission } from "@/lib/auth/permissions";
import { isEnabled, type FeatureFlag } from "./flags";

/** Pages: permission first (never leak that a module exists), then the module's feature flag. */
export async function requireAccess(p: Permission, flag?: FeatureFlag): Promise<SessionUser> {
  const user = await requirePermission(p);
  if (flag && !(await isEnabled(flag))) redirect(`/admin/disabled?feature=${flag}`);
  return user;
}

export class FeatureDisabledError extends AuthError {
  constructor() {
    super("FORBIDDEN");
    this.message = "This module is switched off.";
  }
}

/** Server actions / route handlers: throws AuthError when unauthorised or the module is off. */
export async function authorizeAccess(p: Permission, flag?: FeatureFlag): Promise<SessionUser> {
  const user = await authorize(p);
  if (flag && !(await isEnabled(flag))) throw new FeatureDisabledError();
  return user;
}
