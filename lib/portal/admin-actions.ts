"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { audit } from "@/lib/audit";
import { hashToken, newToken } from "@/lib/auth/tokens";
import { sendMail } from "@/lib/email/mailer";
import { siteConfig } from "@/data/siteConfig";
import { authorizeAccess } from "@/lib/os/guard";
import { fail, reqText, UserError, type ActionState } from "@/lib/os/action";

export type InviteState = (ActionState & { link?: string }) | undefined;
const INVITE_MS = 7 * 86400_000;

async function issueInvite(portalUserId: string, email: string, name: string, clientName: string) {
  const token = newToken();
  await db.portalToken.updateMany({ where: { portalUserId, usedAt: null }, data: { usedAt: new Date() } });
  await db.portalToken.create({ data: { id: hashToken(token), portalUserId, purpose: "INVITE", expiresAt: new Date(Date.now() + INVITE_MS) } });
  const link = `${siteConfig.url}/client/set-password?token=${token}`;
  const r = await sendMail({
    to: email,
    subject: `Your ${siteConfig.name} client portal access`,
    text: `Hello ${name},\n\nYou have been invited to the ${siteConfig.name} client portal for ${clientName}. Set your password here (valid for 7 days):\n${link}\n`,
    html: `<p>Hello ${name.replace(/[<>&]/g, "")},</p><p>You have been invited to the ${siteConfig.name} client portal for <strong>${clientName.replace(/[<>&]/g, "")}</strong>.</p><p><a href="${link}">Set your password</a> (valid for 7 days).</p>`,
  });
  return { link, emailed: r.sent };
}

/** Creates a portal user for a client and returns a one-time invitation link (also emailed when mail is configured). */
export async function invitePortalUserAction(_: InviteState, form: FormData): Promise<InviteState> {
  try {
    const user = await authorizeAccess("portal:manage", "CLIENT_PORTAL");
    const d = z.object({ clientId: z.string().min(1, "Choose a client").max(40), email: z.string().trim().toLowerCase().email("Invalid email").max(160), name: reqText(200) }).parse({ clientId: form.get("clientId"), email: form.get("email"), name: form.get("name") });
    const client = await db.client.findFirst({ where: { id: d.clientId, deletedAt: null } });
    if (!client) throw new UserError("Client not found.");
    if (await db.portalUser.findUnique({ where: { email: d.email } })) throw new UserError("A portal user with this email already exists.");
    if (await db.user.findUnique({ where: { email: d.email } })) throw new UserError("This email belongs to a staff account. Use a different address for portal access.");
    const pu = await db.portalUser.create({ data: { clientId: client.id, email: d.email, name: d.name } });
    const { link, emailed } = await issueInvite(pu.id, pu.email, pu.name, client.name);
    await audit({ userId: user.id, action: "portal.user_invited", entity: "PortalUser", entityId: pu.id, metadata: { clientId: client.id, emailed } });
    revalidatePath("/admin/portal-users");
    return { ok: emailed ? `Invitation emailed to ${pu.email}.` : "Portal user created. Email is not configured — send them the link below.", link };
  } catch (e) {
    return fail(e, "portal");
  }
}

export async function resendInviteAction(portalUserId: string): Promise<InviteState> {
  try {
    const user = await authorizeAccess("portal:manage", "CLIENT_PORTAL");
    const pu = await db.portalUser.findUnique({ where: { id: portalUserId }, include: { client: true } });
    if (!pu || !pu.active) return { error: "Portal user not found or disabled." };
    const { link, emailed } = await issueInvite(pu.id, pu.email, pu.name, pu.client.name);
    await audit({ userId: user.id, action: "portal.invite_resent", entity: "PortalUser", entityId: pu.id, metadata: { emailed } });
    return { ok: emailed ? "New invitation emailed." : "New link created — copy it below.", link };
  } catch (e) {
    return fail(e, "portal");
  }
}

export async function setPortalUserActiveAction(portalUserId: string, active: boolean) {
  const user = await authorizeAccess("portal:manage", "CLIENT_PORTAL");
  await db.$transaction([db.portalUser.update({ where: { id: portalUserId }, data: { active } }), ...(active ? [] : [db.portalSession.deleteMany({ where: { portalUserId } })])]);
  await audit({ userId: user.id, action: active ? "portal.user_enabled" : "portal.user_disabled", entity: "PortalUser", entityId: portalUserId });
  revalidatePath("/admin/portal-users");
}
