"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { audit } from "@/lib/audit";
import { can } from "@/lib/auth/permissions";
import { sendMail } from "@/lib/email/mailer";
import { siteConfig } from "@/data/siteConfig";
import { authorizeAccess } from "@/lib/os/guard";
import { fail, formObject, optEmail, optId, optText, reqText, UserError, type ActionState } from "@/lib/os/action";
import { logActivity } from "@/lib/os/activity";
import { notify } from "@/lib/os/notify";
import { createTicket, PRIORITIES, slaDates, slaPolicy, TICKET_CATEGORIES, TICKET_STATUSES } from "./core";

const F = "SUPPORT" as const;
const path = (id: string) => `/admin/support/${id}`;

export async function createTicketAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("support:manage", F);
    const d = z.object({ subject: reqText(200), description: optText(10000), category: z.enum(TICKET_CATEGORIES), priority: z.enum(PRIORITIES), source: z.enum(["EMAIL", "PHONE", "INTERNAL", "WEBSITE"]), clientId: optId, projectId: optId, contactName: optText(200), contactEmail: optEmail, assigneeId: optId }).parse(formObject(form));
    if (d.clientId && !(await db.client.findFirst({ where: { id: d.clientId, deletedAt: null } }))) throw new UserError("Client not found.");
    const t = await createTicket(d, user.id);
    await audit({ userId: user.id, action: "ticket.created", entity: "Ticket", entityId: t.id });
    return { ok: `Ticket ${t.number} created.`, redirect: path(t.id) };
  } catch (e) {
    return fail(e, "support");
  }
}

export async function updateTicketAction(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("support:manage", F);
    const d = z.object({ status: z.enum(TICKET_STATUSES), priority: z.enum(PRIORITIES), category: z.enum(TICKET_CATEGORIES), assigneeId: optId, projectId: optId }).parse(formObject(form));
    const t = await db.ticket.findUnique({ where: { id } });
    if (!t) return { error: "Ticket not found." };
    const policy = await slaPolicy();
    const now = new Date();
    const changes: string[] = [];
    if (t.status !== d.status) changes.push(`status ${t.status} → ${d.status}`);
    if (t.priority !== d.priority) changes.push(`priority ${t.priority} → ${d.priority}`);
    if (t.assigneeId !== d.assigneeId) changes.push("reassigned");
    await db.$transaction(async (tx) => {
      await tx.ticket.update({
        where: { id },
        data: {
          ...d,
          // A priority change re-bases the SLA on the ticket's creation time.
          ...(t.priority !== d.priority && { ...slaDates(policy, d.priority, t.createdAt), ...(t.firstResponseAt && { firstResponseDueAt: t.firstResponseDueAt }) }),
          resolvedAt: d.status === "RESOLVED" || d.status === "CLOSED" ? (t.resolvedAt ?? now) : null,
          closedAt: d.status === "CLOSED" ? (t.closedAt ?? now) : null,
        },
      });
      if (changes.length) await logActivity({ type: "UPDATED", summary: changes.join(", "), actorId: user.id, ticketId: id, clientId: t.clientId }, tx);
    });
    if (d.assigneeId && d.assigneeId !== t.assigneeId && d.assigneeId !== user.id) await notify({ type: "ticket.assigned", title: `Ticket assigned: ${t.number} ${t.subject}`, href: path(id), userIds: [d.assigneeId] });
    await audit({ userId: user.id, action: "ticket.updated", entity: "Ticket", entityId: id, metadata: { changes } });
    revalidatePath(path(id));
    return { ok: "Ticket updated." };
  } catch (e) {
    return fail(e, "support");
  }
}

/** Public reply (visible in the portal / emailed to the contact) or an internal note (never shown to the client). */
export async function replyTicketAction(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("support:manage", F);
    const d = z.object({ body: z.string().trim().min(1, "Write a message").max(10000), internal: z.preprocess((v) => v === "on" || v === "1", z.boolean()), emailContact: z.preprocess((v) => v === "on", z.boolean()), status: z.enum(["", ...TICKET_STATUSES]).optional(), aiDrafted: z.preprocess((v) => v === "1", z.boolean()) }).parse(formObject(form));
    const t = await db.ticket.findUnique({ where: { id }, include: { portalUser: { select: { id: true } } } });
    if (!t) return { error: "Ticket not found." };
    let emailed = false;
    await db.$transaction(async (tx) => {
      await tx.ticketMessage.create({ data: { ticketId: id, authorId: user.id, body: d.body, internal: d.internal, aiDrafted: d.aiDrafted } });
      await tx.ticket.update({ where: { id }, data: { ...(!d.internal && !t.firstResponseAt && { firstResponseAt: new Date() }), ...(d.status && { status: d.status, resolvedAt: d.status === "RESOLVED" || d.status === "CLOSED" ? new Date() : null }), updatedAt: new Date() } });
      await logActivity({ type: d.internal ? "NOTE" : "REPLY", summary: d.internal ? "Internal note" : "Replied to client", actorId: user.id, ticketId: id, clientId: t.clientId }, tx);
    });
    if (!d.internal && d.emailContact && t.contactEmail && can(user.role, "communication:send")) {
      const r = await sendMail({ to: t.contactEmail, replyTo: process.env.SUPPORT_EMAIL || undefined, subject: `[${t.number}] ${t.subject}`, text: `${d.body}\n\n— ${user.name}, ${siteConfig.name} Support`, html: `<div style="white-space:pre-wrap">${d.body.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!)}</div><p>— ${user.name}, ${siteConfig.name} Support</p>` });
      emailed = r.sent;
      await db.communication.create({ data: { channel: "EMAIL", direction: "OUTBOUND", status: r.sent ? "SENT" : "FAILED", subject: `[${t.number}] ${t.subject}`, body: d.body, toAddress: t.contactEmail, provider: "smtp", ticketId: id, clientId: t.clientId, userId: user.id, error: r.error?.slice(0, 300) } });
    }
    revalidatePath(path(id));
    return { ok: d.internal ? "Internal note added." : `Reply posted${t.portalUser ? " to the client portal" : ""}${emailed ? " and emailed" : ""}.` };
  } catch (e) {
    return fail(e, "support");
  }
}

export async function saveSlaAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("support:manage", F);
    const hrs = z.coerce.number().min(0.25).max(24 * 60);
    const value = Object.fromEntries(PRIORITIES.map((p) => [p, { response: hrs.parse(form.get(`${p}:response`)), resolution: hrs.parse(form.get(`${p}:resolution`)) }]));
    for (const p of PRIORITIES) if (value[p].resolution < value[p].response) return { error: `${p}: resolution time must be at least the response time.` };
    await db.setting.upsert({ where: { key: "sla" }, create: { key: "sla", value }, update: { value } });
    await audit({ userId: user.id, action: "settings.sla", entity: "Setting", entityId: "sla", metadata: value });
    return { ok: "SLA targets saved. They apply to new tickets and priority changes." };
  } catch (e) {
    return fail(e, "support");
  }
}
