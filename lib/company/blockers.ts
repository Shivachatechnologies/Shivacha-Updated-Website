import "server-only";
import { db } from "@/lib/db/client";
import { getProvider } from "@/lib/ai/provider";
import { mailMode } from "@/lib/email/mailer";
import { enrichmentProvider, leadProviders, SOCIAL_PROVIDERS, unsubscribeSecret } from "@/lib/growth/providers";
import { adsProviders, ADS_PROVIDER_KEYS } from "@/lib/ads/providers";
import { hydrateVault } from "@/lib/integrations/vault";
import { blockingProviders, stageBlockers, type Capability, type StageBlocker } from "./blocker-rules";

/** Which capabilities are connected right now (configuration present; see the Integration Center for live checks). */
export async function capabilityState(): Promise<Record<Capability, boolean>> {
  await hydrateVault();
  return {
    ai: !!getProvider(),
    discovery: leadProviders.apollo.status().connected || leadProviders.hunter.status().connected,
    verification: enrichmentProvider.status().connected,
    email: mailMode() !== "none" && !!unsubscribeSecret(),
    social: Object.values(SOCIAL_PROVIDERS).some((p) => p.platform !== "YOUTUBE" && p.status().connected),
    ads: ADS_PROVIDER_KEYS.some((k) => adsProviders[k].connected()),
  };
}

export interface HumanAction {
  kind: "CONNECT" | "APPROVE" | "UNBLOCK";
  text: string;
  href: string;
}

/** Provider blockers per stage plus the human actions the objective is waiting on (from records). */
export async function objectiveBlockers(objectiveId: string): Promise<{ stages: StageBlocker[]; providers: string[]; actions: HumanAction[] }> {
  const o = await db.aIObjective.findUnique({ where: { id: objectiveId }, select: { playbook: true, plan: true } });
  if (!o) return { stages: [], providers: [], actions: [] };
  const plan = Array.isArray(o.plan) ? (o.plan as { key: string; title: string }[]) : [];
  const stages = stageBlockers(o.playbook, plan.length ? plan : [{ key: "plan", title: "Chief of Staff plan" }], await capabilityState());
  const providers = blockingProviders(stages);
  const [taskIds, blocked] = await Promise.all([
    db.aITask.findMany({ where: { objectiveId }, select: { id: true } }),
    db.aITask.findMany({ where: { objectiveId, blockedReason: { not: null } }, select: { id: true, title: true, blockedReason: true }, take: 10 }),
  ]);
  const approvals = taskIds.length ? await db.aIApproval.count({ where: { status: "PENDING", taskId: { in: taskIds.map((t) => t.id) } } }) : 0;
  const actions: HumanAction[] = [
    ...providers.map((p) => ({ kind: "CONNECT" as const, text: `Connect ${p}`, href: "/admin/integrations/connect" })),
    ...(approvals ? [{ kind: "APPROVE" as const, text: `${approvals} approval request(s) waiting`, href: "/admin/ai/approvals" }] : []),
    ...blocked.map((t) => ({ kind: "UNBLOCK" as const, text: `${t.title}: ${t.blockedReason}`, href: `/admin/ai/tasks/${t.id}` })),
  ];
  return { stages, providers, actions };
}
