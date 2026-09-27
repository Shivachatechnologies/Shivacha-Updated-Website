"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { requestMeta } from "@/lib/auth/session";
import { logActivity } from "@/lib/os/activity";
import { notify } from "@/lib/os/notify";
import { rateLimited } from "@/lib/os/ratelimit";
import { snapshot } from "./lines";
import { hashToken } from "./proposals";

export type PublicState = { ok?: string; error?: string } | undefined;

async function live(token: string) {
  if (!/^[\w-]{30,80}$/.test(token)) return null;
  const p = await db.proposal.findUnique({ where: { shareTokenHash: hashToken(token) }, include: { items: true } });
  if (!p || p.deletedAt || !["SENT", "VIEWED"].includes(p.status)) return null;
  if ((p.shareExpiresAt && p.shareExpiresAt < new Date()) || (p.validUntil && p.validUntil < new Date())) return null;
  return p;
}

/** Client accepts through the secret link. Requires the typed full name and explicit confirmation. */
export async function acceptProposalAction(token: string, _: PublicState, form: FormData): Promise<PublicState> {
  const { ip, userAgent } = await requestMeta();
  if (rateLimited(`p-accept:${ip}`, 10, 10 * 60_000)) return { error: "Too many attempts. Please try again later." };
  const parsed = z.object({ name: z.string().trim().min(2, "Type your full name").max(200), title: z.string().trim().max(120).optional(), confirm: z.literal("on", { error: "Please confirm you are authorised to accept" }) }).safeParse({ name: form.get("name"), title: form.get("title") || undefined, confirm: form.get("confirm") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const p = await live(token);
  if (!p) return { error: "This proposal link is no longer active." };
  await db.$transaction(async (tx) => {
    await tx.proposal.update({ where: { id: p.id }, data: { status: "ACCEPTED", acceptedAt: new Date(), acceptedByName: parsed.data.title ? `${parsed.data.name} (${parsed.data.title})` : parsed.data.name } });
    await snapshot("PROPOSAL", p.id, p.version, { ...p, status: "ACCEPTED" }, null, `Accepted online by ${parsed.data.name}`, tx);
    await logActivity({ type: "ACCEPTED", summary: `Accepted online by ${parsed.data.name}${parsed.data.title ? `, ${parsed.data.title}` : ""}`, data: { ip, userAgent }, proposalId: p.id, dealId: p.dealId, clientId: p.clientId }, tx);
    await tx.auditLog.create({ data: { action: "proposal.accepted_online", entity: "Proposal", entityId: p.id, ip, userAgent, metadata: { name: parsed.data.name, version: p.version } } });
    if (p.dealId) await tx.deal.updateMany({ where: { id: p.dealId, stage: { in: ["DISCOVERY", "QUALIFICATION", "SOLUTION", "PROPOSAL"] } }, data: { stage: "NEGOTIATION", probability: 75, stageChangedAt: new Date() } });
  });
  const deal = p.dealId ? await db.deal.findUnique({ where: { id: p.dealId }, select: { ownerId: true } }) : null;
  await notify({ type: "proposal.viewed", title: `Proposal ${p.number} accepted by ${parsed.data.name}`, href: `/admin/proposals/${p.id}`, userIds: [p.createdById, deal?.ownerId] });
  revalidatePath(`/p/${token}`);
  return { ok: "Thank you — the proposal has been accepted. Our team will be in touch with next steps." };
}

export async function declineProposalAction(token: string, _: PublicState, form: FormData): Promise<PublicState> {
  const { ip, userAgent } = await requestMeta();
  if (rateLimited(`p-decline:${ip}`, 10, 10 * 60_000)) return { error: "Too many attempts. Please try again later." };
  const reason = z.string().trim().max(1000).parse(form.get("reason") ?? "");
  const p = await live(token);
  if (!p) return { error: "This proposal link is no longer active." };
  await db.$transaction(async (tx) => {
    await tx.proposal.update({ where: { id: p.id }, data: { status: "REJECTED", rejectedAt: new Date(), rejectionReason: reason || null } });
    await snapshot("PROPOSAL", p.id, p.version, { ...p, status: "REJECTED" }, null, "Declined online", tx);
    await logActivity({ type: "REJECTED", summary: `Declined online${reason ? ` — ${reason}` : ""}`, data: { ip, userAgent }, proposalId: p.id, dealId: p.dealId, clientId: p.clientId }, tx);
  });
  await notify({ type: "proposal.viewed", title: `Proposal ${p.number} declined`, body: reason || undefined, href: `/admin/proposals/${p.id}`, userIds: [p.createdById] });
  revalidatePath(`/p/${token}`);
  return { ok: "Thank you for letting us know. Your feedback has been shared with our team." };
}
