"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { audit } from "@/lib/audit";
import { can } from "@/lib/auth/permissions";
import { siteConfig } from "@/data/siteConfig";
import { sendMail } from "@/lib/email/mailer";
import { authorizeAccess } from "@/lib/os/guard";
import { fail, formObject, okThen, optDate, optId, reqText, currency, UserError, type ActionState } from "@/lib/os/action";
import { nextNumber } from "@/lib/os/numbers";
import { logActivity } from "@/lib/os/activity";
import { notify } from "@/lib/os/notify";
import { fmtMoney } from "@/lib/os/money";
import { queueEvent } from "@/lib/automation/engine";
import { parseLines, replaceLines, snapshot } from "./lines";
import { DEFAULT_TERMS, createProposalFromDeal, hashToken, newShareToken, parseContent, proposalContentSchema } from "./proposals";

const P = "PROPOSALS" as const;

const headerSchema = z.object({ title: reqText(200), dealId: optId, clientId: optId, currency, validUntil: optDate });

export async function createProposalAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("proposals:manage", P);
    const h = headerSchema.parse(formObject(form));
    if (h.dealId && form.get("template") === "deal") {
      const p = await createProposalFromDeal(h.dealId, user.id, { title: h.title });
      await audit({ userId: user.id, action: "proposal.created", entity: "Proposal", entityId: p.id, metadata: { fromDeal: h.dealId } });
      return { ok: `Proposal ${p.number} drafted from the deal.`, redirect: `/admin/proposals/${p.id}` };
    }
    const deal = h.dealId ? await db.deal.findUnique({ where: { id: h.dealId }, select: { id: true, clientId: true, leadId: true } }) : null;
    if (h.dealId && !deal) throw new UserError("Deal not found.");
    const clientId = h.clientId ?? deal?.clientId ?? null;
    const client = clientId ? await db.client.findUnique({ where: { id: clientId }, include: { contacts: { where: { isPrimary: true }, take: 1 } } }) : null;
    const p = await db.$transaction(async (tx) => {
      const number = await nextNumber("proposal", tx);
      const created = await tx.proposal.create({
        data: {
          number,
          title: h.title,
          dealId: deal?.id ?? null,
          clientId,
          leadId: deal?.leadId ?? null,
          currency: h.currency,
          validUntil: h.validUntil ?? new Date(Date.now() + 30 * 86400_000),
          content: parseContent({ terms: DEFAULT_TERMS, clientName: client?.name ?? "", clientContact: client?.contacts[0]?.name ?? "", clientEmail: client?.contacts[0]?.email ?? client?.billingEmail ?? "" }),
          createdById: user.id,
        },
      });
      await logActivity({ type: "CREATED", summary: `Proposal ${number} created`, actorId: user.id, proposalId: created.id, dealId: created.dealId, clientId }, tx);
      return created;
    });
    await audit({ userId: user.id, action: "proposal.created", entity: "Proposal", entityId: p.id });
    return { ok: `Proposal ${p.number} created.`, redirect: `/admin/proposals/${p.id}` };
  } catch (e) {
    return fail(e, "proposals");
  }
}

export async function saveProposalAction(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("proposals:manage", P);
    const p = await db.proposal.findUnique({ where: { id } });
    if (!p || p.deletedAt) return { error: "Proposal not found." };
    if (p.status !== "DRAFT") return { error: "Only drafts can be edited. Create a new version to make changes." };
    const o = formObject(form);
    const h = z.object({ title: reqText(200), currency, validUntil: optDate }).parse(o);
    const content = proposalContentSchema.parse(Object.fromEntries(Object.keys(proposalContentSchema.shape).map((k) => [k, typeof o[k] === "string" ? o[k] : ""])));
    const lines = parseLines(o.items);
    const extra = z.preprocess((v) => (v == null || v === "" ? null : String(v).replace(/[,\s]/g, "")), z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, "Invalid discount").nullable()).parse(o.extraDiscount);
    await db.$transaction(async (tx) => {
      const totals = await replaceLines({ proposalId: id }, lines, extra, tx);
      await tx.proposal.update({ where: { id }, data: { ...h, content, ...totals } });
      await logActivity({ type: "UPDATED", actorId: user.id, proposalId: id }, tx);
    });
    revalidatePath(`/admin/proposals/${id}`);
    return { ok: "Proposal saved." };
  } catch (e) {
    return fail(e, "proposals");
  }
}

