import "server-only";
import { db } from "@/lib/db/client";
import { agentBySlug } from "@/lib/ai/catalog";
import { placementOf } from "./org";

/**
 * "What did the AI company do today?" — answered only from records: employee activity, approvals, audit entries for
 * external actions, metered AI cost, provider API calls, and provider-confirmed results (posts with a platform ID,
 * emails accepted by the mail server, prospects returned by a provider, ad campaigns with a provider ID).
 */

export interface DayEvent {
  at: Date;
  source: "AI" | "APPROVAL" | "AUDIT";
  actor: string | null;
  employee: string | null;
  department: string | null;
  objectiveId: string | null;
  taskId: string | null;
  provider: string | null;
  action: string;
  result: string;
  externalId: string | null;
}

export interface CompanyDay {
  from: Date;
  to: Date;
  counts: { tasksDone: number; tasksFailed: number; approvalsDecided: number; approvalsPending: number; escalations: number; blockers: number };
  aiCost: { agentSlug: string; costUsd: number; calls: number }[];
  providerCalls: { provider: string; calls: number; errors: number; coolUntil: Date | null }[];
  confirmed: { postsPublished: number; emailsSent: number; prospectsDiscovered: number; adCampaignsCreated: number; adCampaignsLaunched: number };
  events: DayEvent[];
}

/** External or governed actions worth showing in the timeline (audit action prefixes). */
const AUDIT_PREFIXES = ["ads.", "integration.", "growth.", "company.", "ai.approval", "ai.company.", "social.", "email."];
const PROVIDER_OF: [RegExp, string][] = [[/^ads\./, "ads"], [/^integration\.oauth/, "oauth"], [/^integration\./, "integrations"], [/^growth\.social|^social\./, "social"], [/^growth\.email|^email\./, "email"], [/leadgen/, "lead providers"]];

const utcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

export async function companyDay(day = new Date(), limit = 300): Promise<CompanyDay> {
  const from = utcDay(day);
  const to = new Date(from.getTime() + 86400_000);
  const range = { gte: from, lt: to };
  const [activity, approvals, audits, usage, calls, done, failed, pending, escalations, blockers, posts, emails, prospects, adsCreated, adsLaunched] = await Promise.all([
    db.aIActivity.findMany({ where: { createdAt: range }, orderBy: { createdAt: "desc" }, take: limit }),
    db.aIApproval.findMany({ where: { decidedAt: range }, orderBy: { decidedAt: "desc" }, take: 100, select: { id: true, agentSlug: true, tool: true, status: true, decidedAt: true, taskId: true, decidedBy: { select: { name: true } } } }),
    db.auditLog.findMany({ where: { createdAt: range, OR: AUDIT_PREFIXES.map((p) => ({ action: { startsWith: p } })) }, orderBy: { createdAt: "desc" }, take: limit, select: { action: true, entity: true, entityId: true, metadata: true, createdAt: true, user: { select: { name: true } } } }),
    db.aIUsage.groupBy({ by: ["agentSlug"], where: { createdAt: range }, _sum: { costUsd: true }, _count: { _all: true } }),
    db.integrationUsage.findMany({ where: { date: from } }),
    db.aITask.count({ where: { status: "DONE", completedAt: range } }),
    db.aITask.count({ where: { status: "FAILED", completedAt: range } }),
    db.aIApproval.count({ where: { status: "PENDING" } }),
    db.aIWorkMessage.count({ where: { kind: "ESCALATION", createdAt: range } }),
    db.aIWorkMessage.count({ where: { kind: "BLOCKER", createdAt: range } }),
    db.socialPost.count({ where: { status: "PUBLISHED", publishedAt: range, externalId: { not: null } } }),
    db.growthEmailSend.count({ where: { status: "SENT", sentAt: range } }),
    db.prospect.count({ where: { createdAt: range } }),
    db.adCampaign.count({ where: { createdAt: range, externalId: { not: null } } }),
    db.auditLog.count({ where: { createdAt: range, action: { in: ["ads.campaign.launched", "ads.campaign.launched_by_policy"] } } }),
  ]);
  const emp = (slug: string | null) => (slug ? { employee: agentBySlug(slug)?.name ?? slug, department: placementOf(slug)?.department ?? null } : { employee: null, department: null });
  const events: DayEvent[] = [
    ...activity.map((a) => ({ at: a.createdAt, source: "AI" as const, actor: null, ...emp(a.agentSlug), objectiveId: a.objectiveId, taskId: a.taskId, provider: null, action: a.type, result: a.summary, externalId: null })),
    ...approvals.map((a) => ({ at: a.decidedAt!, source: "APPROVAL" as const, actor: a.decidedBy?.name ?? null, ...emp(a.agentSlug), objectiveId: null, taskId: a.taskId, provider: null, action: `approval: ${a.tool}`, result: a.status, externalId: null })),
    ...audits.map((a) => {
      const meta = (a.metadata ?? {}) as Record<string, unknown>;
      return { at: a.createdAt, source: "AUDIT" as const, actor: a.user?.name ?? "system", employee: null, department: null, objectiveId: typeof meta.objectiveId === "string" ? meta.objectiveId : null, taskId: a.entity === "AITask" ? a.entityId : null, provider: PROVIDER_OF.find(([re]) => re.test(a.action))?.[1] ?? (typeof meta.provider === "string" ? meta.provider : null), action: a.action, result: [a.entity, a.entityId].filter(Boolean).join(" ") || "—", externalId: typeof meta.externalId === "string" ? meta.externalId : null };
    }),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, limit);
  return {
    from,
    to,
    counts: { tasksDone: done, tasksFailed: failed, approvalsDecided: approvals.length, approvalsPending: pending, escalations, blockers },
    aiCost: usage.map((u) => ({ agentSlug: u.agentSlug, costUsd: Math.round(Number(u._sum.costUsd ?? 0) * 10000) / 10000, calls: u._count._all })).sort((a, b) => b.costUsd - a.costUsd),
    providerCalls: calls.map((c) => ({ provider: c.provider, calls: c.calls, errors: c.errors, coolUntil: c.coolUntil })).sort((a, b) => b.calls - a.calls),
    confirmed: { postsPublished: posts, emailsSent: emails, prospectsDiscovered: prospects, adCampaignsCreated: adsCreated, adCampaignsLaunched: adsLaunched },
    events,
  };
}
