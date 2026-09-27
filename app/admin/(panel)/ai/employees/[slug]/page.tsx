import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { agentBySlug, AGENTS } from "@/lib/ai/catalog";
import { canRunAgent, getAgentConfig } from "@/lib/ai/agents";
import { getTool } from "@/lib/ai/tools";
import { employeeDirectory } from "@/lib/ai/workforce/employees";
import { memoryScope } from "@/lib/ai/workforce/memory";
import { employeePerformance } from "@/lib/ai/workforce/performance";
import { goalMetricOptions, HUMAN_APPROVAL_RULES, MEMORY_KINDS, OPEN_TASK_STATUSES, permissionLabel, SCHEDULES, TASK_KINDS, type MemoryKind, type ScheduleTrigger } from "@/lib/ai/workforce/profiles";
import { addGoalAction, addMemoryAction, addRecurringAction, deleteGoalAction, deleteMemoryAction, setAvailabilityAction, updateEmployeeProfileAction } from "@/lib/ai/workforce/actions";
import { pumpSoon } from "@/lib/ai/workforce/scheduler";
import { PageHeader, Panel, fmtDate, inputCls, labelCls } from "@/components/admin/ui";
import { ActionForm, FieldError } from "@/components/admin/forms";
import { SubmitButton } from "@/components/admin/client";
import { CheckField, DataTable, KV, SelectField, StatusBadge, Tabs, TextArea, TextField, pick, type SP } from "@/components/admin/os";
import { AgentAvatar, EmployeeStatusPill, GoalBar, ProgressBar, StatTile, WorkforceNav, ago, fmtDuration, taskTone } from "@/components/admin/ai/workforce";
import { AssignTaskForm, TaskControls } from "@/components/admin/ai/workforce-forms";
import { AutoRefresh } from "@/components/admin/ai/auto-refresh";
import { ReportPanel } from "@/components/admin/ai/reports";
import { usd } from "@/components/admin/command/workforce";

export const metadata = { title: "AI Employee" };
export const maxDuration = 300;

const TABS = ["overview", "tasks", "goals", "activity", "performance", "knowledge", "tools", "permissions", "memory", "settings"] as const;
type Tab = (typeof TABS)[number];

