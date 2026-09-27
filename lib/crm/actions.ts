"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { audit } from "@/lib/audit";
import { newLeadId } from "@/lib/leads/id";
import { parseCsv } from "@/lib/admin/csv";
import { LEAD_PRIORITIES, LEAD_STATUSES } from "@/lib/admin/leads";
import { authorizeAccess } from "@/lib/os/guard";
import { fail, formObject, moneyStr, optId, optText, optUrl, reqText, currency, type ActionState } from "@/lib/os/action";
import { notify } from "@/lib/os/notify";
import { queueEvent } from "@/lib/automation/engine";
import { LIFECYCLE_STAGES } from "./constants";
import { convertLeadToDeal, importLeads, mergeLeads } from "./core";

const createSchema = z.object({
  name: reqText(200),
  email: z.string().trim().toLowerCase().email("Invalid email").max(160),
  phone: optText(40),
  company: optText(200),
  country: optText(80),
  city: optText(80),
  website: optUrl,
  service: optText(120),
  product: optText(120),
  budget: optText(40),
  source: optText(120),
  campaign: optText(120),
  message: optText(5000),
  status: z.enum(LEAD_STATUSES).default("NEW"),
  priority: z.enum(LEAD_PRIORITIES).default("MEDIUM"),
  lifecycleStage: z.enum(LIFECYCLE_STAGES).default("LEAD"),
  currency: currency.default("USD"),
  estimatedValue: moneyStr(),
  assignedToId: optId,
  tags: z.string().max(500).optional().transform((v) => [...new Set((v ?? "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 20)),
});

/** Manually created lead (phone call, event, referral). Runs the same NEW_LEAD automations as website leads. */
export async function createLeadAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("leads:create");
    const d = createSchema.parse(formObject(form));
    const dup = await db.lead.findFirst({ where: { email: { equals: d.email, mode: "insensitive" }, archivedAt: null }, select: { id: true, ref: true } });
    const lead = await db.lead.create({
      data: { ...d, ref: newLeadId(), formType: "manual", source: d.source ?? "manual", utmCampaign: d.campaign, assignedToId: d.assignedToId ?? user.id, tags: dup ? [...d.tags, "possible-duplicate"] : d.tags, activities: { create: { type: "CREATED", actorId: user.id, data: { formType: "manual", duplicateOf: dup?.ref } } } },
    });
    await audit({ userId: user.id, action: "lead.created", entity: "Lead", entityId: lead.id });
    queueEvent({ trigger: "NEW_LEAD", entity: "Lead", entityId: lead.id, ownerId: lead.assignedToId, actorId: user.id, payload: { lead } });
    if (lead.assignedToId && lead.assignedToId !== user.id) await notify({ type: "lead.assigned", title: `Lead assigned: ${lead.name}`, href: `/admin/leads/${lead.id}`, userIds: [lead.assignedToId] });
    revalidatePath("/admin/leads");
    return { ok: dup ? `Lead created — possible duplicate of ${dup.ref}.` : "Lead created.", redirect: `/admin/leads/${lead.id}` };
  } catch (e) {
    return fail(e, "crm");
  }
}

/** Kanban move. Moving to WON/LOST is allowed here; deals keep their own lifecycle. */
export async function moveLeadStatusAction(id: string, status: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await authorizeAccess("leads:edit");
    const to = z.enum(LEAD_STATUSES).parse(status);
    const lead = await db.lead.findUnique({ where: { id }, select: { status: true, archivedAt: true } });
    if (!lead || lead.archivedAt) return { ok: false, error: "Lead not found." };
    if (lead.status === to) return { ok: true };
    await db.$transaction([
      db.lead.update({ where: { id }, data: { status: to, ...(to === "WON" && { lifecycleStage: "CUSTOMER" }) } }),
      db.leadActivity.create({ data: { leadId: id, actorId: user.id, type: "STATUS_CHANGED", data: { from: lead.status, to, via: "pipeline" } } }),
    ]);
    await audit({ userId: user.id, action: "lead.status_changed", entity: "Lead", entityId: id, metadata: { from: lead.status, to } });
    revalidatePath("/admin/crm/pipeline");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: fail(e, "crm")?.error };
  }
}

