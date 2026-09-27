"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { audit } from "@/lib/audit";
import { authorizeAccess } from "@/lib/os/guard";
import { fail, formObject, intRange, moneyStr, okThen, optDate, optId, optText, reqText, currency, UserError, type ActionState } from "@/lib/os/action";
import { nextNumber } from "@/lib/os/numbers";
import { logActivity } from "@/lib/os/activity";
import { notify } from "@/lib/os/notify";
import { fmtMoney } from "@/lib/os/money";
import { queueEvent } from "@/lib/automation/engine";
import { DEAL_STAGES, STAGE_PROBABILITY, type DealStageName } from "@/lib/crm/constants";
import { markDealWon } from "./deals";

const list = z.preprocess((v) => (v == null ? "" : String(v)), z.string().max(1000)).transform((v) => [...new Set(v.split(",").map((s) => s.trim()).filter(Boolean))].slice(0, 20));

const dealSchema = z.object({
  name: reqText(200),
  company: optText(200),
  clientId: optId,
  leadId: optId,
  ownerId: optId,
  value: moneyStr(true),
  currency,
  probability: z.preprocess((v) => (v === "" || v == null ? undefined : v), intRange(0, 100).optional()),
  expectedCloseDate: optDate,
  stage: z.enum(DEAL_STAGES.filter((s) => s !== "WON" && s !== "LOST") as [DealStageName, ...DealStageName[]]),
  services: list,
  products: list,
  country: optText(80),
  source: optText(120),
  notes: optText(10000),
});

async function checkRefs(d: { clientId: string | null; leadId: string | null; ownerId: string | null }) {
  if (d.clientId && !(await db.client.findFirst({ where: { id: d.clientId, deletedAt: null } }))) throw new UserError("Client not found.");
  if (d.leadId && !(await db.lead.findUnique({ where: { id: d.leadId } }))) throw new UserError("Lead not found.");
  if (d.ownerId && !(await db.user.findFirst({ where: { id: d.ownerId, active: true } }))) throw new UserError("Choose an active owner.");
}

export async function createDealAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("deals:manage", "SALES_PIPELINE");
    const d = dealSchema.parse(formObject(form));
    await checkRefs(d);
    const deal = await db.$transaction(async (tx) => {
      const number = await nextNumber("deal", tx);
      const created = await tx.deal.create({ data: { ...d, value: d.value!, number, ownerId: d.ownerId ?? user.id, probability: d.probability ?? STAGE_PROBABILITY[d.stage] } });
      await logActivity({ type: "CREATED", summary: `Deal ${number} created`, actorId: user.id, dealId: created.id, clientId: created.clientId }, tx);
      return created;
    });
    await audit({ userId: user.id, action: "deal.created", entity: "Deal", entityId: deal.id });
    revalidatePath("/admin/deals");
    return { ok: `Deal ${deal.number} created.`, redirect: `/admin/deals/${deal.id}` };
  } catch (e) {
    return fail(e, "deals");
  }
}

export async function updateDealAction(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("deals:manage", "SALES_PIPELINE");
    const before = await db.deal.findUnique({ where: { id } });
    if (!before || before.deletedAt) return { error: "Deal not found." };
    if (before.stage === "WON" || before.stage === "LOST") return { error: "Reopen the deal before editing it." };
    const d = dealSchema.parse(formObject(form));
    await checkRefs(d);
    const stageChanged = before.stage !== d.stage;
    // A stage change resets probability to the stage default unless the user also changed probability.
    const probability = d.probability != null && d.probability !== before.probability ? d.probability : stageChanged ? STAGE_PROBABILITY[d.stage] : before.probability;
    await db.$transaction(async (tx) => {
      await tx.deal.update({ where: { id }, data: { ...d, value: d.value!, probability, ...(stageChanged && { stageChangedAt: new Date() }) } });
      if (stageChanged) await logActivity({ type: "STAGE_CHANGED", summary: `${before.stage} → ${d.stage}`, actorId: user.id, dealId: id }, tx);
      else await logActivity({ type: "UPDATED", actorId: user.id, dealId: id }, tx);
    });
    await audit({ userId: user.id, action: stageChanged ? "deal.stage_changed" : "deal.updated", entity: "Deal", entityId: id, metadata: { stage: d.stage, value: d.value } });
    revalidatePath(`/admin/deals/${id}`);
    return { ok: "Deal saved." };
  } catch (e) {
    return fail(e, "deals");
  }
}

