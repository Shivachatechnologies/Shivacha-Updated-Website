"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { audit } from "@/lib/audit";
import { sendMail } from "@/lib/email/mailer";
import { siteConfig } from "@/data/siteConfig";
import { dummyHash, hashPassword, passwordProblem, verifyPassword } from "./password";
import { createSession, destroySession, getSessionUser, requestMeta } from "./session";
import { hashToken, newToken } from "./tokens";
import { decryptSecret, verifyTotp } from "./totp";
import { securityEvent } from "./security-events";

export type FormState = { error?: string; ok?: string; twoFactor?: boolean } | undefined;

const WINDOW_MS = 15 * 60 * 1000;
const MAX_EMAIL_FAILS = 5; // per email per window
const MAX_IP_FAILS = 20; // per IP per window
const LOCK_AFTER = 10; // consecutive failures before the account is locked
const LOCK_MS = 30 * 60 * 1000;
const GENERIC = "Invalid email or password.";

const loginSchema = z.object({ email: z.string().trim().toLowerCase().email().max(160), password: z.string().min(1).max(128), next: z.string().max(300).optional(), code: z.string().trim().max(10).optional() });

/** Only same-site admin paths are accepted as post-login destinations (no open redirects). */
const safeNext = (n?: string) => (n && /^\/(admin|employee)(\/[\w\-/[\]?=&%.]*)?$/.test(n) && !n.startsWith("/admin/login") ? n : "/admin/dashboard");

export async function loginAction(_: FormState, form: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({ email: form.get("email"), password: form.get("password"), next: form.get("next") || undefined, code: form.get("code") || undefined });
  if (!parsed.success) return { error: GENERIC };
  const { email, password, next, code } = parsed.data;
  const { ip } = await requestMeta();
  const since = new Date(Date.now() - WINDOW_MS);

  const [emailFails, ipFails] = await Promise.all([
    db.loginAttempt.count({ where: { email, success: false, createdAt: { gte: since } } }),
    ip ? db.loginAttempt.count({ where: { ip, success: false, createdAt: { gte: since } } }) : Promise.resolve(0),
  ]);
  if (emailFails >= MAX_EMAIL_FAILS || ipFails >= MAX_IP_FAILS) {
    await db.loginAttempt.create({ data: { email, ip, success: false } });
    return { error: "Too many attempts. Please wait 15 minutes and try again." };
  }

  const user = await db.user.findUnique({ where: { email } });
  // Always run a bcrypt comparison so response time does not reveal whether the account exists.
  const ok = await verifyPassword(password, user?.passwordHash ?? (await dummyHash()));
  const locked = !!user?.lockedUntil && user.lockedUntil.getTime() > Date.now();

  if (!user || !ok || !user.active || locked) {
    await db.loginAttempt.create({ data: { email, ip, success: false } });
    if (locked || (user && !ok)) await securityEvent(locked ? "login.locked_account" : "login.failed", { userId: user?.id, severity: "LOW", detail: { email } });
    if (user && !ok) {
      const fails = user.failedLoginCount + 1;
      await db.user.update({ where: { id: user.id }, data: { failedLoginCount: fails, lockedUntil: fails >= LOCK_AFTER ? new Date(Date.now() + LOCK_MS) : user.lockedUntil } });
      if (fails === LOCK_AFTER) await audit({ userId: user.id, action: "auth.locked", entity: "User", entityId: user.id });
    }
    return { error: locked ? "This account is temporarily locked. Try again later or reset your password." : GENERIC };
  }

  // Optional TOTP second factor (only for users who enabled it).
  const tfa = await db.twoFactorMethod.findUnique({ where: { userId: user.id } });
  if (tfa?.enabledAt) {
    if (!code) return { error: "Enter the 6-digit code from your authenticator app.", twoFactor: true };
    let step: number | null = null;
    try {
      step = verifyTotp(decryptSecret(tfa.secretEncrypted), code);
    } catch {
      step = null;
    }
    // Reject replays of an already-used code (atomic compare-and-set on the last used step).
    const fresh = step !== null && (await db.twoFactorMethod.updateMany({ where: { id: tfa.id, OR: [{ lastUsedStep: null }, { lastUsedStep: { lt: step } }] }, data: { lastUsedStep: step } })).count === 1;
    if (!fresh) {
      await db.loginAttempt.create({ data: { email, ip, success: false } });
      await securityEvent("login.2fa_failed", { userId: user.id, severity: "MEDIUM" });
      return { error: "That code is not valid. Try the current code.", twoFactor: true };
    }
  }

  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } }),
    db.loginAttempt.create({ data: { email, ip, success: true } }),
  ]);
  await createSession(user.id);
  await audit({ userId: user.id, action: "auth.login", entity: "User", entityId: user.id });
  redirect(safeNext(next));
}

