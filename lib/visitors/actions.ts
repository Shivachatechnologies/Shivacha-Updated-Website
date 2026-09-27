"use server";

import { z } from "zod";
import { db } from "@/lib/db/client";
import { audit } from "@/lib/audit";
import { authorize } from "@/lib/auth/session";
import { PERMISSIONS, type Permission } from "@/lib/auth/permissions";
import { fail, formObject, okThen, reqText, UserError, type ActionState } from "@/lib/os/action";
import { visitorPolicySchema } from "./policy";
import { VISITOR_SETTING } from "./settings";
import { ruleConditionsSchema } from "./rules";

export async function saveVisitorPolicyAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorize("visitors:manage");
    const f = formObject(form);
    const d = visitorPolicySchema.parse({ ...f, enabled: form.get("enabled"), honorGpc: form.get("honorGpc"), captureCity: form.get("captureCity"), retentionDays: f.retention === "custom" ? f.retentionCustom : f.retention });
    await db.setting.upsert({ where: { key: VISITOR_SETTING }, update: { value: d }, create: { key: VISITOR_SETTING, value: d } });
    await audit({ userId: user.id, action: "visitors.policy.changed", metadata: d });
    return okThen("/admin/settings/visitor-tracking", "Visitor tracking settings saved.");
  } catch (e) {
    return fail(e, "visitors");
  }
}

const list = (v: unknown) => String(v ?? "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 30);

export async function saveAlertRuleAction(id: string | null, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorize("visitors:manage");
    const f = formObject(form);
    const conditions = ruleConditionsSchema.parse({
      minIntent: f.minIntent ? Number(f.minIntent) : null,
      countries: list(f.countries),
      pathContains: f.pathContains || null,
      returning: form.get("returning") === "on",
      identifiedCompany: form.get("identifiedCompany") === "on",
      industries: list(f.industries),
    });
    const d = z.object({ name: reqText(120), action: z.enum(["NOTIFY", "CREATE_TASK"]), assigneeId: z.string().max(40).nullish().transform((v) => v || null), notifyPermission: z.string().max(60).nullish().transform((v) => v || null) }).parse(f);
    if (d.notifyPermission && !PERMISSIONS.includes(d.notifyPermission as Permission)) throw new UserError("Unknown permission.");
    if (d.assigneeId && !(await db.user.count({ where: { id: d.assigneeId, active: true } }))) throw new UserError("Assignee not found.");
    const data = { ...d, conditions, active: form.get("active") !== null ? form.get("active") === "on" : true };
    const rule = id ? await db.visitorAlertRule.update({ where: { id }, data }) : await db.visitorAlertRule.create({ data: { ...data, createdById: user.id } });
    await audit({ userId: user.id, action: id ? "visitors.rule.updated" : "visitors.rule.created", entity: "VisitorAlertRule", entityId: rule.id, metadata: { conditions } });
    return okThen("/admin/visitors/rules", "Rule saved.");
  } catch (e) {
    return fail(e, "visitors");
  }
}

export async function toggleAlertRuleAction(id: string, active: boolean, _s?: ActionState, _f?: FormData): Promise<ActionState> {
  try {
    const user = await authorize("visitors:manage");
    await db.visitorAlertRule.update({ where: { id }, data: { active } });
    await audit({ userId: user.id, action: "visitors.rule.toggled", entity: "VisitorAlertRule", entityId: id, metadata: { active } });
    return okThen("/admin/visitors/rules", active ? "Rule enabled." : "Rule paused.");
  } catch (e) {
    return fail(e, "visitors");
  }
}

export async function deleteAlertRuleAction(id: string, _s?: ActionState, _f?: FormData): Promise<ActionState> {
  try {
    const user = await authorize("visitors:manage");
    await db.visitorAlertRule.delete({ where: { id } });
    await audit({ userId: user.id, action: "visitors.rule.deleted", entity: "VisitorAlertRule", entityId: id });
    return okThen("/admin/visitors/rules", "Rule deleted.");
  } catch (e) {
    return fail(e, "visitors");
  }
}

/** Manually link an anonymous visitor to an existing CRM lead (never creates a lead or guesses identity). */
export async function linkVisitorLeadAction(visitorId: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorize("visitors:manage");
    const ref = reqText(60).parse(form.get("lead"));
    const lead = await db.lead.findFirst({ where: { OR: [{ id: ref }, { ref }] }, select: { id: true } });
    if (!lead) throw new UserError("Lead not found. Use the lead's reference, e.g. SHV-20260927-AB12.");
    await db.visitor.update({ where: { id: visitorId }, data: { leadId: lead.id, identifiedAt: new Date() } });
    await audit({ userId: user.id, action: "visitors.linked", entity: "Visitor", entityId: visitorId, metadata: { leadId: lead.id } });
    return okThen(`/admin/visitors/${visitorId}`, "Linked to lead.");
  } catch (e) {
    return fail(e, "visitors");
  }
}

/** Delete one visitor's data (e.g. on a data-subject request). */
export async function deleteVisitorAction(visitorId: string, _s?: ActionState, _f?: FormData): Promise<ActionState> {
  try {
    const user = await authorize("visitors:manage");
    await db.visitor.delete({ where: { id: visitorId } });
    await audit({ userId: user.id, action: "visitors.deleted", entity: "Visitor", entityId: visitorId });
    return okThen("/admin/visitors", "Visitor data deleted.");
  } catch (e) {
    return fail(e, "visitors");
  }
}
