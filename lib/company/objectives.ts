import "server-only";
import { db } from "@/lib/db/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { audit } from "@/lib/audit";
import { agentBySlug } from "@/lib/ai/catalog";
import { createEmployeeTask } from "@/lib/ai/workforce/engine";
import { logEmployeeActivity } from "@/lib/ai/workforce/activity";
import { saveMemory } from "@/lib/ai/workforce/memory";
import { growthStop } from "@/lib/growth/settings";
import { hydrateVault } from "@/lib/integrations/vault";
import { postMessage } from "./delegation";
import { detectPlaybook, detectRegion, parseTarget, planFor, PLAYBOOKS, type Playbook } from "./objective-rules";
import { refreshObjective } from "./objective-status";
import { ensureOrganisationOnce, getCompanyProfile } from "./organisation";
import { placementOf, REGIONS } from "./org";
import { requestMarketResearch } from "./research-request";
import { stageBlockers } from "./blocker-rules";
import { capabilityState } from "./blockers";

const json = (v: unknown) => JSON.parse(JSON.stringify(v ?? null)) as Prisma.InputJsonValue;

export class ObjectiveError extends Error {}

export interface PlanStage {
  key: string;
  title: string;
  ownerSlug: string;
  taskId: string | null;
  after: string[];
  note?: string;
}

/**
 * CEO objective → company plan → real tasks.
 * Known objective types use a deterministic playbook: the Chief of Staff's executives each get a real task, with
 * dependencies, and system steps (lead campaign record, market research request) are created directly. Anything else
 * goes to the Chief of Staff, who plans and delegates with the delegation tools. The Chief of Staff's task waits for
 * the work, reviews it and writes the CEO report. Nothing runs outside the normal AI runtime and approval policy.
 */
