import "server-only";
import { db } from "@/lib/db/client";
import { takeClaim } from "@/lib/growth/engine";
import { growthStop } from "@/lib/growth/settings";
import { refreshObjective } from "./objective-status";
import { ensureOrganisationOnce } from "./organisation";
import { postMessage } from "./delegation";
import { runLeadPipeline } from "./leadgen";
import { parseLeadGen } from "./leadgen-rules";
import { syncResearch } from "./research";
import { controlObjective } from "./measure";
import { syncAdSpend } from "@/lib/ads/engine";
import { syncPostMetrics } from "@/lib/growth/social-metrics";

/** Which executive owns an insight raised by an existing AI employee. */
export const INSIGHT_OWNER: Record<string, string> = { sales: "cro", sdr: "cro", crm: "cro", proposal: "cro", finance: "cfo", project: "coo", support: "cco", "customer-success": "cco", marketing: "cmo", research: "strategy-director", knowledge: "coo", ceo: "ceo" };

export interface CompanyPump {
  objectives: number;
  escalations: number;
  leadRuns: number;
  research: number;
  measured: number;
  loopTasks: number;
  adsSynced: number | null;
  socialSynced: number | null;
}

/**
 * The AI company heartbeat (runs inside the existing workforce pump):
 *  1. keeps objective status in step with real task state,
 *  2. escalates HIGH/CRITICAL insights (stalled high-value deals, overdue invoices, red projects …) to the responsible
 *     AI executive's inbox — a message, not autonomous spending,
 *  3. runs AUTONOMOUS lead campaigns once a day, only when Autonomous Growth and the lead channel allow it,
 *  4. keeps market research status in step with its task,
 *  5. control loop: measures each open objective against its target (hourly), tells the owner about a changed next
 *     action and creates at most one bounded optimisation task per objective per day (see controlObjective),
 *  6. every 6 hours pulls provider-reported ad spend (then the spend guard) and social post metrics.
 * Idempotent: escalations are keyed by insight, lead runs by campaign and day, loop steps by objective and hour/day.
 */
export async function pumpCompany(now = new Date()): Promise<CompanyPump> {
  const out: CompanyPump = { objectives: 0, escalations: 0, leadRuns: 0, research: 0, measured: 0, loopTasks: 0, adsSynced: null, socialSynced: null };
  await ensureOrganisationOnce();
  for (const o of await db.aIObjective.findMany({ where: { status: { in: ["PLANNING", "ACTIVE", "BLOCKED"] } }, select: { id: true }, take: 50 })) {
    await refreshObjective(o.id);
    out.objectives++;
    try {
      const step = await controlObjective(o.id, now);
      if (step.measured) out.measured++;
      if (step.task) out.loopTasks++;
    } catch (e) {
      console.error("[company] control loop failed", o.id, (e as Error).message);
    }
  }

  const insights = await db.aIRecommendation.findMany({ where: { status: "OPEN", severity: { in: ["HIGH", "CRITICAL"] } }, orderBy: { createdAt: "desc" }, take: 30 });
  for (const i of insights) {
    const owner = INSIGHT_OWNER[i.agentSlug] ?? "ceo";
    const key = `insight:${i.dedupeKey}`;
    if (await db.aIWorkMessage.findFirst({ where: { kind: "ESCALATION", toSlug: owner, data: { path: ["key"], equals: key } }, select: { id: true } })) continue;
    await postMessage({ fromSlug: i.agentSlug, toSlug: owner, kind: "ESCALATION", subject: i.title, body: [i.body, i.href ? `Record: ${i.href}` : null].filter(Boolean).join("\n"), data: { key, recommendationId: i.id, severity: i.severity } });
    out.escalations++;
  }

  const day = now.toISOString().slice(0, 10);
  const campaigns = await db.campaign.findMany({ where: { status: { in: ["PLANNED", "ACTIVE"] }, leadGen: { path: ["mode"], equals: "AUTONOMOUS" } }, select: { id: true, leadGen: true } });
  for (const c of campaigns) {
    if (parseLeadGen(c.leadGen).mode !== "AUTONOMOUS") continue;
    if (await growthStop({ kind: "channel", channel: "leadGen", autonomous: true })) break;
    if (!(await takeClaim(`leadgen-daily:${c.id}:${day}`))) continue;
    try {
      await runLeadPipeline(c.id, { actor: "company-loop", autonomous: true });
      out.leadRuns++;
    } catch (e) {
      console.error("[company] lead run failed", c.id, (e as Error).message);
    }
  }

  for (const r of await db.marketResearch.findMany({ where: { status: { in: ["QUEUED", "RUNNING", "BLOCKED"] } }, select: { id: true }, take: 30 })) {
    await syncResearch(r.id);
    out.research++;
  }

  const slot = `${day}:${Math.floor(now.getUTCHours() / 6)}`;
  if ((await db.adCampaign.count({ where: { externalId: { not: null }, status: { in: ["ACTIVE", "PAUSED"] } } })) && (await takeClaim(`ads-sync:${slot}`))) {
    const r = await syncAdSpend(3).catch((e) => (console.error("[company] ads sync failed", (e as Error).message), null));
    out.adsSynced = r?.synced ?? null;
  }
  if ((await db.socialPost.count({ where: { status: "PUBLISHED", externalId: { not: null } } })) && (await takeClaim(`social-metrics:${slot}`))) {
    const r = await syncPostMetrics(50).catch((e) => (console.error("[company] social metrics failed", (e as Error).message), null));
    out.socialSynced = r?.synced ?? null;
  }
  return out;
}
