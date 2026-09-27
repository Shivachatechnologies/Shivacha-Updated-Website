import "server-only";
import { db } from "@/lib/db/client";

/** Budget guard-rails. Every model call is metered in AIUsage; limits are checked before each call. */
export function aiLimits() {
  const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : d);
  return {
    /** USD per UTC day across all agents. */
    dailyUsd: num(process.env.MAX_DAILY_AI_COST, 10),
    /** Total tokens (input + output) one request may consume across its tool loop. */
    requestTokens: num(process.env.MAX_REQUEST_TOKENS, 150_000),
    /** max_tokens per model call. */
    callMaxTokens: 16_000,
    maxIterations: 8,
  };
}

export const startOfUtcDay = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

export async function spentToday(agentSlug?: string) {
  const r = await db.aIUsage.aggregate({ where: { createdAt: { gte: startOfUtcDay() }, agentSlug }, _sum: { costUsd: true } });
  return Number(r._sum.costUsd ?? 0);
}

export class BudgetError extends Error {}

export async function assertBudget(agentSlug: string, agentLimit: number | null) {
  const { dailyUsd } = aiLimits();
  const [all, agent] = await Promise.all([spentToday(), agentLimit != null ? spentToday(agentSlug) : Promise.resolve(0)]);
  if (all >= dailyUsd) throw new BudgetError(`Daily AI budget reached ($${all.toFixed(2)} of $${dailyUsd.toFixed(2)}). Raise MAX_DAILY_AI_COST or try tomorrow.`);
  if (agentLimit != null && agent >= agentLimit) throw new BudgetError(`This agent's daily budget is used up ($${agent.toFixed(2)} of $${agentLimit.toFixed(2)}).`);
}
