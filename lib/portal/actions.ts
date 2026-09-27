"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { audit } from "@/lib/audit";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/auth/password";
import { requestMeta } from "@/lib/auth/session";
import { logActivity } from "@/lib/os/activity";
import { notify } from "@/lib/os/notify";
import { rateLimited } from "@/lib/os/ratelimit";
import { MAX_DOCUMENT_BYTES, safeName, sniffDocument, storeDocument } from "@/lib/os/documents";
import { snapshot } from "@/lib/sales/lines";
import { createTicket, TICKET_CATEGORIES } from "@/lib/support/core";
import { authorizePortal, PortalAuthError } from "./session";

export type PortalState = { ok?: string; error?: string; redirect?: string } | undefined;

const failP = (e: unknown): PortalState => {
  if (e instanceof PortalAuthError) return { error: e.message, redirect: "/client/login" };
  if (e instanceof z.ZodError) return { error: e.issues[0]?.message ?? "Please check the form." };
  console.error("[portal] action failed", (e as Error).message);
  return { error: "Something went wrong. Please try again." };
};

async function attachFiles(files: File[], ticketId: string, clientId: string, portalUserId: string) {
  for (const f of files.slice(0, 3)) {
    if (f.size > MAX_DOCUMENT_BYTES) throw new z.ZodError([{ code: "custom", path: ["files"], message: `${f.name} is larger than 4 MB.`, input: f.name }]);
    const buf = Buffer.from(await f.arrayBuffer());
    const t = sniffDocument(buf, f.name);
    if (!t) throw new z.ZodError([{ code: "custom", path: ["files"], message: `${f.name}: only PDF, images, Office documents, ZIP, TXT and CSV are accepted.`, input: f.name }]);
    const stored = await storeDocument(buf, t.mime, t.ext);
    await db.document.create({ data: { name: safeName(f.name), key: stored.key, url: stored.url, mimeType: t.mime, size: buf.length, visibility: "CLIENT", clientId, ticketId, portalUserId } });
  }
}

export async function portalCreateTicketAction(_: PortalState, form: FormData): Promise<PortalState> {
  try {
    const u = await authorizePortal();
    if (rateLimited(`portal-ticket:${u.id}`, 10, 60 * 60_000)) return { error: "You have opened many tickets recently. Please add to an existing ticket or try again later." };
    const d = z.object({ subject: z.string().trim().min(3, "Add a subject").max(200), description: z.string().trim().min(5, "Describe the issue").max(10000), category: z.enum(TICKET_CATEGORIES), priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]), projectId: z.string().max(40).optional() }).parse({ subject: form.get("subject"), description: form.get("description"), category: form.get("category"), priority: form.get("priority"), projectId: form.get("projectId") || undefined });
    // A client can only link its own project.
    const projectId = d.projectId ? (await db.project.findFirst({ where: { id: d.projectId, clientId: u.clientId }, select: { id: true } }))?.id ?? null : null;
    const ticket = await createTicket({ subject: d.subject, description: d.description, category: d.category, priority: d.priority, source: "PORTAL", clientId: u.clientId, projectId, portalUserId: u.id, contactName: u.name, contactEmail: u.email }, null);
    const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    let note = "";
    if (files.length) {
      try {
        await attachFiles(files, ticket.id, u.clientId, u.id);
      } catch (e) {
        // The ticket exists; tell the client the attachment part did not go through.
        note = e instanceof z.ZodError ? ` Attachment not added: ${e.issues[0]?.message}` : " Attachments could not be stored — please reply with them later.";
      }
    }
    await audit({ action: "portal.ticket_created", entity: "Ticket", entityId: ticket.id, metadata: { portalUserId: u.id } });
    return { ok: `Ticket ${ticket.number} created.${note}`, redirect: `/client/support/${ticket.id}` };
  } catch (e) {
    return failP(e);
  }
}

