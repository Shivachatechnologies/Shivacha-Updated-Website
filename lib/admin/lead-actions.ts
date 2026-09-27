"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { authorize, AuthError } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { audit } from "@/lib/audit";
import { LEAD_PRIORITIES, LEAD_STATUSES } from "./leads";
import { CURRENCIES } from "@/lib/os/money";
import { LIFECYCLE_STAGES } from "@/lib/crm/constants";

export type ActionState = { ok?: string; error?: string; fieldErrors?: Record<string, string> } | undefined;

const fail = (e: unknown): ActionState => {
  if (e instanceof AuthError) return { error: e.message };
  if (e instanceof z.ZodError) return { error: "Please check the highlighted fields.", fieldErrors: Object.fromEntries(e.issues.map((i) => [String(i.path[0]), i.message])) };
  console.error("[admin] lead action failed", (e as Error).message);
  return { error: "Something went wrong. Please try again." };
};

const opt = (max = 200) => z.string().trim().max(max).optional().transform((v) => (v ? v : null));
const optDate = z.string().trim().optional().transform((v, ctx) => {
  if (!v) return null;
  const d = new Date(v.length === 16 ? `${v}:00Z` : v);
  if (Number.isNaN(d.getTime())) {
    ctx.addIssue({ code: "custom", message: "Invalid date" });
    return z.NEVER;
  }
  return d;
});

const updateSchema = z.object({
  name: z.string().trim().min(1, "Required").max(200),
  email: z.string().trim().email("Invalid email").max(160),
  company: opt(),
  phone: opt(40),
  country: opt(80),
  service: opt(120),
  product: opt(120),
  budget: opt(40),
  message: opt(5000),
  status: z.enum(LEAD_STATUSES),
  priority: z.enum(LEAD_PRIORITIES),
  estimatedValue: z.string().trim().optional().transform((v, ctx) => {
    if (!v) return null;
    const n = Number(v.replace(/[, ]/g, ""));
    if (!Number.isFinite(n) || n < 0 || n > 1e12) {
      ctx.addIssue({ code: "custom", message: "Enter a positive amount" });
      return z.NEVER;
    }
    return n;
  }),
  lastContactedAt: optDate,
  nextFollowUpAt: optDate,
  // CRM 2.0
  city: opt(80),
  website: opt(300),
  team: opt(80),
  currency: z.enum(CURRENCIES).optional(),
  lifecycleStage: z.enum(LIFECYCLE_STAGES).optional(),
  tags: z.string().max(500).optional().transform((v) => (v == null ? undefined : [...new Set(v.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 20))),
});
const CRM2_FIELDS = ["city", "website", "team", "currency", "lifecycleStage", "tags"] as const;

export async function updateLeadAction(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorize("leads:edit");
    const data = updateSchema.parse(Object.fromEntries(form));
    // CRM 2.0 fields are only written when the form actually sent them.
    for (const k of CRM2_FIELDS) if (!form.has(k)) delete (data as Record<string, unknown>)[k];
    const before = await db.lead.findUnique({ where: { id }, select: { status: true, priority: true } });
    if (!before) return { error: "Lead not found." };
    await db.lead.update({ where: { id }, data: { ...data, estimatedValue: data.estimatedValue } });
    const acts: { type: string; data: object }[] = [{ type: "UPDATED", data: {} }];
    if (before.status !== data.status) acts.push({ type: "STATUS_CHANGED", data: { from: before.status, to: data.status } });
    if (before.priority !== data.priority) acts.push({ type: "PRIORITY_CHANGED", data: { from: before.priority, to: data.priority } });
    await db.leadActivity.createMany({ data: acts.map((a) => ({ leadId: id, actorId: user.id, type: a.type, data: a.data })) });
    await audit({ userId: user.id, action: before.status !== data.status ? "lead.status_changed" : "lead.updated", entity: "Lead", entityId: id, metadata: { status: data.status, priority: data.priority } });
    revalidatePath(`/admin/leads/${id}`);
    return { ok: "Lead updated." };
  } catch (e) {
    return fail(e);
  }
}

export async function assignLeadAction(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorize("leads:assign");
    const assignee = String(form.get("assignedToId") ?? "") || null;
    if (assignee && !(await db.user.findFirst({ where: { id: assignee, active: true }, select: { id: true } }))) return { error: "Choose an active user." };
    await db.lead.update({ where: { id }, data: { assignedToId: assignee } });
    await db.leadActivity.create({ data: { leadId: id, actorId: user.id, type: "ASSIGNED", data: { to: assignee } } });
    await audit({ userId: user.id, action: "lead.assigned", entity: "Lead", entityId: id, metadata: { to: assignee } });
    revalidatePath(`/admin/leads/${id}`);
    return { ok: assignee ? "Lead assigned." : "Lead unassigned." };
  } catch (e) {
    return fail(e);
  }
}

