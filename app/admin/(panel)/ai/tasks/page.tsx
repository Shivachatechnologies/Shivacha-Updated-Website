import Link from "next/link";
import { db } from "@/lib/db/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { runnableAgents } from "@/lib/ai/agents";
import { agentBySlug, AGENTS } from "@/lib/ai/catalog";
import { providerStatus } from "@/lib/ai/provider";
import { runWorkforceNowAction } from "@/lib/ai/workforce/actions";
import { displayName, ensureEmployees } from "@/lib/ai/workforce/employees";
import { OPEN_TASK_STATUSES, TASK_KINDS } from "@/lib/ai/workforce/profiles";
import { pumpSoon } from "@/lib/ai/workforce/scheduler";
import { PageHeader, Panel, fmtDate } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/forms";
import { SubmitButton } from "@/components/admin/client";
import { DataTable, NotConnected, StatusBadge, Tabs, pick, type SP } from "@/components/admin/os";
import { AgentAvatar, ProgressBar, WorkforceNav, taskTone } from "@/components/admin/ai/workforce";
import { AssignTaskForm, TaskControls } from "@/components/admin/ai/workforce-forms";
import { AutoRefresh } from "@/components/admin/ai/auto-refresh";

export const metadata = { title: "AI Task Management" };
export const maxDuration = 300;

const VIEWS = ["open", "running", "approval", "done", "failed", "all"] as const;