async function load(id: string) {
  const p = await db.proposal.findUnique({ where: { id }, include: { items: { orderBy: { sortOrder: "asc" } } } });
  if (!p || p.deletedAt) throw new UserError("Proposal not found.");
  return p;
}

export async function submitProposalAction(id: string): Promise<ActionState> {
  try {
    const user = await authorizeAccess("proposals:manage", P);
    const p = await load(id);
    if (p.status !== "DRAFT") return { error: "Only drafts can be submitted." };
    if (!p.items.length || p.total.lessThanOrEqualTo(0)) return { error: "Add priced line items before submitting for review." };
    await db.$transaction(async (tx) => {
      await tx.proposal.update({ where: { id }, data: { status: "INTERNAL_REVIEW", approvedAt: null, approvedById: null } });
      await snapshot("PROPOSAL", id, p.version, p, user.id, "Submitted for review", tx);
      await logActivity({ type: "STATUS_CHANGED", summary: "Submitted for internal review", actorId: user.id, proposalId: id, dealId: p.dealId }, tx);
    });
    await notify({ type: "proposal.review", title: `Proposal ${p.number} awaits review`, body: `${p.title} · ${fmtMoney(p.total, p.currency)}`, href: `/admin/proposals/${id}`, permission: "proposals:approve", exceptUserId: user.id });
    await audit({ userId: user.id, action: "proposal.submitted", entity: "Proposal", entityId: id });
    return okThen(`/admin/proposals/${id}`, "Submitted for review.");
  } catch (e) {
    return fail(e, "proposals");
  }
}

export async function approveProposalAction(id: string): Promise<ActionState> {
  try {
    const user = await authorizeAccess("proposals:approve", P);
    const p = await load(id);
    if (p.status !== "INTERNAL_REVIEW") return { error: "The proposal is not awaiting review." };
    await db.$transaction(async (tx) => {
      await tx.proposal.update({ where: { id }, data: { approvedAt: new Date(), approvedById: user.id } });
      await logActivity({ type: "APPROVED", summary: `Approved for sending`, actorId: user.id, proposalId: id, dealId: p.dealId }, tx);
    });
    await audit({ userId: user.id, action: "proposal.approved", entity: "Proposal", entityId: id, metadata: { total: p.total.toString(), currency: p.currency, selfApproved: p.createdById === user.id } });
    if (p.createdById && p.createdById !== user.id) await notify({ type: "proposal.review", title: `Proposal ${p.number} approved`, href: `/admin/proposals/${id}`, userIds: [p.createdById] });
    return okThen(`/admin/proposals/${id}`, "Proposal approved — it can now be sent.");
  } catch (e) {
    return fail(e, "proposals");
  }
}

export async function returnToDraftAction(id: string): Promise<ActionState> {
  try {
    const user = await authorizeAccess("proposals:manage", P);
    const p = await load(id);
    if (p.status !== "INTERNAL_REVIEW") return { error: "The proposal is not awaiting review." };
    await db.$transaction(async (tx) => {
      await tx.proposal.update({ where: { id }, data: { status: "DRAFT", approvedAt: null, approvedById: null } });
      await logActivity({ type: "STATUS_CHANGED", summary: "Returned to draft", actorId: user.id, proposalId: id }, tx);
    });
    return okThen(`/admin/proposals/${id}`, "Returned to draft.");
  } catch (e) {
    return fail(e, "proposals");
  }
}

export type SendState = (ActionState & { link?: string }) | undefined;