export default async function EmployeeProfile({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SP> }) {
  const user = await requireAccess("ai:view", "AI_WORKFORCE");
  const { slug } = await params;
  const spec = agentBySlug(slug);
  if (!spec) notFound();
  const sp = await searchParams;
  const tab: Tab = pick(sp, "tab", TABS) ?? "overview";
  const now = new Date();
  const dir = await employeeDirectory(now);
  const e = dir.find((x) => x.slug === slug)!;
  const cfg = (await getAgentConfig(slug))!;
  const row = await db.aIAgent.findUniqueOrThrow({ where: { slug } });
  const configure = can(user.role, "ai:configure");
  const direct = canRunAgent(user.role, spec);
  const pendingApprovals = await db.aIApproval.count({ where: { status: "PENDING" } });
  pumpSoon();
  const href = (t: Tab) => `/admin/ai/employees/${slug}${t === "overview" ? "" : `?tab=${t}`}`;

  return (
    <>
      <PageHeader title={e.name} description={`${e.jobTitle} · ${e.department}`} crumbs={[{ label: "AI", href: "/admin/ai/command-center" }, { label: "Employees", href: "/admin/ai/employees" }, { label: e.name }]} actions={direct && can(user.role, "ai:execute") ? <Link href={`/admin/ai/tasks?new=1&agent=${slug}`} className="btn-primary h-9 px-3.5 text-[13px]">Assign task</Link> : undefined} />
      <WorkforceNav active="employees" counts={{ approvals: pendingApprovals }} />
      <AutoRefresh active={e.status === "WORKING"} every={5000} />

      <section className="mb-5 flex flex-col gap-4 rounded-lg border border-line bg-ink-900 p-4 md:flex-row md:items-center">
        <AgentAvatar slug={slug} className="size-14 rounded-2xl [&_svg]:size-7" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-fg">{e.name}</h2>
            <EmployeeStatusPill status={e.status} />
            <StatusBadge value={cfg.mode} />
          </div>
          <p className="text-sm text-muted">{e.jobTitle} · {e.department}{e.manager ? ` · Reports to ${e.manager}` : ""}</p>
          <p className="mt-0.5 text-xs text-dim">{e.workingStatus} · last activity {ago(e.lastActivity, now)}</p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center md:w-80">
          {[["Tasks today", e.tasksToday], ["Completed", e.completedToday], ["Pending", e.pending]].map(([k, v]) => (
            <div key={k as string} className="rounded-md border border-line px-2 py-1.5"><p className="font-mono text-lg font-semibold text-fg tabular-nums">{v}</p><p className="text-[10px] tracking-wide text-dim uppercase">{k}</p></div>
          ))}
        </div>
        {configure && (
          <ActionForm action={setAvailabilityAction.bind(null, slug, !row.available)}>
            <button type="submit" className="h-9 rounded-md border border-line-strong px-3 text-[13px] font-medium text-fg hover:bg-ink-850">{row.available ? "Clock out" : "Clock in"}</button>
          </ActionForm>
        )}
      </section>

      <Tabs active={tab} items={TABS.map((t) => ({ key: t, label: t[0].toUpperCase() + t.slice(1), href: href(t) }))} />

      {tab === "overview" && <Overview slug={slug} e={e} responsibilities={row.responsibilities} capabilities={spec.capabilities} direct={direct && can(user.role, "ai:execute")} now={now} />}
      {tab === "tasks" && <TasksTab slug={slug} configure={configure && can(user.role, "automations:manage")} />}
      {tab === "goals" && <GoalsTab slug={slug} goals={e.goals} tools={spec.tools} configure={configure} />}
      {tab === "activity" && <ActivityTab slug={slug} />}
      {tab === "performance" && <PerformanceTab slug={slug} />}
      {tab === "knowledge" && <KnowledgeTab slug={slug} capabilities={spec.capabilities} hasKb={cfg.tools.has("searchKnowledge")} hasWeb={cfg.tools.has("webResearch")} />}
      {tab === "tools" && <ToolsTab tools={spec.tools} enabled={cfg.tools} />}
      {tab === "permissions" && <PermissionsTab slug={slug} tools={spec.tools} enabled={cfg.tools} approvalActions={cfg.approvalActions} mode={cfg.mode} requires={spec.requires} configure={configure} />}
      {tab === "memory" && <MemoryTab slug={slug} configure={configure} />}
      {tab === "settings" && <SettingsTab slug={slug} row={row} configure={configure} />}
    </>
  );
}

