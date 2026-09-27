import Link from "next/link";
import { db } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { runnableAgents } from "@/lib/ai/agents";
import { canDecide } from "@/lib/ai/approvals";
import { decideApprovalAction } from "@/lib/ai/actions";
import { providerStatus } from "@/lib/ai/provider";
import { generateReportsAction } from "@/lib/ai/workforce/actions";
import { employeeDirectory } from "@/lib/ai/workforce/employees";
import { localParts, OPEN_TASK_STATUSES, startOfLocalDay } from "@/lib/ai/workforce/profiles";
import { generateCeoBriefing, type CeoBriefing } from "@/lib/ai/workforce/reports";
import { pumpSoon } from "@/lib/ai/workforce/scheduler";
import { PageHeader, Panel, fmtDate } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/forms";
import { SubmitButton } from "@/components/admin/client";
import { DataTable, NotConnected, StatusBadge } from "@/components/admin/os";
import { OpsPanel } from "@/components/admin/command/section";
import { AgentAvatar, EmployeeStatusPill, ProgressBar, WorkforceNav, ago, taskTone } from "@/components/admin/ai/workforce";
import { AssignInstructionForm, TaskControls } from "@/components/admin/ai/workforce-forms";
import { AutoRefresh } from "@/components/admin/ai/auto-refresh";

export const metadata = { title: "CEO Command Center" };
export const maxDuration = 300;

