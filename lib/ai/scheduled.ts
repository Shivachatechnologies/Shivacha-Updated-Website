import "server-only";
import { db } from "@/lib/db/client";
import { isEnabled } from "@/lib/os/flags";
import { expireApprovals } from "./approvals";
import { ensureAgents } from "./agents";
import { generateBriefing } from "./briefing";
import { generateInsights } from "./insights";
import { processTasks } from "./tasks";

const whenOn = (run: () => Promise<number>) => async () => ((await isEnabled("AI_WORKFORCE")) ? run() : 0);

/** AI jobs added to the daily scheduler. Order matters: insights feed the briefing. */
export function aiDailyJobs(): { name: string; run: () => Promise<number> }[] {
  return [
    { name: "ai.agents.ensure", run: whenOn(async () => (await ensureAgents(), 0)) },
    { name: "ai.approvals.expire", run: expireApprovals },
    { name: "ai.insights", run: whenOn(generateInsights) },
    { name: "ai.tasks", run: whenOn(() => processTasks(20)) },
    { name: "ai.briefing", run: whenOn(() => generateBriefing()) },
    { name: "ai.conversations.retention", run: async () => (await db.aIConversation.deleteMany({ where: { expiresAt: { lt: new Date() } } })).count },
  ];
}
