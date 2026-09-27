"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { audit } from "@/lib/audit";
import { authorizeAccess } from "@/lib/os/guard";
import { fail, optText, reqText, type ActionState } from "@/lib/os/action";
import { TRIGGERS, rulesSchema, isPublicHttpsUrl, type AutomationAction, type Condition, type Trigger } from "./rules";

const F = "AUTOMATIONS" as const;

export async function saveAutomationAction(id: string | null, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("automations:manage", F);
    const name = reqText(200).parse(form.get("name"));
    const description = optText(1000).parse(form.get("description"));
    const trigger = z.enum(TRIGGERS).parse(form.get("trigger"));
    let raw: unknown;
    try {
      raw = { conditions: JSON.parse(String(form.get("conditions") ?? "[]")), actions: JSON.parse(String(form.get("actions") ?? "[]")) };
    } catch {
      return { error: "The rule could not be read. Reload and try again." };
    }
    const r = rulesSchema.safeParse(raw);
    if (!r.success) return { error: `Rule invalid: ${r.error.issues[0]?.path.join(".")} — ${r.error.issues[0]?.message}` };
    for (const a of r.data.actions) if (a.type === "WEBHOOK" && !isPublicHttpsUrl(a.url)) return { error: "Webhook URLs must be public https:// addresses." };
    const enabled = form.get("enabled") === "on";
    const data = { name, description, trigger, enabled, conditions: r.data.conditions, actions: r.data.actions };
    const a = id ? await db.automation.update({ where: { id }, data }) : await db.automation.create({ data: { ...data, createdById: user.id } });
    await audit({ userId: user.id, action: id ? "automation.updated" : "automation.created", entity: "Automation", entityId: a.id, metadata: { trigger, enabled, actions: r.data.actions.map((x) => x.type) } });
    revalidatePath("/admin/automations");
    return id ? { ok: "Automation saved." } : { ok: "Automation created.", redirect: `/admin/automations/${a.id}` };
  } catch (e) {
    return fail(e, "automations");
  }
}

export async function toggleAutomationAction(id: string, enabled: boolean) {
  const user = await authorizeAccess("automations:manage", F);
  await db.automation.update({ where: { id }, data: { enabled } });
  await audit({ userId: user.id, action: enabled ? "automation.enabled" : "automation.disabled", entity: "Automation", entityId: id });
  revalidatePath("/admin/automations");
}

/** Starter workflows from the Shivacha OS playbook — created DISABLED so a human reviews them first. */
const TEMPLATES: Record<string, { name: string; description: string; trigger: Trigger; conditions: Condition[]; actions: AutomationAction[] }> = {
  "new-lead": {
    name: "New lead → assign, follow up, notify, AI analysis",
    description: "Round-robin assignment, a follow-up within 4 hours, a manager notification and an AI lead analysis (ASSIST mode — any outreach waits for approval).",
    trigger: "NEW_LEAD",
    conditions: [],
    actions: [
      { type: "ASSIGN_OWNER", strategy: "round_robin", userId: "", role: "SALES_MANAGER" },
      { type: "CREATE_FOLLOWUP", note: "First response to {{lead.name}} ({{lead.service}})", dueInHours: 4, assignTo: "owner" },
      { type: "SEND_NOTIFICATION", to: "permission:leads:assign", title: "New lead: {{lead.name}} — {{lead.company}}", body: "{{lead.service}} · {{lead.country}} · score {{lead.score}}" },
      { type: "AI_AGENT", agent: "sales", instruction: "Analyze and qualify this new lead, recommend services and the next best action, and draft a personalised follow-up for approval." },
    ],
  },
  "hot-lead": {
    name: "Hot lead → urgent task",
    description: "High-scoring leads get an urgent call task for their owner.",
    trigger: "NEW_LEAD",
    conditions: [{ field: "lead.score", op: "gte", value: "70" }],
    actions: [{ type: "CREATE_TASK", title: "Call {{lead.name}} today (score {{lead.score}})", assignTo: "owner", dueInDays: 0, priority: "URGENT" }],
  },
  "deal-won": {
    name: "Deal won → kickoff tasks, finance, customer success",
    description: "Kick-off task, finance notification and AI account onboarding summary.",
    trigger: "DEAL_WON",
    conditions: [],
    actions: [
      { type: "CREATE_TASK", title: "Kick-off meeting for {{deal.name}}", assignTo: "owner", dueInDays: 2, priority: "HIGH" },
      { type: "SEND_NOTIFICATION", to: "permission:finance:manage", title: "Deal won: {{deal.name}} ({{deal.value}} {{deal.currency}})", body: "Prepare the first invoice per the payment schedule." },
      { type: "AI_AGENT", agent: "customer-success", instruction: "Summarize this new client account and prepare an onboarding brief." },
    ],
  },
  "invoice-overdue": {
    name: "Invoice overdue → finance agent drafts a reminder",
    description: "The Finance agent drafts a polite reminder; sending needs human approval.",
    trigger: "INVOICE_OVERDUE",
    conditions: [],
    actions: [
      { type: "SEND_NOTIFICATION", to: "permission:finance:manage", title: "Invoice {{invoice.number}} is overdue ({{invoice.daysOverdue}} days)", body: "Balance {{invoice.balanceDue}} {{invoice.currency}}" },
      { type: "AI_AGENT", agent: "finance", instruction: "Assess payment risk for this overdue invoice and draft a polite payment reminder for approval." },
    ],
  },
  "urgent-ticket": {
    name: "Urgent ticket → escalate",
    description: "Urgent tickets notify every support manager immediately.",
    trigger: "TICKET_CREATED",
    conditions: [{ field: "ticket.priority", op: "eq", value: "URGENT" }],
    actions: [{ type: "SEND_NOTIFICATION", to: "permission:support:manage", title: "URGENT ticket {{ticket.number}}: {{ticket.subject}}", body: "" }],
  },
};
export async function listTemplates() {
  return Object.entries(TEMPLATES).map(([key, t]) => ({ key, name: t.name, description: t.description, trigger: t.trigger }));
}

export async function createFromTemplateAction(key: string) {
  const user = await authorizeAccess("automations:manage", F);
  const t = TEMPLATES[key];
  if (!t) return;
  const a = await db.automation.create({ data: { name: t.name, description: t.description, trigger: t.trigger, conditions: t.conditions, actions: t.actions, enabled: false, createdById: user.id } });
  await audit({ userId: user.id, action: "automation.created", entity: "Automation", entityId: a.id, metadata: { template: key } });
  revalidatePath("/admin/automations");
}
