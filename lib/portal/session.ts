import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { hashToken, newToken } from "@/lib/auth/tokens";
import { requestMeta } from "@/lib/auth/session";

/**
 * Client-portal sessions. Completely separate from admin sessions (own cookie, own table, own users).
 * Tenant isolation: the only source of `clientId` for portal data is this server-side session.
 */
const IDLE_MS = 8 * 60 * 60 * 1000;
const ABSOLUTE_MS = 14 * 24 * 60 * 60 * 1000;
const RENEW_MS = 60 * 60 * 1000;

export const PORTAL_COOKIE = process.env.NODE_ENV === "production" ? "__Host-shv_client" : "shv_client";

export interface PortalSessionUser {
  id: string;
  email: string;
  name: string;
  clientId: string;
  clientName: string;
}

async function setCookie(token: string, expires: Date) {
  (await cookies()).set(PORTAL_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires });
}

export async function createPortalSession(portalUserId: string) {
  const token = newToken();
  const { ip, userAgent } = await requestMeta();
  const expiresAt = new Date(Date.now() + IDLE_MS);
  await db.portalSession.create({ data: { id: hashToken(token), portalUserId, expiresAt, ip, userAgent } });
  await setCookie(token, expiresAt);
}

export async function destroyPortalSession() {
  const jar = await cookies();
  const token = jar.get(PORTAL_COOKIE)?.value;
  if (token) await db.portalSession.deleteMany({ where: { id: hashToken(token) } });
  jar.set(PORTAL_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
}

export const getPortalUser = cache(async (): Promise<PortalSessionUser | null> => {
  if (!process.env.DATABASE_URL) return null;
  const token = (await cookies()).get(PORTAL_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const id = hashToken(token);
  const s = await db.portalSession.findUnique({ where: { id }, include: { portalUser: { include: { client: { select: { id: true, name: true, deletedAt: true } } } } } });
  if (!s) return null;
  const now = Date.now();
  const u = s.portalUser;
  const expired = s.expiresAt.getTime() <= now || s.createdAt.getTime() + ABSOLUTE_MS <= now;
  const stale = u.passwordChangedAt.getTime() > s.createdAt.getTime() + 1000;
  if (expired || stale || !u.active || u.client.deletedAt) {
    await db.portalSession.delete({ where: { id } }).catch(() => {});
    return null;
  }
  if (now - s.lastSeenAt.getTime() > RENEW_MS || s.expiresAt.getTime() - now < RENEW_MS) {
    const expiresAt = new Date(Math.min(now + IDLE_MS, s.createdAt.getTime() + ABSOLUTE_MS));
    await db.portalSession.update({ where: { id }, data: { lastSeenAt: new Date(now), expiresAt } }).catch(() => {});
    await setCookie(token, expiresAt).catch(() => {});
  }
  return { id: u.id, email: u.email, name: u.name, clientId: u.clientId, clientName: u.client.name };
});

export async function requirePortalUser(): Promise<PortalSessionUser> {
  const u = await getPortalUser();
  if (!u) redirect("/client/login");
  return u;
}

export class PortalAuthError extends Error {
  constructor() {
    super("Please sign in again.");
  }
}

/** For portal server actions and route handlers. */
export async function authorizePortal(): Promise<PortalSessionUser> {
  const u = await getPortalUser();
  if (!u) throw new PortalAuthError();
  return u;
}