export async function addNoteAction(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorize("leads:edit");
    const body = z.string().trim().min(1, "Write a note").max(5000).parse(form.get("body"));
    await db.leadNote.create({ data: { leadId: id, authorId: user.id, body } });
    await db.leadActivity.create({ data: { leadId: id, actorId: user.id, type: "NOTE_ADDED" } });
    revalidatePath(`/admin/leads/${id}`);
    return { ok: "Note added." };
  } catch (e) {
    return fail(e);
  }
}

export async function markContactedAction(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorize("leads:edit");
    const channel = z.enum(["email", "whatsapp", "call"]).parse(form.get("channel"));
    const lead = await db.lead.findUnique({ where: { id }, select: { status: true } });
    if (!lead) return { error: "Lead not found." };
    await db.lead.update({ where: { id }, data: { lastContactedAt: new Date(), status: lead.status === "NEW" ? "CONTACTED" : lead.status } });
    await db.leadActivity.create({ data: { leadId: id, actorId: user.id, type: "CONTACTED", data: { channel } } });
    revalidatePath(`/admin/leads/${id}`);
    return { ok: "Contact logged." };
  } catch (e) {
    return fail(e);
  }
}

const followSchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"), time: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")), note: opt(2000), assignedToId: opt(40) });

export async function scheduleFollowUpAction(leadId: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorize("followups:manage");
    const f = followSchema.parse(Object.fromEntries(form));
    const dueAt = new Date(`${f.date}T${f.time || "10:00"}:00Z`);
    await db.$transaction([
      db.followUp.create({ data: { leadId, dueAt, note: f.note, assignedToId: f.assignedToId ?? user.id, createdById: user.id } }),
      db.lead.update({ where: { id: leadId }, data: { nextFollowUpAt: dueAt } }),
      db.leadActivity.create({ data: { leadId, actorId: user.id, type: "FOLLOWUP_SCHEDULED", data: { dueAt: dueAt.toISOString() } } }),
    ]);
    revalidatePath(`/admin/leads/${leadId}`);
    revalidatePath("/admin/follow-ups");
    return { ok: "Follow-up scheduled." };
  } catch (e) {
    return fail(e);
  }
}

export async function setFollowUpStatusAction(id: string, status: "DONE" | "CANCELLED" | "PENDING") {
  const user = await authorize("followups:manage");
  const f = await db.followUp.update({ where: { id }, data: { status, completedAt: status === "DONE" ? new Date() : null } });
  const next = await db.followUp.findFirst({ where: { leadId: f.leadId, status: "PENDING" }, orderBy: { dueAt: "asc" }, select: { dueAt: true } });
  await db.lead.update({ where: { id: f.leadId }, data: { nextFollowUpAt: next?.dueAt ?? null } });
  await db.leadActivity.create({ data: { leadId: f.leadId, actorId: user.id, type: status === "DONE" ? "FOLLOWUP_DONE" : "FOLLOWUP_UPDATED", data: { status } } });
  revalidatePath(`/admin/leads/${f.leadId}`);
  revalidatePath("/admin/follow-ups");
}

const bulkSchema = z.object({ op: z.enum(["assign", "status", "priority", "archive", "unarchive"]), value: z.string().max(40).optional(), ids: z.array(z.string().max(40)).min(1, "Select at least one lead").max(500) });

export async function bulkLeadsAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { op, value, ids } = bulkSchema.parse({ op: form.get("op"), value: form.get("value") || undefined, ids: form.getAll("ids") });
    const need = op === "assign" ? "leads:assign" : op === "archive" || op === "unarchive" ? "leads:archive" : "leads:edit";
    const user = await authorize(need);
    let data: Record<string, unknown>;
    if (op === "assign") {
      if (value && value !== "unassigned" && !(await db.user.findFirst({ where: { id: value, active: true } }))) return { error: "Choose an active user." };
      data = { assignedToId: value && value !== "unassigned" ? value : null };
    } else if (op === "status") data = { status: z.enum(LEAD_STATUSES).parse(value) };
    else if (op === "priority") data = { priority: z.enum(LEAD_PRIORITIES).parse(value) };
    else data = { archivedAt: op === "archive" ? new Date() : null };
    const r = await db.lead.updateMany({ where: { id: { in: ids } }, data });
    await db.leadActivity.createMany({ data: ids.map((leadId) => ({ leadId, actorId: user.id, type: op === "status" ? "STATUS_CHANGED" : op === "assign" ? "ASSIGNED" : op === "priority" ? "PRIORITY_CHANGED" : op.toUpperCase(), data: { value: value ?? null, bulk: true } })) });
    await audit({ userId: user.id, action: `lead.bulk_${op}`, entity: "Lead", metadata: { count: r.count, value } });
    revalidatePath("/admin/leads");
    return { ok: `${r.count} lead${r.count === 1 ? "" : "s"} updated.` };
  } catch (e) {
    return fail(e);
  }
}

/** Used by the UI to decide which controls to render; the actions above re-check on the server. */
export async function leadCapabilities() {
  const user = await authorize("leads:view");
  return { edit: can(user.role, "leads:edit"), assign: can(user.role, "leads:assign"), archive: can(user.role, "leads:archive"), export: can(user.role, "leads:export"), followups: can(user.role, "followups:manage") };
}