/**
 * Sends an approved proposal: creates a secret share link (only its hash is stored), snapshots the version and — if
 * requested, permitted and email is configured — emails the link. Returns the link once so it can be copied.
 */
export async function sendProposalAction(id: string, _: SendState, form: FormData): Promise<SendState> {
  try {
    const user = await authorizeAccess("proposals:manage", P);
    const p = await load(id);
    const resend = ["SENT", "VIEWED"].includes(p.status);
    if (!resend && p.status !== "INTERNAL_REVIEW") return { error: "Submit the proposal for review first." };
    if (!p.approvedAt) return { error: "The proposal must be approved before it is sent." };
    if (p.validUntil && p.validUntil < new Date()) return { error: "The validity date has passed. Create a new version with a new date." };
    const token = newShareToken();
    const link = `${siteConfig.url}/p/${token}`;
    await db.$transaction(async (tx) => {
      await tx.proposal.update({ where: { id }, data: { status: resend ? p.status : "SENT", sentAt: p.sentAt ?? new Date(), shareTokenHash: hashToken(token), shareExpiresAt: p.validUntil ?? new Date(Date.now() + 30 * 86400_000) } });
      if (!resend) await snapshot("PROPOSAL", id, p.version, { ...p, status: "SENT" }, user.id, "Sent to client", tx);
      await logActivity({ type: "SENT", summary: resend ? "New share link generated (previous link disabled)" : "Sent to client", actorId: user.id, proposalId: id, dealId: p.dealId, clientId: p.clientId }, tx);
      if (!resend && p.dealId) await tx.deal.updateMany({ where: { id: p.dealId, stage: { in: ["DISCOVERY", "QUALIFICATION", "SOLUTION"] } }, data: { stage: "PROPOSAL", probability: 60, stageChangedAt: new Date() } });
    });
    let emailed = "";
    const to = z.string().trim().email().safeParse(form.get("email"));
    if (form.get("sendEmail") === "on") {
      if (!can(user.role, "communication:send")) return { error: "You can copy the link, but sending email needs the communication:send permission.", link };
      if (!to.success) return { error: "Enter a valid recipient email, or copy the link below.", link };
      const r = await sendMail({
        to: to.data,
        subject: `Proposal ${p.number}: ${p.title}`,
        text: `Hello,\n\nPlease find our proposal "${p.title}" here:\n${link}\n\nThe link is valid until ${(p.validUntil ?? new Date(Date.now() + 30 * 86400_000)).toISOString().slice(0, 10)}.\n\n${siteConfig.name}`,
        html: `<p>Hello,</p><p>Please find our proposal <strong>${p.title.replace(/[<>&"]/g, "")}</strong> here:</p><p><a href="${link}">View proposal ${p.number}</a></p><p>${siteConfig.name}</p>`,
      });
      await db.communication.create({ data: { channel: "EMAIL", direction: "OUTBOUND", status: r.sent ? "SENT" : "FAILED", subject: `Proposal ${p.number}`, toAddress: to.data, provider: "smtp", clientId: p.clientId, dealId: p.dealId, leadId: p.leadId, userId: user.id, error: r.error?.slice(0, 300), body: "Proposal share link sent." } });
      emailed = r.sent ? ` and emailed to ${to.data}` : " — email could not be sent (check mail settings); copy the link instead";
    }
    if (!resend) queueEvent({ trigger: "PROPOSAL_SENT", entity: "Proposal", entityId: id, ownerId: p.createdById, actorId: user.id, payload: { proposal: { id, number: p.number, title: p.title, total: p.total.toString(), currency: p.currency, clientId: p.clientId, email: to.success ? to.data : null } } });
    await audit({ userId: user.id, action: resend ? "proposal.link_regenerated" : "proposal.sent", entity: "Proposal", entityId: id, metadata: { emailed: !!emailed } });
    revalidatePath(`/admin/proposals/${id}`);
    return { ok: `${resend ? "New link created" : "Proposal sent"}${emailed}.`, link };
  } catch (e) {
    return fail(e, "proposals");
  }
}

