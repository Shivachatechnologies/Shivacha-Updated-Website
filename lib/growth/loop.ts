import "server-only";
import { db } from "@/lib/db/client";
import { audit } from "@/lib/audit";
import { createEmployeeTask } from "@/lib/ai/workforce/engine";
import { ensureEmployees } from "@/lib/ai/workforce/employees";
import { isEnabled } from "@/lib/os/flags";
import { stopReason, type GrowthChannel } from "./policy";
import { getGrowthSettings } from "./settings";
import { qualifyPending, utcDay } from "./engine";
import { processDueEmails } from "./email";
import { publishDue, syncSocialMetrics } from "./social";

export const GROWTH_TASK_SOURCE = "growth";

interface Step {
  step: string;
  status: "done" | "skipped" | "failed";
  detail: string;
  count?: number;
}

/**
 * Scheduled autonomous work for one AI employee, created through the existing AI task system (the same path the
 * global execution router uses for BACKGROUND_TASK). At most one per employee per day. The employee runs under the
 * system identity, so every external action it proposes still goes to the Human Approval Center.
 */
async function scheduleEmployeeTask(agentSlug: string, title: string, instructions: string): Promise<boolean> {
  const exists = await db.aITask.count({ where: { agentSlug, source: GROWTH_TASK_SOURCE, title, createdAt: { gte: utcDay() } } });
  if (exists) return false;
  await createEmployeeTask({ agentSlug, title, instructions, priority: "MEDIUM", kind: "RECURRING", source: GROWTH_TASK_SOURCE });
  return true;
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

export async function runGrowthLoop(trigger: "SCHEDULE" | "MANUAL" = "SCHEDULE", actorId?: string | null): Promise<number> {
  const s = await getGrowthSettings();
  const run = await db.growthRun.create({ data: { trigger, status: "RUNNING" } });
  const steps: Step[] = [];
  const finish = async (status: "SUCCEEDED" | "SKIPPED" | "FAILED", error?: string) => {
    await db.growthRun.update({ where: { id: run.id }, data: { status, steps: JSON.parse(JSON.stringify(steps)), error: error ?? null, finishedAt: new Date() } });
    await audit({ userId: actorId ?? null, action: "growth.loop", entity: "GrowthRun", entityId: run.id, metadata: { status, trigger, steps: steps.map((x) => `${x.step}:${x.status}`) } });
  };
  try {
    if (s.stops.all) {
      steps.push({ step: "all", status: "skipped", detail: "STOP ALL is on." });
      await finish("SKIPPED");
      return 0;
    }
    // Reading real follower counts is not a marketing action, so it runs whenever a platform is connected.
    const metrics = await syncSocialMetrics();
    steps.push({ step: "social.metrics", status: metrics.some((m) => !m.ok) ? "failed" : metrics.length ? "done" : "skipped", detail: metrics.length ? metrics.map((m) => (m.ok ? `${m.platform}: ${m.followers}` : `${m.platform}: ${m.error}`)).join("; ") : "No social platform connected.", count: metrics.filter((m) => m.ok).length });

    if (!s.autonomousMode) {
      steps.push({ step: "autonomous", status: "skipped", detail: "Autonomous growth mode is off." });
      await finish("SKIPPED");
      return 0;
    }
    const gate = (channel: GrowthChannel) => stopReason(s, { kind: "channel", channel, autonomous: true });
    let total = 0;

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
      const created = await scheduleEmployeeTask(w.agent, w.title, w.instructions);
      if (created) total++;
      steps.push({ step: `ai.${w.agent}`, status: "done", detail: created ? `Task assigned: ${w.title}` : "Already assigned today." });
    }
    await finish("SUCCEEDED");
    return total;
  } catch (e) {
    steps.push({ step: "error", status: "failed", detail: (e as Error).message.slice(0, 300) });
    await finish("FAILED", (e as Error).message.slice(0, 1000));
    return 0;
  }
}