export async function portalReplyTicketAction(ticketId: string, _: PortalState, form: FormData): Promise<PortalState> {
  try {
    const u = await authorizePortal();
    const body = z.string().trim().min(1, "Write a message").max(10000).parse(form.get("body"));
    const t = await db.ticket.findFirst({ where: { id: ticketId, clientId: u.clientId } });
    if (!t) return { error: "Ticket not found." };
    await db.$transaction(async (tx) => {
      await tx.ticketMessage.create({ data: { ticketId, portalUserId: u.id, body } });
      // A client reply re-opens tickets that were waiting on them or resolved.
      if (["WAITING_FOR_CLIENT", "RESOLVED"].includes(t.status)) await tx.ticket.update({ where: { id: ticketId }, data: { status: "IN_PROGRESS", resolvedAt: null } });
      else await tx.ticket.update({ where: { id: ticketId }, data: { updatedAt: new Date() } });
      await logActivity({ type: "CLIENT_REPLY", summary: `${u.name} replied`, ticketId, clientId: u.clientId }, tx);
    });
    const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length) await attachFiles(files, ticketId, u.clientId, u.id);
    await notify({ type: "ticket.assigned", title: `Client replied on ${t.number}`, body: body.slice(0, 200), href: `/admin/support/${t.id}`, userIds: [t.assigneeId], permission: t.assigneeId ? undefined : "support:manage" });
    revalidatePath(`/client/support/${ticketId}`);
    return { ok: "Reply sent." };
  } catch (e) {
    return failP(e);
  }
}

export async function portalSendMessageAction(_: PortalState, form: FormData): Promise<PortalState> {
  try {
    const u = await authorizePortal();
    if (rateLimited(`portal-msg:${u.id}`, 30, 60 * 60_000)) return { error: "Too many messages. Please try again later." };
    const d = z.object({ subject: z.string().trim().max(200).optional(), body: z.string().trim().min(1, "Write a message").max(10000) }).parse({ subject: form.get("subject") || undefined, body: form.get("body") });
    const client = await db.client.findUnique({ where: { id: u.clientId }, select: { accountOwnerId: true } });
    await db.communication.create({ data: { channel: "NOTE", direction: "INBOUND", status: "RECEIVED", provider: "portal", subject: d.subject ?? "Portal message", body: d.body, fromAddress: u.email, clientId: u.clientId, meta: { portalUserId: u.id, portalUserName: u.name } } });
    await notify({ type: "ticket.assigned", title: `Portal message from ${u.name} (${u.clientName})`, body: d.body.slice(0, 200), href: `/admin/clients/${u.clientId}?tab=messages`, userIds: [client?.accountOwnerId], permission: client?.accountOwnerId ? undefined : "clients:manage" });
    revalidatePath("/client/messages");
    return { ok: "Message sent to your account team." };
  } catch (e) {
    return failP(e);
  }
}

export async function portalProposalDecisionAction(proposalId: string, decision: "ACCEPTED" | "REJECTED", _: PortalState, form: FormData): Promise<PortalState> {
  try {
    const u = await authorizePortal();
    const { ip, userAgent } = await requestMeta();
    const p = await db.proposal.findFirst({ where: { id: proposalId, clientId: u.clientId, deletedAt: null }, include: { items: true } });
    if (!p || !["SENT", "VIEWED"].includes(p.status)) return { error: "This proposal can no longer be accepted or declined." };
    if (p.validUntil && p.validUntil < new Date()) return { error: "This proposal has expired. Please ask your account manager for an updated version." };
    if (decision === "ACCEPTED" && form.get("confirm") !== "on") return { error: "Please confirm you are authorised to accept." };
    const reason = z.string().trim().max(1000).parse(form.get("reason") ?? "");
    await db.$transaction(async (tx) => {
      await tx.proposal.update({ where: { id: p.id }, data: decision === "ACCEPTED" ? { status: "ACCEPTED", acceptedAt: new Date(), acceptedByName: `${u.name} (${u.email})` } : { status: "REJECTED", rejectedAt: new Date(), rejectionReason: reason || null } });
      await snapshot("PROPOSAL", p.id, p.version, { ...p, status: decision }, null, `${decision === "ACCEPTED" ? "Accepted" : "Declined"} in the client portal by ${u.name}`, tx);
      await logActivity({ type: decision, summary: `${decision === "ACCEPTED" ? "Accepted" : "Declined"} in the client portal by ${u.name}${reason ? ` — ${reason}` : ""}`, data: { ip, userAgent, portalUserId: u.id }, proposalId: p.id, dealId: p.dealId, clientId: u.clientId }, tx);
      await tx.auditLog.create({ data: { action: `proposal.${decision.toLowerCase()}_portal`, entity: "Proposal", entityId: p.id, ip, userAgent, metadata: { portalUserId: u.id } } });
      if (decision === "ACCEPTED" && p.dealId) await tx.deal.updateMany({ where: { id: p.dealId, stage: { in: ["DISCOVERY", "QUALIFICATION", "SOLUTION", "PROPOSAL"] } }, data: { stage: "NEGOTIATION", probability: 75, stageChangedAt: new Date() } });
    });
    await notify({ type: "proposal.viewed", title: `Proposal ${p.number} ${decision === "ACCEPTED" ? "accepted" : "declined"} by ${u.name}`, href: `/admin/proposals/${p.id}`, userIds: [p.createdById] });
    revalidatePath(`/client/proposals/${p.id}`);
    return { ok: decision === "ACCEPTED" ? "Thank you — proposal accepted." : "Thank you — your response has been recorded." };
  } catch (e) {
    return failP(e);
  }
}

