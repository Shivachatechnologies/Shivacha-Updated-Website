import "server-only";
import { z } from "zod";
import { db } from "@/lib/db/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { can, type Permission } from "@/lib/auth/permissions";
import type { SessionUser } from "@/lib/auth/session";
import { LEAD_STATUSES, LEAD_PRIORITIES } from "@/lib/admin/leads";
import { LIFECYCLE_STAGES } from "@/lib/crm/constants";
import { findDuplicateGroups } from "@/lib/crm/core";
import { dealMetrics } from "@/lib/sales/deals";
import { getCatalog } from "@/lib/sales/catalog";
import { createProposalFromDeal } from "@/lib/sales/proposals";
import { financeSummary, monthlyRevenue } from "@/lib/finance/core";
import { slaState, TICKET_CATEGORIES, TICKET_STATUSES, PRIORITIES } from "@/lib/support/core";
import { funnelBy } from "@/lib/marketing/attribution";
import { sendEmailMessage } from "@/lib/communication/providers";
import { logActivity } from "@/lib/os/activity";
import { notify } from "@/lib/os/notify";

/**
 * Controlled tools — the only way an agent can touch data. Every call is checked against the requesting user's
 * permissions (agents never have more access than the person who asked), validated with zod, and logged on the
 * execution (tools used, records accessed, actions proposed/executed). Mutating tools never run directly in ASSIST
 * mode: they become Human Approval requests executed later under the approver's own permissions.
 */
export interface ToolCtx {
  user: SessionUser;
  agentSlug: string;
  executionId: string | null;
}

export interface ToolResult {
  data: unknown;
  /** "Entity:id" references the tool read or changed (for the audit trail). */
  records?: string[];
}

export interface ApprovalPreview {
  summary: string;
  affected: { entity: string; id: string }[];
  content?: string;
  changes?: Record<string, unknown>;
}

export interface ToolDef<S extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  input: S;
  /** All required. `extra` adds input-dependent permissions (e.g. re-assigning needs leads:assign). */
  permissions: Permission[];
  extra?: (input: z.infer<S>) => Permission[];
  /** read: returns data. draft: produces text only, changes nothing. write: changes data (approval-governed). */
  kind: "read" | "draft" | "write";
  risk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  /** External communication: approval is required in every mode. */
  alwaysApprove?: boolean;
  preview?: (input: z.infer<S>) => Promise<ApprovalPreview>;
  run: (ctx: ToolCtx, input: z.infer<S>) => Promise<ToolResult>;
}

const def = <S extends z.ZodType>(t: ToolDef<S>) => t as unknown as ToolDef;

const DAY = 86400_000;
const id = z.string().trim().min(1).max(40);
const limit = z.number().int().min(1).max(25).default(10);
const q = z.string().trim().max(120).optional();
const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const money = (v: { toString(): string } | null | undefined) => (v == null ? null : v.toString());
const contains = (s?: string) => (s ? { contains: s, mode: "insensitive" as const } : undefined);

/* ───────────────────────── read tools ───────────────────────── */