export async function logoutAction() {
  const user = await getSessionUser();
  await destroySession();
  if (user) await audit({ userId: user.id, action: "auth.logout", entity: "User", entityId: user.id });
  redirect("/admin/login");
}

const RESET_MS = 30 * 60 * 1000;

/** Always answers the same way, whether or not the email exists. */
export async function requestPasswordResetAction(_: FormState, form: FormData): Promise<FormState> {
  const email = z.string().trim().toLowerCase().email().max(160).safeParse(form.get("email"));
  const done = { ok: "If an active account exists for that email, a reset link has been sent. It expires in 30 minutes." };
  if (!email.success) return done;
  const { ip } = await requestMeta();
  const recent = await db.loginAttempt.count({ where: { email: `reset:${email.data}`, createdAt: { gte: new Date(Date.now() - WINDOW_MS) } } });
  await db.loginAttempt.create({ data: { email: `reset:${email.data}`, ip, success: true } });
  if (recent >= 3) return done;
  const user = await db.user.findUnique({ where: { email: email.data } });
  if (!user || !user.active) return done;
  const token = newToken();
  await db.passwordResetToken.create({ data: { id: hashToken(token), userId: user.id, expiresAt: new Date(Date.now() + RESET_MS) } });
  const link = `${siteConfig.url}/admin/reset-password?token=${token}`;
  const r = await sendMail({
    to: user.email,
    subject: "Reset your Shivacha admin password",
    text: `A password reset was requested for your Shivacha admin account.\n\nReset link (valid for 30 minutes): ${link}\n\nIf you did not request this, ignore this email — your password will not change.`,
    html: `<p>A password reset was requested for your Shivacha admin account.</p><p><a href="${link}">Reset your password</a> (valid for 30 minutes).</p><p>If you did not request this, ignore this email — your password will not change.</p>`,
  });
  if (!r.sent) console.error("[auth] reset email failed", { userId: user.id });
  await audit({ userId: user.id, action: "auth.reset_requested", entity: "User", entityId: user.id });
  return done;
}

export async function resetPasswordAction(_: FormState, form: FormData): Promise<FormState> {
  const token = String(form.get("token") ?? "");
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  if (!token || token.length > 100) return { error: "This reset link is invalid or has expired." };
  const rec = await db.passwordResetToken.findUnique({ where: { id: hashToken(token) }, include: { user: true } });
  if (!rec || rec.usedAt || rec.expiresAt.getTime() < Date.now() || !rec.user.active) return { error: "This reset link is invalid or has expired." };
  if (password !== confirm) return { error: "Passwords do not match." };
  const problem = passwordProblem(password, rec.user.email);
  if (problem) return { error: problem };
  await db.$transaction([
    db.user.update({ where: { id: rec.userId }, data: { passwordHash: await hashPassword(password), passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null } }),
    db.passwordResetToken.update({ where: { id: rec.id }, data: { usedAt: new Date() } }),
    db.session.deleteMany({ where: { userId: rec.userId } }),
  ]);
  await audit({ userId: rec.userId, action: "auth.password_reset", entity: "User", entityId: rec.userId });
  return { ok: "Password updated. You can now sign in." };
}
