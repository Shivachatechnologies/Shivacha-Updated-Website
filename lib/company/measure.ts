import "server-only";
import { db } from "@/lib/db/client";
import type { Currency, Prisma } from "@/lib/generated/prisma/client";
import { getProvider } from "@/lib/ai/provider";
import { createEmployeeTask } from "@/lib/ai/workforce/engine";
import { assertBudget } from "@/lib/ai/cost";
import { takeClaim } from "@/lib/growth/engine";
import { growthStop } from "@/lib/growth/settings";
import { enrichmentProvider, leadProviders } from "@/lib/growth/providers";
import { hydrateVault } from "@/lib/integrations/vault";
import { postMessage } from "./delegation";
import { leadGenFunnel } from "./leadgen";
import { leadNextStep, revenueNextStep, type NextStep } from "./measure-rules";
import { dealRisks } from "./sales";

/**
 * MEASURE → REVIEW → OPTIMIZE → NEXT ACTION for CEO objectives. Every number comes from records (prospects, deals);
 * a target the system cannot measure is stored as UNAVAILABLE. The next action is deterministic from the measurement.
 */

const QUALIFIED = ["RESEARCHED", "CONTACTED", "REPLIED", "CONVERTED"];
const dayStart = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

export interface ObjectiveMeasurement {
  day: string;
  metric: string | null;
  target: number | null;
  actual: number | null;
  nature: "REAL" | "UNAVAILABLE";
  label: string;
  bottleneck: NextStep["bottleneck"] | "BLOCKED" | "TASKS" | null;
  owner: string | null;
  /** The next action needs a person (e.g. connecting a provider) — the loop creates no AI task for it. */
  needsHuman?: boolean;
  funnel?: { discovered: number; withEmail: number; verified: number; qualified: number; contacted: number; replied: number };
}

export async function measureObjective(id: string, now = new Date()): Promise<{ measurement: ObjectiveMeasurement; nextAction: string | null } | null> {
  const o = await db.aIObjective.findUnique({ where: { id } });
  if (!o) return null;
  const from = dayStart(now);
  const m: ObjectiveMeasurement = { day: from.toISOString().slice(0, 10), metric: o.targetMetric, target: o.targetValue, actual: null, nature: "UNAVAILABLE", label: "No measurable target in the objective", bottleneck: null, owner: null };
  let step: NextStep | null = null;
  const metric = o.targetMetric ?? "";

  if (/^(qualified_)?leads(_per_day)?$/.test(metric) || (o.playbook === "LEAD_GENERATION" && o.campaignId)) {
    if (o.campaignId) {
      await hydrateVault();
      const perDay = metric.endsWith("_per_day");
      const qualifiedOnly = metric.startsWith("qualified") || !metric;
      const where: Prisma.ProspectWhereInput = { campaignId: o.campaignId, ...(perDay ? { createdAt: { gte: from } } : {}), ...(qualifiedOnly ? { status: { in: QUALIFIED } } : {}) };
      const [actual, today, f] = await Promise.all([db.prospect.count({ where }), db.prospect.count({ where: { campaignId: o.campaignId, createdAt: { gte: from }, status: { in: QUALIFIED } } }), leadGenFunnel(o.campaignId)]);
      m.actual = actual;
      m.nature = "REAL";
      m.label = `${qualifiedOnly ? "Qualified prospects" : "Prospects"} ${perDay ? "sourced today (UTC)" : "in the campaign"}`;
      m.funnel = { discovered: f.discovered, withEmail: f.withEmail, verified: f.verified, qualified: f.qualified, contacted: f.contacted, replied: f.replied };
      const target = perDay && qualifiedOnly ? o.targetValue : null;
      step = leadNextStep(m.funnel, today, target, { discovery: leadProviders.apollo.status().connected || leadProviders.hunter.status().connected, verification: enrichmentProvider.status().connected });
    } else m.label = "The lead campaign for this objective has not been created";
  } else if (metric.startsWith("revenue_") && o.targetValue != null) {
    const currency = metric.split("_")[1].toUpperCase() as Currency;
    const since = metric.endsWith("_month") ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)) : o.createdAt;
    const [won, risks] = await Promise.all([db.deal.aggregate({ where: { deletedAt: null, stage: "WON", currency, wonAt: { gte: since } }, _sum: { value: true } }), dealRisks(50)]);
    m.actual = Math.round(Number(won._sum?.value ?? 0) * 100) / 100;
    m.nature = "REAL";
    m.label = `Won deals in ${currency} since ${since.toISOString().slice(0, 10)}`;
    step = revenueNextStep(m.actual, o.targetValue, currency, risks.filter((r) => r.currency === currency && r.risk >= 40).length);
  }

  let nextAction: string | null = step?.action ?? null;
  m.bottleneck = step?.bottleneck ?? null;
  m.owner = step?.owner ?? null;
  m.needsHuman = step?.needsHuman ?? false;
  if (o.status === "BLOCKED" && o.blockedReason) {
    nextAction = `Unblock first: ${o.blockedReason}`;
    m.bottleneck = "BLOCKED";
    m.owner = o.ownerSlug;
  } else if (!step) {
    const failed = await db.aITask.findFirst({ where: { objectiveId: id, status: "FAILED" }, orderBy: { updatedAt: "desc" }, select: { title: true, agentSlug: true, error: true } });
    if (failed) {
      nextAction = `Review the failed task "${failed.title}" (${failed.agentSlug})${failed.error ? `: ${failed.error.slice(0, 200)}` : ""}.`;
      m.bottleneck = "TASKS";
      m.owner = o.ownerSlug;
    }
  }
  await db.aIObjective.update({ where: { id }, data: { metrics: m as unknown as Prisma.InputJsonValue, measuredAt: now, nextAction } });
  return { measurement: m, nextAction };
}

