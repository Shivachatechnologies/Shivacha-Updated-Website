import "server-only";
import { createHmac } from "node:crypto";
import { after } from "next/server";
import { db } from "@/lib/db/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { ROLES, type Permission, type RoleName } from "@/lib/auth/permissions";
import { sendMail } from "@/lib/email/mailer";
import { notify, rolesWith } from "@/lib/os/notify";
import { nextNumber } from "@/lib/os/numbers";
import { isEnabled } from "@/lib/os/flags";
import { hrefFor } from "./href";
import { actionSchema, allMatch, conditionSchema, isPublicHttpsUrl, render, type AutomationAction, type Trigger } from "./rules";

export interface AutomationEvent {
  trigger: Trigger;
  entity: string;
  entityId: string;
  /** Payload exposed to conditions and templates ({{lead.name}} …). */
  payload: Record<string, unknown>;
  /** Owner of the record (used by "owner" recipients / assignees). */
  ownerId?: string | null;
  actorId?: string | null;
}

type Step = { action: string; status: "ok" | "skipped" | "failed" | "approval"; detail?: string };

const htmlEsc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * Queue an event to run after the response is sent (never slows down or breaks the user's action).
 * Falls back to running inline outside a request (cron, scripts, tests).
 */
export function queueEvent(ev: AutomationEvent) {
  try {
    after(() => runEvent(ev));
  } catch {
    void runEvent(ev);
  }
}

/** Runs every enabled automation for the trigger. Automation actions never emit further events (no loops). */
export async function runEvent(ev: AutomationEvent): Promise<number> {
  if (!process.env.DATABASE_URL) return 0;
  try {
    if (!(await isEnabled("AUTOMATIONS"))) return 0;
    const rules = await db.automation.findMany({ where: { trigger: ev.trigger, enabled: true } });
    for (const rule of rules) await runRule(rule.id, rule.name, rule.conditions, rule.actions, ev);
    return rules.length;
  } catch (e) {
    console.error("[automation] event failed", ev.trigger, (e as Error).message);
    return 0;
  }
}

async function runRule(id: string, name: string, rawConds: unknown, rawActions: unknown, ev: AutomationEvent) {
  const conds = conditionSchema.array().safeParse(rawConds);
  const acts = actionSchema.array().safeParse(rawActions);
  const run = await db.automationRun.create({ data: { automationId: id, trigger: ev.trigger, entity: ev.entity, entityId: ev.entityId } });
  const steps: Step[] = [];
  let status: "SUCCEEDED" | "PARTIAL" | "FAILED" | "SKIPPED" = "SUCCEEDED";
  let error: string | undefined;
  try {
    if (!conds.success || !acts.success) throw new Error("Rule definition is invalid — edit and save it again.");
    if (!allMatch(conds.data, ev.payload)) {
      status = "SKIPPED";
      steps.push({ action: "conditions", status: "skipped", detail: "Conditions not met" });
    } else {
      for (const a of acts.data) {
        try {
          steps.push(await execute(a, ev, name, id));
        } catch (e) {
          steps.push({ action: a.type, status: "failed", detail: (e as Error).message.slice(0, 300) });
        }
      }
      const failed = steps.filter((s) => s.status === "failed").length;
      status = failed === 0 ? "SUCCEEDED" : failed === steps.length ? "FAILED" : "PARTIAL";
    }
  } catch (e) {
    status = "FAILED";
    error = (e as Error).message.slice(0, 500);
  }
  await db.$transaction([
    db.automationRun.update({ where: { id: run.id }, data: { status, steps: steps as unknown as Prisma.InputJsonValue, error, finishedAt: new Date() } }),
    db.automation.update({ where: { id }, data: { lastRunAt: new Date(), runCount: { increment: status === "SKIPPED" ? 0 : 1 }, failureCount: { increment: status === "FAILED" || status === "PARTIAL" ? 1 : 0 } } }),
  ]);
  if (status === "FAILED" || status === "PARTIAL")
    await notify({ type: "automation.failed", title: `Automation "${name}" ${status === "FAILED" ? "failed" : "partly failed"}`, body: error ?? steps.find((s) => s.status === "failed")?.detail, href: `/admin/automations/runs/${run.id}`, permission: "automations:manage" });
}

async function resolveUsers(to: string, ev: AutomationEvent): Promise<string[]> {
  if (to === "owner") return ev.ownerId ? [ev.ownerId] : [];
  if (to.startsWith("permission:")) {
    const users = await db.user.findMany({ where: { active: true, role: { in: rolesWith(to.slice(11) as Permission) } }, select: { id: true } });
    return users.map((u) => u.id);
  }
  if (to.startsWith("role:")) {
    const role = to.slice(5) as RoleName;
    if (!ROLES.includes(role)) return [];
    return (await db.user.findMany({ where: { active: true, role }, select: { id: true } })).map((u) => u.id);
  }
  const u = await db.user.findFirst({ where: { OR: [{ id: to }, { email: to.toLowerCase() }], active: true }, select: { id: true } });
  return u ? [u.id] : [];
}

async function execute(a: AutomationAction, ev: AutomationEvent, ruleName: string, automationId: string): Promise<Step> {
  const t = (s: string) => render(s, ev.payload);
  switch (a.type) {
    case "CREATE_TASK": {
      const [assigneeId] = await resolveUsers(a.assignTo, ev);
      await db.task.create({
        data: {
          title: t(a.title).slice(0, 200) || "Automation task",
          priority: a.priority,
          assigneeId: assigneeId ?? null,
          dueDate: new Date(Date.now() + a.dueInDays * 86400_000),
          source: `automation:${ruleName}`.slice(0, 120),
          leadId: ev.entity === "Lead" ? ev.entityId : null,
          dealId: ev.entity === "Deal" ? ev.entityId : null,
          projectId: ev.entity === "Project" ? ev.entityId : null,
        },
      });
      if (assigneeId) await notify({ type: "task.assigned", title: t(a.title).slice(0, 200), href: "/admin/tasks?mine=1", userIds: [assigneeId] });
      return { action: a.type, status: "ok" };
    }
    case "CREATE_FOLLOWUP": {
      if (ev.entity !== "Lead") return { action: a.type, status: "skipped", detail: "Follow-ups apply to leads only" };
      const [assignedToId] = await resolveUsers(a.assignTo, ev);
      const dueAt = new Date(Date.now() + a.dueInHours * 3600_000);
      await db.$transaction([
        db.followUp.create({ data: { leadId: ev.entityId, dueAt, note: t(a.note) || `Automation: ${ruleName}`, assignedToId: assignedToId ?? null } }),
        db.lead.update({ where: { id: ev.entityId }, data: { nextFollowUpAt: dueAt } }),
        db.leadActivity.create({ data: { leadId: ev.entityId, type: "FOLLOWUP_SCHEDULED", data: { dueAt: dueAt.toISOString(), automation: ruleName } } }),
      ]);
      return { action: a.type, status: "ok" };
    }
    case "ASSIGN_OWNER": {
      let userId: string | null = null;
      if (a.strategy === "user") userId = (await db.user.findFirst({ where: { id: a.userId, active: true }, select: { id: true } }))?.id ?? null;
      else {
        // Round robin: the active user of the role with the fewest open (non-archived, not won/lost) leads.
        const role = (ROLES as readonly string[]).includes(a.role) ? (a.role as RoleName) : "SALES_MANAGER";
        const users = await db.user.findMany({ where: { active: true, role }, select: { id: true, _count: { select: { assignedLeads: { where: { archivedAt: null, status: { notIn: ["WON", "LOST"] } } } } } } });
        userId = users.sort((x, y) => x._count.assignedLeads - y._count.assignedLeads)[0]?.id ?? null;
      }
      if (!userId) return { action: a.type, status: "skipped", detail: "No active user to assign" };
      if (ev.entity === "Lead") {
        await db.$transaction([db.lead.update({ where: { id: ev.entityId }, data: { assignedToId: userId } }), db.leadActivity.create({ data: { leadId: ev.entityId, type: "ASSIGNED", data: { to: userId, automation: ruleName } } })]);
        await notify({ type: "lead.assigned", title: `Lead assigned: ${String((ev.payload.lead as Record<string, unknown>)?.name ?? "")}`, href: `/admin/leads/${ev.entityId}`, userIds: [userId] });
      } else if (ev.entity === "Deal") await db.deal.update({ where: { id: ev.entityId }, data: { ownerId: userId } });
      else if (ev.entity === "Ticket") await db.ticket.update({ where: { id: ev.entityId }, data: { assigneeId: userId } });
      else return { action: a.type, status: "skipped", detail: `Cannot assign a ${ev.entity}` };
      ev.ownerId = userId;
      return { action: a.type, status: "ok" };
    }
    case "SEND_EMAIL": {
      const subject = t(a.subject);
      if (a.to === "customer") {
        // External communication is never automatic: it goes to the Human Approval Center.
        const email = String(getEmail(ev) ?? "");
        if (!email) return { action: a.type, status: "skipped", detail: "No customer email on this record" };
        await db.aIApproval.create({
          data: {
            agentSlug: "automation",
            action: "SEND_EMAIL",
            tool: "sendEmail",
            input: { to: email, subject, body: t(a.body), leadId: ev.entity === "Lead" ? ev.entityId : undefined, clientId: getClientId(ev) },
            reason: `Automation "${ruleName}" (${ev.trigger}) wants to email the customer.`,
            affectedRecords: [{ entity: ev.entity, id: ev.entityId }],
            generatedContent: `To: ${email}\nSubject: ${subject}\n\n${t(a.body)}`,
            risk: "MEDIUM",
            requiredPermission: "communication:send",
            expiresAt: new Date(Date.now() + 7 * 86400_000),
          },
        });
        await notify({ type: "ai.approval", title: `Approval needed: email to ${email}`, href: "/admin/ai/approvals", permission: "communication:send" });
        return { action: a.type, status: "approval", detail: "Queued for human approval" };
      }
      const ids = await resolveUsers(a.to, ev);
      const users = await db.user.findMany({ where: { id: { in: ids } }, select: { email: true } });
      if (!users.length) return { action: a.type, status: "skipped", detail: "No internal recipient" };
      let sent = 0;
      for (const u of users) {
        const r = await sendMail({ to: u.email, subject, text: t(a.body), html: `<div style="font-family:sans-serif;white-space:pre-wrap">${render(a.body, ev.payload, htmlEsc)}</div>` });
        if (r.sent) sent++;
      }
      if (!sent) throw new Error("Email is not configured or delivery failed");
      return { action: a.type, status: "ok", detail: `${sent} sent` };
    }
    case "SEND_NOTIFICATION": {
      const ids = await resolveUsers(a.to, ev);
      const n = await notify({ type: notificationTypeFor(ev.trigger), title: t(a.title), body: t(a.body), href: hrefFor(ev), entity: ev.entity, entityId: ev.entityId, userIds: ids });
      return { action: a.type, status: n ? "ok" : "skipped", detail: `${n} recipient(s)` };
    }
    case "CREATE_TICKET": {
      const number = await nextNumber("ticket");
      await db.ticket.create({ data: { number, subject: t(a.subject).slice(0, 200), priority: a.priority, category: a.category, source: "INTERNAL", clientId: getClientId(ev) ?? null } });
      return { action: a.type, status: "ok", detail: number };
    }
    case "UPDATE_STATUS": {
      const v = a.value.toUpperCase();
      if (ev.entity === "Lead") {
        const allowed = ["NEW", "CONTACTED", "QUALIFIED", "MEETING", "PROPOSAL_SENT", "NEGOTIATION", "ON_HOLD"];
        if (!allowed.includes(v)) throw new Error(`Status ${v} cannot be set by an automation`);
        await db.$transaction([db.lead.update({ where: { id: ev.entityId }, data: { status: v as "NEW" } }), db.leadActivity.create({ data: { leadId: ev.entityId, type: "STATUS_CHANGED", data: { value: v, automation: ruleName } } })]);
      } else if (ev.entity === "Ticket") {
        if (!["OPEN", "IN_PROGRESS", "WAITING_FOR_CLIENT"].includes(v)) throw new Error(`Status ${v} cannot be set by an automation`);
        await db.ticket.update({ where: { id: ev.entityId }, data: { status: v as "OPEN" } });
      } else if (ev.entity === "Project") {
        if (!["ACTIVE", "ON_HOLD"].includes(v)) throw new Error(`Status ${v} cannot be set by an automation`);
        await db.project.update({ where: { id: ev.entityId }, data: { status: v as "ACTIVE" } });
      } else return { action: a.type, status: "skipped", detail: `No status change for ${ev.entity}` };
      // Deal stages (WON/LOST), invoices and payments are deliberately not automatable.
      return { action: a.type, status: "ok" };
    }
    case "AI_AGENT": {
      if (!(await isEnabled("AI_WORKFORCE"))) return { action: a.type, status: "skipped", detail: "AI workforce is switched off" };
      // Loaded lazily: the AI runtime imports modules that themselves queue automation events.
      const { createEmployeeTask } = await import("@/lib/ai/workforce/engine");
      const scheduled = ev.entity === "Schedule";
      const task = await createEmployeeTask({ agentSlug: a.agent, title: (scheduled ? ruleName : `${ruleName}: ${a.agent}`).slice(0, 200), instructions: t(a.instruction), kind: scheduled ? "RECURRING" : "TASK", automationId, entity: scheduled ? null : ev.entity, entityId: scheduled ? null : ev.entityId, source: `automation:${ruleName}` });
      return { action: a.type, status: "ok", detail: `AI employee task ${task.id} assigned (sensitive actions need approval)` };
    }
    case "WEBHOOK": {
      if (!isPublicHttpsUrl(a.url)) throw new Error("Webhook URL must be a public https:// address");
      const body = JSON.stringify({ trigger: ev.trigger, entity: ev.entity, entityId: ev.entityId, payload: ev.payload, sentAt: new Date().toISOString() });
      const headers: Record<string, string> = { "content-type": "application/json", "user-agent": "ShivachaOS-Automation/1.0" };
      if (process.env.AUTOMATION_WEBHOOK_SECRET) headers["x-shivacha-signature"] = `sha256=${createHmac("sha256", process.env.AUTOMATION_WEBHOOK_SECRET).update(body).digest("hex")}`;
      const res = await fetch(a.url, { method: "POST", headers, body, redirect: "error", signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`Webhook responded ${res.status}`);
      return { action: a.type, status: "ok", detail: `HTTP ${res.status}` };
    }
  }
}

const getEmail = (ev: AutomationEvent) => {
  for (const k of ["lead", "client", "ticket", "invoice", "proposal"]) {
    const o = ev.payload[k] as Record<string, unknown> | undefined;
    const e = o?.email ?? o?.billingEmail ?? o?.contactEmail;
    if (typeof e === "string" && e.includes("@")) return e;
  }
  return null;
};
const getClientId = (ev: AutomationEvent) => {
  if (ev.entity === "Client") return ev.entityId;
  for (const k of ["deal", "invoice", "project", "ticket", "proposal", "payment"]) {
    const o = ev.payload[k] as Record<string, unknown> | undefined;
    if (typeof o?.clientId === "string") return o.clientId;
  }
  return undefined;
};


const notificationTypeFor = (t: Trigger) =>
  (({ NEW_LEAD: "lead.new", DEAL_WON: "deal.won", PROPOSAL_SENT: "proposal.viewed", PROPOSAL_EXPIRING: "proposal.expiring", INVOICE_OVERDUE: "invoice.overdue", PAYMENT_RECEIVED: "payment.received", TICKET_CREATED: "ticket.created", PROJECT_DELAYED: "milestone.due", FOLLOW_UP_DUE: "followup.due", SCHEDULE_MORNING: "ai.task", SCHEDULE_EVENING: "ai.task", SCHEDULE_WEEKLY_MONDAY: "ai.task", SCHEDULE_CONTINUOUS: "ai.task" }) as const)[t];

export { hrefFor };
