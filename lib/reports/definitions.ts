import "server-only";
import { db } from "@/lib/db/client";
import type { Permission } from "@/lib/auth/permissions";
import { byCurrency, fmtMoney } from "@/lib/os/money";
import { slaState } from "@/lib/support/core";
import { funnelBy } from "@/lib/marketing/attribution";

export interface ReportRange {
  from?: Date;
  to?: Date;
  label: string;
}
export interface ReportResult {
  columns: string[];
  rows: (string | number | null | undefined)[][];
  summary: [string, string][];
  truncated?: boolean;
}
export interface ReportDef {
  key: string;
  title: string;
  description: string;
  permission: Permission;
  /** Range applies to the date named here; false = point-in-time report. */
  rangeOn: string | false;
  run: (r: ReportRange) => Promise<ReportResult>;
}

const MAX = 5000;
const d = (x: Date | null | undefined) => (x ? x.toISOString().slice(0, 10) : "");
const between = (r: ReportRange) => (r.from || r.to ? { gte: r.from, lte: r.to } : undefined);
const DAY = 86400_000;
const totals = (list: { currency: string; amount: { toString(): string } }[]) =>
  byCurrency(list, (x) => x.currency, (x) => x.amount.toString())
    .map((x) => fmtMoney(x.amount, x.currency))
    .join(" · ") || "—";

