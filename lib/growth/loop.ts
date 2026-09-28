import "server-only";
import { db } from "@/lib/db/client";
import { audit } from "@/lib/audit";
import { createEmployeeTask, taskTokenLimit } from "@/lib/ai/workforce/engine";
import { ensureEmployees } from "@/lib/ai/workforce/employees";
import { getAgentConfig } from "@/lib/ai/agents";
import { aiLimits } from "@/lib/ai/cost";
import { costOf, DEFAULT_MODEL } from "@/lib/ai/provider";
import { isEnabled } from "@/lib/os/flags";
import { stopReason, type GrowthChannel } from "./policy";
import { getGrowthSettings } from "./settings";
import { qualifyPending, releaseBudget, releaseClaim, reserveBudget, takeClaim, utcDay } from "./engine";
import { processDueEmails } from "./email";
import { publishDue, syncSocialMetrics } from "./social";

export const GROWTH_TASK_SOURCE = "growth";
/** Only one loop run at a time across all servers; a run that died is taken over after this long. */
const LOOP_CLAIM = "growth-loop-running";
const LOOP_STALE_MS = 20 * 60_000;

interface Step {
  step: string;
  status: "done" | "skipped" | "failed";
  detail: string;
  count?: number;
}

/**
 * The most one autonomous AI task can cost: its token cap priced at the employee's model input rate, plus one
 * maximum-length reply. This is what the AI daily budget reserves, so actual spend can only be lower.
 */
export async function aiTaskMaxCostUsd(agentSlug: string): Promise<number> {
  const model = (await getAgentConfig(agentSlug))?.model || process.env.AI_MODEL || DEFAULT_MODEL;
  return Math.ceil(costOf(model, { input: taskTokenLimit(), output: aiLimits().callMaxTokens }) * 100) / 100;
}

/**
 * Scheduled autonomous work for one AI employee, created through the existing AI task system (the same path the
 * global execution router uses for BACKGROUND_TASK). Order: daily claim (at most one per employee per day, atomic
 * across servers) → AI budget reservation of the task's maximum cost → task. Anything that fails is given back.
 */
async function scheduleEmployeeTask(agentSlug: string, title: string, instructions: string): Promise<{ created: boolean; detail: string }> {
  const key = `ai-task:${utcDay().toISOString().slice(0, 10)}:${agentSlug}:${title}`;
  if (!(await takeClaim(key))) return { created: false, detail: "Already assigned today." };
  const cost = await aiTaskMaxCostUsd(agentSlug);
  const budget = await reserveBudget("aiDaily", cost);
  if (!budget.ok) {
    await releaseClaim(key);
    return { created: false, detail: `AI budget: ${budget.reason} (this task can cost up to $${cost.toFixed(2)}).` };
  }
  try {
    await createEmployeeTask({ agentSlug, title, instructions, priority: "MEDIUM", kind: "RECURRING", source: GROWTH_TASK_SOURCE });
  } catch (e) {
    await releaseBudget(budget);
    await releaseClaim(key);
    throw e;
  }
  return { created: true, detail: `Task assigned: ${title} (reserved up to $${cost.toFixed(2)} of the AI budget).` };
}

const AI_WORK: { channel: GrowthChannel; agent: string; title: string; instructions: string }[] = [
  {
    channel: "content",
    agent: "marketing",
    title: "Growth: daily content & social plan",
    instructions: "Autonomous growth loop (scheduled). Use getGrowthSummary and getContentInventory. Draft up to 3 social posts with draftSocialPost for the strongest services/products, in the configured languages (English / Hindi / Hinglish as appropriate), each with a UTM-tagged link. Follow the brand voice. Never invent numbers, testimonials or results. Drafts go to human approval; do not publish.",
  },
  {
    channel: "aiSales",
    agent: "sales",
    title: "Growth: follow up sales-ready leads",
    instructions: "Autonomous growth loop (scheduled). Find leads whose growth tier is SALES_READY and that have not been contacted, summarise why each is sales-ready from its qualification, and propose a follow-up (createFollowUp) and a personal email draft. Every email needs human approval.",
  },
  {
    channel: "leadGen",
    agent: "sdr",
    title: "Growth: review new prospects and qualification",
    instructions: "Autonomous growth loop (scheduled). Use listProspects and getGrowthSummary. For NEW prospects, check fit against the ICP using only provider data and internal records; recommend which to research or disqualify. A prospect is not a lead until they respond. Do not send anything.",
  },
];