export default async function AITasksPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireAccess("ai:view", "AI_WORKFORCE");
  const sp = await searchParams;
  const view = pick(sp, "view", VIEWS) ?? "open";
  const agent = pick(sp, "agent", AGENTS.map((a) => a.slug));
  const all = can(user.role, "ai:configure");
  await ensureEmployees();
  const status: Prisma.AITaskWhereInput["status"] =
    view === "open" ? { in: [...OPEN_TASK_STATUSES] } : view === "running" ? "RUNNING" : view === "approval" ? "AWAITING_APPROVAL" : view === "done" ? "DONE" : view === "failed" ? "FAILED" : undefined;
  const scope: Prisma.AITaskWhereInput = all ? {} : { requestedById: user.id };
  const [rows, counts, agents, pendingApprovals] = await Promise.all([
    db.aITask.findMany({ where: { ...scope, status, agentSlug: agent }, orderBy: [{ createdAt: "desc" }], take: 150 }),
    db.aITask.groupBy({ by: ["status"], where: scope, _count: { _all: true } }),
    db.aIAgent.findMany({ select: { slug: true, name: true, personaName: true, jobTitle: true } }),
    db.aIApproval.count({ where: { status: "PENDING" } }),
  ]);
  pumpSoon();
  const names = new Map(agents.map((a) => [a.slug, displayName(a)]));
  const n = (s: string[]) => counts.filter((c) => s.includes(c.status)).reduce((x, c) => x + c._count._all, 0);
  const runnable = runnableAgents(user.role).map((a) => ({ slug: a.slug, name: names.get(a.slug) ?? a.name, jobTitle: agents.find((x) => x.slug === a.slug)?.jobTitle ?? undefined }));
  const q = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ view: view === "open" ? undefined : view, agent, ...patch }).filter(([, v]) => v) as [string, string][]).toString();
    return `/admin/ai/tasks${p ? `?${p}` : ""}`;
  };
  const connected = providerStatus().connected;

  return (
    <>
      <PageHeader
        title="Task Management"
        description="Assign work to AI employees exactly like you would to people. Each task is planned, executed with the employee's tools, tracked step by step and reported back. Risky actions wait for your approval."
        crumbs={[{ label: "AI", href: "/admin/ai/command-center" }, { label: "Tasks" }]}
        actions={all ? <ActionForm action={runWorkforceNowAction}><SubmitButton variant="secondary">Run scheduler now</SubmitButton></ActionForm> : undefined}
      />
      <WorkforceNav active="tasks" counts={{ approvals: pendingApprovals }} />
      <AutoRefresh active={rows.some((t) => t.status === "RUNNING")} />
      {!connected && (
        <div className="mb-4">
          <NotConnected name="AI provider" env={["ANTHROPIC_API_KEY"]}>AI provider not connected. Tasks can be assigned and tracked, but employees cannot execute them until the provider is configured. They will fail with a clear message.</NotConnected>
        </div>
      )}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <Tabs active={view} items={[
            { key: "open", label: "Open", href: q({ view: undefined }), count: n([...OPEN_TASK_STATUSES]) },
            { key: "running", label: "Working", href: q({ view: "running" }), count: n(["RUNNING"]) },
            { key: "approval", label: "Awaiting approval", href: q({ view: "approval" }), count: n(["AWAITING_APPROVAL"]) },
            { key: "done", label: "Completed", href: q({ view: "done" }), count: n(["DONE"]) },
            { key: "failed", label: "Failed", href: q({ view: "failed" }), count: n(["FAILED"]) },
            { key: "all", label: "All", href: q({ view: "all" }) },
          ]} />
          <form className="mb-3 flex items-center gap-2 text-sm" action="/admin/ai/tasks">
            {view !== "open" && <input type="hidden" name="view" value={view} />}
            <label className="text-muted" htmlFor="agent-filter">Employee</label>
            <select id="agent-filter" name="agent" defaultValue={agent ?? ""} className="h-8 rounded-md border border-line-strong bg-ink-900 px-2 text-sm">
              <option value="">All employees</option>
              {AGENTS.map((a) => <option key={a.slug} value={a.slug}>{names.get(a.slug) ?? a.name}</option>)}
            </select>
            <button type="submit" className="h-8 rounded-md border border-line-strong px-2.5 text-[12.5px]">Filter</button>
          </form>
          {rows.length === 0 ? <p className="text-sm text-muted">No tasks here.</p> : (
            <DataTable rows={rows} columns={[
              { header: "Employee", cell: (t) => <Link href={`/admin/ai/employees/${t.agentSlug}`} className="flex items-center gap-2 whitespace-nowrap hover:underline"><AgentAvatar slug={t.agentSlug} className="size-7 rounded-md [&_svg]:size-3.5" /><span className="text-fg">{names.get(t.agentSlug) ?? agentBySlug(t.agentSlug)?.name ?? t.agentSlug}</span></Link> },
              { header: "Task", cell: (t) => <div className="min-w-[220px]"><Link href={`/admin/ai/tasks/${t.id}`} className="font-medium text-fg hover:underline">{t.title}</Link><p className="line-clamp-1 text-xs text-muted">{t.currentStep ?? TASK_KINDS[t.kind as keyof typeof TASK_KINDS] ?? t.kind}</p>{t.error && <p className="line-clamp-1 text-xs text-red-700">{t.error}</p>}</div> },
              { header: "Priority", cell: (t) => <StatusBadge value={t.priority} /> },
              { header: "Progress", cell: (t) => <div className="w-28"><ProgressBar value={t.progress} tone={taskTone(t.status)} /><p className="mt-0.5 font-mono text-[11px] text-dim">{t.progress}%</p></div> },
              { header: "Status", cell: (t) => <StatusBadge value={t.status} /> },
              { header: "Deadline", cell: (t) => <span className={t.deadline && t.deadline < new Date() && !["DONE", "CANCELLED"].includes(t.status) ? "text-red-700" : "text-muted"}>{t.deadline ? fmtDate(t.deadline, true) : "—"}</span> },
              { header: "", cell: (t) => <div className="flex items-center gap-2"><TaskControls id={t.id} status={t.status} /><Link href={`/admin/ai/tasks/${t.id}`} className="text-xs whitespace-nowrap text-brand-blue hover:underline">{t.status === "DONE" ? "View result" : t.status === "AWAITING_APPROVAL" ? "Review" : "Open"}</Link></div> },
            ]} />
          )}
        </div>
        {can(user.role, "ai:execute") && runnable.length > 0 && (
          <aside>
            <Panel title="Create task">
              <AssignTaskForm employees={runnable} defaultAgent={typeof sp.agent === "string" ? sp.agent : undefined} />
            </Panel>
          </aside>
        )}
      </div>
    </>
  );
}
