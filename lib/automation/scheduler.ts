import "server-only";
import { db } from "@/lib/db/client";
import { logActivity } from "@/lib/os/activity";
import { notify } from "@/lib/os/notify";
import { runEvent } from "./engine";
import type { Trigger } from "./rules";

const DAY = 86400_000;

/** Emits a time-based event once per record per `days` window (dedupe via the unified timeline). */
async function once(trigger: Trigger, ref: { proposalId?: string; invoiceId?: string; projectId?: string; contractId?: string }, days: number) {
  const key = `EVENT:${trigger}`;
  const since = new Date(Date.now() - days * DAY);
  const exists = await db.activity.findFirst({ where: { type: key, createdAt: { gte: since }, ...ref }, select: { id: true } });
  if (exists) return false;
  await logActivity({ type: key, summary: `Scheduled event ${trigger}`, ...ref });
  return true;
}

export interface JobReport {
  job: string;
  count: number;
  error?: string;
}

async function job(name: string, fn: () => Promise<number>): Promise<JobReport> {
  try {
    return { job: name, count: await fn() };
  } catch (e) {
    console.error(`[scheduler] ${name} failed`, (e as Error).message);
    return { job: name, count: 0, error: (e as Error).message.slice(0, 200) };
  }
}

/** Daily scheduled work. Idempotent: safe to run more than once a day. */
export async function runDailyJobs(extra: { name: string; run: () => Promise<number> }[] = []): Promise<JobReport[]> {
  const now = new Date();
  const reports: JobReport[] = [];

  reports.push(
    await job("proposals.expire", async () => {
      const expired = await db.proposal.findMany({ where: { deletedAt: null, status: { in: ["SENT", "VIEWED"] }, validUntil: { lt: now } }, select: { id: true, number: true, createdById: true, dealId: true } });
      for (const p of expired) {
        await db.proposal.update({ where: { id: p.id }, data: { status: "EXPIRED" } });
        await logActivity({ type: "STATUS_CHANGED", summary: "Expired (validity date passed)", proposalId: p.id, dealId: p.dealId });
        await notify({ type: "proposal.expiring", title: `Proposal ${p.number} expired`, href: `/admin/proposals/${p.id}`, userIds: [p.createdById] });
      }
      return expired.length;
    }),
  );

  reports.push(
    await job("proposals.expiring", async () => {
      const soon = await db.proposal.findMany({ where: { deletedAt: null, status: { in: ["SENT", "VIEWED"] }, validUntil: { gte: now, lte: new Date(now.getTime() + 3 * DAY) } }, select: { id: true, number: true, title: true, total: true, currency: true, createdById: true, clientId: true, validUntil: true } });
      let n = 0;
      for (const p of soon) {
        if (!(await once("PROPOSAL_EXPIRING", { proposalId: p.id }, 7))) continue;
        n++;
        await notify({ type: "proposal.expiring", title: `Proposal ${p.number} expires ${p.validUntil!.toISOString().slice(0, 10)}`, href: `/admin/proposals/${p.id}`, userIds: [p.createdById] });
        await runEvent({ trigger: "PROPOSAL_EXPIRING", entity: "Proposal", entityId: p.id, ownerId: p.createdById, payload: { proposal: { id: p.id, number: p.number, title: p.title, total: p.total.toString(), currency: p.currency, clientId: p.clientId, daysLeft: Math.ceil((p.validUntil!.getTime() - now.getTime()) / DAY) } } });
      }
      return n;
    }),
  );

  reports.push(
    await job("invoices.overdue", async () => {
      const overdue = await db.invoice.findMany({ where: { status: { in: ["ISSUED", "PARTIALLY_PAID"] }, dueDate: { lt: now } }, include: { client: { select: { name: true, billingEmail: true, accountOwnerId: true } } } });
      let n = 0;
      for (const i of overdue) {
        if (!(await once("INVOICE_OVERDUE", { invoiceId: i.id }, 7))) continue;
        n++;
        const daysOverdue = Math.floor((now.getTime() - i.dueDate!.getTime()) / DAY);
        await notify({ type: "invoice.overdue", title: `Invoice ${i.number} is ${daysOverdue} day(s) overdue`, body: `${i.client.name} · ${i.balanceDue.toFixed(2)} ${i.currency}`, href: `/admin/finance/invoices/${i.id}`, permission: "finance:manage", userIds: [i.client.accountOwnerId] });
        await runEvent({ trigger: "INVOICE_OVERDUE", entity: "Invoice", entityId: i.id, ownerId: i.client.accountOwnerId, payload: { invoice: { id: i.id, number: i.number, balanceDue: i.balanceDue.toString(), currency: i.currency, daysOverdue, clientId: i.clientId, email: i.client.billingEmail } } });
      }
      return n;
    }),
  );

  reports.push(
    await job("followups.due", async () => {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const due = await db.followUp.findMany({ where: { status: "PENDING", dueAt: { gte: start, lt: new Date(start.getTime() + DAY) } }, include: { lead: { select: { id: true, name: true } } } });
      for (const f of due) {
        await notify({ type: "followup.due", title: `Follow-up due today: ${f.lead.name}`, body: f.note ?? undefined, href: `/admin/leads/${f.lead.id}`, userIds: [f.assignedToId] });
        await runEvent({ trigger: "FOLLOW_UP_DUE", entity: "FollowUp", entityId: f.id, ownerId: f.assignedToId, payload: { followUp: { id: f.id, leadName: f.lead.name, leadId: f.lead.id } } });
      }
      return due.length;
    }),
  );

  reports.push(
    await job("projects.delayed", async () => {
      const late = await db.project.findMany({ where: { deletedAt: null, status: { in: ["ACTIVE", "PLANNED"] }, OR: [{ targetDate: { lt: now } }, { milestones: { some: { status: { notIn: ["COMPLETED"] }, dueDate: { lt: now } } } }] }, select: { id: true, number: true, name: true, status: true, health: true, targetDate: true, managerId: true, clientId: true } });
      let n = 0;
      for (const p of late) {
        if (!(await once("PROJECT_DELAYED", { projectId: p.id }, 7))) continue;
        n++;
        await notify({ type: "milestone.due", title: `Project ${p.number} is behind schedule`, body: p.name, href: `/admin/projects/${p.id}?tab=timeline`, userIds: [p.managerId], permission: p.managerId ? undefined : "projects:manage" });
        await runEvent({ trigger: "PROJECT_DELAYED", entity: "Project", entityId: p.id, ownerId: p.managerId, payload: { project: { id: p.id, number: p.number, name: p.name, status: p.status, health: p.health, clientId: p.clientId, daysLate: p.targetDate && p.targetDate < now ? Math.floor((now.getTime() - p.targetDate.getTime()) / DAY) : 0 } } });
      }
      return n;
    }),
  );

  reports.push(
    await job("contracts.lifecycle", async () => {
      const ended = await db.contract.findMany({ where: { deletedAt: null, status: "ACTIVE", endDate: { lt: now } }, select: { id: true, clientId: true } });
      for (const c of ended) {
        await db.contract.update({ where: { id: c.id }, data: { status: "EXPIRED" } });
        await logActivity({ type: "STATUS_CHANGED", summary: "ACTIVE → EXPIRED (end date passed)", contractId: c.id, clientId: c.clientId });
      }
      const renewing = await db.contract.findMany({ where: { deletedAt: null, status: { in: ["SIGNED", "ACTIVE"] }, renewalDate: { gte: now, lte: new Date(now.getTime() + 30 * DAY) } }, include: { client: { select: { name: true, accountOwnerId: true } } } });
      for (const c of renewing) if (await once("PROPOSAL_EXPIRING", { contractId: c.id }, 30)) await notify({ type: "proposal.expiring", title: `Contract ${c.number} renews ${c.renewalDate!.toISOString().slice(0, 10)}`, body: c.client.name, href: `/admin/contracts/${c.id}`, userIds: [c.client.accountOwnerId], permission: "contracts:manage" });
      return ended.length + renewing.length;
    }),
  );

  reports.push(
    await job("retention", async () => {
      const [s, ps, pt, mem, la] = await Promise.all([
        db.session.deleteMany({ where: { expiresAt: { lt: now } } }),
        db.portalSession.deleteMany({ where: { expiresAt: { lt: now } } }),
        db.portalToken.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - 30 * DAY) } } }),
        db.aIMemory.deleteMany({ where: { expiresAt: { lt: now } } }),
        db.loginAttempt.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 180 * DAY) } } }),
      ]);
      return s.count + ps.count + pt.count + mem.count + la.count;
    }),
  );

  for (const e of extra) reports.push(await job(e.name, e.run));
  return reports;
}

export interface SchedulerRun {
  at: string;
  trigger: string;
  ms: number;
  reports: JobReport[];
}

/** Last scheduler run, shown on System Health (Setting "scheduler:lastRun"). */
export async function recordSchedulerRun(trigger: string, ms: number, reports: JobReport[]) {
  const value = { at: new Date().toISOString(), trigger, ms, reports } satisfies SchedulerRun;
  await db.setting.upsert({ where: { key: "scheduler:lastRun" }, update: { value: value as object }, create: { key: "scheduler:lastRun", value: value as object } }).catch((e) => console.error("[scheduler] could not record run", (e as Error).message));
}