export const REPORTS: ReportDef[] = [
  {
    key: "leads",
    title: "Leads",
    description: "Leads created in the period with source, status, owner and score.",
    permission: "leads:view",
    rangeOn: "created",
    run: async (r) => {
      const rows = await db.lead.findMany({ where: { archivedAt: null, createdAt: between(r) }, orderBy: { createdAt: "desc" }, take: MAX + 1, include: { assignedTo: { select: { name: true } } } });
      const byStatus = new Map<string, number>();
      rows.forEach((l) => byStatus.set(l.status, (byStatus.get(l.status) ?? 0) + 1));
      return {
        columns: ["Ref", "Created", "Name", "Company", "Country", "Service/Product", "Source", "UTM campaign", "Status", "Priority", "Score", "Owner"],
        rows: rows.slice(0, MAX).map((l) => [l.ref, d(l.createdAt), l.name, l.company, l.country, l.service ?? l.product, l.utmSource ?? l.source, l.utmCampaign, l.status, l.priority, l.score, l.assignedTo?.name ?? "Unassigned"]),
        summary: [["Leads", String(Math.min(rows.length, MAX))], ...[...byStatus].map(([k, v]) => [k.replace(/_/g, " ").toLowerCase(), String(v)] as [string, string])],
        truncated: rows.length > MAX,
      };
    },
  },
  {
    key: "deals",
    title: "Sales pipeline & closed deals",
    description: "Deals created or closed in the period, with stage, value (per currency) and owner.",
    permission: "deals:view",
    rangeOn: "created or closed",
    run: async (r) => {
      const w = between(r);
      const rows = await db.deal.findMany({ where: { deletedAt: null, ...(w ? { OR: [{ createdAt: w }, { wonAt: w }, { lostAt: w }] } : {}) }, orderBy: { createdAt: "desc" }, take: MAX + 1, include: { owner: { select: { name: true } }, client: { select: { name: true } } } });
      const won = rows.filter((x) => x.stage === "WON");
      const open = rows.filter((x) => x.stage !== "WON" && x.stage !== "LOST");
      return {
        columns: ["Number", "Deal", "Client/company", "Stage", "Value", "Currency", "Probability %", "Expected close", "Won", "Lost", "Lost reason", "Owner"],
        rows: rows.slice(0, MAX).map((x) => [x.number, x.name, x.client?.name ?? x.company, x.stage, x.value.toFixed(2), x.currency, x.probability, d(x.expectedCloseDate), d(x.wonAt), d(x.lostAt), x.lostReason, x.owner?.name]),
        summary: [["Deals", String(Math.min(rows.length, MAX))], ["Won", `${won.length} · ${totals(won.map((x) => ({ currency: x.currency, amount: x.value })))}`], ["Open", `${open.length} · ${totals(open.map((x) => ({ currency: x.currency, amount: x.value })))}`]],
        truncated: rows.length > MAX,
      };
    },
  },
  {
    key: "revenue",
    title: "Revenue (confirmed payments)",
    description: "Payments confirmed in the period, net of refunds. Pending payments are excluded.",
    permission: "finance:view",
    rangeOn: "confirmed",
    run: async (r) => {
      const rows = await db.payment.findMany({ where: { status: { in: ["CONFIRMED", "PARTIALLY_REFUNDED", "REFUNDED"] }, confirmedAt: between(r) }, orderBy: { confirmedAt: "desc" }, take: MAX + 1, include: { client: { select: { name: true } } } });
      return {
        columns: ["Payment", "Confirmed", "Client", "Method", "Source", "Amount", "Refunded", "Net", "Currency", "Reference"],
        rows: rows.slice(0, MAX).map((p) => [p.number, d(p.confirmedAt), p.client.name, p.method, p.provider, p.amount.toFixed(2), p.refundedAmount.toFixed(2), p.amount.minus(p.refundedAmount).toFixed(2), p.currency, p.reference]),
        summary: [["Payments", String(Math.min(rows.length, MAX))], ["Net collected", totals(rows.map((p) => ({ currency: p.currency, amount: p.amount.minus(p.refundedAmount) })))]],
        truncated: rows.length > MAX,
      };
    },
  },
  {
    key: "receivables",
    title: "Receivables aging",
    description: "All open invoices today, bucketed by days past due.",
    permission: "finance:view",
    rangeOn: false,
    run: async () => {
      const now = Date.now();
      const rows = await db.invoice.findMany({ where: { status: { in: ["ISSUED", "PARTIALLY_PAID"] } }, orderBy: { dueDate: "asc" }, take: MAX, include: { client: { select: { name: true } } } });
      const bucket = (due: Date | null) => {
        const days = due ? Math.floor((now - due.getTime()) / DAY) : 0;
        return days <= 0 ? "Current" : days <= 30 ? "1–30" : days <= 60 ? "31–60" : days <= 90 ? "61–90" : "90+";
      };
      const groups = new Map<string, { currency: string; amount: { toString(): string } }[]>();
      rows.forEach((i) => groups.set(bucket(i.dueDate), [...(groups.get(bucket(i.dueDate)) ?? []), { currency: i.currency, amount: i.balanceDue }]));
      return {
        columns: ["Invoice", "Client", "Issued", "Due", "Days overdue", "Bucket", "Total", "Balance due", "Currency"],
        rows: rows.map((i) => [i.number, i.client.name, d(i.issueDate), d(i.dueDate), i.dueDate ? Math.max(0, Math.floor((now - i.dueDate.getTime()) / DAY)) : 0, bucket(i.dueDate), i.total.toFixed(2), i.balanceDue.toFixed(2), i.currency]),
        summary: ["Current", "1–30", "31–60", "61–90", "90+"].map((b) => [b, totals(groups.get(b) ?? [])] as [string, string]),
      };
    },
  },
  {
    key: "projects",
    title: "Project portfolio",
    description: "All active and planned projects with health, progress and schedule.",
    permission: "projects:view",
    rangeOn: false,
    run: async () => {
      const now = new Date();
      const rows = await db.project.findMany({ where: { deletedAt: null, status: { in: ["ACTIVE", "PLANNED", "ON_HOLD"] } }, orderBy: { targetDate: "asc" }, take: MAX, include: { client: { select: { name: true } }, manager: { select: { name: true } }, _count: { select: { tasks: { where: { status: { not: "DONE" }, dueDate: { lt: now } } }, issues: { where: { status: { in: ["OPEN", "IN_PROGRESS"] } } } } } } });
      return {
        columns: ["Project", "Name", "Client", "Manager", "Status", "Health", "Progress %", "Start", "Target", "Overdue tasks", "Open issues"],
        rows: rows.map((p) => [p.number, p.name, p.client.name, p.manager?.name, p.status, p.health, p.progress, d(p.startDate), d(p.targetDate), p._count.tasks, p._count.issues]),
        summary: [["Projects", String(rows.length)], ["Red", String(rows.filter((p) => p.health === "RED").length)], ["Past target", String(rows.filter((p) => p.targetDate && p.targetDate < now).length)]],
      };
    },
  },
  {
    key: "support",
    title: "Support tickets & SLA",
    description: "Tickets created in the period with priority, SLA outcome and first-response time.",
    permission: "support:view",
    rangeOn: "created",
    run: async (r) => {
      const rows = await db.ticket.findMany({ where: { createdAt: between(r) }, orderBy: { createdAt: "desc" }, take: MAX + 1, include: { client: { select: { name: true } }, assignee: { select: { name: true } } } });
      const frt = rows.filter((t) => t.firstResponseAt).map((t) => (t.firstResponseAt!.getTime() - t.createdAt.getTime()) / 3600_000);
      const sla = rows.map((t) => slaState(t));
      return {
        columns: ["Ticket", "Created", "Subject", "Client", "Category", "Priority", "Status", "Assignee", "First response (h)", "SLA"],
        rows: rows.slice(0, MAX).map((t, i) => [t.number, d(t.createdAt), t.subject, t.client?.name ?? t.contactEmail, t.category, t.priority, t.status, t.assignee?.name, t.firstResponseAt ? ((t.firstResponseAt.getTime() - t.createdAt.getTime()) / 3600_000).toFixed(1) : "", sla[i]]),
        summary: [["Tickets", String(Math.min(rows.length, MAX))], ["Avg first response", frt.length ? `${(frt.reduce((a, b) => a + b, 0) / frt.length).toFixed(1)} h` : "—"], ["SLA breached", String(sla.filter((s) => s === "BREACHED").length)]],
        truncated: rows.length > MAX,
      };
    },
  },
  {
    key: "marketing",
    title: "Marketing funnel by source",
    description: "Leads → qualified → proposals → won, and won value per currency, by traffic source.",
    permission: "marketing:view",
    rangeOn: "lead created",
    run: async (r) => {
      const f = await funnelBy("source", r, 100);
      return {
        columns: ["Source", "Leads", "Qualified", "Proposals", "Won", "Lead→won %", "Won value"],
        rows: f.map((x) => [x.key, x.leads, x.qualified, x.proposals, x.won, x.leads ? ((x.won / x.leads) * 100).toFixed(1) : "0.0", x.wonValue.map((v) => fmtMoney(v.amount, v.currency)).join(" · ")]),
        summary: [["Sources", String(f.length)], ["Leads", String(f.reduce((s, x) => s + x.leads, 0))], ["Won", String(f.reduce((s, x) => s + x.won, 0))]],
      };
    },
  },
  {
    key: "ai-usage",
    title: "AI usage & cost",
    description: "Model calls, tokens and cost by agent and model in the period.",
    permission: "ai:configure",
    rangeOn: "call time",
    run: async (r) => {
      const g = await db.aIUsage.groupBy({ by: ["agentSlug", "model"], where: { createdAt: between(r) }, _sum: { inputTokens: true, outputTokens: true, costUsd: true }, _count: true, orderBy: { agentSlug: "asc" } });
      const total = g.reduce((s, x) => s + Number(x._sum.costUsd ?? 0), 0);
      return {
        columns: ["Agent", "Model", "Calls", "Input tokens", "Output tokens", "Cost (USD)"],
        rows: g.map((x) => [x.agentSlug, x.model, x._count, x._sum.inputTokens ?? 0, x._sum.outputTokens ?? 0, Number(x._sum.costUsd ?? 0).toFixed(4)]),
        summary: [["Calls", String(g.reduce((s, x) => s + x._count, 0))], ["Cost", `USD ${total.toFixed(2)}`]],
      };
    },
  },
];

export const reportByKey = (k: string) => REPORTS.find((r) => r.key === k);