export default async function CeoCommandCenter() {
  const user = await requireAccess("ai:view", "AI_WORKFORCE");
  const now = new Date();
  const today = startOfLocalDay(now);
  const exec = can(user.role, "executive:view");
  const day = localParts(now).day;
  const [dir, board, todayCounts, approvals, reports, briefingRow] = await Promise.all([
    employeeDirectory(now),
    db.aITask.findMany({ where: { OR: [{ status: { in: [...OPEN_TASK_STATUSES] } }, { createdAt: { gte: today } }, { completedAt: { gte: today } }] }, orderBy: [{ createdAt: "desc" }], take: 60 }),
    db.aITask.groupBy({ by: ["status"], where: { OR: [{ createdAt: { gte: today } }, { startedAt: { gte: today } }, { completedAt: { gte: today } }] }, _count: { _all: true } }),
    db.aIApproval.findMany({ where: { status: "PENDING" }, orderBy: [{ createdAt: "asc" }], take: 30 }),
    db.aIReport.findMany({ where: { kind: { in: ["END_OF_DAY", "MORNING_PLAN"] } }, orderBy: { createdAt: "desc" }, take: 12 }),
    exec ? db.aIReport.findFirst({ where: { agentSlug: "workforce", kind: "CEO_BRIEFING" }, orderBy: { createdAt: "desc" } }) : null,
  ]);
  pumpSoon();
  // Today's briefing is built from live data the first time the CEO opens the page.
  const briefing: { data: CeoBriefing; day: string; at: Date } | null = exec
    ? briefingRow?.day === day
      ? { data: briefingRow.data as unknown as CeoBriefing, day, at: briefingRow.createdAt }
      : { data: await generateCeoBriefing(now), day, at: now }
    : null;
  const names = new Map(dir.map((e) => [e.slug, e.name]));
  const c = (s: string) => dir.filter((e) => e.status === s).length;
  const t = (s: string[]) => todayCounts.filter((x) => s.includes(x.status)).reduce((n, x) => n + x._count._all, 0);
  const decidable = approvals.filter((a) => canDecide(user, a.requiredPermission));
  const employees = runnableAgents(user.role).map((a) => ({ slug: a.slug, name: names.get(a.slug) ?? a.name }));
  const hour = localParts(now).hour;
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <>
      <PageHeader
        title="CEO Command Center"
        description="Run your AI workforce like a company: see who is working on what, assign work and instructions, approve risky actions and read their reports."
        crumbs={[{ label: "AI", href: "/admin/ai/command-center" }, { label: "Command Center" }]}
        actions={can(user.role, "ai:execute") ? <Link href="/admin/ai/tasks?new=1" className="btn-primary h-9 px-3.5 text-[13px]">Assign task</Link> : undefined}
      />
      <WorkforceNav active="command" counts={{ approvals: approvals.length }} />
      <AutoRefresh active={dir.some((e) => e.status === "WORKING")} every={6000} />
      {!providerStatus().connected && (
        <div className="mb-4"><NotConnected name="AI provider" env={["ANTHROPIC_API_KEY"]}>AI provider not connected. You can assign and track work, and reports are still built from live data, but employees cannot execute tasks until it is configured.</NotConnected></div>
      )}

      <OpsPanel dark eyebrow="AI workforce" title={`${dir.length} employees`} className="border-violet-400/15" actions={<Link href="/admin/ai/employees" className="text-xs font-medium text-violet-200 hover:underline">Directory</Link>}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
          {[
            ["Working", c("WORKING"), "text-violet-200"],
            ["Waiting", c("WAITING"), "text-sky-300"],
            ["Approval required", c("AWAITING_APPROVAL"), "text-amber-300"],
            ["Offline", c("OFFLINE") + c("ERROR"), c("ERROR") ? "text-red-300" : "text-[#8b97ab]"],
            ["Today's tasks", t(["QUEUED", "RUNNING", "PAUSED", "AWAITING_APPROVAL", "DONE", "FAILED", "CANCELLED"]), "text-white"],
            ["Completed", t(["DONE"]), "text-emerald-300"],
            ["Failed", t(["FAILED"]), t(["FAILED"]) ? "text-red-300" : "text-[#8b97ab]"],
            ["Pending approvals", approvals.length, approvals.length ? "text-amber-300" : "text-[#8b97ab]"],
          ].map(([k, v, cls]) => (
            <div key={k as string} className="rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-2.5">
              <p className={`font-mono text-2xl font-semibold tabular-nums ${cls}`}>{v}</p>
              <p className="text-[10.5px] tracking-wide text-[#8b97ab] uppercase">{k}</p>
            </div>
          ))}
        </div>
        <ul className="mt-4 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {dir.map((e) => (
            <li key={e.slug}>
              <Link href={`/admin/ai/employees/${e.slug}`} className="flex items-center gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2 hover:bg-white/[0.05]">
                <AgentAvatar slug={e.slug} className="size-8 rounded-md [&_svg]:size-4" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-medium text-white">{e.name}</span>
                  <span className="block truncate text-[11px] text-[#8b97ab]">{e.currentTask && e.status === "WORKING" ? `${e.currentTask.title} · ${e.currentTask.progress}%` : e.workingStatus}</span>
                </span>
                <EmployeeStatusPill status={e.status} className="bg-white/[0.06] text-[10.5px] text-white/80" />
              </Link>
            </li>
          ))}
        </ul>
      </OpsPanel>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          {briefing && (
            <Panel title="Daily CEO briefing" action={<ActionForm action={generateReportsAction.bind(null, "briefing")}><SubmitButton variant="secondary" className="h-8 text-xs">Refresh</SubmitButton></ActionForm>}>
              <Briefing b={briefing.data} greeting={greeting} name={user.name.split(" ")[0]} day={briefing.day} at={briefing.at} />
            </Panel>
          )}

          <Panel title="Today's work" action={<Link href="/admin/ai/tasks" className="text-xs text-brand-blue hover:underline">Task board</Link>} bodyClassName="p-0">
            {board.length === 0 ? <p className="p-4 text-sm text-muted">No work today yet. Assign a task or an instruction to get started.</p> : (
              <DataTable rows={board} columns={[
                { header: "Employee", cell: (x) => <Link href={`/admin/ai/employees/${x.agentSlug}`} className="flex items-center gap-2 whitespace-nowrap hover:underline"><AgentAvatar slug={x.agentSlug} className="size-6 rounded-md [&_svg]:size-3" /><span>{names.get(x.agentSlug) ?? x.agentSlug}</span></Link> },
                { header: "Task", cell: (x) => <div className="min-w-[180px]"><Link href={`/admin/ai/tasks/${x.id}`} className="font-medium text-fg hover:underline">{x.title}</Link>{x.currentStep && x.status === "RUNNING" && <p className="line-clamp-1 text-xs text-muted">{x.currentStep}</p>}</div> },
                { header: "Deadline", cell: (x) => <span className="font-mono text-[11.5px] whitespace-nowrap text-muted" title={x.deadline ? fmtDate(x.deadline, true) : undefined}>{x.deadline ? x.deadline.toISOString().slice(5, 16).replace("T", " ") : "—"}</span> },
                { header: "Priority", cell: (x) => <StatusBadge value={x.priority} /> },
                { header: "Progress", cell: (x) => <div className="w-20"><ProgressBar value={x.progress} tone={taskTone(x.status)} /><p className="mt-0.5 font-mono text-[11px] text-dim">{x.progress}%</p></div> },
                { header: "Status", cell: (x) => <StatusBadge value={x.status} /> },
                { header: "", cell: (x) => <div className="flex items-center gap-2"><TaskControls id={x.id} status={x.status} /><Link href={`/admin/ai/tasks/${x.id}`} className="text-xs whitespace-nowrap text-brand-blue hover:underline">{x.status === "DONE" ? "View result" : x.status === "AWAITING_APPROVAL" ? "Approve" : x.status === "FAILED" ? "Reassign" : "Open"}</Link></div> },
              ]} />
            )}
          </Panel>

          <Panel title="Employee reports">
            {reports.length === 0 ? <p className="text-sm text-dim">Morning plans and end-of-day reports appear here once employees have work. They are generated by the scheduler each morning and evening.</p> : (
              <ul className="divide-y divide-line">
                {reports.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 py-2 text-sm">
                    <AgentAvatar slug={r.agentSlug} className="size-7 rounded-md [&_svg]:size-3.5" />
                    <Link href={`/admin/ai/employees/${r.agentSlug}`} className="min-w-0 flex-1 truncate hover:underline"><span className="font-medium text-fg">{names.get(r.agentSlug) ?? r.agentSlug}</span> <span className="text-muted">· {r.title}</span></Link>
                    <span className="text-xs text-dim">{ago(r.createdAt, now)}</span>
                  </li>
                ))}
              </ul>
            )}
            {can(user.role, "ai:configure") && (
              <div className="mt-3 flex gap-2 border-t border-line pt-3">
                <ActionForm action={generateReportsAction.bind(null, "morning")}><SubmitButton variant="secondary" className="h-8 text-xs">Morning plans now</SubmitButton></ActionForm>
                <ActionForm action={generateReportsAction.bind(null, "eod")}><SubmitButton variant="secondary" className="h-8 text-xs">End-of-day reports now</SubmitButton></ActionForm>
              </div>
            )}
          </Panel>
        </div>

        <aside className="space-y-5">
          {can(user.role, "ai:execute") && employees.length > 0 && (
            <Panel title="Assign instruction">
              <AssignInstructionForm employees={employees} />
              <p className="mt-2 text-[11.5px] text-dim">The employee executes the instruction as a tracked task and reports back.</p>
            </Panel>
          )}
          <Panel title={`Requires your approval (${decidable.length})`} action={<Link href="/admin/ai/approvals" className="text-xs text-brand-blue hover:underline">All</Link>}>
            {decidable.length === 0 ? <p className="text-sm text-dim">Nothing is waiting for you.</p> : (
              <ul className="space-y-3">
                {decidable.slice(0, 6).map((a) => (
                  <li key={a.id} className="rounded-md border border-line p-2.5">
                    <Link href={`/admin/ai/approvals/${a.id}`} className="line-clamp-2 text-sm font-medium text-fg hover:underline">{a.action}</Link>
                    <p className="mt-0.5 text-xs text-muted">{names.get(a.agentSlug) ?? a.agentSlug} · <StatusBadge value={a.risk} /></p>
                    <div className="mt-2 flex gap-1.5">
                      <ActionForm action={decideApprovalAction.bind(null, a.id)}><input type="hidden" name="decision" value="APPROVE" /><SubmitButton className="h-7 px-2.5 text-[11.5px]">Approve</SubmitButton></ActionForm>
                      <Link href={`/admin/ai/approvals/${a.id}`} className="btn-secondary h-7 px-2.5 text-[11.5px]">Edit</Link>
                      <ActionForm action={decideApprovalAction.bind(null, a.id)}><input type="hidden" name="decision" value="REJECT" /><SubmitButton variant="secondary" className="h-7 px-2.5 text-[11.5px] text-red-700">Reject</SubmitButton></ActionForm>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </aside>
      </div>
    </>
  );
}

function Briefing({ b, greeting, name, day, at }: { b: CeoBriefing; greeting: string; name: string; day: string; at: Date }) {
  const block = (title: string, rows: [string, string | number][], href?: string) => (
    <div className="rounded-md border border-line p-3">
      <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-dim uppercase">{href ? <Link href={href} className="hover:text-fg">{title}</Link> : title}</p>
      <dl className="space-y-0.5 text-sm">{rows.map(([k, v]) => <div key={k} className="flex justify-between gap-2"><dt className="text-muted">{k}</dt><dd className="text-right font-medium text-fg tabular-nums">{v}</dd></div>)}</dl>
    </div>
  );
  return (
    <div>
      <p className="text-lg font-semibold text-fg">{greeting}{name ? `, ${name}` : ""}.</p>
      <p className="mb-3 text-xs text-dim">Briefing for {day} · built from live records {fmtDate(at, true)}</p>
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {block("AI workforce", [["Working", b.workforce.working], ["Waiting", b.workforce.waiting], ["Approval required", b.workforce.approval], ["Offline / error", b.workforce.offline + b.workforce.error]], "/admin/ai/employees")}
        {block("Sales", [["Open pipeline", b.sales.openPipeline], ["Weighted", b.sales.weightedPipeline], ["Open deals", b.sales.openDeals], ["New leads today · 7d", `${b.sales.newLeadsToday} · ${b.sales.newLeads7d}`]], "/admin/deals")}
        {block("Projects", [["Active", b.projects.active], ["At risk", b.projects.atRisk]], "/admin/projects")}
        {block("Finance", [["Outstanding", b.finance.outstanding], ["Overdue", b.finance.overdue], ["Overdue invoices", b.finance.overdueInvoices]], "/admin/finance")}
        {block("Support", [["Open tickets", b.support.open], ["Urgent", b.support.urgent], ["Past due", b.support.pastDue]], "/admin/support")}
        {block("AI work", [["Completed today", b.ai.completedToday], ["Pending", b.ai.pending], ["Failed today", b.ai.failedToday]], "/admin/ai/tasks")}
      </div>
      <div className="mt-4">
        <p className="text-[11px] font-semibold tracking-wide text-dim uppercase">Requires your attention</p>
        {b.attention.length ? (
          <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-sm">{b.attention.map((a) => <li key={a.title}><Link href={a.href} className="text-fg hover:underline">{a.title}</Link></li>)}</ol>
        ) : <p className="mt-1 text-sm text-muted">Nothing needs you right now.</p>}
      </div>
    </div>
  );
}
