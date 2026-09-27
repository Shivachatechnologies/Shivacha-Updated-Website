"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { audit } from "@/lib/audit";
import { requestMeta } from "@/lib/auth/session";
import { dummyHash, hashPassword, passwordProblem, verifyPassword } from "@/lib/auth/password";
import { hashToken, newToken } from "@/lib/auth/tokens";
import { sendMail } from "@/lib/email/mailer";
import { siteConfig } from "@/data/siteConfig";
import { createPortalSession, destroyPortalSession, getPortalUser } from "./session";

export type PortalFormState = { error?: string; ok?: string } | undefined;

const WINDOW_MS = 15 * 60 * 1000;
const GENERIC = "Invalid email or password.";
const LOCK_AFTER = 10;
const LOCK_MS = 30 * 60 * 1000;

export async function portalLoginAction(_: PortalFormState, form: FormData): Promise<PortalFormState> {
  const parsed = z.object({ email: z.string().trim().toLowerCase().email().max(160), password: z.string().min(1).max(128) }).safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: GENERIC };
  const { email, password } = parsed.data;
  const { ip, userAgent } = await requestMeta();
  const key = `portal:${email}`;
  const since = new Date(Date.now() - WINDOW_MS);
  const [fails, ipFails] = await Promise.all([
    db.loginAttempt.count({ where: { email: key, success: false, createdAt: { gte: since } } }),
    ip ? db.loginAttempt.count({ where: { ip, success: false, createdAt: { gte: since } } }) : Promise.resolve(0),
  ]);
  if (fails >= 5 || ipFails >= 20) {
    await db.loginAttempt.create({ data: { email: key, ip, userAgent, success: false } });
    return { error: "Too many attempts. Please wait 15 minutes and try again." };
  }
  const u = await db.portalUser.findUnique({ where: { email }, include: { client: { select: { deletedAt: true } } } });
  const ok = await verifyPassword(password, u?.passwordHash ?? (await dummyHash()));
  const locked = !!u?.lockedUntil && u.lockedUntil.getTime() > Date.now();
  if (!u || !u.passwordHash || !ok || !u.active || locked || u.client.deletedAt) {
    await db.loginAttempt.create({ data: { email: key, ip, userAgent, success: false } });
    if (u && !ok) {
      const n = u.failedLoginCount + 1;
      await db.portalUser.update({ where: { id: u.id }, data: { failedLoginCount: n, lockedUntil: n >= LOCK_AFTER ? new Date(Date.now() + LOCK_MS) : u.lockedUntil } });
      if (n === LOCK_AFTER) await db.securityEvent.create({ data: { type: "portal.locked", severity: "MEDIUM", ip, userAgent, detail: { portalUserId: u.id } } });
    }
    return { error: locked ? "This account is temporarily locked. Try again later or reset your password." : GENERIC };
  }
  await db.$transaction([
    db.portalUser.update({ where: { id: u.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } }),
    db.loginAttempt.create({ data: { email: key, ip, userAgent, success: true } }),
  ]);
  await createPortalSession(u.id);
  await audit({ action: "portal.login", entity: "PortalUser", entityId: u.id, metadata: { clientId: u.clientId } });
  redirect("/client/dashboard");
}

export async function portalLogoutAction() {
  const u = await getPortalUser();
  await destroyPortalSession();
  if (u) await audit({ action: "portal.logout", entity: "PortalUser", entityId: u.id });
  redirect("/client/login");
}

/** Sets the password from an invitation or reset link (single use). */
export async function setPortalPasswordAction(_: PortalFormState, form: FormData): Promise<PortalFormState> {
  const token = String(form.get("token") ?? "");
  const password = String(form.get("password") ?? "");
  if (!token || token.length > 100) return { error: "This link is invalid or has expired." };
  const rec = await db.portalToken.findUnique({ where: { id: hashToken(token) }, include: { portalUser: true } });
  if (!rec || rec.usedAt || rec.expiresAt.getTime() < Date.now() || !rec.portalUser.active) return { error: "This link is invalid or has expired. Ask your account manager for a new one." };
  if (password !== String(form.get("confirm") ?? "")) return { error: "Passwords do not match." };
  const problem = passwordProblem(password, rec.portalUser.email);
  if (problem) return { error: problem };
  await db.$transaction([
    db.portalUser.update({ where: { id: rec.portalUserId }, data: { passwordHash: await hashPassword(password), passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null } }),
    db.portalToken.update({ where: { id: rec.id }, data: { usedAt: new Date() } }),
    db.portalToken.updateMany({ where: { portalUserId: rec.portalUserId, usedAt: null }, data: { usedAt: new Date() } }),
    db.portalSession.deleteMany({ where: { portalUserId: rec.portalUserId } }),
  ]);
  await audit({ action: rec.purpose === "INVITE" ? "portal.invite_accepted" : "portal.password_reset", entity: "PortalUser", entityId: rec.portalUserId });
  return { ok: "Password set. You can now sign in." };
}

export async function portalForgotAction(_: PortalFormState, form: FormData): Promise<PortalFormState> {
  const done = { ok: "If an active portal account exists for that email, a reset link has been sent. It expires in 30 minutes." };
  const email = z.string().trim().toLowerCase().email().max(160).safeParse(form.get("email"));
  if (!email.success) return done;
  const { ip } = await requestMeta();
  const recent = await db.loginAttempt.count({ where: { email: `portal-reset:${email.data}`, createdAt: { gte: new Date(Date.now() - WINDOW_MS) } } });
  await db.loginAttempt.create({ data: { email: `portal-reset:${email.data}`, ip, success: true } });
  if (recent >= 3) return done;
  const u = await db.portalUser.findUnique({ where: { email: email.data } });
  if (!u || !u.active) return done;
  const token = newToken();
  await db.portalToken.create({ data: { id: hashToken(token), portalUserId: u.id, purpose: "RESET", expiresAt: new Date(Date.now() + 30 * 60 * 1000) } });
  const link = `${siteConfig.url}/client/set-password?token=${token}`;
  const r = await sendMail({ to: u.email, subject: "Reset your Shivacha client portal password", text: `Reset your password (valid for 30 minutes): ${link}\n\nIf you did not request this, ignore this email.`, html: `<p><a href="${link}">Reset your Shivacha client portal password</a> (valid for 30 minutes).</p><p>If you did not request this, ignore this email.</p>` });
  if (!r.sent) console.error("[portal] reset email failed", { portalUserId: u.id });
  return done;
}
