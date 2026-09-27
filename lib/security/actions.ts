"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { audit } from "@/lib/audit";
import { authorize, SESSION_COOKIE } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { hashToken } from "@/lib/auth/tokens";
import { decryptSecret, encryptionConfigured, encryptSecret, newTotpSecret, verifyTotp } from "@/lib/auth/totp";
import { securityEvent } from "@/lib/auth/security-events";
import { fail, okThen, UserError, type ActionState } from "@/lib/os/action";

const currentSessionId = async () => {
  const t = (await cookies()).get(SESSION_COOKIE)?.value;
  return t ? hashToken(t) : null;
};

/** Step 1: create a pending (not yet enabled) TOTP secret for the signed-in user. */
export async function start2faAction(): Promise<ActionState> {
  try {
    const user = await authorize();
    if (!encryptionConfigured()) throw new UserError("Two-factor authentication needs APP_ENCRYPTION_KEY (32+ characters) on the server.");
    const existing = await db.twoFactorMethod.findUnique({ where: { userId: user.id } });
    if (existing?.enabledAt) throw new UserError("Two-factor authentication is already on.");
    const secretEncrypted = encryptSecret(newTotpSecret());
    await db.twoFactorMethod.upsert({ where: { userId: user.id }, update: { secretEncrypted, enabledAt: null, lastUsedStep: null }, create: { userId: user.id, secretEncrypted } });
    return okThen("/admin/account", "Scan the key in your authenticator app, then enter a code to finish.");
  } catch (e) {
    return fail(e, "security");
  }
}

/** Step 2: prove the app is set up by entering a current code. */
export async function confirm2faAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorize();
    const m = await db.twoFactorMethod.findUnique({ where: { userId: user.id } });
    if (!m || m.enabledAt) throw new UserError("Start the set-up first.");
    const step = verifyTotp(decryptSecret(m.secretEncrypted), String(form.get("code") ?? ""));
    if (step === null) return { error: "That code is not valid.", fieldErrors: { code: "Enter the current 6-digit code" } };
    await db.twoFactorMethod.update({ where: { id: m.id }, data: { enabledAt: new Date(), lastUsedStep: step } });
    await audit({ userId: user.id, action: "security.2fa.enabled", entity: "User", entityId: user.id });
    await securityEvent("2fa.enabled", { userId: user.id });
    return okThen("/admin/account", "Two-factor authentication is on.");
  } catch (e) {
    return fail(e, "security");
  }
}

export async function disable2faAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorize();
    const m = await db.twoFactorMethod.findUnique({ where: { userId: user.id } });
    if (!m) throw new UserError("Two-factor authentication is not set up.");
    if (m.enabledAt && verifyTotp(decryptSecret(m.secretEncrypted), String(form.get("code") ?? "")) === null) return { error: "That code is not valid.", fieldErrors: { code: "Enter the current 6-digit code" } };
    await db.twoFactorMethod.delete({ where: { id: m.id } });
    await audit({ userId: user.id, action: "security.2fa.disabled", entity: "User", entityId: user.id });
    await securityEvent("2fa.disabled", { userId: user.id, severity: "MEDIUM" });
    return okThen("/admin/account", "Two-factor authentication is off.");
  } catch (e) {
    return fail(e, "security");
  }
}

/** Security admins can reset a user's 2FA (lost device). Only a Super Admin can reset a Super Admin. */
export async function reset2faAction(userId: string) {
  const actor = await authorize("security:manage");
  const target = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!target || (target.role === "SUPER_ADMIN" && actor.role !== "SUPER_ADMIN")) return;
  await db.twoFactorMethod.deleteMany({ where: { userId } });
  await audit({ userId: actor.id, action: "security.2fa.reset", entity: "User", entityId: userId });
  await securityEvent("2fa.reset_by_admin", { userId, severity: "MEDIUM", detail: { by: actor.id } });
  revalidatePath("/admin/security");
}

/** Revokes a session: your own, or anyone's with security:manage (Super Admin sessions only by a Super Admin). */
export async function revokeSessionAction(sessionId: string) {
  const actor = await authorize();
  const s = await db.session.findUnique({ where: { id: sessionId }, select: { userId: true, user: { select: { role: true } } } });
  if (!s) return;
  const own = s.userId === actor.id;
  if (!own && (!can(actor.role, "security:manage") || (s.user.role === "SUPER_ADMIN" && actor.role !== "SUPER_ADMIN"))) return;
  if (sessionId === (await currentSessionId())) return; // use Sign out for the current session
  await db.session.deleteMany({ where: { id: sessionId } });
  await audit({ userId: actor.id, action: "security.session.revoked", entity: "User", entityId: s.userId });
  if (!own) await securityEvent("session.revoked_by_admin", { userId: s.userId, severity: "MEDIUM", detail: { by: actor.id } });
  revalidatePath("/admin/security");
  revalidatePath("/admin/account");
}

export async function revokeOtherSessionsAction() {
  const actor = await authorize();
  const current = await currentSessionId();
  const r = await db.session.deleteMany({ where: { userId: actor.id, NOT: current ? { id: current } : undefined } });
  await audit({ userId: actor.id, action: "security.sessions.revoked_others", entity: "User", entityId: actor.id, metadata: { count: r.count } });
  revalidatePath("/admin/account");
}
