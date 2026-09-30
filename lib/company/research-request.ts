import "server-only";
import { db } from "@/lib/db/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { audit } from "@/lib/audit";
import { getProvider, webSearchEnabled } from "@/lib/ai/provider";
import { createEmployeeTask } from "@/lib/ai/workforce/engine";
import { hydrateVault } from "@/lib/integrations/vault";
import { paramsSummary, RESEARCH_SECTIONS, type ResearchParams } from "./research-rules";
import { RESEARCH_OWNER } from "./research";

const json = (v: unknown) => JSON.parse(JSON.stringify(v ?? null)) as Prisma.InputJsonValue;

/**
 * "Run Market Research": a real task for the Market Intelligence Director. Findings are recorded through a tool that
 * rejects unsourced statistics; the result is saved to the Knowledge Base (draft, for review) and company memory.
 */
export async function requestMarketResearch(p: { params: ResearchParams; title?: string; userId: string | null; objectiveId?: string | null; parentTaskId?: string | null; delegatedBySlug?: string | null; dependsOn?: string[] }) {
  await hydrateVault();
  const summary = paramsSummary(p.params);
  if (!summary) throw new Error("Choose at least one research parameter.");
  const title = (p.title?.trim() || `Market research: ${summary}`).slice(0, 200);
  const r = await db.marketResearch.create({ data: { title, params: json(p.params), status: "QUEUED", createdById: p.userId, objectiveId: p.objectiveId ?? null } });
  const web = webSearchEnabled();
  const task = await createEmployeeTask({
    agentSlug: RESEARCH_OWNER,
    title,
    priority: "HIGH",
    requestedById: p.userId,
    source: "market-research",
    objectiveId: p.objectiveId ?? null,
    parentTaskId: p.parentTaskId ?? null,
    delegatedBySlug: p.delegatedBySlug ?? null,
    dependsOn: p.dependsOn ?? [],
    instructions: [
      `Research id: ${r.id}. Parameters: ${summary}.`,
      `Cover these sections: ${Object.values(RESEARCH_SECTIONS).join(", ")}.`,
      "Record every finding with recordMarketFinding (researchId above). Labels: FACT = from an internal record (sourceUrl = its /admin link); SOURCE = from a web page you actually read (sourceUrl = https URL); INFERENCE = your reasoning; RECOMMENDATION = suggested action. Numbers without a source are rejected — never invent statistics, market sizes or prices.",
      web ? "Web research is available: use it for competitors, pricing observations and market context, and cite each page." : "Web research is NOT CONNECTED: use internal data only (leads, deals, visitors, knowledge base) and state that external market data was unavailable. Do not guess external facts.",
      "When finished call completeMarketResearch with an executive summary (no new numbers in it).",
    ].join("\n"),
  });
  await db.marketResearch.update({ where: { id: r.id }, data: { taskId: task.id, status: getProvider() ? "QUEUED" : "BLOCKED", blockedReason: getProvider() ? null : "AI provider NOT CONNECTED (ANTHROPIC_API_KEY). The research task is queued and starts once it is connected." } });
  await audit({ userId: p.userId, action: "company.research.requested", entity: "MarketResearch", entityId: r.id, metadata: { params: p.params, taskId: task.id } });
  return { id: r.id, taskId: task.id };
}

