import "server-only";
import { db } from "@/lib/db/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/os/notify";
import { fmtMulti } from "@/lib/os/money";
import { startOfUtcDay } from "./cost";
import { getProvider } from "./provider";
import { runAgent, SYSTEM_USER } from "./runner";
import { getTool } from "./tools";

export const BRIEFING_PREFIX = "Daily CEO briefing";

type Amounts = { currency: string; amount: { toString(): string } }[];
interface Snapshot {
  leads: { last7Days: number; last30Days: number };
  sales: { openDeals: number; openPipeline: Amounts; weightedPipeline: Amounts; wonLast30Days: Amounts; wonCountLast30Days: number; winRatePct: number | null };
  finance: { collectedLast30Days: Amounts; outstanding: Amounts; overdue: Amounts; overdueInvoiceCount: number; paymentsAwaitingConfirmation: number };
  projects: { active: number; redHealth: { number: string; name: string }[] };
  support: { open: number; urgent: number; pastResolutionDue: number };
  pendingAiApprovals: number;
}

const m = (a: Amounts) => (a.length ? fmtMulti(a.map((x) => ({ currency: x.currency, amount: x.amount.toString() }))) : "none");

/** Deterministic briefing from live numbers — used when no AI provider is connected (clearly labelled). */
function rulesBriefing(s: Snapshot, risks: { title: string; severity: string }[]) {
  const lines = [
    `**${BRIEFING_PREFIX} — ${new Date().toISOString().slice(0, 10)}**`,
    "_Generated from live data by rules. AI provider not connected, so no AI analysis is included._",
    "",
    `- **Leads:** ${s.leads.last7Days} in the last 7 days · ${s.leads.last30Days} in 30 days`,
    `- **Pipeline:** ${s.sales.openDeals} open deals · ${m(s.sales.openPipeline)} (weighted ${m(s.sales.weightedPipeline)})`,
    `- **Won (30 days):** ${s.sales.wonCountLast30Days} deals · ${m(s.sales.wonLast30Days)}${s.sales.winRatePct != null ? ` · win rate ${s.sales.winRatePct}%` : ""}`,
    `- **Collected (30 days):** ${m(s.finance.collectedLast30Days)} · outstanding ${m(s.finance.outstanding)}`,
    `- **Overdue:** ${s.finance.overdueInvoiceCount} invoices · ${m(s.finance.overdue)}${s.finance.paymentsAwaitingConfirmation ? ` · ${s.finance.paymentsAwaitingConfirmation} payments awaiting confirmation` : ""}`,
    `- **Projects:** ${s.projects.active} active · ${s.projects.redHealth.length} red${s.projects.redHealth.length ? ` (${s.projects.redHealth.map((p) => p.number).join(", ")})` : ""}`,
    `- **Support:** ${s.support.open} open · ${s.support.urgent} urgent · ${s.support.pastResolutionDue} past resolution due`,
    `- **Approvals waiting:** ${s.pendingAiApprovals}`,
  ];
  if (risks.length) lines.push("", "**Top risks**", ...risks.map((r) => `- [${r.severity}] ${r.title}`));
  return lines.join("\n");
}

export async function latestBriefing() {
  return db.aIExecution.findFirst({ where: { agentSlug: "ceo", trigger: "SCHEDULE", request: { startsWith: BRIEFING_PREFIX }, status: { in: ["SUCCEEDED", "AWAITING_APPROVAL"] } }, orderBy: { startedAt: "desc" } });
}

/** Once per UTC day (unless forced). Executives are notified when it is ready. */
export async function generateBriefing(opts: { force?: boolean; actorId?: string } = {}): Promise<number> {
  if (!opts.force) {
    const today = await db.aIExecution.count({ where: { agentSlug: "ceo", trigger: "SCHEDULE", request: { startsWith: BRIEFING_PREFIX }, startedAt: { gte: startOfUtcDay() }, status: { in: ["SUCCEEDED", "AWAITING_APPROVAL"] } } });
    if (today) return 0;
  }
  let executionId: string | null;
  if (getProvider()) {
    const r = await runAgent({
      agentSlug: "ceo",
      user: SYSTEM_USER,
      trigger: "SCHEDULE",
      request: `${BRIEFING_PREFIX}: prepare today's executive briefing for the CEO. Use getBusinessSummary and getInsights, then write: 1) headline numbers (per currency), 2) important deals and pipeline movement, 3) overdue payments, 4) project and support risks, 5) the 3–5 most important recommendations for today. Do not call tools that change data.`,
    });
    if (r.status === "FAILED" || r.status === "BLOCKED") return 0;
    executionId = r.executionId;
  } else {
    const snap = (await getTool("getBusinessSummary")!.run({ user: SYSTEM_USER, agentSlug: "ceo", executionId: null }, {})).data as Snapshot;
    const risks = await db.aIRecommendation.findMany({ where: { status: "OPEN", severity: { in: ["CRITICAL", "HIGH"] } }, orderBy: [{ severity: "desc" }, { createdAt: "desc" }], take: 7, select: { title: true, severity: true } });
    const text = rulesBriefing(snap, risks);
    const e = await db.aIExecution.create({ data: { agentSlug: "ceo", trigger: "SCHEDULE", mode: "OBSERVE", request: `${BRIEFING_PREFIX} (rules)`, status: "SUCCEEDED", provider: "none", toolsUsed: [{ tool: "getBusinessSummary", ok: true, ms: 0 }], result: { text, snapshot: JSON.parse(JSON.stringify(snap)) as Prisma.InputJsonValue }, finishedAt: new Date(), durationMs: 0 } });
    executionId = e.id;
  }
  await notify({ type: "ai.briefing", title: `${BRIEFING_PREFIX} is ready`, href: "/admin/ai#briefing", permission: "executive:view" });
  await audit({ userId: opts.actorId ?? null, action: "ai.briefing.generated", entity: "AIExecution", entityId: executionId ?? undefined });
  return 1;
}
