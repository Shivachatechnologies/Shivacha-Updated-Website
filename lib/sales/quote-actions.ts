"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { audit } from "@/lib/audit";
import { authorizeAccess } from "@/lib/os/guard";
import { fail, formObject, okThen, optDate, optId, optText, reqText, currency, UserError, type ActionState } from "@/lib/os/action";
import { nextNumber } from "@/lib/os/numbers";
import { logActivity } from "@/lib/os/activity";
import { parseLines, replaceLines, snapshot } from "./lines";

const F = "PROPOSALS" as const;

export async function createQuoteAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("proposals:manage", F);
    const d = z.object({ title: reqText(200), dealId: optId, clientId: optId, currency, validUntil: optDate }).parse(formObject(form));
    const deal = d.dealId ? await db.deal.findUnique({ where: { id: d.dealId }, select: { id: true, clientId: true } }) : null;
    if (d.dealId && !deal) throw new UserError("Deal not found.");
    const q = await db.$transaction(async (tx) => {
      const number = await nextNumber("quote", tx);
      const created = await tx.quote.create({ data: { number, title: d.title, dealId: deal?.id ?? null, clientId: d.clientId ?? deal?.clientId ?? null, currency: d.currency, validUntil: d.validUntil ?? new Date(Date.now() + 30 * 86400_000), paymentTerms: "Net 15", createdById: user.id } });
      await logActivity({ type: "CREATED", summary: `Quote ${number} created`, actorId: user.id, quoteId: created.id, dealId: created.dealId, clientId: created.clientId }, tx);
      return created;
    });
    await audit({ userId: user.id, action: "quote.created", entity: "Quote", entityId: q.id });
    return { ok: `Quote ${q.number} created.`, redirect: `/admin/quotes/${q.id}` };
  } catch (e) {
    return fail(e, "quotes");
  }
}

export async function saveQuoteAction(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("proposals:manage", F);
    const q = await db.quote.findUnique({ where: { id } });
    if (!q || q.deletedAt) return { error: "Quote not found." };
    if (q.status !== "DRAFT") return { error: "Only draft quotes can be edited. Create a new version first." };
    const o = formObject(form);
    const d = z.object({ title: reqText(200), currency, validUntil: optDate, paymentTerms: optText(200), notes: optText(5000) }).parse(o);
    const lines = parseLines(o.items);
    const extra = z.preprocess((v) => (v == null || v === "" ? null : String(v).replace(/[,\s]/g, "")), z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, "Invalid discount").nullable()).parse(o.extraDiscount);
    await db.$transaction(async (tx) => {
      const totals = await replaceLines({ quoteId: id }, lines, extra, tx);
      await tx.quote.update({ where: { id }, data: { ...d, ...totals } });
      await logActivity({ type: "UPDATED", actorId: user.id, quoteId: id }, tx);
    });
    revalidatePath(`/admin/quotes/${id}`);
    return { ok: "Quote saved." };
  } catch (e) {
    return fail(e, "quotes");
  }
}

const TRANSITIONS: Record<string, string[]> = { DRAFT: ["SENT"], SENT: ["ACCEPTED", "REJECTED", "EXPIRED"], ACCEPTED: [], REJECTED: [], EXPIRED: [] };

/** Records the quote's status. Sending snapshots the version; client decisions are recorded by staff. */
export async function setQuoteStatusAction(id: string, status: "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED"): Promise<ActionState> {
  try {
    const user = await authorizeAccess("proposals:manage", F);
    const q = await db.quote.findUnique({ where: { id }, include: { items: true } });
    if (!q || q.deletedAt) return { error: "Quote not found." };
    if (!TRANSITIONS[q.status]?.includes(status)) return { error: `A ${q.status.toLowerCase()} quote cannot become ${status.toLowerCase()}.` };
    if (status === "SENT" && (!q.items.length || q.total.lessThanOrEqualTo(0))) return { error: "Add priced line items first." };
    await db.$transaction(async (tx) => {
      await tx.quote.update({ where: { id }, data: { status, ...(status === "SENT" ? { sentAt: new Date() } : { decidedAt: new Date() }) } });
      await snapshot("QUOTE", id, q.version, { ...q, status }, user.id, status === "SENT" ? "Sent" : `Marked ${status.toLowerCase()}`, tx);
      await logActivity({ type: status === "SENT" ? "SENT" : status, summary: `Quote ${status.toLowerCase()}`, actorId: user.id, quoteId: id, dealId: q.dealId, clientId: q.clientId }, tx);
    });
    await audit({ userId: user.id, action: `quote.${status.toLowerCase()}`, entity: "Quote", entityId: id });
    return okThen(`/admin/quotes/${id}`, `Quote marked ${status.toLowerCase()}.`);
  } catch (e) {
    return fail(e, "quotes");
  }
}

export async function reviseQuoteAction(id: string): Promise<ActionState> {
  try {
    const user = await authorizeAccess("proposals:manage", F);
    const q = await db.quote.findUnique({ where: { id }, include: { items: true } });
    if (!q || q.deletedAt || q.status === "DRAFT" || q.status === "ACCEPTED") return { error: "Only sent, rejected or expired quotes can be revised." };
    await db.$transaction(async (tx) => {
      await snapshot("QUOTE", id, q.version, q, user.id, `Closed version (${q.status})`, tx);
      await tx.quote.update({ where: { id }, data: { version: q.version + 1, status: "DRAFT", sentAt: null, decidedAt: null } });
      await logActivity({ type: "REVISED", summary: `Version ${q.version + 1} started`, actorId: user.id, quoteId: id }, tx);
    });
    return okThen(`/admin/quotes/${id}`, "New version started.");
  } catch (e) {
    return fail(e, "quotes");
  }
}

export async function archiveQuoteAction(id: string) {
  const user = await authorizeAccess("proposals:manage", F);
  await db.quote.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit({ userId: user.id, action: "quote.archived", entity: "Quote", entityId: id });
  revalidatePath("/admin/quotes");
}