const TOOLS: ToolDef[] = [
  def({
    name: "getBusinessSummary",
    description: "Live company-wide snapshot: new leads, open pipeline, revenue collected (30d), outstanding and overdue invoices, active/red projects, open/breached tickets, pending AI approvals. Amounts are per currency.",
    input: z.object({}),
    permissions: ["executive:view"],
    kind: "read",
    risk: "LOW",
    run: async () => {
      const now = new Date();
      const since7 = new Date(now.getTime() - 7 * DAY);
      const since30 = new Date(now.getTime() - 30 * DAY);
      const [leads7, leads30, deals, fin, activeProjects, redProjects, openTickets, urgentTickets, overdueTickets, approvals] = await Promise.all([
        db.lead.count({ where: { archivedAt: null, createdAt: { gte: since7 } } }),
        db.lead.count({ where: { archivedAt: null, createdAt: { gte: since30 } } }),
        dealMetrics({ from: since30, to: now }),
        financeSummary({ from: since30, to: now }),
        db.project.count({ where: { deletedAt: null, status: "ACTIVE" } }),
        db.project.findMany({ where: { deletedAt: null, status: { in: ["ACTIVE", "PLANNED"] }, health: "RED" }, select: { id: true, number: true, name: true }, take: 10 }),
        db.ticket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS", "WAITING_FOR_CLIENT"] } } }),
        db.ticket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] }, priority: "URGENT" } }),
        db.ticket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS", "WAITING_FOR_CLIENT"] }, resolutionDueAt: { lt: now } } }),
        db.aIApproval.count({ where: { status: "PENDING" } }),
      ]);
      return {
        data: {
          asOf: now.toISOString(),
          leads: { last7Days: leads7, last30Days: leads30 },
          sales: { openDeals: deals.openCount, openPipeline: deals.pipeline, weightedPipeline: deals.weighted, wonLast30Days: deals.won, wonCountLast30Days: deals.wonCount, winRatePct: deals.winRate },
          finance: { collectedLast30Days: fin.collected, outstanding: fin.outstanding, overdue: fin.overdue, overdueInvoiceCount: fin.overdueCount, paymentsAwaitingConfirmation: fin.pendingPayments },
          projects: { active: activeProjects, redHealth: redProjects },
          support: { open: openTickets, urgent: urgentTickets, pastResolutionDue: overdueTickets },
          pendingAiApprovals: approvals,
        },
        records: redProjects.map((p) => `Project:${p.id}`),
      };
    },
  }),
  def({
    name: "searchLeads",
    description: "Search leads by text (name, company, email, ref) and filters. staleDays = no contact for at least that many days. Returns up to 25.",
    input: z.object({ q, status: z.enum(LEAD_STATUSES).optional(), priority: z.enum(LEAD_PRIORITIES).optional(), staleDays: z.number().int().min(1).max(365).optional(), unassigned: z.boolean().optional(), createdWithinDays: z.number().int().min(1).max(365).optional(), limit }),
    permissions: ["leads:view"],
    kind: "read",
    risk: "LOW",
    run: async (_c, i) => {
      const now = Date.now();
      const where: Prisma.LeadWhereInput = {
        archivedAt: null,
        status: i.status,
        priority: i.priority,
        assignedToId: i.unassigned ? null : undefined,
        createdAt: i.createdWithinDays ? { gte: new Date(now - i.createdWithinDays * DAY) } : undefined,
        ...(i.staleDays ? { status: i.status ?? { notIn: ["WON", "LOST"] }, OR: [{ lastContactedAt: null, createdAt: { lt: new Date(now - i.staleDays * DAY) } }, { lastContactedAt: { lt: new Date(now - i.staleDays * DAY) } }] } : {}),
        ...(i.q ? { AND: [{ OR: [{ name: contains(i.q) }, { company: contains(i.q) }, { email: contains(i.q) }, { ref: contains(i.q) }] }] } : {}),
      };
      const [rows, total] = await Promise.all([
        db.lead.findMany({ where, orderBy: { createdAt: "desc" }, take: i.limit, select: { id: true, ref: true, name: true, company: true, email: true, country: true, service: true, product: true, budget: true, status: true, priority: true, score: true, lifecycleStage: true, estimatedValue: true, currency: true, lastContactedAt: true, nextFollowUpAt: true, createdAt: true, assignedTo: { select: { name: true } } } }),
        db.lead.count({ where }),
      ]);
      return { data: { total, leads: rows.map((l) => ({ ...l, estimatedValue: money(l.estimatedValue), owner: l.assignedTo?.name ?? null, assignedTo: undefined, link: `/admin/leads/${l.id}` })) }, records: rows.map((l) => `Lead:${l.id}`) };
    },
  }),
  def({
    name: "getLead",
    description: "Full lead record with recent notes, activity, follow-ups, deals and communications.",
    input: z.object({ id }),
    permissions: ["leads:view"],
    kind: "read",
    risk: "LOW",
    run: async (_c, i) => {
      const l = await db.lead.findFirst({
        where: { OR: [{ id: i.id }, { ref: i.id }] },
        include: {
          assignedTo: { select: { id: true, name: true } },
          notes: { orderBy: { createdAt: "desc" }, take: 5, select: { body: true, createdAt: true } },
          activities: { orderBy: { createdAt: "desc" }, take: 10, select: { type: true, data: true, createdAt: true } },
          followUps: { orderBy: { dueAt: "desc" }, take: 5, select: { dueAt: true, status: true, note: true } },
          deals: { where: { deletedAt: null }, select: { id: true, number: true, name: true, stage: true, value: true, currency: true } },
          communications: { orderBy: { occurredAt: "desc" }, take: 5, select: { channel: true, direction: true, subject: true, occurredAt: true, status: true } },
        },
      });
      if (!l) return { data: { error: "Lead not found" } };
      const rest = { ...l, extra: undefined };
      return { data: { ...rest, estimatedValue: money(l.estimatedValue), deals: l.deals.map((d) => ({ ...d, value: money(d.value) })), link: `/admin/leads/${l.id}` }, records: [`Lead:${l.id}`] };
    },
  }),
  def({
    name: "searchDeals",
    description: "Search deals. stalledDays = open deals whose stage has not changed for that many days. closingWithinDays = expected close date within N days.",
    input: z.object({ q, stage: z.enum(["DISCOVERY", "QUALIFICATION", "SOLUTION", "PROPOSAL", "NEGOTIATION", "CONTRACT", "WON", "LOST"]).optional(), open: z.boolean().optional(), stalledDays: z.number().int().min(1).max(365).optional(), closingWithinDays: z.number().int().min(1).max(365).optional(), limit }),
    permissions: ["deals:view"],
    kind: "read",
    risk: "LOW",
    run: async (_c, i) => {
      const now = Date.now();
      const where: Prisma.DealWhereInput = {
        deletedAt: null,
        stage: i.stage ?? (i.open || i.stalledDays || i.closingWithinDays ? { notIn: ["WON", "LOST"] } : undefined),
        stageChangedAt: i.stalledDays ? { lt: new Date(now - i.stalledDays * DAY) } : undefined,
        expectedCloseDate: i.closingWithinDays ? { gte: new Date(now), lte: new Date(now + i.closingWithinDays * DAY) } : undefined,
        ...(i.q ? { OR: [{ name: contains(i.q) }, { company: contains(i.q) }, { number: contains(i.q) }] } : {}),
      };
      const rows = await db.deal.findMany({ where, orderBy: [{ value: "desc" }], take: i.limit, select: { id: true, number: true, name: true, company: true, stage: true, value: true, currency: true, probability: true, expectedCloseDate: true, stageChangedAt: true, services: true, owner: { select: { name: true } }, client: { select: { name: true } } } });
      return { data: rows.map((d) => ({ ...d, value: money(d.value), expectedCloseDate: iso(d.expectedCloseDate), daysInStage: Math.floor((now - d.stageChangedAt.getTime()) / DAY), owner: d.owner?.name ?? null, client: d.client?.name ?? null, link: `/admin/deals/${d.id}` })), records: rows.map((d) => `Deal:${d.id}`) };
    },
  }),
  def({
    name: "getDeal",
    description: "Full deal with lead/client, proposals, quotes, contracts, invoices and recent activity.",
    input: z.object({ id }),
    permissions: ["deals:view"],
    kind: "read",
    risk: "LOW",
    run: async (_c, i) => {
      const d = await db.deal.findFirst({
        where: { OR: [{ id: i.id }, { number: i.id }], deletedAt: null },
        include: {
          owner: { select: { name: true } },
          lead: { select: { id: true, name: true, company: true, email: true, country: true, service: true, budget: true, message: true } },
          client: { select: { id: true, name: true, country: true, industry: true } },
          proposals: { where: { deletedAt: null }, select: { id: true, number: true, title: true, status: true, total: true, currency: true } },
          quotes: { where: { deletedAt: null }, select: { number: true, status: true, total: true, currency: true } },
          contracts: { where: { deletedAt: null }, select: { number: true, status: true } },
          invoices: { select: { number: true, status: true, total: true, balanceDue: true, currency: true } },
          activities: { orderBy: { createdAt: "desc" }, take: 10, select: { type: true, summary: true, createdAt: true } },
        },
      });
      if (!d) return { data: { error: "Deal not found" } };
      return { data: { ...d, value: money(d.value), link: `/admin/deals/${d.id}` }, records: [`Deal:${d.id}`] };
    },
  }),
  def({
    name: "getPipelineSummary",
    description: "Sales pipeline metrics (open pipeline, weighted, won/lost, win rate, average deal, cycle length) per currency, plus open-deal counts per stage. Optional period in days for closed deals.",
    input: z.object({ days: z.number().int().min(1).max(730).default(90) }),
    permissions: ["deals:view"],
    kind: "read",
    risk: "LOW",
    run: async (_c, i) => {
      const [m, stages] = await Promise.all([dealMetrics({ from: new Date(Date.now() - i.days * DAY), to: new Date() }), db.deal.groupBy({ by: ["stage"], where: { deletedAt: null, stage: { notIn: ["WON", "LOST"] } }, _count: true })]);
      return { data: { periodDays: i.days, ...m, openByStage: Object.fromEntries(stages.map((s) => [s.stage, s._count])) } };
    },
  }),
  def({
    name: "searchInvoices",
    description: "Search invoices. overdue=true returns issued/partially-paid invoices past their due date.",
    input: z.object({ status: z.enum(["DRAFT", "ISSUED", "PARTIALLY_PAID", "PAID", "VOID"]).optional(), overdue: z.boolean().optional(), clientId: id.optional(), limit }),
    permissions: ["finance:view"],
    kind: "read",
    risk: "LOW",
    run: async (_c, i) => {
      const now = new Date();
      const rows = await db.invoice.findMany({ where: { status: i.overdue ? { in: ["ISSUED", "PARTIALLY_PAID"] } : i.status, dueDate: i.overdue ? { lt: now } : undefined, clientId: i.clientId }, orderBy: i.overdue ? { dueDate: "asc" } : { createdAt: "desc" }, take: i.limit, select: { id: true, number: true, status: true, currency: true, total: true, balanceDue: true, issueDate: true, dueDate: true, client: { select: { id: true, name: true } } } });
      return { data: rows.map((r) => ({ ...r, total: money(r.total), balanceDue: money(r.balanceDue), issueDate: iso(r.issueDate), dueDate: iso(r.dueDate), daysOverdue: r.dueDate && r.dueDate < now && r.status !== "PAID" ? Math.floor((now.getTime() - r.dueDate.getTime()) / DAY) : 0, link: `/admin/finance/invoices/${r.id}` })), records: rows.map((r) => `Invoice:${r.id}`) };
    },
  }),
  def({
    name: "getInvoice",
    description: "Invoice with line items, payment allocations and credit notes.",
    input: z.object({ id }),
    permissions: ["finance:view"],
    kind: "read",
    risk: "LOW",
    run: async (_c, i) => {
      const r = await db.invoice.findFirst({ where: { OR: [{ id: i.id }, { number: i.id }] }, include: { client: { select: { id: true, name: true, billingEmail: true } }, items: { select: { name: true, quantity: true, unitPrice: true, amount: true } }, allocations: { select: { amount: true, payment: { select: { status: true, method: true, receivedAt: true, confirmedAt: true } } } } } });
      if (!r) return { data: { error: "Invoice not found" } };
      return { data: { ...r, link: `/admin/finance/invoices/${r.id}` }, records: [`Invoice:${r.id}`] };
    },
  }),
  def({
    name: "getFinanceSummary",
    description: "Finance KPIs from confirmed records (collected, outstanding, overdue, refunds, expenses, pending confirmations) per currency, plus monthly collected revenue for the last 6 months.",
    input: z.object({ days: z.number().int().min(1).max(730).default(30) }),
    permissions: ["finance:view"],
    kind: "read",
    risk: "LOW",
    run: async (_c, i) => {
      const [s, m] = await Promise.all([financeSummary({ from: new Date(Date.now() - i.days * DAY), to: new Date() }), monthlyRevenue(6)]);
      return { data: { periodDays: i.days, ...s, monthlyCollected: m.rows } };
    },
  }),
  def({
    name: "searchProjects",
    description: "Search projects. delayed=true returns active/planned projects past their target date or with overdue milestones.",
    input: z.object({ q, status: z.enum(["PLANNED", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"]).optional(), health: z.enum(["GREEN", "AMBER", "RED"]).optional(), delayed: z.boolean().optional(), clientId: id.optional(), limit }),
    permissions: ["projects:view"],
    kind: "read",
    risk: "LOW",
    run: async (_c, i) => {
      const now = new Date();
      const rows = await db.project.findMany({
        where: { deletedAt: null, status: i.status ?? (i.delayed ? { in: ["ACTIVE", "PLANNED"] } : undefined), health: i.health, clientId: i.clientId, ...(i.delayed ? { OR: [{ targetDate: { lt: now } }, { milestones: { some: { status: { not: "COMPLETED" }, dueDate: { lt: now } } } }] } : {}), ...(i.q ? { AND: [{ OR: [{ name: contains(i.q) }, { number: contains(i.q) }] }] } : {}) },
        orderBy: { updatedAt: "desc" },
        take: i.limit,
        select: { id: true, number: true, name: true, status: true, health: true, progress: true, targetDate: true, client: { select: { name: true } }, manager: { select: { name: true } }, _count: { select: { tasks: { where: { status: { not: "DONE" }, dueDate: { lt: now } } }, issues: { where: { status: { in: ["OPEN", "IN_PROGRESS"] } } } } } },
      });
      return { data: rows.map((p) => ({ id: p.id, number: p.number, name: p.name, status: p.status, health: p.health, progress: p.progress, targetDate: iso(p.targetDate), client: p.client.name, manager: p.manager?.name ?? null, overdueTasks: p._count.tasks, openIssues: p._count.issues, link: `/admin/projects/${p.id}` })), records: rows.map((p) => `Project:${p.id}`) };
    },
  }),
  def({
    name: "getProject",
    description: "Project detail: milestones, overdue/blocked tasks, open issues, change requests and recent updates.",
    input: z.object({ id }),
    permissions: ["projects:view"],
    kind: "read",
    risk: "LOW",
    run: async (_c, i) => {
      const now = new Date();
      const p = await db.project.findFirst({
        where: { OR: [{ id: i.id }, { number: i.id }], deletedAt: null },
        include: {
          client: { select: { id: true, name: true } },
          manager: { select: { name: true } },
          milestones: { orderBy: { sortOrder: "asc" }, select: { name: true, status: true, dueDate: true, amount: true } },
          tasks: { where: { status: { not: "DONE" }, OR: [{ dueDate: { lt: now } }, { status: "BLOCKED" }] }, take: 20, select: { title: true, status: true, dueDate: true, assignee: { select: { name: true } } } },
          issues: { where: { status: { in: ["OPEN", "IN_PROGRESS"] } }, select: { title: true, severity: true, status: true } },
          changeRequests: { orderBy: { createdAt: "desc" }, take: 10, select: { title: true, status: true, impactCost: true, impactDays: true } },
          updates: { orderBy: { createdAt: "desc" }, take: 3, select: { body: true, health: true, createdAt: true } },
        },
      });
      if (!p) return { data: { error: "Project not found" } };
      return { data: { ...p, link: `/admin/projects/${p.id}` }, records: [`Project:${p.id}`] };
    },
  }),
  def({
    name: "searchTickets",
    description: "Search support tickets. slaBreached=true returns unresolved tickets past their SLA due time.",
    input: z.object({ q, status: z.enum(TICKET_STATUSES).optional(), priority: z.enum(PRIORITIES).optional(), open: z.boolean().optional(), slaBreached: z.boolean().optional(), clientId: id.optional(), limit }),
    permissions: ["support:view"],
    kind: "read",
    risk: "LOW",
    run: async (_c, i) => {
      const now = new Date();
      const openSet = { in: ["OPEN", "IN_PROGRESS", "WAITING_FOR_CLIENT"] as ("OPEN" | "IN_PROGRESS" | "WAITING_FOR_CLIENT")[] };
      const rows = await db.ticket.findMany({
        where: { status: i.status ?? (i.open || i.slaBreached ? openSet : undefined), priority: i.priority, clientId: i.clientId, ...(i.slaBreached ? { OR: [{ resolutionDueAt: { lt: now } }, { firstResponseAt: null, firstResponseDueAt: { lt: now } }] } : {}), ...(i.q ? { AND: [{ OR: [{ subject: contains(i.q) }, { number: contains(i.q) }] }] } : {}) },
        orderBy: { createdAt: "desc" },
        take: i.limit,
        select: { id: true, number: true, subject: true, status: true, priority: true, category: true, createdAt: true, firstResponseAt: true, firstResponseDueAt: true, resolutionDueAt: true, resolvedAt: true, client: { select: { name: true } }, assignee: { select: { name: true } } },
      });
      return { data: rows.map((t) => ({ id: t.id, number: t.number, subject: t.subject, status: t.status, priority: t.priority, category: t.category, client: t.client?.name ?? null, assignee: t.assignee?.name ?? null, sla: slaState(t, now), created: iso(t.createdAt), link: `/admin/support/${t.id}` })), records: rows.map((t) => `Ticket:${t.id}`) };
    },
  }),
  def({
    name: "getTicket",
    description: "Ticket with conversation (latest 15 messages, internal notes marked), SLA state and client/project.",
    input: z.object({ id }),
    permissions: ["support:view"],
    kind: "read",
    risk: "LOW",
    run: async (_c, i) => {
      const t = await db.ticket.findFirst({ where: { OR: [{ id: i.id }, { number: i.id }] }, include: { client: { select: { id: true, name: true } }, project: { select: { number: true, name: true } }, assignee: { select: { name: true } }, messages: { orderBy: { createdAt: "desc" }, take: 15, select: { body: true, internal: true, createdAt: true, author: { select: { name: true } }, portalUser: { select: { name: true } } } } } });
      if (!t) return { data: { error: "Ticket not found" } };
      return { data: { ...t, sla: slaState(t), messages: t.messages.reverse().map((m) => ({ from: m.author?.name ?? m.portalUser?.name ?? "Client", internal: m.internal, at: m.createdAt, body: m.body.slice(0, 1500) })), link: `/admin/support/${t.id}` }, records: [`Ticket:${t.id}`] };
    },
  }),
  def({
    name: "getMarketingSummary",
    description: "Lead funnel by source (leads → qualified → proposals → won, won value per currency) for the period, from real website attribution data. Also active campaign count.",
    input: z.object({ days: z.number().int().min(1).max(730).default(90), dimension: z.enum(["source", "medium", "campaign", "landing"]).default("source") }),
    permissions: ["marketing:view"],
    kind: "read",
    risk: "LOW",
    run: async (_c, i) => {
      const [funnel, campaigns] = await Promise.all([funnelBy(i.dimension, { from: new Date(Date.now() - i.days * DAY), to: new Date() }, 15), db.campaign.count({ where: { status: "ACTIVE" } })]);
      return { data: { periodDays: i.days, dimension: i.dimension, funnel, activeCampaigns: campaigns, note: "Spend/ROI only exists where campaign metrics were entered or synced." } };
    },
  }),
  def({
    name: "searchCampaigns",
    description: "Marketing campaigns with recorded spend/impressions/clicks and attributed lead counts.",
    input: z.object({ status: z.enum(["PLANNED", "ACTIVE", "PAUSED", "COMPLETED"]).optional(), limit }),
    permissions: ["marketing:view"],
    kind: "read",
    risk: "LOW",
    run: async (_c, i) => {
      const rows = await db.campaign.findMany({ where: { status: i.status }, orderBy: { updatedAt: "desc" }, take: i.limit, select: { id: true, name: true, channel: true, status: true, utmCampaign: true, budget: true, currency: true, startDate: true, endDate: true } });
      const out = await Promise.all(rows.map(async (c) => {
        const [m, leads] = await Promise.all([db.campaignMetric.aggregate({ where: { campaignId: c.id }, _sum: { spend: true, impressions: true, clicks: true } }), c.utmCampaign ? db.lead.count({ where: { utmCampaign: c.utmCampaign, archivedAt: null } }) : Promise.resolve(0)]);
        return { ...c, budget: money(c.budget), recordedSpend: money(m._sum.spend), impressions: m._sum.impressions, clicks: m._sum.clicks, attributedLeads: leads };
      }));
      return { data: out, records: rows.map((c) => `Campaign:${c.id}`) };
    },
  }),
  def({
    name: "getContentInventory",
    description: "Counts of published/draft website content (services, products, pages, blog posts, case studies) and the 10 most recent blog posts.",
    input: z.object({}),
    permissions: ["marketing:view"],
    kind: "read",
    risk: "LOW",
    run: async () => {
      const by = async (m: "service" | "product" | "page" | "blogPost" | "caseStudy") => {
        const rows = await (db[m] as unknown as { groupBy: (a: object) => Promise<{ status: string; _count: number }[]> }).groupBy({ by: ["status"], _count: true });
        return Object.fromEntries(rows.map((r) => [r.status, r._count]));
      };
      const [services, products, pages, blog, cases, recent] = await Promise.all([by("service"), by("product"), by("page"), by("blogPost"), by("caseStudy"), db.blogPost.findMany({ where: { status: "PUBLISHED" }, orderBy: { publishedAt: "desc" }, take: 10, select: { title: true, slug: true, publishedAt: true } })]);
      return { data: { services, products, pages, blog, caseStudies: cases, recentPosts: recent } };
    },
  }),
  def({
    name: "getInsights",
    description: "Open AI insights/recommendations (rule-based from live data) visible to this user.",
    input: z.object({ limit }),
    permissions: ["ai:view"],
    kind: "read",
    risk: "LOW",
    run: async (c, i) => {
      const rows = await db.aIRecommendation.findMany({ where: { status: "OPEN" }, orderBy: [{ severity: "desc" }, { createdAt: "desc" }], take: 100 });
      const visible = rows.filter((r) => can(c.user.role, r.permission as Permission)).slice(0, i.limit);
      return { data: visible.map((r) => ({ type: r.type, title: r.title, body: r.body, severity: r.severity, href: r.href })) };
    },
  }),
  def({
    name: "recommendServices",
    description: "Match a requirement description against the Shivacha service & product catalogue (names, descriptions, modules — no prices). Returns ranked matches.",
    input: z.object({ requirement: z.string().trim().min(3).max(2000) }),
    permissions: ["leads:view"],
    kind: "read",
    risk: "LOW",
    run: async (_c, i) => {
      const words = new Set(i.requirement.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w)));
      const scored = getCatalog().map((c) => {
        const hay = `${c.name} ${c.description} ${(c.modules ?? []).join(" ")}`.toLowerCase();
        const hits = [...words].filter((w) => hay.includes(w));
        return { kind: c.kind, name: c.name, slug: c.slug, description: c.description, timeline: c.timeline ?? null, matched: hits, score: hits.length + (c.name.toLowerCase().split(/\s+/).some((w) => words.has(w)) ? 2 : 0) };
      });
      return { data: scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, 6) };
    },
  }),
  def({
    name: "searchKnowledge",
    description: "Search published Knowledge Base articles (title, excerpt, tags, body). Returns snippets with links to cite.",
    input: z.object({ q: z.string().trim().min(2).max(120), limit: z.number().int().min(1).max(10).default(5) }),
    permissions: ["knowledge:view"],
    kind: "read",
    risk: "LOW",
    run: async (_c, i) => {
      const terms = i.q.split(/\s+/).filter((w) => w.length > 2).slice(0, 6);
      const rows = await db.knowledgeArticle.findMany({
        where: { status: "PUBLISHED", OR: [{ title: contains(i.q) }, { excerpt: contains(i.q) }, { tags: { hasSome: terms.map((t) => t.toLowerCase()) } }, ...terms.map((t) => ({ body: contains(t) }))] },
        orderBy: { updatedAt: "desc" },
        take: i.limit,
        select: { id: true, slug: true, title: true, excerpt: true, body: true, category: true, visibility: true, updatedAt: true },
      });
      return { data: rows.map((a) => ({ title: a.title, category: a.category, visibility: a.visibility, excerpt: a.excerpt, snippet: snippet(a.body, terms), link: `/admin/knowledge/${a.id}`, publicLink: a.visibility === "PUBLIC" ? `/help/${a.slug}` : null })), records: rows.map((a) => `KnowledgeArticle:${a.id}`) };
    },
  }),
  def({
    name: "findDuplicates",
    description: "Groups of active leads sharing an email or phone number (possible duplicates to merge).",
    input: z.object({ limit }),
    permissions: ["leads:view"],
    kind: "read",
    risk: "LOW",
    run: async (_c, i) => {
      const { groups, total } = await findDuplicateGroups(1, i.limit);
      const ids = groups.flatMap((g) => g.ids);
      const leads = await db.lead.findMany({ where: { id: { in: ids } }, select: { id: true, ref: true, name: true, company: true, status: true, createdAt: true } });
      const by = new Map(leads.map((l) => [l.id, l]));
      return { data: { totalGroups: total, groups: groups.map((g) => ({ matchBy: g.by, value: g.key, leads: g.ids.map((x) => by.get(x)).filter(Boolean) })), mergeAt: "/admin/crm/duplicates" }, records: ids.map((x) => `Lead:${x}`) };
    },
  }),
  def({
    name: "findDataGaps",
    description: "Active leads missing key information (phone, company, country, owner, service), with counts and examples.",
    input: z.object({ limit }),
    permissions: ["leads:view"],
    kind: "read",
    risk: "LOW",
    run: async (_c, i) => {
      const base = { archivedAt: null, status: { notIn: ["WON" as const, "LOST" as const] } };
      const checks: [string, Prisma.LeadWhereInput][] = [["phone", { phone: null }], ["company", { company: null }], ["country", { country: null }], ["owner", { assignedToId: null }], ["service", { service: null, product: null }]];
      const out = await Promise.all(checks.map(async ([field, w]) => {
        const where = { ...base, ...w };
        const [count, sample] = await Promise.all([db.lead.count({ where }), db.lead.findMany({ where, take: Math.min(5, i.limit), orderBy: { createdAt: "desc" }, select: { id: true, ref: true, name: true } })]);
        return { missing: field, count, examples: sample.map((l) => ({ ...l, link: `/admin/leads/${l.id}` })) };
      }));
      return { data: out };
    },
  }),
  def({
    name: "getOverdueFollowUps",
    description: "Pending follow-ups that are past due, oldest first, with lead and assignee.",
    input: z.object({ limit }),
    permissions: ["leads:view"],
    kind: "read",
    risk: "LOW",
    run: async (_c, i) => {
      const rows = await db.followUp.findMany({ where: { status: "PENDING", dueAt: { lt: new Date() } }, orderBy: { dueAt: "asc" }, take: i.limit, select: { id: true, dueAt: true, note: true, lead: { select: { id: true, ref: true, name: true, company: true, status: true } }, assignedTo: { select: { name: true } } } });
      const total = await db.followUp.count({ where: { status: "PENDING", dueAt: { lt: new Date() } } });
      return { data: { total, followUps: rows.map((f) => ({ ...f, daysOverdue: Math.floor((Date.now() - f.dueAt.getTime()) / DAY), assignedTo: f.assignedTo?.name ?? null, link: `/admin/leads/${f.lead.id}` })) }, records: rows.map((f) => `Lead:${f.lead.id}`) };
    },
  }),
  def({
    name: "searchClients",
    description: "Search client accounts by name/number with status, owner and country.",
    input: z.object({ q, status: z.enum(["ONBOARDING", "ACTIVE", "INACTIVE", "CHURNED"]).optional(), limit }),
    permissions: ["clients:view"],
    kind: "read",
    risk: "LOW",
    run: async (_c, i) => {
      const rows = await db.client.findMany({ where: { deletedAt: null, status: i.status, ...(i.q ? { OR: [{ name: contains(i.q) }, { number: contains(i.q) }, { legalName: contains(i.q) }] } : {}) }, orderBy: { updatedAt: "desc" }, take: i.limit, select: { id: true, number: true, name: true, status: true, country: true, industry: true, currency: true, accountOwner: { select: { name: true } } } });
      return { data: rows.map((c) => ({ ...c, accountOwner: c.accountOwner?.name ?? null, link: `/admin/clients/${c.id}` })), records: rows.map((c) => `Client:${c.id}`) };
    },
  }),
  def({
    name: "getClient",
    description: "Client account: contacts, deals, projects (health), open invoices, open tickets and recent activity.",
    input: z.object({ id }),
    permissions: ["clients:view"],
    kind: "read",
    risk: "LOW",
    run: async (c, i) => {
      const fin = can(c.user.role, "finance:view");
      const sup = can(c.user.role, "support:view");
      const cl = await db.client.findFirst({
        where: { OR: [{ id: i.id }, { number: i.id }], deletedAt: null },
        include: {
          accountOwner: { select: { name: true } },
          contacts: { select: { name: true, email: true, title: true, isPrimary: true } },
          deals: { where: { deletedAt: null }, select: { number: true, name: true, stage: true, value: true, currency: true } },
          projects: { where: { deletedAt: null }, select: { number: true, name: true, status: true, health: true, progress: true, targetDate: true } },
          invoices: fin ? { where: { status: { in: ["ISSUED", "PARTIALLY_PAID"] } }, select: { number: true, balanceDue: true, currency: true, dueDate: true } } : false,
          tickets: sup ? { where: { status: { in: ["OPEN", "IN_PROGRESS", "WAITING_FOR_CLIENT"] } }, select: { number: true, subject: true, priority: true, status: true } } : false,
          activities: { orderBy: { createdAt: "desc" }, take: 10, select: { type: true, summary: true, createdAt: true } },
        },
      });
      if (!cl) return { data: { error: "Client not found" } };
      return { data: { ...cl, invoices: fin ? cl.invoices : "not permitted", tickets: sup ? cl.tickets : "not permitted", link: `/admin/clients/${cl.id}` }, records: [`Client:${cl.id}`] };
    },
  }),
  def({
    name: "webResearch",
    description: "Public web research. Only available when a web search provider is configured; otherwise reports that it is not connected.",
    input: z.object({ query: z.string().trim().min(3).max(300) }),
    permissions: ["ai:execute"],
    kind: "read",
    risk: "LOW",
    run: async () => ({ data: { connected: false, message: "Web research provider not connected (set AI_WEB_SEARCH=true with an Anthropic key). Only internal records can be used — label anything else as AI inference." } }),
  }),

  /* ───────────────────────── draft tools (no data changes) ───────────────────────── */

  def({
    name: "draftEmail",
    description: "Record an email DRAFT for a human to review. Does not send. Use sendEmail to request approval to send.",
    input: z.object({ to: z.string().trim().max(160).optional(), subject: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(8000), leadId: id.optional(), clientId: id.optional() }),
    permissions: ["ai:execute"],
    kind: "draft",
    risk: "LOW",
    run: async (_c, i) => ({ data: { drafted: true, draft: i } }),
  }),
  def({
    name: "draftProjectUpdate",
    description: "Record a project status update / client update DRAFT (not published).",
    input: z.object({ projectId: id, audience: z.enum(["INTERNAL", "CLIENT"]).default("INTERNAL"), health: z.enum(["GREEN", "AMBER", "RED"]).optional(), body: z.string().trim().min(1).max(8000) }),
    permissions: ["projects:view"],
    kind: "draft",
    risk: "LOW",
    run: async (_c, i) => ({ data: { drafted: true, draft: i }, records: [`Project:${i.projectId}`] }),
  }),
  def({
    name: "draftTicketReply",
    description: "Record a support reply DRAFT for an agent to review (not sent to the client).",
    input: z.object({ ticketId: id, body: z.string().trim().min(1).max(8000), citations: z.array(z.string().max(300)).max(10).optional() }),
    permissions: ["support:view"],
    kind: "draft",
    risk: "LOW",
    run: async (_c, i) => ({ data: { drafted: true, draft: i }, records: [`Ticket:${i.ticketId}`] }),
  }),

  /* ───────────────────────── write tools (approval-governed) ───────────────────────── */

  def({
    name: "createNotification",
    description: "Send an in-app notification to yourself or to a team (by permission). Internal only.",
    input: z.object({ audience: z.enum(["me", "sales", "finance", "support", "projects", "executives"]).default("me"), title: z.string().trim().min(1).max(200), body: z.string().trim().max(1000).optional(), href: z.string().trim().regex(/^\/admin\//, "Internal /admin link only").max(300).optional() }),
    permissions: ["ai:execute"],
    kind: "write",
    risk: "LOW",
    preview: async (i) => ({ summary: `Notify ${i.audience}: ${i.title}`, affected: [], content: i.body }),
    run: async (c, i) => {
      const perm: Record<string, Permission | undefined> = { me: undefined, sales: "leads:assign", finance: "finance:manage", support: "support:manage", projects: "projects:manage", executives: "executive:view" };
      const n = await notify({ type: "ai.briefing", title: i.title, body: i.body, href: i.href, userIds: i.audience === "me" ? [c.user.id] : [], permission: perm[i.audience] });
      return { data: { notified: n } };
    },
  }),
  def({
    name: "createLeadActivity",
    description: "Add a note to a lead's timeline (e.g. call summary, meeting brief, qualification notes).",
    input: z.object({ leadId: id, note: z.string().trim().min(1).max(5000) }),
    permissions: ["leads:edit"],
    kind: "write",
    risk: "LOW",
    preview: async (i) => ({ summary: `Add note to lead ${await leadLabel(i.leadId)}`, affected: [{ entity: "Lead", id: i.leadId }], content: i.note }),
    run: async (c, i) => {
      const lead = await db.lead.findUnique({ where: { id: i.leadId }, select: { id: true } });
      if (!lead) throw new Error("Lead not found");
      await db.$transaction([db.leadNote.create({ data: { leadId: i.leadId, authorId: c.user.id, body: `[AI ${c.agentSlug}] ${i.note}` } }), db.leadActivity.create({ data: { leadId: i.leadId, actorId: c.user.id, type: "NOTE_ADDED", data: { aiAgent: c.agentSlug } } })]);
      return { data: { ok: true }, records: [`Lead:${i.leadId}`] };
    },
  }),
  def({
    name: "createFollowUp",
    description: "Schedule a follow-up on a lead. dueAt is ISO date/time. Assigns to the lead owner unless assignedToId is given.",
    input: z.object({ leadId: id, dueAt: z.string().trim().refine((v) => !Number.isNaN(Date.parse(v)), "Invalid date"), note: z.string().trim().max(1000).optional(), assignedToId: id.optional() }),
    permissions: ["followups:manage"],
    kind: "write",
    risk: "LOW",
    preview: async (i) => ({ summary: `Follow-up on ${await leadLabel(i.leadId)} due ${new Date(i.dueAt).toISOString().slice(0, 16).replace("T", " ")} UTC`, affected: [{ entity: "Lead", id: i.leadId }], content: i.note }),
    run: async (c, i) => {
      const lead = await db.lead.findUnique({ where: { id: i.leadId }, select: { id: true, assignedToId: true } });
      if (!lead) throw new Error("Lead not found");
      const assignee = i.assignedToId ? await activeUser(i.assignedToId) : lead.assignedToId ?? c.user.id;
      const dueAt = new Date(i.dueAt);
      await db.$transaction([
        db.followUp.create({ data: { leadId: lead.id, dueAt, note: i.note, assignedToId: assignee, createdById: c.user.id } }),
        db.lead.update({ where: { id: lead.id }, data: { nextFollowUpAt: dueAt } }),
        db.leadActivity.create({ data: { leadId: lead.id, actorId: c.user.id, type: "FOLLOWUP_SCHEDULED", data: { dueAt: dueAt.toISOString(), aiAgent: c.agentSlug } } }),
      ]);
      return { data: { ok: true, dueAt }, records: [`Lead:${lead.id}`] };
    },
  }),
  def({
    name: "createTask",
    description: "Create a task linked to a project, lead or deal (exactly one). dueDate ISO date.",
    input: z
      .object({ title: z.string().trim().min(1).max(200), description: z.string().trim().max(4000).optional(), projectId: id.optional(), leadId: id.optional(), dealId: id.optional(), assigneeId: id.optional(), dueDate: z.string().trim().refine((v) => !Number.isNaN(Date.parse(v)), "Invalid date").optional(), priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM") })
      .refine((v) => [v.projectId, v.leadId, v.dealId].filter(Boolean).length === 1, "Link the task to exactly one project, lead or deal"),
    permissions: [],
    extra: (i) => [i.projectId ? "projects:manage" : i.dealId ? "deals:manage" : "leads:edit"],
    kind: "write",
    risk: "LOW",
    preview: async (i) => ({ summary: `Create task "${i.title}"`, affected: [i.projectId ? { entity: "Project", id: i.projectId } : i.dealId ? { entity: "Deal", id: i.dealId } : { entity: "Lead", id: i.leadId! }], content: i.description }),
    run: async (c, i) => {
      const assigneeId = i.assigneeId ? await activeUser(i.assigneeId) : null;
      const t = await db.task.create({ data: { title: i.title, description: i.description, projectId: i.projectId, leadId: i.leadId, dealId: i.dealId, assigneeId, createdById: c.user.id, dueDate: i.dueDate ? new Date(i.dueDate) : null, priority: i.priority, source: `ai:${c.agentSlug}` } });
      if (i.projectId || i.dealId) await logActivity({ type: "TASK_CREATED", summary: `Task: ${i.title}`, actorId: c.user.id, aiAgent: c.agentSlug, projectId: i.projectId, dealId: i.dealId });
      if (assigneeId && assigneeId !== c.user.id) await notify({ type: "task.assigned", title: `Task assigned: ${i.title}`, href: i.projectId ? `/admin/projects/${i.projectId}?tab=tasks` : "/admin/tasks", userIds: [assigneeId] });
      return { data: { ok: true, taskId: t.id }, records: [`Task:${t.id}`] };
    },
  }),
  def({
    name: "updateLead",
    description: "Change a lead's status, priority, lifecycle stage, estimated value or owner. Changing the owner needs lead-assignment permission.",
    input: z.object({ leadId: id, status: z.enum(LEAD_STATUSES).optional(), priority: z.enum(LEAD_PRIORITIES).optional(), lifecycleStage: z.enum(LIFECYCLE_STAGES).optional(), estimatedValue: z.string().regex(/^\d{1,12}(\.\d{1,2})?$/).optional(), assignedToId: id.optional(), reason: z.string().trim().max(500).optional() }),
    permissions: ["leads:edit"],
    extra: (i) => (i.assignedToId ? ["leads:assign"] : []),
    kind: "write",
    risk: "MEDIUM",
    preview: async (i) => {
      const l = await db.lead.findUnique({ where: { id: i.leadId }, select: { name: true, ref: true, status: true, priority: true, lifecycleStage: true, estimatedValue: true, assignedToId: true } });
      const changes = Object.fromEntries(Object.entries({ status: i.status, priority: i.priority, lifecycleStage: i.lifecycleStage, estimatedValue: i.estimatedValue, assignedToId: i.assignedToId }).filter(([, v]) => v !== undefined).map(([k, v]) => [k, { from: l ? String((l as Record<string, unknown>)[k] ?? "—") : "?", to: v }]));
      return { summary: `Update lead ${l ? `${l.name} (${l.ref})` : i.leadId}`, affected: [{ entity: "Lead", id: i.leadId }], changes, content: i.reason };
    },
    run: async (c, i) => {
      const lead = await db.lead.findUnique({ where: { id: i.leadId }, select: { id: true, status: true } });
      if (!lead) throw new Error("Lead not found");
      const assignedToId = i.assignedToId ? await activeUser(i.assignedToId) : undefined;
      const data: Prisma.LeadUncheckedUpdateInput = { status: i.status, priority: i.priority, lifecycleStage: i.lifecycleStage, estimatedValue: i.estimatedValue, assignedToId };
      await db.$transaction([
        db.lead.update({ where: { id: lead.id }, data }),
        db.leadActivity.create({ data: { leadId: lead.id, actorId: c.user.id, type: i.status && i.status !== lead.status ? "STATUS_CHANGED" : "UPDATED", data: { aiAgent: c.agentSlug, changes: JSON.parse(JSON.stringify({ ...data, reason: i.reason })) } } }),
      ]);
      if (assignedToId && assignedToId !== c.user.id) await notify({ type: "lead.assigned", title: "Lead assigned to you", href: `/admin/leads/${lead.id}`, userIds: [assignedToId] });
      return { data: { ok: true }, records: [`Lead:${lead.id}`] };
    },
  }),
  def({
    name: "sendEmail",
    description: "Request to send an email to a customer. ALWAYS requires human approval; the approver can edit before sending. Link it to the lead/client/deal/ticket it concerns.",
    input: z.object({ to: z.string().trim().email().max(160), subject: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(10000), leadId: id.optional(), clientId: id.optional(), dealId: id.optional(), ticketId: id.optional() }),
    permissions: ["communication:send"],
    kind: "write",
    risk: "MEDIUM",
    alwaysApprove: true,
    preview: async (i) => ({ summary: `Email ${i.to}: ${i.subject}`, affected: [i.leadId && { entity: "Lead", id: i.leadId }, i.clientId && { entity: "Client", id: i.clientId }, i.dealId && { entity: "Deal", id: i.dealId }, i.ticketId && { entity: "Ticket", id: i.ticketId }].filter((x): x is { entity: string; id: string } => !!x), content: `To: ${i.to}\nSubject: ${i.subject}\n\n${i.body}` }),
    run: async (c, i) => {
      const r = await sendEmailMessage(i.to, i.subject, i.body);
      await db.communication.create({ data: { channel: "EMAIL", direction: "OUTBOUND", status: r.sent ? "SENT" : "FAILED", subject: i.subject, body: i.body, toAddress: i.to, fromAddress: c.user.email, provider: r.provider, userId: c.user.id, error: r.error?.slice(0, 300), leadId: i.leadId, clientId: i.clientId, dealId: i.dealId, ticketId: i.ticketId, meta: { aiAgent: c.agentSlug } } });
      if (!r.sent) throw new Error(r.error ? `Email not sent: ${r.error}` : "Email is not connected (configure SMTP or Gmail OAuth).");
      return { data: { sent: true, provider: r.provider }, records: [i.leadId && `Lead:${i.leadId}`, i.clientId && `Client:${i.clientId}`].filter((x): x is string => !!x) };
    },
  }),
  def({
    name: "createProposalDraft",
    description: "Create a DRAFT proposal from a deal (line items from the deal's services/products and the catalogue; prices from the deal value only). Optional narrative sections override the defaults. Never sends or approves.",
    input: z.object({ dealId: id, title: z.string().trim().max(200).optional(), summary: z.string().max(5000).optional(), scope: z.string().max(20000).optional(), deliverables: z.string().max(10000).optional(), assumptions: z.string().max(10000).optional(), timeline: z.string().max(5000).optional(), milestones: z.string().max(5000).optional(), paymentSchedule: z.string().max(5000).optional() }),
    permissions: ["proposals:manage"],
    kind: "write",
    risk: "LOW",
    preview: async (i) => {
      const d = await db.deal.findUnique({ where: { id: i.dealId }, select: { number: true, name: true } });
      return { summary: `Create DRAFT proposal for deal ${d ? `${d.number} ${d.name}` : i.dealId}`, affected: [{ entity: "Deal", id: i.dealId }], content: [i.summary, i.scope && `Scope:\n${i.scope}`, i.deliverables && `Deliverables:\n${i.deliverables}`, i.timeline && `Timeline:\n${i.timeline}`, i.paymentSchedule && `Payment schedule:\n${i.paymentSchedule}`].filter(Boolean).join("\n\n") };
    },
    run: async (c, i) => {
      const { dealId, title, ...content } = i;
      const p = await createProposalFromDeal(dealId, c.user.id, { aiGenerated: true, title, content: Object.fromEntries(Object.entries(content).filter(([, v]) => v)) });
      return { data: { ok: true, proposalId: p.id, number: p.number, status: "DRAFT", link: `/admin/proposals/${p.id}` }, records: [`Proposal:${p.id}`, `Deal:${dealId}`] };
    },
  }),
  def({
    name: "updateTicket",
    description: "Change a ticket's status/priority/category/assignee and optionally add an INTERNAL note (never visible to the client).",
    input: z.object({ ticketId: id, status: z.enum(TICKET_STATUSES).optional(), priority: z.enum(PRIORITIES).optional(), category: z.enum(TICKET_CATEGORIES).optional(), assigneeId: id.optional(), internalNote: z.string().trim().max(5000).optional() }),
    permissions: ["support:manage"],
    kind: "write",
    risk: "MEDIUM",
    preview: async (i) => {
      const t = await db.ticket.findUnique({ where: { id: i.ticketId }, select: { number: true, subject: true, status: true, priority: true, category: true } });
      const changes = Object.fromEntries(Object.entries({ status: i.status, priority: i.priority, category: i.category, assigneeId: i.assigneeId }).filter(([, v]) => v !== undefined).map(([k, v]) => [k, { from: t ? String((t as Record<string, unknown>)[k] ?? "—") : "?", to: v }]));
      return { summary: `Update ticket ${t ? `${t.number} ${t.subject}` : i.ticketId}`, affected: [{ entity: "Ticket", id: i.ticketId }], changes, content: i.internalNote };
    },
    run: async (c, i) => {
      const t = await db.ticket.findUnique({ where: { id: i.ticketId }, select: { id: true, status: true, clientId: true } });
      if (!t) throw new Error("Ticket not found");
      const assigneeId = i.assigneeId ? await activeUser(i.assigneeId) : undefined;
      const resolved = i.status === "RESOLVED" && t.status !== "RESOLVED";
      await db.$transaction(async (tx) => {
        await tx.ticket.update({ where: { id: t.id }, data: { status: i.status, priority: i.priority, category: i.category, assigneeId, resolvedAt: resolved ? new Date() : undefined, closedAt: i.status === "CLOSED" ? new Date() : undefined } });
        if (i.internalNote) await tx.ticketMessage.create({ data: { ticketId: t.id, authorId: c.user.id, body: i.internalNote, internal: true, aiDrafted: true } });
        await logActivity({ type: "UPDATED", summary: `Ticket updated by AI ${c.agentSlug} (approved)`, data: { status: i.status, priority: i.priority, category: i.category, assigneeId }, actorId: c.user.id, aiAgent: c.agentSlug, ticketId: t.id, clientId: t.clientId }, tx);
      });
      return { data: { ok: true }, records: [`Ticket:${t.id}`] };
    },
  }),
];

const STOP = new Set(["the", "and", "for", "with", "our", "you", "your", "that", "this", "are", "need", "want", "from", "have", "will", "can", "into", "platform", "solution", "system"]);

function snippet(body: string, terms: string[]) {
  const text = body.replace(/[#*_>`]/g, "").replace(/\s+/g, " ");
  const at = terms.map((t) => text.toLowerCase().indexOf(t.toLowerCase())).filter((x) => x >= 0).sort((a, b) => a - b)[0] ?? 0;
  return text.slice(Math.max(0, at - 120), at + 380);
}

async function leadLabel(leadId: string) {
  const l = await db.lead.findUnique({ where: { id: leadId }, select: { name: true, ref: true } });
  return l ? `${l.name} (${l.ref})` : leadId;
}

async function activeUser(userId: string) {
  const u = await db.user.findFirst({ where: { id: userId, active: true }, select: { id: true } });
  if (!u) throw new Error("Assignee is not an active user");
  return u.id;
}

export const TOOL_NAMES = TOOLS.map((t) => t.name);
export const getTool = (name: string) => TOOLS.find((t) => t.name === name);
export const toolPermissions = (t: ToolDef, input?: unknown): Permission[] => [...t.permissions, ...(t.extra && input !== undefined ? t.extra(input) : [])];

/** JSON Schema for the model (zod v4 native conversion). */
export function toolSchema(t: ToolDef): Record<string, unknown> {
  const s = z.toJSONSchema(t.input, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
  delete s.$schema;
  return s;
}
