import "server-only";
import { z } from "zod";
import { db } from "@/lib/db/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { logActivity } from "@/lib/os/activity";
import { audit } from "@/lib/audit";
import { STAGE_PROBABILITY } from "@/lib/crm/constants";
import { getVisitorPolicy } from "@/lib/visitors/settings";
import type { ToolDef } from "./tools";

/**
 * Minimal controlled tools behind the global execution router: fast counts (Prisma count/groupBy on indexed columns,
 * never loading rows just to count them) and the simple single-record changes people ask for directly. Like every
 * tool they run server-side, need the same permission as the page that shows the data, and are only available to the
 * AI employees whose catalogue entry lists them.
 */
const DAY = 86400_000;
const def = <S extends z.ZodType>(t: ToolDef<S>) => t as unknown as ToolDef;
const id = z.string().trim().min(1).max(40);
const startOfDay = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};
const OPEN_TICKET = ["OPEN", "IN_PROGRESS", "WAITING_FOR_CLIENT"] as const;
const OPEN_TASK = ["TODO", "IN_PROGRESS", "REVIEW", "BLOCKED"] as const;
/** Leads captured by the website's own forms (not typed in, imported or created by an AI employee). */
const NOT_WEBSITE = ["manual", "import", "ai"];
const LIST_SIZE = 10;

/** Growth qualification tiers (Lead.growthTier). "qualified" includes sales-ready: sales-ready is the strictest qualified tier. */
const LEAD_TIER_FILTER: Record<string, Prisma.StringNullableFilter<"Lead"> | null> = {
  qualified: { in: ["QUALIFIED", "SALES_READY"] },
  sales_ready: { equals: "SALES_READY" },
  nurture: { equals: "NURTURE" },
  low_fit: { equals: "LOW_FIT" },
  unscored: null,
};