/** Starts a new version from a sent/viewed/rejected/expired proposal. The old share link stops working. */
export async function reviseProposalAction(id: string): Promise<ActionState> {
  try {
    const user = await authorizeAccess("proposals:manage", P);
    const p = await load(id);
    if (!["SENT", "VIEWED", "REJECTED", "EXPIRED"].includes(p.status)) return { error: "Only sent, rejected or expired proposals can be revised." };
    await db.$transaction(async (tx) => {
      await snapshot("PROPOSAL", id, p.version, p, user.id, `Closed version (${p.status})`, tx);
      await tx.proposal.update({ where: { id }, data: { version: p.version + 1, status: "DRAFT", shareTokenHash: null, shareExpiresAt: null, approvedAt: null, approvedById: null, rejectedAt: null, rejectionReason: null } });
      await logActivity({ type: "REVISED", summary: `Version ${p.version + 1} started`, actorId: user.id, proposalId: id }, tx);
    });
    await audit({ userId: user.id, action: "proposal.revised", entity: "Proposal", entityId: id, metadata: { version: p.version + 1 } });
    return okThen(`/admin/proposals/${id}`, "New version started as a draft.");
  } catch (e) {
    return fail(e, "proposals");
  }
}

/** Records a decision the client communicated outside the share page (e.g. signed PDF by email). */
export async function recordDecisionAction(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("proposals:manage", P);
    const d = z.object({ decision: z.enum(["ACCEPTED", "REJECTED"]), by: reqText(200), note: z.string().trim().max(1000).optional() }).parse(formObject(form));
    const p = await load(id);
    if (!["SENT", "VIEWED"].includes(p.status)) return { error: "Only sent proposals can be accepted or rejected." };
    await db.$transaction(async (tx) => {
      await tx.proposal.update({ where: { id }, data: d.decision === "ACCEPTED" ? { status: "ACCEPTED", acceptedAt: new Date(), acceptedByName: d.by } : { status: "REJECTED", rejectedAt: new Date(), rejectionReason: d.note ?? null } });
      await snapshot("PROPOSAL", id, p.version, { ...p, status: d.decision }, user.id, `${d.decision} (recorded by staff)`, tx);
      await logActivity({ type: d.decision, summary: `${d.decision === "ACCEPTED" ? "Accepted" : "Rejected"} by ${d.by} (recorded by staff)${d.note ? ` — ${d.note}` : ""}`, actorId: user.id, proposalId: id, dealId: p.dealId, clientId: p.clientId }, tx);
      if (d.decision === "ACCEPTED" && p.dealId) await tx.deal.updateMany({ where: { id: p.dealId, stage: { in: ["DISCOVERY", "QUALIFICATION", "SOLUTION", "PROPOSAL"] } }, data: { stage: "NEGOTIATION", probability: 75, stageChangedAt: new Date() } });
    });
    await audit({ userId: user.id, action: `proposal.${d.decision.toLowerCase()}`, entity: "Proposal", entityId: id, metadata: { recordedBy: user.id, by: d.by } });
    return okThen(`/admin/proposals/${id}`, `Recorded as ${d.decision.toLowerCase()}.`);
  } catch (e) {
    return fail(e, "proposals");
  }
}

export async function archiveProposalAction(id: string) {
  const user = await authorizeAccess("proposals:manage", P);
  await db.proposal.update({ where: { id }, data: { deletedAt: new Date(), shareTokenHash: null } });
  await audit({ userId: user.id, action: "proposal.archived", entity: "Proposal", entityId: id });
  revalidatePath("/admin/proposals");
}

export async function generateProposalFromDealAction(dealId: string) {
  const user = await authorizeAccess("proposals:manage", P);
  const p = await createProposalFromDeal(dealId, user.id);
  await audit({ userId: user.id, action: "proposal.created", entity: "Proposal", entityId: p.id, metadata: { fromDeal: dealId } });
  return p.id;
}