export const parseMeasurement = (v: unknown): ObjectiveMeasurement | null => (v && typeof v === "object" && !Array.isArray(v) && "day" in v ? (v as ObjectiveMeasurement) : null);

/** At most this many optimisation tasks per objective in total; beyond it the loop only reports. */
export const MAX_LOOP_TASKS = 10;

/** Consecutive failed optimisation tasks after which the loop stops creating them until a person looks. */
export const MAX_LOOP_FAILURES = 3;

export interface LoopStep {
  measured: boolean;
  messaged: boolean;
  task: string | null;
  /** Why no optimisation task was created (observability). */
  skipped?: string;
}

/**
 * One control-loop step for an objective. Bounded: measured at most hourly; the owner is told about a changed next
 * action at most once a day; an optimisation task is created at most once a day, only while the objective is ACTIVE,
 * an AI provider is connected, AI is not stopped, no earlier loop task is still open, and the total stays under
 * MAX_LOOP_TASKS. The task runs under the objective creator's permissions and every write still goes through approvals.
 */
export async function controlObjective(id: string, now = new Date()): Promise<LoopStep> {
  const out: LoopStep = { measured: false, messaged: false, task: null };
  const hour = now.toISOString().slice(0, 13);
  const day = now.toISOString().slice(0, 10);
  if (!(await takeClaim(`objective-measure:${id}:${hour}`))) return out;
  const before = await db.aIObjective.findUnique({ where: { id }, select: { nextAction: true } });
  const r = await measureObjective(id, now);
  if (!r) return out;
  out.measured = true;
  const o = await db.aIObjective.findUniqueOrThrow({ where: { id } });
  const m = r.measurement;
  if (!r.nextAction || !m.owner || m.bottleneck === "ON_TARGET") return out;
  if (r.nextAction !== before?.nextAction && (await takeClaim(`objective-next:${id}:${day}`))) {
    await postMessage({ fromSlug: "ceo", toSlug: m.owner, kind: "ESCALATION", subject: `Next action: ${o.title}`, body: [r.nextAction, m.actual != null ? `Measured: ${m.label} = ${m.actual}${m.target != null ? ` (target ${m.target})` : ""}.` : null, `Objective: /admin/company/objectives/${id}`].filter(Boolean).join("\n"), objectiveId: id, data: { key: `next:${id}:${day}`, bottleneck: m.bottleneck } });
    out.messaged = true;
  }
  const skip = (why: string) => ((out.skipped = why), out);
  if (o.status !== "ACTIVE") return skip(`objective is ${o.status.toLowerCase()}`);
  if (m.bottleneck === "BLOCKED") return skip("objective is blocked");
  if (m.needsHuman) return skip("needs a person (provider not connected)");
  if (!getProvider()) return skip("AI provider not connected");
  const stop = await growthStop({ kind: "ai", agent: m.owner });
  if (stop) return skip(stop);
  const [open, total, recent] = await Promise.all([
    db.aITask.count({ where: { objectiveId: id, source: "company-loop", status: { in: ["QUEUED", "RUNNING", "WAITING", "AWAITING_APPROVAL", "PAUSED"] } } }),
    db.aITask.count({ where: { objectiveId: id, source: "company-loop" } }),
    db.aITask.findMany({ where: { objectiveId: id, source: "company-loop", status: { in: ["DONE", "FAILED", "CANCELLED"] } }, orderBy: { createdAt: "desc" }, take: MAX_LOOP_FAILURES, select: { status: true } }),
  ]);
  if (open) return skip("an optimisation task is still open");
  if (total >= MAX_LOOP_TASKS) return skip(`optimisation cap reached (${MAX_LOOP_TASKS})`);
  if (recent.length === MAX_LOOP_FAILURES && recent.every((t) => t.status !== "DONE")) {
    if (await takeClaim(`objective-loop-halted:${id}`)) await postMessage({ fromSlug: "ceo", toSlug: m.owner, toUserId: null, kind: "ESCALATION", subject: `Optimisation paused: ${o.title}`, body: `The last ${MAX_LOOP_FAILURES} optimisation tasks did not finish. No new ones are created until a person reviews them. Objective: /admin/company/objectives/${id}`, objectiveId: id, data: { key: `loop-halted:${id}` } });
    return skip(`paused after ${MAX_LOOP_FAILURES} failed optimisation tasks`);
  }
  try {
    await assertBudget(m.owner, null);
  } catch (e) {
    return skip((e as Error).message);
  }
  const t = await createEmployeeTask({ agentSlug: m.owner, title: `Optimise: ${o.title}`.slice(0, 200), instructions: `Control loop for objective "${o.statement}".\nMeasurement (${m.day}): ${m.label} = ${m.actual ?? "UNAVAILABLE"}${m.target != null ? `, target ${m.target}` : ""}. Bottleneck: ${m.bottleneck}.\nNext action: ${r.nextAction}\nAct with your tools; writes go through approval. If a provider is NOT CONNECTED, call reportBlocker. Report what you changed with the numbers.`, requestedById: o.createdById, source: "company-loop", objectiveId: id, idempotencyKey: `loop:${id}:${day}`, runAfter: now });
  out.task = t.id;
  return out;
}