/**
 * The daily autonomous growth loop. Order is part of the safety contract:
 * GROWTH flag (checked by the caller) → STOP ALL → AUTONOMOUS_GROWTH_MODE → one run at a time → only then any
 * external provider call or AI task. With autonomous mode off nothing runs and no provider is contacted.
 */
export async function runGrowthLoop(trigger: "SCHEDULE" | "MANUAL" = "SCHEDULE", actorId?: string | null): Promise<number> {
  const s = await getGrowthSettings();
  const run = await db.growthRun.create({ data: { trigger, status: "RUNNING" } });
  const steps: Step[] = [];
  const finish = async (status: "SUCCEEDED" | "SKIPPED" | "FAILED", error?: string) => {
    await db.growthRun.update({ where: { id: run.id }, data: { status, steps: JSON.parse(JSON.stringify(steps)), error: error ?? null, finishedAt: new Date() } });
    await audit({ userId: actorId ?? null, action: "growth.loop", entity: "GrowthRun", entityId: run.id, metadata: { status, trigger, steps: steps.map((x) => `${x.step}:${x.status}`) } });
  };
  if (s.stops.all) {
    steps.push({ step: "all", status: "skipped", detail: "STOP ALL is on." });
    await finish("SKIPPED");
    return 0;
  }
  if (!s.autonomousMode) {
    steps.push({ step: "autonomous", status: "skipped", detail: "Autonomous growth mode is off — nothing runs and no provider is contacted." });
    await finish("SKIPPED");
    return 0;
  }
  if (!(await takeClaim(LOOP_CLAIM, LOOP_STALE_MS))) {
    steps.push({ step: "overlap", status: "skipped", detail: "Another growth loop run is in progress." });
    await finish("SKIPPED");
    return 0;
  }
  try {
    const gate = (channel: GrowthChannel) => stopReason(s, { kind: "channel", channel, autonomous: true });
    let total = 0;

    // Follower counts are pulled only when autonomous mode AND the social channel allow it (per-platform stops apply).
    const so1 = gate("social");
    if (so1) steps.push({ step: "social.metrics", status: "skipped", detail: so1 });
    else {
      const metrics = await syncSocialMetrics(s.stoppedPlatforms);
      steps.push({ step: "social.metrics", status: metrics.some((m) => !m.ok) ? "failed" : metrics.length ? "done" : "skipped", detail: metrics.length ? metrics.map((m) => (m.ok ? `${m.platform}: ${m.followers}` : `${m.platform}: ${m.error}`)).join("; ") : "No social platform connected.", count: metrics.filter((m) => m.ok).length });
    }

    const lg = gate("leadGen");
    if (lg) steps.push({ step: "leads.qualify", status: "skipped", detail: lg });
    else {
      const n = await qualifyPending();
      total += n;
      steps.push({ step: "leads.qualify", status: "done", detail: `${n} lead(s) scored`, count: n });
    }

    const em = await processDueEmails({ autonomous: true });
    total += em.sent;
    steps.push({ step: "email.sequences", status: em.blocked && !em.sent ? "skipped" : "done", detail: em.blocked ? `${em.sent} sent; stopped: ${em.blocked}` : `${em.sent} sent, ${em.skipped} skipped`, count: em.sent });

    const so = await publishDue({ autonomous: true });
    total += so.published;
    steps.push({ step: "social.publish", status: so.blocked ? "skipped" : so.failed ? "failed" : "done", detail: so.blocked ?? `${so.published} published, ${so.failed} not published`, count: so.published });

    const aiOn = await isEnabled("AI_WORKFORCE");
    const aiStop = stopReason(s, { kind: "ai" });
    let employeesReady = false;
    for (const w of AI_WORK) {
      const why = !aiOn ? "AI workforce module is off." : (aiStop ?? stopReason(s, { kind: "channel", channel: w.channel, autonomous: true, agent: w.agent }));
      if (why) {
        steps.push({ step: `ai.${w.agent}`, status: "skipped", detail: why });
        continue;
      }
      if (!employeesReady) {
        await ensureEmployees();
        employeesReady = true;
      }
      const r = await scheduleEmployeeTask(w.agent, w.title, w.instructions);
      if (r.created) total++;
      steps.push({ step: `ai.${w.agent}`, status: r.created || /Already assigned/.test(r.detail) ? "done" : "skipped", detail: r.detail });
    }
    await finish("SUCCEEDED");
    return total;
  } catch (e) {
    steps.push({ step: "error", status: "failed", detail: (e as Error).message.slice(0, 300) });
    await finish("FAILED", (e as Error).message.slice(0, 1000));
    return 0;
  } finally {
    await releaseClaim(LOOP_CLAIM);
  }
}