/** Kanban move between open stages. WON/LOST need the dedicated flows (client creation, lost reason). */
export async function moveDealStageAction(id: string, stage: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await authorizeAccess("deals:manage", "SALES_PIPELINE");
    const to = z.enum(DEAL_STAGES).parse(stage);
    if (to === "WON" || to === "LOST") return { ok: false, error: `Open the deal to mark it ${to === "WON" ? "won" : "lost"}.` };
    const deal = await db.deal.findUnique({ where: { id } });
    if (!deal || deal.deletedAt) return { ok: false, error: "Deal not found." };
    if (deal.stage === "WON" || deal.stage === "LOST") return { ok: false, error: "Reopen the deal first." };
    await db.$transaction(async (tx) => {
      await tx.deal.update({ where: { id }, data: { stage: to, probability: STAGE_PROBABILITY[to], stageChangedAt: new Date() } });
      await logActivity({ type: "STAGE_CHANGED", summary: `${deal.stage} → ${to}`, actorId: user.id, dealId: id }, tx);
    });
    await audit({ userId: user.id, action: "deal.stage_changed", entity: "Deal", entityId: id, metadata: { from: deal.stage, to } });
    revalidatePath("/admin/deals");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: fail(e, "deals")?.error };
  }
}

export async function winDealAction(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("deals:manage", "SALES_PIPELINE");
    const createProject = form.get("createProject") === "on";
    const r = await markDealWon(id, user.id, { createProject, projectName: optText(200).parse(form.get("projectName")) });
    const payload = { deal: { id, number: r.deal.number, name: r.deal.name, value: r.deal.value.toString(), currency: r.deal.currency, country: r.deal.country, source: r.deal.source, services: r.deal.services, clientId: r.clientId } };
    queueEvent({ trigger: "DEAL_WON", entity: "Deal", entityId: id, ownerId: r.deal.ownerId, actorId: user.id, payload });
    await notify({ type: "deal.won", title: `Deal won: ${r.deal.name}`, body: fmtMoney(r.deal.value, r.deal.currency), href: `/admin/deals/${id}`, entity: "Deal", entityId: id, permission: "finance:view", userIds: [r.deal.ownerId], exceptUserId: user.id });
    return okThen(`/admin/deals/${id}`, `Deal won${r.clientCreated ? " — client created" : ""}${r.projectId ? " and project set up" : ""}.`);
  } catch (e) {
    if (e instanceof Error && /not found|already won/.test(e.message)) return { error: e.message };
    return fail(e, "deals");
  }
}

export async function loseDealAction(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("deals:manage", "SALES_PIPELINE");
    const reason = reqText(300).parse(form.get("reason"));
    const deal = await db.deal.findUnique({ where: { id } });
    if (!deal || deal.deletedAt) return { error: "Deal not found." };
    if (deal.stage === "WON") return { error: "A won deal cannot be marked lost. Reopen it first." };
    await db.$transaction(async (tx) => {
      await tx.deal.update({ where: { id }, data: { stage: "LOST", probability: 0, lostAt: new Date(), lostReason: reason, stageChangedAt: new Date() } });
      await logActivity({ type: "LOST", summary: reason, actorId: user.id, dealId: id }, tx);
    });
    await audit({ userId: user.id, action: "deal.lost", entity: "Deal", entityId: id, metadata: { reason } });
    return okThen(`/admin/deals/${id}`, "Deal marked lost.");
  } catch (e) {
    return fail(e, "deals");
  }
}

/** Reopens a WON/LOST deal. The client/project created at win time are kept (nothing is deleted). */
export async function reopenDealAction(id: string) {
  const user = await authorizeAccess("deals:manage", "SALES_PIPELINE");
  const deal = await db.deal.findUnique({ where: { id } });
  if (!deal || (deal.stage !== "WON" && deal.stage !== "LOST")) return;
  await db.$transaction(async (tx) => {
    await tx.deal.update({ where: { id }, data: { stage: "NEGOTIATION", probability: STAGE_PROBABILITY.NEGOTIATION, wonAt: null, lostAt: null, stageChangedAt: new Date() } });
    await logActivity({ type: "STAGE_CHANGED", summary: `${deal.stage} → NEGOTIATION (reopened)`, actorId: user.id, dealId: id }, tx);
  });
  await audit({ userId: user.id, action: "deal.reopened", entity: "Deal", entityId: id });
  revalidatePath(`/admin/deals/${id}`);
}

export async function archiveDealAction(id: string) {
  const user = await authorizeAccess("deals:manage", "SALES_PIPELINE");
  await db.deal.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit({ userId: user.id, action: "deal.archived", entity: "Deal", entityId: id });
  revalidatePath("/admin/deals");
}