export async function createObjective(i: { statement: string; title?: string | null; dueAt?: Date | null; userId: string }): Promise<{ id: string; existing: boolean }> {
  const statement = i.statement.trim().slice(0, 4000);
  if (statement.length < 8) throw new ObjectiveError("Describe the objective in a sentence.");
  await hydrateVault();
  const stop = await growthStop({ kind: "ai", agent: "ceo" });
  if (stop) throw new ObjectiveError(`The AI company is stopped: ${stop}`);
  // Double-submit protection: the same objective from the same person within 10 minutes is the same objective.
  const recent = await db.aIObjective.findFirst({ where: { createdById: i.userId, statement, createdAt: { gte: new Date(Date.now() - 10 * 60_000) } }, select: { id: true } });
  if (recent) return { id: recent.id, existing: true };
  await ensureOrganisationOnce();
  const profile = await getCompanyProfile();

  const playbook: Playbook = detectPlaybook(statement);
  const target = parseTarget(statement, playbook);
  const region = detectRegion(statement);
  const title = (i.title?.trim() || statement.split(/[.\n]/)[0]).slice(0, 200);
  const o = await db.aIObjective.create({ data: { title, statement, playbook, regionKey: region, targetMetric: target?.metric ?? null, targetValue: target?.value ?? null, dueAt: i.dueAt ?? null, createdById: i.userId, status: "PLANNING" } });

  const stages = planFor(playbook, statement, region).filter((s) => {
    const dept = placementOf(s.owner)?.department;
    return !dept || profile.departments.includes(dept);
  });
  // Provider blockers known at planning time go into the Chief of Staff's brief, so the report names them.
  const known = stageBlockers(playbook, stages.length ? stages : [{ key: "plan", title: "Plan" }], await capabilityState());
  const root = await createEmployeeTask({
    agentSlug: "ceo",
    kind: "OBJECTIVE",
    title: `Objective: ${title}`,
    priority: "HIGH",
    deadline: i.dueAt ?? null,
    requestedById: i.userId,
    source: "objective",
    objectiveId: o.id,
    status: stages.length ? "WAITING" : "QUEUED",
    instructions: [
      `The CEO set this company objective: ${statement}`,
      target ? `Measurable target: ${target.metric} = ${target.value}. It is a target, not a guarantee — report actual numbers only.` : "",
      region ? `Region: ${REGIONS.find((r) => r.key === region)?.name}.` : "",
      stages.length
        ? `Playbook "${PLAYBOOKS[playbook]}": the plan below was assigned to your executives. When their work is back, review each result with reviewDelegatedWork (accept, or revise with a precise note), delegate follow-up work if needed, then write the CEO report.`
        : "Plan the objective: break it into 3–8 concrete pieces of work and delegate each to the right executive or director with delegateTask (use dependsOn for ordering). End your run after delegating; you will resume when the work is back to review it and write the CEO report.",
      known.length ? `Provider blockers at planning time (re-check with getProviderBlockers before the report; write each still-missing one as "BLOCKED BY <provider>"):\n${known.map((b) => `- ${b.message}`).join("\n")}` : "",
      "CEO report: what was achieved against the target with real numbers and record links; actual vs target; every stage that is blocked, written as \"BLOCKED BY <provider>\" or \"BLOCKED: approval pending\"; risks; and what requires human action. A blocked stage is never reported as done. Never claim an external action happened without confirmation.",
    ].filter(Boolean).join("\n\n"),
  });

  const plan: PlanStage[] = [];
  const idOf = new Map<string, string>();
  let campaignId: string | null = null;
  for (const st of stages) {
    const after = (st.after ?? []).map((k) => idOf.get(k)).filter((x): x is string => !!x);
    let taskId: string | null = null;
    let note: string | undefined;
    if (st.system === "MARKET_RESEARCH") {
      const r = await requestMarketResearch({ params: { market: statement.slice(0, 200), ...(region ? { region: REGIONS.find((x) => x.key === region)?.name } : {}) }, title: `${st.title}: ${title}`.slice(0, 200), userId: i.userId, objectiveId: o.id, parentTaskId: root.id, delegatedBySlug: "ceo", dependsOn: after });
      taskId = r.taskId;
      note = `Market research ${r.id}`;
    } else {
      let instructions = st.instructions;
      if (st.system === "CREATE_CAMPAIGN") {
        const c = await db.campaign.create({
          data: {
            name: `Lead gen: ${title}`.slice(0, 200),
            channel: "OTHER",
            status: "PLANNED",
            objective: statement.slice(0, 500),
            market: region ? REGIONS.find((r) => r.key === region)?.name : null,
            dailyLeadTarget: target?.metric.endsWith("_per_day") ? Math.min(10_000, Math.round(target.value)) : null,
            regionKey: region,
            ownerId: i.userId,
            leadGen: json({ sources: ["apollo", "hunter"], titles: [], countries: [], domains: [], industries: [], totalTarget: target && !target.metric.endsWith("_per_day") && target.metric.includes("lead") ? target.value : null, mode: "MANUAL", minFit: 60, duplicatesTotal: 0, lastRun: null }),
          },
        });
        campaignId = c.id;
        instructions += `\n\nCampaign id: ${c.id} (/admin/marketing/leads/${c.id}). Its daily target is ${c.dailyLeadTarget ?? "not set"}; the ICP fields are empty until research defines them — a person edits them on the campaign page.`;
        note = `Campaign ${c.id}`;
      }
      const t = await createEmployeeTask({ agentSlug: st.owner, title: st.title, instructions, priority: "HIGH", deadline: i.dueAt ?? null, requestedById: i.userId, source: "objective-plan", objectiveId: o.id, parentTaskId: root.id, delegatedBySlug: "ceo", dependsOn: after });
      taskId = t.id;
    }
    idOf.set(st.key, taskId);
    plan.push({ key: st.key, title: st.title, ownerSlug: st.owner, taskId, after: st.after ?? [], note });
    await postMessage({ fromSlug: "ceo", toSlug: st.owner, kind: "DELEGATION", subject: st.title, body: st.instructions, taskId, objectiveId: o.id, data: { stage: st.key } });
  }

  await db.aIObjective.update({ where: { id: o.id }, data: { rootTaskId: root.id, plan: json(plan), campaignId, status: "ACTIVE" } });
  await logEmployeeActivity({ agentSlug: "ceo", taskId: root.id, objectiveId: o.id, type: "objective.planned", summary: stages.length ? `Planned "${title}" (${PLAYBOOKS[playbook]}): ${plan.map((p) => `${agentBySlug(p.ownerSlug)?.name.replace(/^AI\s+/, "") ?? p.ownerSlug} — ${p.title}`).join("; ")}`.slice(0, 500) : `Received "${title}"; the Chief of Staff will plan and delegate it`, actorId: i.userId });
  await saveMemory({ agentSlug: "ceo", kind: "INSTRUCTION", scope: "COMPANY", title: `CEO objective: ${title}`, content: `${statement}${target ? `\nTarget: ${target.metric} = ${target.value}` : ""}\nObjective page: /admin/company/objectives/${o.id}`, createdById: i.userId, expiresInDays: 365 });
  await audit({ userId: i.userId, action: "company.objective.created", entity: "AIObjective", entityId: o.id, metadata: { playbook, target, region, tasks: plan.length + 1, campaignId } });
  await refreshObjective(o.id);
  return { id: o.id, existing: false };
}

/** CEO cancels an objective: open tasks are cancelled and their pending approvals withdrawn. */
export async function cancelObjective(id: string, userId: string, name: string) {
  const o = await db.aIObjective.findUnique({ where: { id } });
  if (!o) throw new ObjectiveError("Objective not found.");
  if (o.status === "CANCELLED" || o.status === "COMPLETED") throw new ObjectiveError(`This objective is already ${o.status.toLowerCase()}.`);
  const open = await db.aITask.findMany({ where: { objectiveId: id, status: { in: ["QUEUED", "RUNNING", "PAUSED", "AWAITING_APPROVAL", "WAITING"] } }, select: { id: true } });
  await db.aITask.updateMany({ where: { id: { in: open.map((t) => t.id) } }, data: { status: "CANCELLED", currentStep: null, completedAt: new Date() } });
  await db.aIApproval.updateMany({ where: { taskId: { in: open.map((t) => t.id) }, status: "PENDING" }, data: { status: "EXPIRED", decisionNote: `Objective cancelled by ${name}` } });
  await db.aIObjective.update({ where: { id }, data: { status: "CANCELLED", blockedReason: null } });
  await logEmployeeActivity({ agentSlug: "ceo", objectiveId: id, type: "objective.cancelled", summary: `Objective cancelled by ${name}: ${o.title} (${open.length} open task(s) cancelled)`, actorId: userId });
  await audit({ userId, action: "company.objective.cancelled", entity: "AIObjective", entityId: id, metadata: { tasks: open.length } });
}