export const COUNT_TOOLS: ToolDef[] = [
  def({
    name: "countLeads",
    description: "Count leads (not archived) with optional filters, and optionally list up to 10 of them. period: all/today/7d/30d. hot = score label Hot or HIGH/URGENT priority. source 'website' = captured by website forms. country is an ISO code or name. assignedToMe = assigned to the requesting user. tier = growth qualification: qualified (Qualified or Sales-ready), sales_ready, nurture, low_fit, unscored.",
    input: z.object({
      period: z.enum(["all", "today", "7d", "30d"]).default("all"),
      status: z.enum(["NEW", "CONTACTED", "QUALIFIED", "MEETING", "PROPOSAL_SENT", "NEGOTIATION", "WON", "LOST", "ON_HOLD"]).optional(),
      openOnly: z.boolean().optional(),
      hot: z.boolean().optional(),
      source: z.string().trim().max(60).optional(),
      country: z.string().trim().max(60).optional(),
      assignedToMe: z.boolean().optional(),
      tier: z.enum(["qualified", "sales_ready", "nurture", "low_fit", "unscored"]).optional(),
      list: z.boolean().optional(),
    }),
    permissions: ["leads:view"],
    kind: "read",
    risk: "LOW",
    run: async (c, i) => {
      const since = i.period === "today" ? startOfDay() : i.period === "7d" ? new Date(Date.now() - 7 * DAY) : i.period === "30d" ? new Date(Date.now() - 30 * DAY) : undefined;
      const and: Prisma.LeadWhereInput[] = [{ archivedAt: null }];
      if (since) and.push({ createdAt: { gte: since } });
      if (i.status) and.push({ status: i.status });
      if (i.openOnly) and.push({ status: { notIn: ["WON", "LOST"] } });
      if (i.hot) and.push({ OR: [{ scoreLabel: "Hot" }, { priority: { in: ["HIGH", "URGENT"] } }] });
      if (i.source) and.push(i.source.toLowerCase() === "website" ? { formType: { notIn: NOT_WEBSITE } } : { source: { contains: i.source, mode: "insensitive" } });
      if (i.country) {
        const cc = i.country.trim();
        const alias: Record<string, string[]> = { US: ["US", "USA", "United States"], UK: ["UK", "GB", "United Kingdom"], IN: ["IN", "India"], AE: ["AE", "UAE", "United Arab Emirates"] };
        const names = alias[cc.toUpperCase()] ?? Object.values(alias).find((v) => v.some((n) => n.toLowerCase() === cc.toLowerCase())) ?? [cc];
        and.push({ OR: names.map((n) => ({ country: { equals: n, mode: "insensitive" as const } })) });
      }
      if (i.assignedToMe) and.push({ assignedToId: c.user.id });
      if (i.tier) and.push({ mergedIntoId: null, growthTier: LEAD_TIER_FILTER[i.tier] });
      const where = { AND: and };
      const [count, rows] = await Promise.all([db.lead.count({ where }), i.list ? db.lead.findMany({ where, orderBy: { createdAt: "desc" }, take: LIST_SIZE, select: { id: true, ref: true, name: true, company: true, country: true, status: true } }) : Promise.resolve([])]);
      return { data: { count, filters: i, leads: rows.map((l) => ({ ...l, link: `/admin/leads/${l.id}` })) }, records: rows.map((l) => `Lead:${l.id}`) };
    },
  }),
  def({
    name: "countTickets",
    description: "Support ticket counts: open, urgent open, and open past their resolution due time.",
    input: z.object({}),
    permissions: ["support:view"],
    kind: "read",
    risk: "LOW",
    run: async () => {
      const open = { status: { in: [...OPEN_TICKET] } };
      const [n, urgent, pastDue] = await Promise.all([db.ticket.count({ where: open }), db.ticket.count({ where: { ...open, priority: "URGENT" } }), db.ticket.count({ where: { ...open, resolutionDueAt: { lt: new Date() } } })]);
      return { data: { open: n, urgent, pastResolutionDue: pastDue } };
    },
  }),
  def({
    name: "countProjects",
    description: "Project counts: active, at risk (red health), on hold, planned.",
    input: z.object({}),
    permissions: ["projects:view"],
    kind: "read",
    risk: "LOW",
    run: async () => {
      const [g, red] = await Promise.all([db.project.groupBy({ by: ["status"], where: { deletedAt: null }, _count: true }), db.project.count({ where: { deletedAt: null, status: { in: ["ACTIVE", "PLANNED"] }, health: "RED" } })]);
      const c = (s: string) => g.find((x) => x.status === s)?._count ?? 0;
      return { data: { active: c("ACTIVE"), atRisk: red, onHold: c("ON_HOLD"), planned: c("PLANNED") } };
    },
  }),
  def({
    name: "countProposals",
    description: "Pending proposal counts by stage: draft, internal review, sent, viewed (not yet accepted, rejected or expired).",
    input: z.object({}),
    permissions: ["proposals:view"],
    kind: "read",
    risk: "LOW",
    run: async () => {
      const g = await db.proposal.groupBy({ by: ["status"], where: { deletedAt: null, status: { in: ["DRAFT", "INTERNAL_REVIEW", "SENT", "VIEWED"] } }, _count: true });
      const c = (s: string) => g.find((x) => x.status === s)?._count ?? 0;
      return { data: { pending: g.reduce((n, x) => n + x._count, 0), draft: c("DRAFT"), internalReview: c("INTERNAL_REVIEW"), sent: c("SENT"), viewed: c("VIEWED") } };
    },
  }),
  def({
    name: "countClients",
    description: "Client counts by status (e.g. ACTIVE, ONBOARDING).",
    input: z.object({}),
    permissions: ["clients:view"],
    kind: "read",
    risk: "LOW",
    run: async () => {
      const g = await db.client.groupBy({ by: ["status"], where: { deletedAt: null }, _count: true });
      return { data: { total: g.reduce((n, x) => n + x._count, 0), byStatus: Object.fromEntries(g.map((x) => [x.status, x._count])) } };
    },
  }),
  def({
    name: "countContacts",
    description: "Number of client contacts (people at client companies).",
    input: z.object({}),
    permissions: ["clients:view"],
    kind: "read",
    risk: "LOW",
    run: async () => {
      const [total, primary] = await Promise.all([db.clientContact.count({ where: { client: { deletedAt: null } } }), db.clientContact.count({ where: { isPrimary: true, client: { deletedAt: null } } })]);
      return { data: { total, primary } };
    },
  }),
  def({
    name: "countTasks",
    description: "Project task counts. mine=true: the requesting user's open tasks (with up to 10 listed). Otherwise open and overdue tasks across all projects.",
    input: z.object({ mine: z.boolean().optional(), list: z.boolean().optional() }),
    permissions: ["ai:execute"],
    extra: (i: { mine?: boolean }) => (i.mine ? [] : ["projects:view"]),
    kind: "read",
    risk: "LOW",
    run: async (c, i) => {
      const now = new Date();
      const where = { status: { in: [...OPEN_TASK] }, ...(i.mine ? { assigneeId: c.user.id } : {}) };
      const [open, overdue, rows] = await Promise.all([db.task.count({ where }), db.task.count({ where: { ...where, dueDate: { lt: now } } }), i.mine || i.list ? db.task.findMany({ where, orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }], take: LIST_SIZE, select: { id: true, title: true, status: true, dueDate: true, projectId: true } }) : Promise.resolve([])]);
      return { data: { open, overdue, tasks: rows.map((t) => ({ ...t, dueDate: t.dueDate?.toISOString().slice(0, 10) ?? null, link: t.projectId ? `/admin/projects/${t.projectId}` : "/admin/tasks" })) }, records: rows.map((t) => `Task:${t.id}`) };
    },
  }),
  def({
    name: "countLiveVisitors",
    description: "Website visitors active right now (within the live window set in visitor settings), excluding bots.",
    input: z.object({}),
    permissions: ["visitors:view"],
    kind: "read",
    risk: "LOW",
    run: async () => {
      const policy = await getVisitorPolicy();
      const n = await db.visitorSession.count({ where: { lastSeenAt: { gte: new Date(Date.now() - policy.liveWindowMinutes * 60_000) }, endedAt: null, visitor: { isBot: false } } });
      return { data: { online: n, windowMinutes: policy.liveWindowMinutes, trackingEnabled: policy.enabled } };
    },
  }),
  def({
    name: "countApprovals",
    description: "AI actions waiting in the Human Approval Center.",
    input: z.object({}),
    permissions: ["ai:view"],
    kind: "read",
    risk: "LOW",
    run: async () => ({ data: { pending: await db.aIApproval.count({ where: { status: "PENDING" } }) } }),
  }),

  def({
    name: "searchProposals",
    description: "Find proposals by title, number or client name, with status, version and value.",
    input: z.object({ q: z.string().trim().min(1).max(120), limit: z.number().int().min(1).max(10).default(5) }),
    permissions: ["proposals:view"],
    kind: "read",
    risk: "LOW",
    run: async (_c, i) => {
      const has = { contains: i.q, mode: "insensitive" as const };
      const rows = await db.proposal.findMany({ where: { deletedAt: null, OR: [{ title: has }, { number: has }, { client: { name: has } }, { deal: { name: has } }] }, orderBy: { updatedAt: "desc" }, take: i.limit, select: { id: true, number: true, title: true, status: true, total: true, currency: true, client: { select: { name: true } } } });
      return { data: rows.map((p) => ({ id: p.id, number: p.number, name: p.title, status: p.status, total: p.total.toString(), currency: p.currency, client: p.client?.name ?? null, link: `/admin/proposals/${p.id}` })), records: rows.map((p) => `Proposal:${p.id}`) };
    },
  }),

  /* ───────── simple single-record changes (approval-governed like every write tool) ───────── */

  def({
    name: "updateDealStage",
    description: "Move an open deal to another open pipeline stage (not WON/LOST; winning or losing a deal is done on the deal page).",
    input: z.object({ dealId: id, stage: z.enum(["DISCOVERY", "QUALIFICATION", "SOLUTION", "PROPOSAL", "NEGOTIATION", "CONTRACT"]) }),
    permissions: ["deals:manage"],
    kind: "write",
    risk: "MEDIUM",
    preview: async (i) => {
      const d = await db.deal.findFirst({ where: { OR: [{ id: i.dealId }, { number: i.dealId }] }, select: { id: true, number: true, name: true, stage: true } });
      return { summary: `Move deal ${d ? `${d.number} ${d.name}` : i.dealId} from ${d?.stage ?? "?"} to ${i.stage}`, affected: d ? [{ entity: "Deal", id: d.id }] : [], changes: { stage: i.stage } };
    },
    run: async (c, i) => {
      const deal = await db.deal.findFirst({ where: { OR: [{ id: i.dealId }, { number: i.dealId }], deletedAt: null } });
      if (!deal) throw new Error("Deal not found.");
      if (deal.stage === "WON" || deal.stage === "LOST") throw new Error("This deal is closed. Reopen it on the deal page first.");
      await db.$transaction(async (tx) => {
        await tx.deal.update({ where: { id: deal.id }, data: { stage: i.stage, probability: STAGE_PROBABILITY[i.stage], stageChangedAt: new Date() } });
        await logActivity({ type: "STAGE_CHANGED", summary: `${deal.stage} → ${i.stage} (AI ${c.agentSlug})`, actorId: c.user.id === "system" ? null : c.user.id, dealId: deal.id }, tx);
      });
      await audit({ userId: c.user.id === "system" ? null : c.user.id, action: "deal.stage_changed", entity: "Deal", entityId: deal.id, metadata: { from: deal.stage, to: i.stage, aiAgent: c.agentSlug } });
      return { data: { dealId: deal.id, from: deal.stage, to: i.stage, link: `/admin/deals/${deal.id}` }, records: [`Deal:${deal.id}`] };
    },
  }),
  def({
    name: "updateTaskStatus",
    description: "Change a project task's status, e.g. mark it DONE (complete).",
    input: z.object({ taskId: id, status: z.enum(["TODO", "IN_PROGRESS", "REVIEW", "BLOCKED", "DONE"]) }),
    permissions: ["projects:manage"],
    kind: "write",
    risk: "LOW",
    preview: async (i) => {
      const t = await db.task.findUnique({ where: { id: i.taskId }, select: { id: true, title: true, status: true } });
      return { summary: `Set task "${t?.title ?? i.taskId}" from ${t?.status ?? "?"} to ${i.status}`, affected: t ? [{ entity: "Task", id: t.id }] : [], changes: { status: i.status } };
    },
    run: async (c, i) => {
      const t = await db.task.findUnique({ where: { id: i.taskId } });
      if (!t) throw new Error("Task not found.");
      await db.$transaction(async (tx) => {
        await tx.task.update({ where: { id: t.id }, data: { status: i.status, completedAt: i.status === "DONE" ? new Date() : null } });
        if (t.projectId) {
          await logActivity({ type: "TASK", summary: `${t.title}: ${t.status} → ${i.status} (AI ${c.agentSlug})`, actorId: c.user.id === "system" ? null : c.user.id, projectId: t.projectId }, tx);
          // Keep the project's progress in step with its tasks (same rule as the task board).
          const [total, done] = await Promise.all([tx.task.count({ where: { projectId: t.projectId } }), tx.task.count({ where: { projectId: t.projectId, status: "DONE" } })]);
          await tx.project.update({ where: { id: t.projectId }, data: { progress: total ? Math.round((done / total) * 100) : 0 } });
        }
      });
      return { data: { taskId: t.id, from: t.status, to: i.status }, records: [`Task:${t.id}`] };
    },
  }),
  def({
    name: "updateProjectStatus",
    description: "Update a project's status and/or health (GREEN/AMBER/RED).",
    input: z.object({ projectId: id, status: z.enum(["PLANNED", "ACTIVE", "ON_HOLD", "COMPLETED"]).optional(), health: z.enum(["GREEN", "AMBER", "RED"]).optional() }).refine((v) => v.status || v.health, "Give a status or a health"),
    permissions: ["projects:manage"],
    kind: "write",
    risk: "MEDIUM",
    preview: async (i) => {
      const p = await db.project.findFirst({ where: { OR: [{ id: i.projectId }, { number: i.projectId }] }, select: { id: true, number: true, name: true } });
      return { summary: `Update project ${p ? `${p.number} ${p.name}` : i.projectId}: ${[i.status && `status ${i.status}`, i.health && `health ${i.health}`].filter(Boolean).join(", ")}`, affected: p ? [{ entity: "Project", id: p.id }] : [], changes: { status: i.status, health: i.health } };
    },
    run: async (c, i) => {
      const p = await db.project.findFirst({ where: { OR: [{ id: i.projectId }, { number: i.projectId }], deletedAt: null } });
      if (!p) throw new Error("Project not found.");
      await db.project.update({ where: { id: p.id }, data: { status: i.status, health: i.health } });
      await logActivity({ type: "UPDATED", summary: `Project ${[i.status && `status ${p.status} → ${i.status}`, i.health && `health ${p.health} → ${i.health}`].filter(Boolean).join(", ")} (AI ${c.agentSlug})`, actorId: c.user.id === "system" ? null : c.user.id, projectId: p.id });
      return { data: { projectId: p.id, status: i.status ?? p.status, health: i.health ?? p.health, link: `/admin/projects/${p.id}` }, records: [`Project:${p.id}`] };
    },
  }),
  def({
    name: "createContact",
    description: "Add a contact person to a client (name required; email, phone, job title optional).",
    input: z.object({ clientId: id, name: z.string().trim().min(1).max(160), email: z.string().trim().email().max(200).optional(), phone: z.string().trim().max(40).optional(), title: z.string().trim().max(120).optional() }),
    permissions: ["clients:manage"],
    kind: "write",
    risk: "LOW",
    preview: async (i) => {
      const cl = await db.client.findFirst({ where: { OR: [{ id: i.clientId }, { number: i.clientId }] }, select: { id: true, name: true } });
      return { summary: `Add contact ${i.name}${i.email ? ` <${i.email}>` : ""} to ${cl?.name ?? i.clientId}`, affected: cl ? [{ entity: "Client", id: cl.id }] : [], changes: { name: i.name, email: i.email, phone: i.phone, title: i.title } };
    },
    run: async (c, i) => {
      const cl = await db.client.findFirst({ where: { OR: [{ id: i.clientId }, { number: i.clientId }], deletedAt: null }, select: { id: true } });
      if (!cl) throw new Error("Client not found.");
      if (i.email && (await db.clientContact.findFirst({ where: { clientId: cl.id, email: { equals: i.email, mode: "insensitive" } }, select: { id: true } }))) throw new Error("This client already has a contact with that email.");
      const ct = await db.clientContact.create({ data: { clientId: cl.id, name: i.name, email: i.email, phone: i.phone, title: i.title } });
      await audit({ userId: c.user.id === "system" ? null : c.user.id, action: "client.contact.created", entity: "Client", entityId: cl.id, metadata: { contactId: ct.id, aiAgent: c.agentSlug } });
      return { data: { contactId: ct.id, clientId: cl.id, link: `/admin/clients/${cl.id}` }, records: [`Client:${cl.id}`] };
    },
  }),
];
