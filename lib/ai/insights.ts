import "server-only";
import { db } from "@/lib/db/client";
import type { Permission } from "@/lib/auth/permissions";
import { findDuplicateGroups } from "@/lib/crm/core";
import { fmtMoney } from "@/lib/os/money";

type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
interface Insight {
  dedupeKey: string;
  agentSlug: string;
  type: string;
  title: string;
  body?: string;
  severity: Severity;
  entity?: string;
  entityId?: string;
  href?: string;
  permission: Permission;
}

const DAY = 86400_000;

/**
 * Proactive insights computed from live records by deterministic rules (no model call, no invented data).
 * Idempotent: keyed by dedupeKey; open insights whose condition no longer holds are closed automatically.
 */
export async function generateInsights(): Promise<number> {
  const now = new Date();
  const ago = (d: number) => new Date(now.getTime() - d * DAY);
  const out: Insight[] = [];

  const [staleLeads, unassigned, overdueFollowUps, stalledDeals, closingDeals, overdueInvoices, pendingPayments, riskyProjects, breached, dups, staleApprovals] = await Promise.all([
    db.lead.findMany({ where: { archivedAt: null, status: { notIn: ["WON", "LOST", "ON_HOLD"] }, OR: [{ priority: { in: ["HIGH", "URGENT"] } }, { score: { gte: 70 } }], AND: [{ OR: [{ lastContactedAt: null, createdAt: { lt: ago(3) } }, { lastContactedAt: { lt: ago(7) } }] }] }, take: 25, orderBy: [{ score: "desc" }, { createdAt: "asc" }], select: { id: true, name: true, company: true, ref: true, lastContactedAt: true, createdAt: true, priority: true } }),
    db.lead.count({ where: { archivedAt: null, assignedToId: null, status: "NEW", createdAt: { lt: ago(1) } } }),
    db.followUp.count({ where: { status: "PENDING", dueAt: { lt: now } } }),
    db.deal.findMany({ where: { deletedAt: null, stage: { notIn: ["WON", "LOST"] }, stageChangedAt: { lt: ago(21) } }, take: 25, orderBy: { value: "desc" }, select: { id: true, number: true, name: true, stage: true, value: true, currency: true, stageChangedAt: true } }),
    db.deal.findMany({ where: { deletedAt: null, stage: { notIn: ["WON", "LOST"] }, expectedCloseDate: { gte: now, lte: new Date(now.getTime() + 7 * DAY) }, proposals: { none: { status: { in: ["SENT", "VIEWED", "ACCEPTED"] } } } }, take: 15, select: { id: true, number: true, name: true, value: true, currency: true, expectedCloseDate: true } }),
    db.invoice.findMany({ where: { status: { in: ["ISSUED", "PARTIALLY_PAID"] }, dueDate: { lt: ago(14) } }, take: 25, orderBy: { dueDate: "asc" }, select: { id: true, number: true, balanceDue: true, currency: true, dueDate: true, client: { select: { name: true } } } }),
    db.payment.count({ where: { status: "PENDING", createdAt: { lt: ago(2) } } }),
    db.project.findMany({ where: { deletedAt: null, status: { in: ["ACTIVE", "PLANNED"] }, OR: [{ health: "RED" }, { targetDate: { lt: now } }] }, take: 20, select: { id: true, number: true, name: true, health: true, targetDate: true } }),
    db.ticket.findMany({ where: { status: { in: ["OPEN", "IN_PROGRESS", "WAITING_FOR_CLIENT"] }, OR: [{ resolutionDueAt: { lt: now } }, { firstResponseAt: null, firstResponseDueAt: { lt: now } }] }, take: 25, select: { id: true, number: true, subject: true, priority: true } }),
    findDuplicateGroups(1, 1),
    db.aIApproval.count({ where: { status: "PENDING", createdAt: { lt: ago(2) } } }),
  ]);

  for (const l of staleLeads) {
    const days = Math.floor((now.getTime() - (l.lastContactedAt ?? l.createdAt).getTime()) / DAY);
    out.push({ dedupeKey: `lead-stale:${l.id}`, agentSlug: "sales", type: "stale_lead", title: `High-value lead ${l.name}${l.company ? ` (${l.company})` : ""} not contacted for ${days} days`, body: `${l.ref} · priority ${l.priority.toLowerCase()}. Reach out or schedule a follow-up.`, severity: days > 14 ? "HIGH" : "MEDIUM", entity: "Lead", entityId: l.id, href: `/admin/leads/${l.id}`, permission: "leads:view" });
  }
  if (unassigned) out.push({ dedupeKey: "leads-unassigned", agentSlug: "crm", type: "unassigned_leads", title: `${unassigned} new lead(s) unassigned for over 24 hours`, severity: unassigned > 5 ? "HIGH" : "MEDIUM", href: "/admin/leads?assigned=unassigned", permission: "leads:assign" });
  if (overdueFollowUps) out.push({ dedupeKey: "followups-overdue", agentSlug: "crm", type: "overdue_followups", title: `${overdueFollowUps} follow-up(s) overdue`, severity: overdueFollowUps > 10 ? "HIGH" : "MEDIUM", href: "/admin/follow-ups", permission: "leads:view" });
  for (const d of stalledDeals) {
    const days = Math.floor((now.getTime() - d.stageChangedAt.getTime()) / DAY);
    out.push({ dedupeKey: `deal-stalled:${d.id}`, agentSlug: "sales", type: "stalled_deal", title: `Deal ${d.number} stuck in ${d.stage.toLowerCase()} for ${days} days`, body: `${d.name} · ${fmtMoney(d.value, d.currency)}`, severity: days > 45 ? "HIGH" : "MEDIUM", entity: "Deal", entityId: d.id, href: `/admin/deals/${d.id}`, permission: "deals:view" });
  }
  for (const d of closingDeals) out.push({ dedupeKey: `deal-closing-no-proposal:${d.id}`, agentSlug: "proposal", type: "closing_without_proposal", title: `Deal ${d.number} expected to close ${d.expectedCloseDate!.toISOString().slice(0, 10)} with no proposal sent`, body: `${d.name} · ${fmtMoney(d.value, d.currency)}`, severity: "HIGH", entity: "Deal", entityId: d.id, href: `/admin/deals/${d.id}`, permission: "deals:view" });
  for (const i of overdueInvoices) {
    const days = Math.floor((now.getTime() - i.dueDate!.getTime()) / DAY);
    out.push({ dedupeKey: `invoice-overdue:${i.id}`, agentSlug: "finance", type: "overdue_invoice", title: `Invoice ${i.number} is ${days} days overdue`, body: `${i.client.name} · ${fmtMoney(i.balanceDue, i.currency)} outstanding`, severity: days > 30 ? "HIGH" : "MEDIUM", entity: "Invoice", entityId: i.id, href: `/admin/finance/invoices/${i.id}`, permission: "finance:view" });
  }
  if (pendingPayments) out.push({ dedupeKey: "payments-pending", agentSlug: "finance", type: "unconfirmed_payments", title: `${pendingPayments} payment(s) awaiting confirmation for over 2 days`, severity: "MEDIUM", href: "/admin/finance/payments?status=PENDING", permission: "payments:confirm" });
  for (const p of riskyProjects) out.push({ dedupeKey: `project-risk:${p.id}`, agentSlug: "project", type: "project_risk", title: `Project ${p.number} ${p.health === "RED" ? "is RED" : "is past its target date"}`, body: p.name, severity: p.health === "RED" ? "HIGH" : "MEDIUM", entity: "Project", entityId: p.id, href: `/admin/projects/${p.id}`, permission: "projects:view" });
  for (const t of breached) out.push({ dedupeKey: `ticket-sla:${t.id}`, agentSlug: "support", type: "sla_breach", title: `Ticket ${t.number} breached SLA`, body: t.subject, severity: t.priority === "URGENT" ? "CRITICAL" : "HIGH", entity: "Ticket", entityId: t.id, href: `/admin/support/${t.id}`, permission: "support:view" });
  if (dups.total) out.push({ dedupeKey: "crm-duplicates", agentSlug: "crm", type: "duplicates", title: `${dups.total} group(s) of possible duplicate leads`, severity: "LOW", href: "/admin/crm/duplicates", permission: "leads:merge" });
  if (staleApprovals) out.push({ dedupeKey: "approvals-stale", agentSlug: "ceo", type: "stale_approvals", title: `${staleApprovals} AI/automation approval(s) waiting over 2 days`, severity: "MEDIUM", href: "/admin/ai/approvals", permission: "ai:approve" });

  for (const i of out) {
    await db.aIRecommendation.upsert({
      where: { dedupeKey: i.dedupeKey },
      // Keep a dismissed insight dismissed; refresh the text of open ones.
      update: { title: i.title, body: i.body, severity: i.severity, href: i.href },
      create: { ...i },
    });
  }
  // Auto-close open rule insights whose condition cleared.
  const keys = out.map((i) => i.dedupeKey);
  await db.aIRecommendation.updateMany({ where: { status: "OPEN", dedupeKey: { notIn: keys.length ? keys : ["-"] }, NOT: { type: "manual" } }, data: { status: "ACTED" } });
  return out.length;
}