async function Overview({ slug, e, responsibilities, capabilities, direct, now }: { slug: string; e: Awaited<ReturnType<typeof employeeDirectory>>[number]; responsibilities: string[]; capabilities: string[]; direct: boolean; now: Date }) {
  const [open, reports, activity] = await Promise.all([
    db.aITask.findMany({ where: { agentSlug: slug, status: { in: [...OPEN_TASK_STATUSES] } }, orderBy: [{ status: "asc" }, { createdAt: "asc" }], take: 8 }),
    db.aIReport.findMany({ where: { agentSlug: slug }, orderBy: { createdAt: "desc" }, take: 2 }),
    db.aIActivity.findMany({ where: { agentSlug: slug }, orderBy: { createdAt: "desc" }, take: 12 }),
  ]);
  const employees = AGENTS.map((a) => ({ slug: a.slug, name: a.name.replace(/^AI\s+/, "") }));
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-5">
        <div className="grid gap-5 md:grid-cols-2">
          <Panel title="Responsibilities">
            <ul className="list-disc space-y-1 pl-4 text-sm text-fg">{(responsibilities.length ? responsibilities : capabilities).map((r) => <li key={r}>{r}</li>)}</ul>
          </Panel>
          <Panel title="Today's KPI" action={<Link href={`/admin/ai/employees/${slug}?tab=goals`} className="text-xs text-brand-blue hover:underline">Goals</Link>}>
            {e.goals.length ? <div className="space-y-3">{e.goals.map((g) => <GoalBar key={g.id} g={g} />)}</div> : <p className="text-sm text-dim">No goals set.</p>}
          </Panel>
        </div>
        <Panel title="Work queue" action={<Link href={`/admin/ai/employees/${slug}?tab=tasks`} className="text-xs text-brand-blue hover:underline">All tasks</Link>}>
          {open.length === 0 ? <p className="text-sm text-dim">Nothing on this employee&apos;s desk.</p> : (
            <ul className="divide-y divide-line">
              {open.map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <Link href={`/admin/ai/tasks/${t.id}`} className="line-clamp-1 text-sm font-medium text-fg hover:underline">{t.title}</Link>
                    <p className="text-xs text-muted">{t.currentStep ?? t.status.toLowerCase().replace(/_/g, " ")} · {t.priority.toLowerCase()} priority{t.deadline ? ` · due ${fmtDate(t.deadline, true)}` : ""}</p>
                  </div>
                  <div className="w-32"><ProgressBar value={t.progress} tone={taskTone(t.status)} /></div>
                  <StatusBadge value={t.status} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
        {reports.map((r) => <ReportPanel key={r.id} kind={r.kind} title={r.title} data={r.data} />)}
      </div>
      <aside className="space-y-5">
        {direct && <Panel title="Assign work"><AssignTaskForm employees={employees} defaultAgent={slug} compact /></Panel>}
        <Panel title="Recent activity" action={<Link href={`/admin/ai/employees/${slug}?tab=activity`} className="text-xs text-brand-blue hover:underline">Timeline</Link>}>
          <ActivityList items={activity} now={now} />
        </Panel>
      </aside>
    </div>
  );
}

function ActivityList({ items, now }: { items: { id: string; type: string; summary: string; createdAt: Date; taskId: string | null }[]; now: Date }) {
  if (!items.length) return <p className="text-sm text-dim">No activity yet. Entries appear as this employee receives and works on tasks.</p>;
  return (
    <ol className="space-y-2.5">
      {items.map((a) => (
        <li key={a.id} className="flex gap-3 text-sm">
          <time className="w-12 shrink-0 pt-px font-mono text-[11.5px] text-dim tabular-nums" dateTime={a.createdAt.toISOString()} title={a.createdAt.toISOString()}>{a.createdAt.toISOString().slice(11, 16)}</time>
          <div className="min-w-0">
            <p className={a.type.endsWith("failed") ? "text-red-700" : a.type.startsWith("approval") ? "text-amber-700" : "text-fg"}>{a.taskId ? <Link href={`/admin/ai/tasks/${a.taskId}`} className="hover:underline">{a.summary}</Link> : a.summary}</p>
            <p className="text-[11px] text-dim">{a.type} · {ago(a.createdAt, now)}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

async function TasksTab({ slug, configure }: { slug: string; configure: boolean }) {
  const [tasks, rules] = await Promise.all([
    db.aITask.findMany({ where: { agentSlug: slug }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.automation.findMany({ where: { trigger: { in: Object.keys(SCHEDULES) as ScheduleTrigger[] } }, orderBy: { createdAt: "asc" } }),
  ]);
  const mine = rules.filter((r) => Array.isArray(r.actions) && (r.actions as { type?: string; agent?: string }[]).some((a) => a.type === "AI_AGENT" && a.agent === slug));
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0">
        {tasks.length === 0 ? <p className="text-sm text-muted">No tasks yet.</p> : (
          <DataTable rows={tasks} columns={[
            { header: "Task", cell: (t) => <div><Link href={`/admin/ai/tasks/${t.id}`} className="font-medium text-fg hover:underline">{t.title}</Link><p className="text-xs text-muted">{TASK_KINDS[t.kind as keyof typeof TASK_KINDS] ?? t.kind} · {fmtDate(t.createdAt, true)}</p></div> },
            { header: "Priority", cell: (t) => <StatusBadge value={t.priority} /> },
            { header: "Progress", cell: (t) => <div className="w-28"><ProgressBar value={t.progress} tone={taskTone(t.status)} /><p className="mt-0.5 text-[11px] text-dim">{t.progress}%</p></div> },
            { header: "Status", cell: (t) => <StatusBadge value={t.status} /> },
            { header: "", cell: (t) => <TaskControls id={t.id} status={t.status} /> },
          ]} />
        )}
      </div>
      <aside className="space-y-5">
        <Panel title="Recurring responsibilities">
          {mine.length === 0 ? <p className="text-sm text-dim">None yet.</p> : (
            <ul className="space-y-2 text-sm">
              {mine.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><Link href={`/admin/automations/${r.id}`} className="font-medium text-fg hover:underline">{r.name}</Link><p className="text-xs text-muted">{SCHEDULES[r.trigger as ScheduleTrigger]} · ran {r.runCount}×{r.lastRunAt ? ` · last ${fmtDate(r.lastRunAt, true)}` : ""}</p></div>
                  <StatusBadge value={r.enabled ? "ACTIVE" : "PAUSED"} text={r.enabled ? "On" : "Off"} />
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[11.5px] text-dim">Recurring work runs through Automations. Edit, pause or delete a responsibility from its automation.</p>
          {configure && (
            <ActionForm action={addRecurringAction.bind(null, slug)} className="mt-4 space-y-3 border-t border-line pt-4" resetOnOk>
              <SelectField name="schedule" label="Schedule" options={Object.entries(SCHEDULES)} defaultValue="SCHEDULE_MORNING" />
              <TextField name="name" label="Responsibility" maxLength={120} placeholder="Find new prospects" required />
              <TextArea name="instruction" label="What to do each time" rows={3} placeholder="Find 20 new US fintech prospects and add qualified ones to the CRM." required />
              <SubmitButton>Add responsibility</SubmitButton>
            </ActionForm>
          )}
        </Panel>
      </aside>
    </div>
  );
}

function GoalsTab({ slug, goals, tools, configure }: { slug: string; goals: { id: string; label: string; metric: string; period: string; target: number; actual: number; pct: number }[]; tools: string[]; configure: boolean }) {
  const writes = new Set(tools.filter((t) => getTool(t)?.kind === "write"));
  const options = goalMetricOptions(tools, writes);
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Panel title="Goals" bodyClassName="p-0">
        {goals.length === 0 ? <p className="p-4 text-sm text-dim">No active goals.</p> : (
          <ul className="divide-y divide-line">
            {goals.map((g) => (
              <li key={g.id} className="flex items-center gap-4 px-4 py-3">
                <div className="min-w-0 flex-1"><GoalBar g={g} /><p className="mt-1 text-[11px] text-dim">Measured from {g.metric === "tasks_completed" ? "completed tasks" : `executed “${permissionLabel(g.metric.slice(8)).toLowerCase()}” actions`} this {g.period === "DAILY" ? "day" : g.period === "WEEKLY" ? "week" : "month"}</p></div>
                {configure && <ActionForm action={deleteGoalAction.bind(null, g.id)}><button type="submit" className="text-xs text-dim hover:text-red-700">Remove</button></ActionForm>}
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {configure && (
        <Panel title="Add goal">
          <ActionForm action={addGoalAction.bind(null, slug)} className="space-y-3" resetOnOk>
            <TextField name="label" label="Goal" maxLength={80} placeholder="Qualified leads" required />
            <SelectField name="metric" label="Measured by" options={options} />
            <div className="grid grid-cols-2 gap-3">
              <TextField name="target" label="Target" type="number" required />
              <SelectField name="period" label="Period" options={[["DAILY", "Daily"], ["WEEKLY", "Weekly"], ["MONTHLY", "Monthly"]]} defaultValue="DAILY" />
            </div>
            <SubmitButton>Add goal</SubmitButton>
          </ActionForm>
          <p className="mt-3 text-[11.5px] text-dim">Progress is counted from real completed tasks and executed actions. It cannot be edited by hand.</p>
        </Panel>
      )}
    </div>
  );
}

async function ActivityTab({ slug }: { slug: string }) {
  const items = await db.aIActivity.findMany({ where: { agentSlug: slug }, orderBy: { createdAt: "desc" }, take: 200 });
  const actorIds = [...new Set(items.map((a) => a.actorId).filter((x): x is string => !!x))];
  const actors = new Map((await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const byDay = new Map<string, typeof items>();
  for (const a of items) {
    const d = a.createdAt.toISOString().slice(0, 10);
    byDay.set(d, [...(byDay.get(d) ?? []), a]);
  }
  if (!items.length) return <p className="text-sm text-muted">No activity yet. Every task, tool call, approval and report this employee handles is recorded here as it happens.</p>;
  return (
    <div className="space-y-5">
      {[...byDay].map(([day, list]) => (
        <Panel key={day} title={day}>
          <ol className="space-y-2">
            {list.map((a) => (
              <li key={a.id} className="flex gap-3 text-sm">
                <time className="w-12 shrink-0 font-mono text-[12px] text-dim tabular-nums" dateTime={a.createdAt.toISOString()}>{a.createdAt.toISOString().slice(11, 16)}</time>
                <div className="min-w-0">
                  <p className={a.type.endsWith("failed") ? "text-red-700" : "text-fg"}>{a.taskId ? <Link href={`/admin/ai/tasks/${a.taskId}`} className="hover:underline">{a.summary}</Link> : a.summary}</p>
                  <p className="text-[11px] text-dim">{a.type}{a.actorId ? ` · by ${actors.get(a.actorId) ?? "a user"}` : ""}</p>
                </div>
              </li>
            ))}
          </ol>
        </Panel>
      ))}
      <p className="text-xs text-dim">Times are UTC.</p>
    </div>
  );
}

async function PerformanceTab({ slug }: { slug: string }) {
  const [p] = await employeePerformance(30, [slug]);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <StatTile label="Tasks completed (30d)" value={p.completed} tone="green" />
        <StatTile label="Tasks failed" value={p.failed} tone={p.failed ? "red" : undefined} />
        <StatTile label="Success rate" value={p.successRate != null ? `${p.successRate}%` : "—"} />
        <StatTile label="Avg completion time" value={p.avgCompletionMs != null ? fmtDuration(p.avgCompletionMs) : "—"} />
        <StatTile label="Approvals requested" value={p.approvalsRequested} hint={`${p.approvalsApproved} approved · ${p.approvalsRejected} rejected`} />
        <StatTile label="Escalations" value={p.escalations} hint="Sent to a person or failed" />
        <StatTile label="AI cost (30d)" value={usd(p.costUsd)} />
        <StatTile label="Business actions" value={p.outcomes.reduce((n, o) => n + o.count, 0)} hint="Executed changes" />
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <Panel title="Against goals">{p.goals.length ? <div className="space-y-3">{p.goals.map((g) => <GoalBar key={g.id} g={g} />)}</div> : <p className="text-sm text-dim">No goals set.</p>}</Panel>
        <Panel title="Business outcomes (30d)">{p.outcomes.length ? <ul className="space-y-1 text-sm">{p.outcomes.map((o) => <li key={o.tool} className="flex justify-between"><span>{o.label}</span><span className="font-mono tabular-nums">{o.count}</span></li>)}</ul> : <p className="text-sm text-dim">No executed actions in the last 30 days.</p>}</Panel>
      </div>
    </div>
  );
}

async function KnowledgeTab({ slug, capabilities, hasKb, hasWeb }: { slug: string; capabilities: string[]; hasKb: boolean; hasWeb: boolean }) {
  const shared = await db.aIEmployeeMemory.findMany({ where: { ...memoryScope(slug), kind: "KNOWLEDGE" }, orderBy: { updatedAt: "desc" }, take: 50 });
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel title="Skills">
        <ul className="list-disc space-y-1 pl-4 text-sm">{capabilities.map((c) => <li key={c}>{c}</li>)}</ul>
      </Panel>
      <Panel title="Knowledge sources">
        <KV cols={1} items={[
          ["Knowledge Base", hasKb ? <Link key="kb" href="/admin/knowledge" className="text-brand-blue hover:underline">Searches internal articles (respects visibility)</Link> : "Not enabled for this employee"],
          ["Public web", hasWeb ? "Web research when a search provider is configured" : "Not enabled"],
          ["Live business records", "Read through its tools, with the assigning person's permissions"],
        ]} />
      </Panel>
      <Panel title="Company knowledge in memory" className="lg:col-span-2" action={<Link href={`/admin/ai/employees/${slug}?tab=memory`} className="text-xs text-brand-blue hover:underline">Manage memory</Link>}>
        {shared.length ? <ul className="space-y-2 text-sm">{shared.map((m) => <li key={m.id}><span className="font-medium text-fg">{m.title}</span>{m.shared && <span className="ml-1.5 text-[11px] text-dim">shared</span>}<p className="text-muted">{m.content.slice(0, 300)}</p></li>)}</ul> : <p className="text-sm text-dim">No company knowledge saved yet.</p>}
      </Panel>
    </div>
  );
}

function ToolsTab({ tools, enabled }: { tools: string[]; enabled: Map<string, boolean> }) {
  return (
    <Panel title="Tools" bodyClassName="p-0">
      <table className="w-full text-sm">
        <thead><tr className="text-left text-[11.5px] text-dim uppercase"><th className="px-4 py-2">Tool</th><th>Does</th><th>Type</th><th>Status</th></tr></thead>
        <tbody>
          {tools.map((name) => {
            const t = getTool(name)!;
            return (
              <tr key={name} className="border-t border-line">
                <td className="px-4 py-2"><span className="font-medium text-fg">{permissionLabel(name)}</span><span className="block font-mono text-[11px] text-dim">{name}</span></td>
                <td className="max-w-md py-2 text-xs text-muted">{t.description}</td>
                <td className="text-xs text-muted">{t.kind}{t.kind === "write" ? ` · ${t.risk.toLowerCase()} risk` : ""}</td>
                <td><StatusBadge value={enabled.has(name) ? "ACTIVE" : "INACTIVE"} text={enabled.has(name) ? "Enabled" : "Disabled"} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}

function PermissionsTab({ slug, tools, enabled, approvalActions, mode, requires, configure }: { slug: string; tools: string[]; enabled: Map<string, boolean>; approvalActions: string[]; mode: string; requires: string; configure: boolean }) {
  const rule = (name: string) => {
    const t = getTool(name)!;
    if (!enabled.has(name)) return { text: "Not allowed", tone: "INACTIVE" };
    if (t.kind !== "write") return { text: "Allowed", tone: "ACTIVE" };
    if (mode === "OBSERVE") return { text: "Recommend only", tone: "OBSERVE" };
    if (t.alwaysApprove || approvalActions.includes(name) || mode !== "AUTONOMOUS" || !enabled.get(name)) return { text: "Requires approval", tone: "PENDING_APPROVAL" };
    return { text: "Autonomous", tone: "AUTONOMOUS" };
  };
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Panel title="Explicit permissions" action={configure ? <Link href={`/admin/ai/agents/${slug}`} className="text-xs text-brand-blue hover:underline">Edit permissions</Link> : undefined} bodyClassName="p-0">
        <ul className="divide-y divide-line">
          {tools.map((name) => {
            const r = rule(name);
            return <li key={name} className="flex items-center justify-between gap-3 px-4 py-2 text-sm"><span className="text-fg">{permissionLabel(name)}</span><StatusBadge value={r.tone} text={r.text} /></li>;
          })}
        </ul>
      </Panel>
      <aside className="space-y-5">
        <Panel title="Always requires a person">
          <ul className="list-disc space-y-1 pl-4 text-sm">{HUMAN_APPROVAL_RULES.map((r) => <li key={r}>{r}</li>)}</ul>
          <p className="mt-3 text-[11.5px] text-dim">No AI employee has tools for payments, refunds, contract changes, deletions or publishing. External email is always sent to the Human Approval Center.</p>
        </Panel>
        <Panel title="Access boundaries">
          <ul className="space-y-2 text-sm text-muted">
            <li>Works with the permissions of the person who assigned the task, never more. Access required to direct this employee: <span className="font-mono text-xs">ai:execute + {requires}</span>.</li>
            <li>Only the tools listed here can ever be enabled. No AI employee can be granted Super Admin rights.</li>
            <li>Recurring work runs as the person who set up the responsibility; work with no person behind it can only read and must ask for approval for every change.</li>
          </ul>
        </Panel>
      </aside>
    </div>
  );
}

async function MemoryTab({ slug, configure }: { slug: string; configure: boolean }) {
  const rows = await db.aIEmployeeMemory.findMany({ where: memoryScope(slug), orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }], take: 200 });
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Panel title="Business memory" bodyClassName="p-0">
        {rows.length === 0 ? <p className="p-4 text-sm text-dim">Nothing remembered yet. Completed tasks, workflows and your instructions are stored here.</p> : (
          <ul className="divide-y divide-line">
            {rows.map((m) => (
              <li key={m.id} className="flex gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-fg">{m.pinned && "📌 "}{m.title}</p>
                  <p className="text-[11px] text-dim">{MEMORY_KINDS[m.kind as MemoryKind] ?? m.kind}{m.agentSlug !== slug ? ` · shared by ${agentBySlug(m.agentSlug)?.name ?? m.agentSlug}` : m.shared ? " · shared with all employees" : " · private to this employee"} · {fmtDate(m.updatedAt, true)}{m.taskId ? <> · <Link href={`/admin/ai/tasks/${m.taskId}`} className="hover:underline">task</Link></> : null}</p>
                  <p className="mt-1 whitespace-pre-wrap text-muted">{m.content.slice(0, 800)}</p>
                </div>
                {configure && m.agentSlug === slug && <ActionForm action={deleteMemoryAction.bind(null, m.id)}><button type="submit" className="text-xs text-dim hover:text-red-700">Delete</button></ActionForm>}
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {configure && (
        <Panel title="Add to memory">
          <ActionForm action={addMemoryAction.bind(null, slug)} className="space-y-3" resetOnOk>
            <SelectField name="kind" label="Type" options={Object.entries(MEMORY_KINDS).filter(([k]) => ["INSTRUCTION", "PREFERENCE", "KNOWLEDGE", "RECORD"].includes(k))} defaultValue="INSTRUCTION" />
            <TextField name="title" label="Title" maxLength={200} required />
            <label className="block"><span className={labelCls}>Content</span><textarea name="content" rows={4} maxLength={4000} required className={`${inputCls} h-auto py-2`} /><FieldError name="content" /></label>
            <CheckField name="shared" label="Share with all employees" hint="Only company knowledge can be shared. Everything else stays private to this employee." />
            <CheckField name="pinned" label="Pin (always included first)" />
            <SubmitButton>Save</SubmitButton>
          </ActionForm>
        </Panel>
      )}
    </div>
  );
}

async function SettingsTab({ slug, row, configure }: { slug: string; row: { personaName: string | null; jobTitle: string | null; department: string | null; reportsToSlug: string | null; managerUserId: string | null; responsibilities: string[] }; configure: boolean }) {
  if (!configure) return <p className="text-sm text-muted">Only AI administrators can change employee settings.</p>;
  const users = await db.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Panel title="Employee profile">
        <ActionForm action={updateEmployeeProfileAction.bind(null, slug)} className="grid gap-4 sm:grid-cols-2">
          <TextField name="personaName" label="Display name (optional)" defaultValue={row.personaName} maxLength={60} hint="e.g. Sarah. Leave blank to use the role name." />
          <TextField name="jobTitle" label="Job title" defaultValue={row.jobTitle} maxLength={120} required />
          <TextField name="department" label="Department" defaultValue={row.department} maxLength={80} required />
          <SelectField name="reportsToSlug" label="Reports to (AI employee)" options={AGENTS.filter((a) => a.slug !== slug).map((a) => [a.slug, a.name] as const)} defaultValue={row.reportsToSlug} blank="No AI manager" />
          <SelectField name="managerUserId" label="Human manager" options={users.map((u) => [u.id, u.name] as const)} defaultValue={row.managerUserId} blank="None" className="sm:col-span-2" />
          <TextArea name="responsibilities" label="Responsibilities (one per line)" defaultValue={row.responsibilities.join("\n")} rows={6} className="sm:col-span-2" />
          <div className="sm:col-span-2"><SubmitButton>Save profile</SubmitButton></div>
        </ActionForm>
      </Panel>
      <Panel title="Behaviour">
        <p className="text-sm text-muted">Operating mode (observe / assist / autonomous), AI model, daily cost limit, tool access and extra instructions are set in the agent configuration.</p>
        <Link href={`/admin/ai/agents/${slug}`} className="btn-secondary mt-3 h-9 px-3 text-[13px]">Open configuration</Link>
      </Panel>
    </div>
  );
}
