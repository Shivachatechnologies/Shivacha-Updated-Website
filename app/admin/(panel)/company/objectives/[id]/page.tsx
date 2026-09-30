import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { agentBySlug } from "@/lib/ai/catalog";
import { refreshObjective, progressFrom } from "@/lib/company/objective-status";
import { PLAYBOOKS, type Playbook } from "@/lib/company/objective-rules";
import { campaignScorecard } from "@/lib/company/analytics";
import { REGIONS } from "@/lib/company/org";
import type { PlanStage } from "@/lib/company/objectives";
import { cancelObjectiveAction } from "@/lib/company/actions";
import { fmtMoney } from "@/lib/os/money";
import { PageHeader, fmtDate } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/forms";
import { ConfirmButton } from "@/components/admin/client";
import { KV, Kpi, KpiGrid, StatusBadge, Timeline } from "@/components/admin/os";
import { Card, CompanyTabs, COMPANY_CRUMB, Meter } from "@/components/admin/company/ui";

export const metadata = { title: "Objective" };
export const dynamic = "force-dynamic";

const name = (slug: string) => agentBySlug(slug)?.name.replace(/^AI\s+/, "") ?? slug;

export default async function ObjectivePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAccess("ai:view", "AI_WORKFORCE");
  const { id } = await params;
  await refreshObjective(id);
  const o = await db.aIObjective.findUnique({ where: { id } });
  if (!o) notFound();
  const [tasks, activity, messages, research] = await Promise.all([
    db.aITask.findMany({ where: { objectiveId: id }, orderBy: { createdAt: "asc" } }),
    db.aIActivity.findMany({ where: { objectiveId: id }, orderBy: { createdAt: "desc" }, take: 80 }),
    db.aIWorkMessage.findMany({ where: { objectiveId: id }, orderBy: { createdAt: "desc" }, take: 60 }),
    db.marketResearch.findMany({ where: { objectiveId: id }, select: { id: true, title: true, status: true } }),
  ]);
  const approvals = tasks.length ? await db.aIApproval.findMany({ where: { taskId: { in: tasks.map((t) => t.id) } }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, action: true, status: true, risk: true, agentSlug: true, createdAt: true } }) : [];
  const creator = o.createdById ? await db.user.findUnique({ where: { id: o.createdById }, select: { name: true } }) : null;
  const score = o.campaignId && can(user.role, "growth:view") ? await campaignScorecard(o.campaignId) : null;
  const p = progressFrom(tasks);
  const plan = (Array.isArray(o.plan) ? o.plan : []) as unknown as PlanStage[];
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const children = (pid: string | null) => tasks.filter((t) => t.parentTaskId === pid);
  const cost = tasks.length ? await db.aIUsage.aggregate({ where: { executionId: { in: tasks.map((t) => t.executionId).filter((x): x is string => !!x) } }, _sum: { costUsd: true } }) : null;

  const Tree = ({ pid, depth }: { pid: string | null; depth: number }) => (
    <ul className={depth ? "ml-4 border-l border-line pl-3" : ""}>
      {children(pid).map((t) => (
        <li key={t.id} className="py-1.5">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <StatusBadge value={t.status} />
            <Link href={`/admin/ai/tasks/${t.id}`} className="font-medium text-fg hover:underline">{t.title}</Link>
            <span className="text-xs text-dim">{name(t.agentSlug)}{t.reviewStatus ? ` · review ${t.reviewStatus.toLowerCase().replace(/_/g, " ")}` : ""}{t.revisions ? ` · revised ${t.revisions}×` : ""}</span>
          </div>
          {t.currentStep && t.status !== "DONE" && <p className="text-xs text-muted">{t.currentStep}</p>}
          {t.blockedReason && <p className="text-xs text-red-700">Blocker: {t.blockedReason}</p>}
          {t.status === "FAILED" && t.error && <p className="text-xs text-red-700">{t.error}</p>}
          {t.dependsOn.length > 0 && <p className="text-xs text-dim">After: {t.dependsOn.map((d) => byId.get(d)?.title ?? d).join(", ")}</p>}
          <Tree pid={t.id} depth={depth + 1} />
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <PageHeader
        title={o.title}
        description={o.statement}
        crumbs={[COMPANY_CRUMB, { label: "Objectives", href: "/admin/company/objectives" }, { label: o.title }]}
        actions={can(user.role, "executive:view") && !["CANCELLED", "COMPLETED"].includes(o.status) ? (
          <ActionForm action={cancelObjectiveAction.bind(null, o.id)}>
            <ConfirmButton message="Cancel this objective? Open tasks are cancelled and pending approvals withdrawn.">Cancel objective</ConfirmButton>
          </ActionForm>
        ) : undefined}
      />
      <CompanyTabs active="objectives" />
      {o.blockedReason && <p className="mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">BLOCKED — {o.blockedReason}</p>}
      <div className="mt-4">
        <KpiGrid cols={6}>
          <Kpi label="Status" value={<StatusBadge value={o.status} />} />
          <Kpi label="Progress" value={`${p.pct}%`} hint={`${p.done}/${p.total} tasks done`} />
          <Kpi label="Open tasks" value={p.open} />
          <Kpi label="Failed" value={p.failed} tone={p.failed ? "red" : undefined} />
          <Kpi label="Approvals pending" value={approvals.filter((a) => a.status === "PENDING").length} tone={approvals.some((a) => a.status === "PENDING") ? "amber" : undefined} href="/admin/ai/approvals" />
          <Kpi label="AI cost" value={`$${Number(cost?._sum.costUsd ?? 0).toFixed(2)}`} hint="Metered, latest run of each task" />
        </KpiGrid>
        <div className="mt-2"><Meter pct={p.pct} tone={o.status === "BLOCKED" ? "red" : o.status === "COMPLETED" ? "green" : "blue"} /></div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <Card title="Plan">
            <KV items={[["Playbook", PLAYBOOKS[o.playbook as Playbook] ?? o.playbook], ["Target", o.targetMetric ? `${o.targetMetric.replace(/_/g, " ")} = ${o.targetValue} (a target, not a guarantee)` : "—"], ["Region", o.regionKey ? (REGIONS.find((r) => r.key === o.regionKey)?.name ?? o.regionKey) : "—"], ["Due", o.dueAt ? fmtDate(o.dueAt) : "—"], ["Set by", creator?.name ?? "—"], ["Created", fmtDate(o.createdAt, true)]]} />
            {plan.length > 0 && (
              <ol className="mt-3 space-y-1.5 text-sm">
                {plan.map((s, i) => {
                  const t = s.taskId ? byId.get(s.taskId) : null;
                  return (
                    <li key={s.key} className="flex flex-wrap items-center gap-2">
                      <span className="w-5 text-right text-xs text-dim">{i + 1}.</span>
                      <StatusBadge value={t?.status ?? "QUEUED"} />
                      <span className="font-medium">{s.title}</span>
                      <span className="text-xs text-dim">→ {name(s.ownerSlug)}{s.after.length ? ` · after ${s.after.join(", ")}` : ""}{s.note ? ` · ${s.note}` : ""}</span>
                    </li>
                  );
                })}
              </ol>
            )}
            {o.campaignId && <p className="mt-3 text-sm"><Link href={`/admin/marketing/leads/${o.campaignId}`} className="text-brand-blue hover:underline">Lead campaign →</Link></p>}
            {research.map((r) => <p key={r.id} className="mt-1 text-sm"><Link href={`/admin/marketing/market/${r.id}`} className="text-brand-blue hover:underline">{r.title}</Link> <StatusBadge value={r.status} /></p>)}
          </Card>
          <Card title="Work breakdown (real tasks)">{tasks.length ? <Tree pid={null} depth={0} /> : <p className="text-sm text-dim">No tasks.</p>}</Card>
          {score && (
            <Card title="Campaign results (real data only)">
              <KpiGrid cols={4}>
                <Kpi label="Prospects" value={score.funnel?.discovered ?? 0} hint={`${score.funnel?.qualified ?? 0} qualified`} />
                <Kpi label="CRM leads" value={score.leads} hint={`${score.qualifiedLeads} qualified`} />
                <Kpi label="Meetings" value={score.meetings} />
                <Kpi label="Opportunities" value={score.opportunities} hint={Object.entries(score.revenue).map(([c, v]) => fmtMoney(String(v), c)).join(" · ") || "no revenue yet"} />
              </KpiGrid>
            </Card>
          )}
          <Card title="CEO report">{o.result ? <div className="text-sm whitespace-pre-wrap text-fg">{o.result}</div> : <p className="text-sm text-dim">The Chief of Staff writes the report after reviewing the team&apos;s work. Nothing is reported before the work is done.</p>}</Card>
        </div>
        <div className="min-w-0 space-y-4">
          <Card title="AI-to-AI communication">
            {messages.length ? (
              <ul className="space-y-2">
                {messages.map((m) => (
                  <li key={m.id} className="text-sm">
                    <p><StatusBadge value={m.kind} /> <span className="text-xs text-dim">{name(m.fromSlug)} → {m.toSlug ? name(m.toSlug) : "a person"} · {fmtDate(m.createdAt, true)}</span></p>
                    <p className="text-fg">{m.subject}</p>
                    {m.kind !== "DELEGATION" && <p className="text-xs text-muted">{m.body.slice(0, 300)}</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-dim">No messages yet.</p>
            )}
          </Card>
          <Card title="Approvals">
            {approvals.length ? (
              <ul className="space-y-1.5 text-sm">
                {approvals.map((a) => (
                  <li key={a.id}><StatusBadge value={a.status} /> <Link className="hover:underline" href={`/admin/ai/approvals/${a.id}`}>{a.action}</Link> <span className="text-xs text-dim">{name(a.agentSlug)} · {a.risk.toLowerCase()}</span></li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-dim">No approvals requested.</p>
            )}
          </Card>
          <Card title="Execution timeline">
            <Timeline items={activity.map((a) => ({ id: a.id, at: a.createdAt, title: a.summary, kind: a.type, who: name(a.agentSlug) }))} empty="Nothing has happened yet." />
          </Card>
        </div>
      </div>
    </>
  );
}