export async function portalChangeRequestAction(projectId: string, _: PortalState, form: FormData): Promise<PortalState> {
  try {
    const u = await authorizePortal();
    const d = z.object({ title: z.string().trim().min(3, "Add a title").max(200), description: z.string().trim().min(5, "Describe the change").max(10000) }).parse({ title: form.get("title"), description: form.get("description") });
    const project = await db.project.findFirst({ where: { id: projectId, clientId: u.clientId, deletedAt: null }, select: { id: true, number: true, managerId: true } });
    if (!project) return { error: "Project not found." };
    await db.$transaction(async (tx) => {
      await tx.changeRequest.create({ data: { projectId, title: d.title, description: d.description, fromClient: true, requestedBy: `${u.name} (${u.email})` } });
      await logActivity({ type: "CHANGE_REQUEST", summary: `Change requested by ${u.name}: ${d.title}`, projectId, clientId: u.clientId }, tx);
    });
    await notify({ type: "milestone.due", title: `Change request on ${project.number}: ${d.title}`, href: `/admin/projects/${projectId}?tab=changes`, userIds: [project.managerId], permission: project.managerId ? undefined : "projects:manage" });
    revalidatePath(`/client/projects/${projectId}`);
    return { ok: "Change request submitted. Your project manager will review the impact on scope, cost and timeline." };
  } catch (e) {
    return failP(e);
  }
}

export async function portalProfileAction(_: PortalState, form: FormData): Promise<PortalState> {
  try {
    const u = await authorizePortal();
    const name = z.string().trim().min(2, "Enter your name").max(200).parse(form.get("name"));
    await db.portalUser.update({ where: { id: u.id }, data: { name } });
    revalidatePath("/client/profile");
    return { ok: "Profile updated." };
  } catch (e) {
    return failP(e);
  }
}

export async function portalChangePasswordAction(_: PortalState, form: FormData): Promise<PortalState> {
  try {
    const u = await authorizePortal();
    const current = String(form.get("current") ?? "");
    const next = String(form.get("password") ?? "");
    if (next !== String(form.get("confirm") ?? "")) return { error: "Passwords do not match." };
    const rec = await db.portalUser.findUnique({ where: { id: u.id } });
    if (!rec?.passwordHash || !(await verifyPassword(current, rec.passwordHash))) return { error: "Your current password is incorrect." };
    const problem = passwordProblem(next, u.email);
    if (problem) return { error: problem };
    await db.$transaction([db.portalUser.update({ where: { id: u.id }, data: { passwordHash: await hashPassword(next), passwordChangedAt: new Date() } }), db.portalSession.deleteMany({ where: { portalUserId: u.id } })]);
    await audit({ action: "portal.password_changed", entity: "PortalUser", entityId: u.id });
    return { ok: "Password changed. Please sign in again.", redirect: "/client/login" };
  } catch (e) {
    return failP(e);
  }
}
