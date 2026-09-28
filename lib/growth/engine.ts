import "server-only";
import { db } from "@/lib/db/client";
import { Prisma } from "@/lib/generated/prisma/client";
import { newLeadId } from "@/lib/leads/id";
import { queueEvent } from "@/lib/automation/engine";
import { notify } from "@/lib/os/notify";
import { checkBudget, type BudgetKind } from "./policy";
import { getGrowthSettings } from "./settings";
import { qualify, shouldAdvanceStage, TIER_LIFECYCLE, type Icp, type Qualification } from "./qualify";
import { normalizeEmail } from "./email-rules";

const DAY = 86400_000;
const utcDay = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const utcMonth = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
const json = (v: unknown) => JSON.parse(JSON.stringify(v ?? null)) as Prisma.InputJsonValue;

/* ───────────────────────── budgets ───────────────────────── */

const MONTHLY: Partial<Record<BudgetKind, true>> = { creativeMonthly: true, videoMonthly: true };
const COUNTED: Partial<Record<BudgetKind, true>> = { emailDaily: true, socialDaily: true };

export async function usageOf(kind: BudgetKind): Promise<number> {
  const since = MONTHLY[kind] ? utcMonth() : utcDay();
  const r = await db.growthUsage.aggregate({ where: { kind, date: { gte: since } }, _sum: { units: true, amount: true } });
  return COUNTED[kind] ? (r._sum.units ?? 0) : Number(r._sum.amount ?? 0);
}

/** Checks the configured budget before an action. Never silently exceeds: over-budget work is refused. */
export async function budgetGate(kind: BudgetKind, add: number) {
  const s = await getGrowthSettings();
  return checkBudget(s.budgets[kind], await usageOf(kind), add);
}

export async function recordUsage(kind: BudgetKind, units: number, amount = 0) {
  const date = utcDay();
  await db.growthUsage.upsert({ where: { date_kind: { date, kind } }, create: { date, kind, units, amount }, update: { units: { increment: units }, amount: { increment: amount } } });
}

/* ───────────────────────── leads: dedupe into the existing CRM ───────────────────────── */

export interface GrowthLeadInput {
  email: string;
  name?: string | null;
  company?: string | null;
  website?: string | null;
  phone?: string | null;
  country?: string | null;
  service?: string | null;
  message?: string | null;
  source: string;
  campaign?: string | null;
  utm?: { source?: string | null; medium?: string | null; campaign?: string | null; content?: string | null; term?: string | null };
  formType?: string;
  /** Who created it: a user id, or an agent/provider label. */
  createdBy?: string | null;
}

/**
 * Finds the existing CRM lead for an email (case-insensitive, ignoring archived/merged records) or creates one in the
 * existing Lead table. Never creates a duplicate: repeated calls for the same person return the same lead and only
 * fill fields that were empty.
 */
export async function upsertGrowthLead(i: GrowthLeadInput): Promise<{ id: string; created: boolean }> {
  const email = normalizeEmail(i.email);
  const existing = await db.lead.findFirst({ where: { email: { equals: email, mode: "insensitive" }, archivedAt: null, mergedIntoId: null }, orderBy: { createdAt: "asc" } });
  if (existing) {
    const fill: Prisma.LeadUpdateInput = {};
    if (!existing.company && i.company) fill.company = i.company.slice(0, 200);
    if (!existing.phone && i.phone) fill.phone = i.phone.slice(0, 40);
    if (!existing.country && i.country) fill.country = i.country.slice(0, 80);
    if (!existing.website && i.website) fill.website = i.website.slice(0, 300);
    if (!existing.service && i.service) fill.service = i.service.slice(0, 120);
    await db.lead.update({ where: { id: existing.id }, data: { ...fill, activities: { create: { type: "GROWTH_TOUCH", data: json({ source: i.source, campaign: i.campaign, note: "Matched existing lead (no duplicate created)" }) } } } });
    return { id: existing.id, created: false };
  }
  const row = await db.lead.create({
    data: {
      ref: newLeadId(),
      name: (i.name ?? "").trim().slice(0, 200) || email.split("@")[0],
      email,
      company: i.company || null,
      website: i.website || null,
      phone: i.phone || null,
      country: i.country || null,
      service: i.service || null,
      message: i.message || null,
      formType: i.formType ?? "growth",
      source: i.utm?.source || i.source,
      campaign: i.campaign || i.utm?.campaign || null,
      utmSource: i.utm?.source || null,
      utmMedium: i.utm?.medium || null,
      utmCampaign: i.utm?.campaign || null,
      utmContent: i.utm?.content || null,
      utmTerm: i.utm?.term || null,
      extra: json({ growth: { createdBy: i.createdBy ?? null } }),
      activities: { create: { type: "CREATED", data: json({ source: i.source, via: "growth" }) } },
    },
    select: { id: true, name: true, email: true, company: true, assignedToId: true },
  });
  queueEvent({ trigger: "NEW_LEAD", entity: "Lead", entityId: row.id, ownerId: row.assignedToId, payload: { lead: row } });
  return { id: row.id, created: true };
}

