import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { canDecide } from "@/lib/ai/approvals";
import { agentBySlug } from "@/lib/ai/catalog";
import { runnableAgents } from "@/lib/ai/agents";
import { decideApprovalAction } from "@/lib/ai/actions";
import { hrefFor } from "@/lib/automation/href";
import { reassignTaskAction } from "@/lib/ai/workforce/actions";
import { displayName } from "@/lib/ai/workforce/employees";
import { parseSubtasks, permissionLabel, TASK_KINDS } from "@/lib/ai/workforce/profiles";
import { PageHeader, Panel, fmtDate, inputCls } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/forms";
import { SubmitButton } from "@/components/admin/client";
import { KV, StatusBadge } from "@/components/admin/os";
import { Markdown } from "@/components/admin/ai/markdown";
import { AgentAvatar, ProgressBar, SubtaskList, fmtDuration, taskTone } from "@/components/admin/ai/workforce";
import { TaskControls } from "@/components/admin/ai/workforce-forms";
import { AutoRefresh } from "@/components/admin/ai/auto-refresh";

export const metadata = { title: "AI task" };
export const maxDuration = 300;

type ToolUse = { tool: string; ok: boolean; ms: number; error?: string };

export default async function TaskDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAccess("ai:view", "AI_WORKFORCE");
  const { id } = await params;
  const t = await db.aITask.findUnique({ where: { id } });
  if (!t) notFound();
  const configure = can(user.role, "ai:configure");
  if (t.requestedById !== user.id && !configure) notFound();
  const [employee, requester, approvals, activity, previous] = await Promise.all([
    db.aIAgent.findUnique({ where: { slug: t.agentSlug }, select: { name: true, personaName: true, jobTitle: true } }),
    t.requestedById ? db.user.findUnique({ where: { id: t.requestedById }, select: { name: true } }) : null,
    db.aIApproval.findMany({ where: { taskId: id }, orderBy: { createdAt: "asc" } }),
    db.aIActivity.findMany({ where: { taskId: id }, orderBy: { createdAt: "asc" }, take: 300 }),
    t.reassignedFrom ? db.aIAgent.findUnique({ where: { slug: t.reassignedFrom }, select: { name: true, personaName: true } }) : null,
  ]);
  const name = employee ? displayName(employee) : agentBySlug(t.agentSlug)?.name ?? t.agentSlug;
  const subtasks = parseSubtasks(t.subtasks);
  const now = new Date().getTime();
  const running = t.status === "RUNNING";
  const finished = ["DONE", "FAILED", "CANCELLED"].includes(t.status);
  const elapsed = t.startedAt ? (t.completedAt ?? new Date(now)).getTime() - t.startedAt.getTime() : null;
  // Straight-line estimate from measured progress; shown only while it is meaningful.
  const expected = running && t.startedAt && t.progress >= 10 && t.progress < 100 && elapsed ? new Date(t.startedAt.getTime() + (elapsed * 100) / t.progress) : null;
  const tools = (Array.isArray(t.toolsUsed) ? t.toolsUsed : []) as ToolUse[];
  const liveTools = activity.filter((a) => ["tool.used", "tool.failed", "action.executed", "approval.requested"].includes(a.type)).map((a) => (a.data as { tool?: string } | null)?.tool).filter((x): x is string => !!x);
  const toolCounts = new Map<string, number>();
  for (const x of tools.length ? tools.map((u) => u.tool) : liveTools) toolCounts.set(x, (toolCounts.get(x) ?? 0) + 1);
  const records = (Array.isArray(t.recordsAffected) ? t.recordsAffected : []) as string[];
  const errors = [t.error, ...activity.filter((a) => a.type === "tool.failed" || a.type === "subtask.failed").map((a) => a.summary)].filter((x): x is string => !!x);
  const others = runnableAgents(user.role).filter((a) => a.slug !== t.agentSlug);
  const canChange = t.requestedById === user.id || configure;

  return (
    <>
      <PageHeader
        title={t.title}
        description={`${TASK_KINDS[t.kind as keyof typeof TASK_KINDS] ?? t.kind} for ${name}`}
        crumbs={[{ label: "AI", href: "/admin/ai/command-center" }, { label: "Tasks", href: "/admin/ai/tasks" }, { label: "Task" }]}
        actions={canChange ? <TaskControls id={t.id} status={t.status} size="md" /> : undefined}
      />
      <AutoRefresh active={running || t.status === "QUEUED"} every={3000} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <section className="rounded-lg border border-line bg-ink-900 p-4">
            <div className="flex items-center gap-3">
              <AgentAvatar slug={t.agentSlug} className="size-10 rounded-xl" />
              <div className="min-w-0 flex-1">
                <Link href={`/admin/ai/employees/${t.agentSlug}`} className="text-sm font-semibold text-fg hover:underline">{name}</Link>
                <p className="truncate text-xs text-muted">{employee?.jobTitle ?? agentBySlug(t.agentSlug)?.name}</p>
              </div>
              <StatusBadge value={t.status} />
            </div>
            <div className="mt-4 flex items-center gap-3">
              <ProgressBar value={t.progress} tone={taskTone(t.status)} className="h-2.5 flex-1" />
              <span className="w-12 text-right font-mono text-lg font-semibold text-fg tabular-nums">{t.progress}%</span>
            </div>
            <p className="mt-2 text-sm text-muted">
              <span className="text-dim">Current:</span> {t.currentStep ?? (t.status === "DONE" ? "Completed" : t.status === "QUEUED" ? "Waiting to start" : t.status.toLowerCase().replace(/_/g, " "))}
            </p>
          </section>

          <Panel title="Subtasks"><SubtaskList items={subtasks} /></Panel>

          {approvals.length > 0 && (
            <Panel title={`Approvals (${approvals.filter((a) => a.status === "PENDING").length} pending)`}>
              <ul className="divide-y divide-line">
                {approvals.map((a) => {
                  const decide = a.status === "PENDING" && canDecide(user, a.requiredPermission);
                  return (
                    <li key={a.id} className="py-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/admin/ai/approvals/${a.id}`} className="min-w-0 flex-1 text-sm font-medium text-fg hover:underline">{a.action}</Link>
                        <StatusBadge value={a.risk} />
                        <StatusBadge value={a.status} />
                      </div>
                      <p className="mt-0.5 text-xs text-muted">{permissionLabel(a.tool)} · requested {fmtDate(a.createdAt, true)}</p>
                      {decide && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <ActionForm action={decideApprovalAction.bind(null, a.id)}><input type="hidden" name="decision" value="APPROVE" /><SubmitButton className="h-8 text-xs">Approve</SubmitButton></ActionForm>
                          <Link href={`/admin/ai/approvals/${a.id}`} className="btn-secondary h-8 px-3 text-xs">Edit &amp; approve</Link>
                          <ActionForm action={decideApprovalAction.bind(null, a.id)}><input type="hidden" name="decision" value="REJECT" /><SubmitButton variant="secondary" className="h-8 text-xs text-red-700">Reject</SubmitButton></ActionForm>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Panel>
          )}

          {t.result && (
            <Panel title={finished || t.status === "AWAITING_APPROVAL" ? "Result" : "Latest output"}>
              <Markdown text={t.result} />
              {t.executionId && <p className="mt-3 text-[11.5px] text-dim"><Link href={`/admin/ai/logs/${t.executionId}`} className="hover:text-fg">Full execution log</Link></p>}
            </Panel>
          )}

          <Panel title="Activity">
            {activity.length === 0 ? <p className="text-sm text-dim">No activity yet.</p> : (
              <ol className="space-y-2">
                {activity.map((a) => (
                  <li key={a.id} className="flex gap-3 text-sm">
                    <time className="w-16 shrink-0 font-mono text-[12px] text-dim tabular-nums" dateTime={a.createdAt.toISOString()}>{a.createdAt.toISOString().slice(11, 19)}</time>
                    <span className={a.type.endsWith("failed") ? "text-red-700" : a.type.startsWith("approval") ? "text-amber-700" : a.type === "task.completed" ? "font-medium text-emerald-700" : "text-fg"}>{a.summary}</span>
                  </li>
                ))}
              </ol>
            )}
            <p className="mt-3 text-[11px] text-dim">Times are UTC. Every line is written when the event happens.</p>
          </Panel>
        </div>

        <aside className="space-y-5">
          <Panel title="Task">
            <KV cols={1} items={[
              ["Assigned by", requester?.name ?? (t.automationId ? <Link key="a" href={`/admin/automations/${t.automationId}`} className="text-brand-blue hover:underline">Recurring responsibility</Link> : t.source)],
              ["Priority", <StatusBadge key="p" value={t.priority} />],
              ["Deadline", t.deadline ? <span key="d" className={t.deadline.getTime() < now && !finished ? "text-red-700" : undefined}>{fmtDate(t.deadline, true)}</span> : "—"],
              ["Time started", t.startedAt ? fmtDate(t.startedAt, true) : "Not started"],
              ["Time elapsed", elapsed != null ? fmtDuration(elapsed) : "—"],
              ["Expected completion", expected ? `${fmtDate(expected, true)} (estimate)` : t.completedAt ? `Finished ${fmtDate(t.completedAt, true)}` : "—"],
              ["Attempts", String(t.attempts)],
              ["Reassigned from", previous ? displayName(previous) : "—"],
            ]} />
            {t.instructions && <div className="mt-4 border-t border-line pt-3"><p className="text-[11px] font-medium tracking-wide text-dim uppercase">Instructions</p><p className="mt-1 whitespace-pre-wrap text-sm text-fg">{t.instructions}</p></div>}
          </Panel>
          <Panel title="Tools used">
            {toolCounts.size ? <ul className="space-y-1 text-sm">{[...toolCounts].map(([tool, c]) => <li key={tool} className="flex justify-between gap-2"><span>{permissionLabel(tool)}</span><span className="font-mono text-xs text-dim">{c}×</span></li>)}</ul> : <p className="text-sm text-dim">None yet.</p>}
          </Panel>
          <Panel title={`Records affected (${records.length})`}>
            {records.length ? <ul className="space-y-1 text-sm">{records.slice(0, 60).map((r) => { const [entity, rid] = r.split(":"); const h = hrefFor({ entity, entityId: rid }); return <li key={r}>{h ? <Link href={h} className="text-brand-blue hover:underline">{entity} {rid.slice(-6)}</Link> : r}</li>; })}</ul> : <p className="text-sm text-dim">No records changed.</p>}
          </Panel>
          {errors.length > 0 && (
            <Panel title="Errors">
              <ul className="space-y-1.5 text-sm text-red-700">{errors.slice(0, 20).map((x, i) => <li key={i}>{x}</li>)}</ul>
            </Panel>
          )}
          {canChange && t.status !== "DONE" && t.status !== "CANCELLED" && others.length > 0 && (
            <Panel title="Reassign">
              <ActionForm action={reassignTaskAction.bind(null, t.id)} className="flex gap-2">
                <select name="agent" aria-label="New employee" className={inputCls}>{others.map((a) => <option key={a.slug} value={a.slug}>{a.name.replace(/^AI\s+/, "")}</option>)}</select>
                <SubmitButton variant="secondary">Reassign</SubmitButton>
              </ActionForm>
            </Panel>
          )}
        </aside>
      </div>
    </>
  );
}
