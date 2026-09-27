"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { audit } from "@/lib/audit";
import { authorize } from "@/lib/auth/session";
import { fail, formObject, optEmail, optId, optText, optUrl, reqText, currency, UserError, type ActionState } from "@/lib/os/action";
import { nextNumber } from "@/lib/os/numbers";
import { logActivity } from "@/lib/os/activity";

const schema = z.object({
  name: reqText(200),
  legalName: optText(200),
  industry: optText(120),
  country: optText(80),
  city: optText(80),
  website: optUrl,
  billingEmail: optEmail,
  phone: optText(40),
  address: optText(1000),
  taxId: optText(60),
  currency,
  status: z.enum(["ACTIVE", "ONBOARDING", "INACTIVE", "CHURNED"]),
  accountOwnerId: optId,
  notes: optText(10000),
  tags: z.string().max(500).optional().transform((v) => [...new Set((v ?? "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 20)),
});

export async function createClientAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorize("clients:manage");
    const d = schema.parse(formObject(form));
    if (d.accountOwnerId && !(await db.user.findFirst({ where: { id: d.accountOwnerId, active: true } }))) throw new UserError("Choose an active account owner.");
    const contact = z.object({ contactName: optText(200), contactEmail: optEmail, contactPhone: optText(40) }).parse(formObject(form));
    const c = await db.$transaction(async (tx) => {
      const number = await nextNumber("client", tx);
      const created = await tx.client.create({ data: { ...d, number, accountOwnerId: d.accountOwnerId ?? user.id, contacts: contact.contactName ? { create: { name: contact.contactName, email: contact.contactEmail, phone: contact.contactPhone, isPrimary: true } } : undefined } });
      await logActivity({ type: "CREATED", summary: `Client ${number} created`, actorId: user.id, clientId: created.id }, tx);
      return created;
    });
    await audit({ userId: user.id, action: "client.created", entity: "Client", entityId: c.id });
    revalidatePath("/admin/clients");
    return { ok: `Client ${c.number} created.`, redirect: `/admin/clients/${c.id}` };
  } catch (e) {
    return fail(e, "clients");
  }
}

export async function updateClientAction(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorize("clients:manage");
    const d = schema.parse(formObject(form));
    const before = await db.client.findUnique({ where: { id } });
    if (!before || before.deletedAt) return { error: "Client not found." };
    await db.$transaction(async (tx) => {
      await tx.client.update({ where: { id }, data: d });
      await logActivity({ type: before.status !== d.status ? "STATUS_CHANGED" : "UPDATED", summary: before.status !== d.status ? `${before.status} → ${d.status}` : undefined, actorId: user.id, clientId: id }, tx);
    });
    await audit({ userId: user.id, action: "client.updated", entity: "Client", entityId: id, metadata: { status: d.status } });
    revalidatePath(`/admin/clients/${id}`);
    return { ok: "Client saved." };
  } catch (e) {
    return fail(e, "clients");
  }
}

const contactSchema = z.object({ name: reqText(200), email: optEmail, phone: optText(40), title: optText(120), isPrimary: z.preprocess((v) => v === "on", z.boolean()) });

export async function saveContactAction(clientId: string, contactId: string | null, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorize("clients:manage");
    const d = contactSchema.parse(formObject(form));
    await db.$transaction(async (tx) => {
      if (d.isPrimary) await tx.clientContact.updateMany({ where: { clientId }, data: { isPrimary: false } });
      if (contactId) {
        const existing = await tx.clientContact.findFirst({ where: { id: contactId, clientId } });
        if (!existing) throw new UserError("Contact not found.");
        await tx.clientContact.update({ where: { id: contactId }, data: d });
      } else await tx.clientContact.create({ data: { ...d, clientId } });
      await logActivity({ type: "UPDATED", summary: `Contact ${d.name} ${contactId ? "updated" : "added"}`, actorId: user.id, clientId }, tx);
    });
    revalidatePath(`/admin/clients/${clientId}`);
    return { ok: contactId ? "Contact updated." : "Contact added." };
  } catch (e) {
    return fail(e, "clients");
  }
}

export async function archiveClientAction(id: string): Promise<ActionState> {
  try {
    const user = await authorize("clients:manage");
    const open = await db.invoice.count({ where: { clientId: id, status: { in: ["ISSUED", "PARTIALLY_PAID"] } } });
    if (open) return { error: "This client has unpaid invoices. Settle or void them before archiving." };
    await db.$transaction([
      db.client.update({ where: { id }, data: { deletedAt: new Date(), status: "INACTIVE" } }),
      db.portalUser.updateMany({ where: { clientId: id }, data: { active: false } }),
      db.portalSession.deleteMany({ where: { portalUser: { clientId: id } } }),
    ]);
    await audit({ userId: user.id, action: "client.archived", entity: "Client", entityId: id });
    revalidatePath("/admin/clients");
    return { ok: "Client archived.", redirect: "/admin/clients" };
  } catch (e) {
    return fail(e, "clients");
  }
}

/** Staff reply in the client-portal message thread. */
export async function replyPortalMessageAction(clientId: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorize("clients:manage");
    const body = z.string().trim().min(1, "Write a message").max(10000).parse(form.get("body"));
    const client = await db.client.findFirst({ where: { id: clientId, deletedAt: null }, select: { id: true } });
    if (!client) return { error: "Client not found." };
    await db.communication.create({ data: { channel: "NOTE", direction: "OUTBOUND", status: "SENT", provider: "portal", subject: "Portal message", body, clientId, userId: user.id } });
    await logActivity({ type: "MESSAGE", summary: "Replied in the client portal", actorId: user.id, clientId });
    revalidatePath(`/admin/clients/${clientId}`);
    return { ok: "Message posted to the client portal." };
  } catch (e) {
    return fail(e, "clients");
  }
}
