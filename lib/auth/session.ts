import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { hashToken, newToken } from "./tokens";
import { can, type Permission, type RoleName } from "./permissions";

const IDLE_MS = 8 * 60 * 60 * 1000; // sliding idle timeout
const ABSOLUTE_MS = 7 * 24 * 60 * 60 * 1000; // hard cap regardless of activity
const RENEW_WHEN_MS = 60 * 60 * 1000; // extend when less than 1h of idle time is left... or on each hour of use

/** `__Host-` prefix pins the cookie to this origin over HTTPS; plain name in local development. */
export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-shv_admin" : "shv_admin";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: RoleName;
}

export async function requestMeta() {
  const h = await headers();
  return { ip: (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || null, userAgent: h.get("user-agent")?.slice(0, 300) ?? null };
}

async function setCookie(token: string, expires: Date) {
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires });
}

export async function createSession(userId: string) {
  const token = newToken();
  const { ip, userAgent } = await requestMeta();
  const expiresAt = new Date(Date.now() + IDLE_MS);
  await db.session.create({ data: { id: hashToken(token), userId, expiresAt, ip, userAgent } });
  await setCookie(token, expiresAt);
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { id: hashToken(token) } });
  // __Host- cookies are only replaced when the same Secure/Path attributes are sent.
  jar.set(SESSION_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
}

/** Validates the session cookie against the database (once per request). */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  if (!process.env.DATABASE_URL) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const id = hashToken(token);
  const session = await db.session.findUnique({ where: { id }, include: { user: true } });
  if (!session) return null;
  const now = Date.now();
  const u = session.user;
  const expired = session.expiresAt.getTime() <= now || session.createdAt.getTime() + ABSOLUTE_MS <= now;
  const stale = u.passwordChangedAt.getTime() > session.createdAt.getTime() + 1000;
  if (expired || stale || !u.active) {
    await db.session.delete({ where: { id } }).catch(() => {});
    return null;
  }
  // Sliding renewal (DB write at most every RENEW_WHEN_MS).
  if (now - session.lastSeenAt.getTime() > RENEW_WHEN_MS || session.expiresAt.getTime() - now < RENEW_WHEN_MS) {
    const expiresAt = new Date(Math.min(now + IDLE_MS, session.createdAt.getTime() + ABSOLUTE_MS));
    await db.session.update({ where: { id }, data: { lastSeenAt: new Date(now), expiresAt } }).catch(() => {});
    await setCookie(token, expiresAt).catch(() => {}); // cookies are read-only while rendering; fine to skip
  }
  return { id: u.id, email: u.email, name: u.name, role: u.role as RoleName };
});

/** For pages and layouts: redirect to login when signed out. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  return user;
}

export class AuthError extends Error {
  constructor(public code: "UNAUTHENTICATED" | "FORBIDDEN") {
    super(code === "UNAUTHENTICATED" ? "Please sign in again." : "You do not have permission to do that.");
  }
}

/** For pages: redirect to login, or to the forbidden page when the role lacks the permission. */
export async function requirePermission(p: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.role, p)) redirect(`/admin/forbidden?need=${encodeURIComponent(p)}`);
  return user;
}

/** For server actions and route handlers: throws AuthError (never trust the client). */
export async function authorize(p?: Permission): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthError("UNAUTHENTICATED");
  if (p && !can(user.role, p)) throw new AuthError("FORBIDDEN");
  return user;
}
