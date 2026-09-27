import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { db } from "@/lib/db/client";

export const LEAD_STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "MEETING", "PROPOSAL_SENT", "NEGOTIATION", "WON", "LOST", "ON_HOLD"] as const;
export const LEAD_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export type LeadStatusName = (typeof LEAD_STATUSES)[number];
export type LeadPriorityName = (typeof LEAD_PRIORITIES)[number];
export const PAGE_SIZE = 25;

export type LeadFilters = Partial<Record<"q" | "status" | "priority" | "country" | "service" | "product" | "source" | "assigned" | "from" | "to" | "archived" | "sort" | "page", string>>;

const clip = (v?: string, n = 120) => (v ? v.slice(0, n) : undefined);

/** Builds a Prisma filter from URL search params (all values validated/whitelisted). */
export function leadWhere(f: LeadFilters): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = { archivedAt: f.archived === "1" ? { not: null } : null };
  const q = clip(f.q?.trim(), 80);
  if (q) where.OR = [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { company: { contains: q, mode: "insensitive" } }, { ref: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }];
  if (f.status && (LEAD_STATUSES as readonly string[]).includes(f.status)) where.status = f.status as LeadStatusName;
  if (f.priority && (LEAD_PRIORITIES as readonly string[]).includes(f.priority)) where.priority = f.priority as LeadPriorityName;
  if (f.country) where.country = clip(f.country);
  if (f.service) where.service = clip(f.service);
  if (f.product) where.product = clip(f.product);
  if (f.source) where.source = clip(f.source);
  if (f.assigned === "unassigned") where.assignedToId = null;
  else if (f.assigned) where.assignedToId = clip(f.assigned, 40);
  const from = f.from && /^\d{4}-\d{2}-\d{2}$/.test(f.from) ? new Date(`${f.from}T00:00:00Z`) : undefined;
  const to = f.to && /^\d{4}-\d{2}-\d{2}$/.test(f.to) ? new Date(`${f.to}T23:59:59.999Z`) : undefined;
  if (from || to) where.createdAt = { ...(from && { gte: from }), ...(to && { lte: to }) };
  return where;
}

export const SORTS: Record<string, Prisma.LeadOrderByWithRelationInput[]> = {
  newest: [{ createdAt: "desc" }],
  oldest: [{ createdAt: "asc" }],
  name: [{ name: "asc" }],
  score: [{ score: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
  priority: [{ priority: "desc" }, { createdAt: "desc" }],
  followup: [{ nextFollowUpAt: { sort: "asc", nulls: "last" } }],
};

export async function listLeads(f: LeadFilters) {
  const where = leadWhere(f);
  const page = Math.max(1, Math.min(10_000, Number(f.page) || 1));
  const [total, rows] = await Promise.all([
    db.lead.count({ where }),
    db.lead.findMany({
      where,
      orderBy: SORTS[f.sort ?? ""] ?? SORTS.newest,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: { id: true, ref: true, name: true, company: true, email: true, country: true, service: true, product: true, budget: true, source: true, status: true, priority: true, score: true, createdAt: true, nextFollowUpAt: true, assignedTo: { select: { id: true, name: true } } },
    }),
  ]);
  return { total, rows, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** Distinct values for filter dropdowns (top 100 each, index-backed). */
export async function leadFilterOptions() {
  const pick = (field: "country" | "service" | "product" | "source") =>
    db.lead.groupBy({ by: [field], where: { [field]: { not: null } }, _count: { _all: true }, orderBy: { _count: { [field]: "desc" } }, take: 100 }).then((r) => r.map((x) => String(x[field])));
  const [countries, services, products, sources, users] = await Promise.all([pick("country"), pick("service"), pick("product"), pick("source"), db.user.findMany({ where: { active: true }, select: { id: true, name: true, role: true }, orderBy: { name: "asc" } })]);
  return { countries, services, products, sources, users };
}

export const filtersToQuery = (f: LeadFilters, patch: Partial<LeadFilters> = {}) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...f, ...patch })) if (v) q.set(k, v);
  return q.toString();
};