const VIEW_KEYS = ["q", "status", "priority", "country", "service", "product", "source", "assigned", "from", "to", "archived", "sort", "lifecycle", "tag"];

export async function saveViewAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("leads:view");
    const name = reqText(60).parse(form.get("name"));
    const raw = new URLSearchParams(String(form.get("query") ?? ""));
    const q = new URLSearchParams();
    for (const k of VIEW_KEYS) {
      const v = raw.get(k);
      if (v) q.set(k, v.slice(0, 120));
    }
    const count = await db.savedView.count({ where: { userId: user.id, module: "leads" } });
    if (count >= 30) return { error: "You can keep up to 30 saved views." };
    await db.savedView.create({ data: { userId: user.id, module: "leads", name, query: q.toString(), shared: form.get("shared") === "on" } });
    revalidatePath("/admin/leads");
    return { ok: "View saved." };
  } catch (e) {
    return fail(e, "crm");
  }
}

export async function deleteViewAction(id: string) {
  const user = await authorizeAccess("leads:view");
  await db.savedView.deleteMany({ where: { id, userId: user.id } });
  revalidatePath("/admin/leads");
}

export type ImportState = (ActionState & { result?: Awaited<ReturnType<typeof importLeads>> }) | undefined;

export async function importLeadsAction(_: ImportState, form: FormData): Promise<ImportState> {
  try {
    const user = await authorizeAccess("leads:import", "ADVANCED_CRM");
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file." };
    if (file.size > 2 * 1024 * 1024) return { error: "The file is larger than 2 MB. Split it into smaller files." };
    const text = await file.text();
    if (text.includes("\u0000")) return { error: "That does not look like a CSV text file." };
    const rows = parseCsv(text, { maxRows: 5000 });
    const ownerId = optId.parse(form.get("ownerId"));
    if (ownerId && !(await db.user.findFirst({ where: { id: ownerId, active: true } }))) return { error: "Choose an active owner." };
    const result = await importLeads(rows, { duplicates: form.get("duplicates") === "flag" ? "flag" : "skip", dryRun: form.get("dryRun") === "on", source: optText(120).parse(form.get("source")) ?? "csv-import", ownerId }, user.id);
    if (!result.dryRun) revalidatePath("/admin/leads");
    return { ok: result.dryRun ? `Dry run: ${result.created} of ${result.total} rows would be imported.` : `${result.created} lead${result.created === 1 ? "" : "s"} imported.`, result };
  } catch (e) {
    if (e instanceof Error && /CSV|columns|rows|empty|quoted/.test(e.message)) return { error: e.message };
    return fail(e, "crm");
  }
}

export async function mergeLeadsAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("leads:merge", "ADVANCED_CRM");
    const primary = z.string().min(1, "Choose the lead to keep").max(40).parse(form.get("primary"));
    const others = form.getAll("ids").map(String).filter((id) => id && id !== primary).slice(0, 10);
    if (!others.length) return { error: "Select at least one other lead to merge." };
    for (const id of others) await mergeLeads(primary, id, user.id);
    await audit({ userId: user.id, action: "lead.merged", entity: "Lead", entityId: primary, metadata: { merged: others } });
    revalidatePath("/admin/crm/duplicates");
    revalidatePath(`/admin/leads/${primary}`);
    return { ok: `${others.length} lead${others.length === 1 ? "" : "s"} merged. Nothing was deleted — merged records are archived.` };
  } catch (e) {
    if (e instanceof Error && /Choose|not found|Archived/.test(e.message)) return { error: e.message };
    return fail(e, "crm");
  }
}

export async function convertLeadAction(leadId: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("deals:manage", "SALES_PIPELINE");
    const deal = await convertLeadToDeal(leadId, user.id, { name: optText(200).parse(form.get("name")), ownerId: optId.parse(form.get("ownerId")) });
    await audit({ userId: user.id, action: "deal.created", entity: "Deal", entityId: deal.id, metadata: { fromLead: leadId } });
    revalidatePath(`/admin/leads/${leadId}`);
    return { ok: `Deal ${deal.number} created.`, redirect: `/admin/deals/${deal.id}` };
  } catch (e) {
    if (e instanceof Error && /not found|Restore/.test(e.message)) return { error: e.message };
    return fail(e, "crm");
  }
}