/* ───────────────────────── qualification ───────────────────────── */

async function engagementOf(leadId: string, email: string) {
  const [visitors, enrollments, lead] = await Promise.all([
    db.visitor.findMany({ where: { leadId }, select: { sessionsCount: true, pageViews: true, intentSignals: true } }),
    db.sequenceEnrollment.findMany({ where: { email: { equals: email, mode: "insensitive" } }, select: { stopReason: true } }),
    db.lead.findUnique({ where: { id: leadId }, select: { status: true, formType: true } }),
  ]);
  const signals = visitors.flatMap((v) => (Array.isArray(v.intentSignals) ? (v.intentSignals as unknown[]) : []));
  return {
    visits: visitors.reduce((a, v) => a + v.sessionsCount, 0),
    pagesViewed: visitors.reduce((a, v) => a + v.pageViews, 0),
    intentPages: Math.min(3, signals.length),
    emailReplies: enrollments.filter((e) => /^REPLY_(POSITIVE|NEUTRAL)$/.test(e.stopReason ?? "")).length,
    meetingBooked: lead?.status === "MEETING",
    demoRequested: /demo/i.test(lead?.formType ?? ""),
  };
}

export async function getIcp(): Promise<Icp> {
  const row = await db.setting.findUnique({ where: { key: "growthIcp" } }).catch(() => null);
  const v = (row?.value ?? {}) as { countries?: unknown; services?: unknown; minBudget?: unknown };
  const arr = (x: unknown) => (Array.isArray(x) ? x.map(String).filter(Boolean).slice(0, 50) : []);
  return { countries: arr(v.countries), services: arr(v.services), minBudget: typeof v.minBudget === "number" ? v.minBudget : undefined };
}

/** Scores a lead, stores the result (history + latest on the lead) and advances the CRM lifecycle when warranted. */
export async function qualifyLeadById(leadId: string, scoredBy = "rules"): Promise<Qualification | null> {
  const l = await db.lead.findUnique({ where: { id: leadId } });
  if (!l || l.archivedAt) return null;
  const q = qualify({ email: l.email, company: l.company, website: l.website, phone: l.phone, country: l.country, service: l.service, product: l.product, budget: l.budget, message: l.message, formType: l.formType, utmMedium: l.utmMedium }, await engagementOf(l.id, l.email), await getIcp());
  const previous = l.growthTier;
  await db.$transaction([
    db.leadQualification.create({ data: { leadId: l.id, fit: q.fit, intent: q.intent, engagement: q.engagement, budget: q.budget, timeline: q.timeline, total: q.total, tier: q.tier, signals: json(q.signals), reason: q.reason, source: l.utmSource ?? l.source, campaign: l.utmCampaign ?? l.campaign, scoredBy } }),
    db.lead.update({
      where: { id: l.id },
      data: {
        growthTier: q.tier,
        growthScore: q.total,
        qualifiedAt: q.tier === "SALES_READY" || q.tier === "QUALIFIED" ? (l.qualifiedAt ?? new Date()) : l.qualifiedAt,
        ...(shouldAdvanceStage(l.lifecycleStage, q.tier) ? { lifecycleStage: TIER_LIFECYCLE[q.tier] } : {}),
        ...(q.tier === "SALES_READY" && l.priority !== "URGENT" ? { priority: "HIGH" as const } : {}),
      },
    }),
    db.leadActivity.create({ data: { leadId: l.id, type: "QUALIFIED_SCORE", data: json({ tier: q.tier, total: q.total, reason: q.reason, scoredBy }) } }),
  ]);
  if (q.tier === "SALES_READY" && previous !== "SALES_READY") void notify({ type: "growth.salesReady", title: `Sales-ready lead: ${l.name}${l.company ? ` (${l.company})` : ""}`, body: q.reason.slice(0, 200), href: `/admin/leads/${l.id}`, entity: "Lead", entityId: l.id, permission: "leads:assign" });
  return q;
}

/** Qualifies leads created or changed recently that have no score yet (idempotent). */
export async function qualifyPending(limit = 200): Promise<number> {
  const rows = await db.lead.findMany({ where: { archivedAt: null, mergedIntoId: null, growthTier: null, createdAt: { gte: new Date(Date.now() - 30 * DAY) } }, select: { id: true }, orderBy: { createdAt: "desc" }, take: limit });
  let n = 0;
  for (const r of rows) if (await qualifyLeadById(r.id)) n++;
  return n;
}

/* ───────────────────────── attribution touches ───────────────────────── */

export async function recordTouch(t: { leadId?: string | null; visitorId?: string | null; campaignId?: string | null; channel: string; source?: string | null; medium?: string | null; campaign?: string | null; content?: string | null; url?: string | null; kind?: string; occurredAt?: Date }) {
  return db.growthTouch.create({ data: { ...t, kind: t.kind ?? "VISIT", occurredAt: t.occurredAt ?? new Date() } });
}

export { utcDay, utcMonth };
