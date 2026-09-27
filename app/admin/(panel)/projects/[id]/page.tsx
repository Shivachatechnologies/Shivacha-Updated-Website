import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { getFlags } from "@/lib/os/flags";
import { fmtMoney } from "@/lib/os/money";
import { toDateInput } from "@/lib/os/action";
import { addMemberAction, addTaskCommentAction, archiveProjectAction, moveTaskAction, postProjectUpdateAction, removeMemberAction, saveChangeRequestAction, saveIssueAction, saveMilestoneAction, saveTaskAction, updateProjectAction } from "@/lib/projects/actions";
import { PageHeader, Panel, fmtDate, inputCls, label } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/client";
import { ActionForm } from "@/components/admin/forms";
import { KV, Kpi, KpiGrid, StatusBadge, Tabs, str, type SP } from "@/components/admin/os";
import { ActivityPanel, DocumentsPanel } from "@/components/admin/os-panels";
import { Kanban } from "@/components/admin/kanban";
import { Gantt } from "@/components/admin/projects/gantt";
import { ProjectForm } from "@/components/admin/projects/project-form";
import { AiActions } from "@/components/admin/ai/contextual";

export const metadata = { title: "Project" };
const TASK_STATUSES = ["TODO", "IN_PROGRESS", "REVIEW", "BLOCKED", "DONE"] as const;
const sel = "h-8 rounded-md border border-line-strong bg-ink-900 px-2 text-[12.5px] text-fg";

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const user = await requireAccess("projects:view", "PROJECTS");
  const { id } = await params;
  const sp = await searchParams;
  const tab = str(sp, "tab", 20) || "overview";
  const view = str(sp, "view", 10);
  const p = await db.project.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true } },
      deal: { select: { id: true, number: true } },
      manager: { select: { name: true } },
      members: { include: { user: { select: { id: true, name: true, role: true } } } },
      milestones: { orderBy: [{ sortOrder: "asc" }, { dueDate: "asc" }], include: { _count: { select: { tasks: true } } } },
      tasks: { orderBy: [{ status: "asc" }, { sortOrder: "asc" }, { dueDate: "asc" }], take: 500, include: { assignee: { select: { name: true } }, milestone: { select: { name: true } }, comments: { orderBy: { createdAt: "asc" }, take: 20, include: { author: { select: { name: true } } } } } },
      issues: { orderBy: [{ status: "asc" }, { createdAt: "desc" }] },
      changeRequests: { orderBy: { createdAt: "desc" } },
      updates: { orderBy: { createdAt: "desc" }, take: 30, include: { author: { select: { name: true } } } },
    },
  });
  if (!p || p.deletedAt) notFound();
  const flags = await getFlags();
  const manage = can(user.role, "projects:manage");
  const users = await db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const now = new Date();
  const overdueTasks = p.tasks.filter((t) => t.status !== "DONE" && t.dueDate && t.dueDate < now);
  const openIssues = p.issues.filter((i) => i.status === "OPEN" || i.status === "IN_PROGRESS");
  const approvedCR = p.changeRequests.filter((c) => c.status === "APPROVED" || c.status === "IMPLEMENTED");
  const tabs = [
    ["overview", "Overview"], ["tasks", `Tasks (${p.tasks.length})`], ["milestones", `Milestones (${p.milestones.length})`], ["timeline", "Timeline"], ["issues", `Issues (${openIssues.length})`], ["changes", `Change requests (${p.changeRequests.length})`], ["updates", "Updates"], ["documents", "Documents"], ["activity", "Activity"],
  ].map(([key, l]) => ({ key, label: l, href: `/admin/projects/${id}${key === "overview" ? "" : `?tab=${key}`}` }));
  const taskForm = (t?: (typeof p.tasks)[number]) => (
    <ActionForm action={saveTaskAction.bind(null, p.id, t?.id ?? null)} resetOnOk={!t} className="grid gap-2 sm:grid-cols-6">
      <input name="title" required maxLength={200} defaultValue={t?.title} placeholder="Task title" aria-label="Task title" className={`${inputCls} sm:col-span-3`} />
      <select name="assigneeId" defaultValue={t?.assigneeId ?? ""} aria-label="Assignee" className={inputCls}><option value="">Unassigned</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
      <select name="status" defaultValue={t?.status ?? "TODO"} aria-label="Status" className={inputCls}>{TASK_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select>
      <select name="priority" defaultValue={t?.priority ?? "MEDIUM"} aria-label="Priority" className={inputCls}>{["LOW", "MEDIUM", "HIGH", "URGENT"].map((s) => <option key={s} value={s}>{label(s)}</option>)}</select>
      <select name="milestoneId" defaultValue={t?.milestoneId ?? ""} aria-label="Milestone" className={`${inputCls} sm:col-span-2`}><option value="">No milestone</option>{p.milestones.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
      <input name="startDate" type="date" defaultValue={toDateInput(t?.startDate)} aria-label="Start date" className={inputCls} />
      <input name="dueDate" type="date" defaultValue={toDateInput(t?.dueDate)} aria-label="Due date" className={inputCls} />
      <input name="estimateHrs" defaultValue={t?.estimateHrs?.toString() ?? ""} placeholder="Est. hours" aria-label="Estimate hours" className={inputCls} />
      <SubmitButton variant={t ? "secondary" : "primary"}>{t ? "Save" : "Add task"}</SubmitButton>
      <textarea name="description" rows={2} defaultValue={t?.description ?? ""} placeholder="Description (optional)" aria-label="Task description" className={`${inputCls} h-auto py-1.5 sm:col-span-6`} />
    </ActionForm>
  );

  return (
    <>
      <PageHeader
        title={p.name}
        description={`${p.number} · ${p.client.name} · PM ${p.manager?.name ?? "—"}`}
        crumbs={[{ label: "Projects", href: "/admin/projects" }, { label: p.number }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge value={p.health} text={`Health: ${label(p.health)}`} />
            <StatusBadge value={p.status} />
            {manage && <ActionForm action={archiveProjectAction.bind(null, p.id)}><SubmitButton variant="secondary">Archive</SubmitButton></ActionForm>}
          </div>
        }
      />
      <div className="mb-5">
        <KpiGrid cols={6}>
          <Kpi label="Progress" value={`${p.progress}%`} hint={p.tasks.length ? `${p.tasks.filter((t) => t.status === "DONE").length}/${p.tasks.length} tasks done` : "Manual"} />
          <Kpi label="Target date" value={fmtDate(p.targetDate)} tone={p.targetDate && p.targetDate < now && p.status !== "COMPLETED" ? "red" : undefined} />
          <Kpi label="Overdue tasks" value={overdueTasks.length} tone={overdueTasks.length ? "red" : undefined} />
          <Kpi label="Open issues" value={openIssues.length} tone={openIssues.length ? "amber" : undefined} />
          <Kpi label="Approved changes" value={approvedCR.length} hint={approvedCR.some((c) => c.impactCost) ? `+${fmtMoney(approvedCR.reduce((s, c) => s + Number(c.impactCost ?? 0), 0), p.currency, { compact: true })}` : undefined} />
          <Kpi label="Budget" value={p.budget ? fmtMoney(p.budget, p.currency, { compact: true }) : "—"} />
        </KpiGrid>
      </div>
      <Tabs items={tabs} active={tab} />

      {tab === "overview" && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 space-y-5">
            <Panel title="Summary">
              <KV cols={3} items={[["Client", <Link key="c" href={`/admin/clients/${p.client.id}`} className="text-brand-blue hover:underline">{p.client.name}</Link>], ["Deal", p.deal ? <Link key="d" href={`/admin/deals/${p.deal.id}`} className="text-brand-blue hover:underline">{p.deal.number}</Link> : null], ["Priority", label(p.priority)], ["Start", fmtDate(p.startDate)], ["Target", fmtDate(p.targetDate)], ["Completed", fmtDate(p.completedAt)]]} />
              {p.description && <p className="mt-4 border-t border-line pt-3 text-sm whitespace-pre-wrap text-muted">{p.description}</p>}
            </Panel>
            {manage && <Panel title="Edit project"><ProjectForm action={updateProjectAction.bind(null, p.id)} p={p} submit="Save project" hasTasks={p.tasks.length > 0} /></Panel>}
          </div>
          <div className="min-w-0 space-y-5">
            {flags.AI_WORKFORCE && can(user.role, "ai:execute") && <AiActions entity="Project" id={p.id} />}
            <Panel title={`Team (${p.members.length})`}>
              <ul className="space-y-1.5 text-sm">
                {p.members.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-2">
                    <span>{m.user.name} <span className="text-xs text-dim">{m.role ?? ""}</span></span>
                    {manage && <form action={removeMemberAction.bind(null, p.id, m.userId)}><button type="submit" className="text-xs text-muted hover:text-red-700">Remove</button></form>}
                  </li>
                ))}
              </ul>
              {manage && (
                <ActionForm action={addMemberAction.bind(null, p.id)} resetOnOk className="mt-3 flex gap-2 border-t border-line pt-3">
                  <select name="userId" required aria-label="Person" className={inputCls}><option value="">Add person…</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
                  <input name="role" placeholder="Role" aria-label="Role" maxLength={80} className={`${inputCls} w-28`} />
                  <SubmitButton variant="secondary">Add</SubmitButton>
                </ActionForm>
              )}
            </Panel>
            <Panel title="Upcoming milestones">
              {p.milestones.filter((m) => m.status !== "COMPLETED").slice(0, 5).map((m) => <p key={m.id} className="flex justify-between gap-2 py-1 text-sm"><span>{m.name}</span><span className={m.dueDate && m.dueDate < now ? "text-red-700" : "text-muted"}>{fmtDate(m.dueDate)}</span></p>)}
              {p.milestones.every((m) => m.status === "COMPLETED") && <p className="text-sm text-dim">No open milestones.</p>}
            </Panel>
          </div>
        </div>
      )}

      {tab === "tasks" && (
        <div className="space-y-4">
          <div className="flex gap-2 text-[13px]">
            <Link href={`/admin/projects/${id}?tab=tasks`} className={view === "board" ? "text-muted" : "font-medium text-fg"}>List</Link>
            <span className="text-dim">·</span>
            <Link href={`/admin/projects/${id}?tab=tasks&view=board`} className={view === "board" ? "font-medium text-fg" : "text-muted"}>Board</Link>
          </div>
          {manage && <Panel title="New task">{taskForm()}</Panel>}
          {view === "board" ? (
            <Kanban
              columns={TASK_STATUSES.map((s) => ({ key: s, label: label(s), count: p.tasks.filter((t) => t.status === s).length }))}
              cards={p.tasks.map((t) => ({ id: t.id, column: t.status, title: t.title, href: `/admin/projects/${id}?tab=tasks#t-${t.id}`, sub: t.milestone?.name, meta: `${t.assignee?.name ?? "Unassigned"}${t.dueDate ? ` · ${fmtDate(t.dueDate)}` : ""}`, badge: t.priority === "URGENT" || t.priority === "HIGH" ? t.priority.toLowerCase() : undefined, tone: t.dueDate && t.dueDate < now && t.status !== "DONE" ? ("red" as const) : t.priority === "URGENT" ? ("amber" as const) : undefined }))}
              move={manage ? moveTaskAction : undefined}
              readOnly={!manage}
            />
          ) : (
            <Panel title="Tasks" bodyClassName="p-0">
              {p.tasks.length === 0 ? <p className="p-4 text-sm text-dim">No tasks yet.</p> : (
                <ul className="divide-y divide-line">
                  {p.tasks.map((t) => (
                    <li key={t.id} id={`t-${t.id}`} className="px-4 py-2.5">
                      <details>
                        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 text-sm [&::-webkit-details-marker]:hidden">
                          <StatusBadge value={t.status} />
                          <span className="min-w-0 flex-1 truncate font-medium text-fg">{t.title}</span>
                          <span className="text-xs text-muted">{t.assignee?.name ?? "Unassigned"}</span>
                          <span className={`text-xs ${t.dueDate && t.dueDate < now && t.status !== "DONE" ? "text-red-700" : "text-dim"}`}>{fmtDate(t.dueDate)}</span>
                          <StatusBadge value={t.priority} />
                        </summary>
                        <div className="mt-3 space-y-3 border-l-2 border-line pl-3">
                          {t.description && <p className="text-sm whitespace-pre-wrap text-muted">{t.description}</p>}
                          {manage && taskForm(t)}
                          <ul className="space-y-1.5">{t.comments.map((c) => <li key={c.id} className="text-sm"><span className="font-medium">{c.author?.name ?? "—"}:</span> {c.body} <span className="text-xs text-dim">{fmtDate(c.createdAt, true)}</span></li>)}</ul>
                          {manage && (
                            <ActionForm action={addTaskCommentAction.bind(null, t.id)} resetOnOk className="flex gap-2">
                              <input name="body" required maxLength={5000} placeholder="Comment…" aria-label="Comment" className={inputCls} />
                              <SubmitButton variant="secondary">Comment</SubmitButton>
                            </ActionForm>
                          )}
                        </div>
                      </details>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}
        </div>
      )}

      {tab === "milestones" && (
        <div className="space-y-4">
          {p.milestones.map((m) => (
            <Panel key={m.id} title={`${m.name}${m.amount ? ` · ${fmtMoney(m.amount, p.currency)}` : ""}`} action={<StatusBadge value={m.dueDate && m.dueDate < now && m.status !== "COMPLETED" ? "MISSED" : m.status} text={m.dueDate && m.dueDate < now && m.status !== "COMPLETED" ? "Overdue" : undefined} />}>
              <p className="mb-2 text-xs text-dim">Due {fmtDate(m.dueDate)} · {m._count.tasks} tasks · {m.clientVisible ? "visible to client" : "internal"}</p>
              {manage && (
                <ActionForm action={saveMilestoneAction.bind(null, p.id, m.id)} className="grid gap-2 sm:grid-cols-6">
                  <input name="name" required defaultValue={m.name} aria-label="Name" className={`${inputCls} sm:col-span-2`} />
                  <input name="dueDate" type="date" defaultValue={toDateInput(m.dueDate)} aria-label="Due date" className={inputCls} />
                  <select name="status" defaultValue={m.status} aria-label="Status" className={inputCls}>{["PENDING", "IN_PROGRESS", "COMPLETED", "MISSED"].map((s) => <option key={s} value={s}>{label(s)}</option>)}</select>
                  <input name="amount" defaultValue={m.amount?.toString() ?? ""} placeholder="Billing amount" aria-label="Amount" className={inputCls} />
                  <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" name="clientVisible" defaultChecked={m.clientVisible} /> Client</label>
                  <input name="description" defaultValue={m.description ?? ""} placeholder="Description" aria-label="Description" className={`${inputCls} sm:col-span-5`} />
                  <SubmitButton variant="secondary">Save</SubmitButton>
                </ActionForm>
              )}
            </Panel>
          ))}
          {p.milestones.length === 0 && <p className="text-sm text-dim">No milestones yet.</p>}
          {manage && (
            <Panel title="New milestone">
              <ActionForm action={saveMilestoneAction.bind(null, p.id, null)} resetOnOk className="grid gap-2 sm:grid-cols-6">
                <input name="name" required placeholder="Milestone" aria-label="Milestone name" className={`${inputCls} sm:col-span-2`} />
                <input name="dueDate" type="date" aria-label="Due date" className={inputCls} />
                <input name="amount" placeholder="Billing amount" aria-label="Amount" className={inputCls} />
                <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" name="clientVisible" defaultChecked /> Client</label>
                <SubmitButton>Add milestone</SubmitButton>
              </ActionForm>
            </Panel>
          )}
        </div>
      )}

      {tab === "timeline" && (
        <Panel title="Timeline">
          <Gantt rows={[
            { id: p.id, label: p.name, start: p.startDate, end: p.targetDate, kind: "project", status: p.status },
            ...p.milestones.map((m) => ({ id: m.id, label: `◆ ${m.name}`, start: null, end: m.dueDate, kind: "milestone" as const, status: m.status, href: `/admin/projects/${id}?tab=milestones` })),
            ...p.tasks.map((t) => ({ id: t.id, label: t.title, start: t.startDate ?? (t.dueDate ? new Date(t.dueDate.getTime() - 86400_000) : null), end: t.dueDate, kind: "task" as const, status: t.status, href: `/admin/projects/${id}?tab=tasks#t-${t.id}` })),
          ]} now={now} />
        </Panel>
      )}

      {tab === "issues" && (
        <div className="space-y-4">
          {manage && (
            <Panel title="Log issue">
              <ActionForm action={saveIssueAction.bind(null, p.id, null)} resetOnOk className="grid gap-2 sm:grid-cols-6">
                <input name="title" required placeholder="Issue" aria-label="Issue title" className={`${inputCls} sm:col-span-3`} />
                <select name="severity" defaultValue="MEDIUM" aria-label="Severity" className={inputCls}>{["LOW", "MEDIUM", "HIGH", "URGENT"].map((s) => <option key={s} value={s}>{label(s)}</option>)}</select>
                <select name="assigneeId" aria-label="Assignee" className={inputCls}><option value="">Unassigned</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
                <SubmitButton>Log issue</SubmitButton>
                <textarea name="description" rows={2} placeholder="Details" aria-label="Details" className={`${inputCls} h-auto py-1.5 sm:col-span-6`} />
              </ActionForm>
            </Panel>
          )}
          <Panel title="Issues" bodyClassName="p-0">
            {p.issues.length === 0 ? <p className="p-4 text-sm text-dim">No issues logged.</p> : (
              <ul className="divide-y divide-line">
                {p.issues.map((i) => (
                  <li key={i.id} className="px-4 py-2.5 text-sm">
                    <div className="flex flex-wrap items-center gap-2"><StatusBadge value={i.status} /><StatusBadge value={i.severity} /><span className="font-medium text-fg">{i.title}</span><span className="text-xs text-dim">{fmtDate(i.createdAt)} · {i.reportedBy}</span></div>
                    {i.description && <p className="mt-1 text-muted">{i.description}</p>}
                    {manage && (
                      <ActionForm action={saveIssueAction.bind(null, p.id, i.id)} className="mt-2 flex flex-wrap gap-2">
                        <input type="hidden" name="title" value={i.title} />
                        <input type="hidden" name="description" value={i.description ?? ""} />
                        <input type="hidden" name="severity" value={i.severity} />
                        <input type="hidden" name="assigneeId" value={i.assigneeId ?? ""} />
                        <select name="status" defaultValue={i.status} aria-label="Status" className={sel}>{["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"].map((s) => <option key={s} value={s}>{label(s)}</option>)}</select>
                        <SubmitButton variant="secondary" className="h-8">Update</SubmitButton>
                      </ActionForm>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}

      {tab === "changes" && (
        <div className="space-y-4">
          {manage && (
            <Panel title="New change request">
              <ActionForm action={saveChangeRequestAction.bind(null, p.id, null)} resetOnOk className="grid gap-2 sm:grid-cols-6">
                <input name="title" required placeholder="Change" aria-label="Change title" className={`${inputCls} sm:col-span-3`} />
                <input name="impactCost" placeholder={`Cost impact (${p.currency})`} aria-label="Cost impact" className={inputCls} />
                <input name="impactDays" type="number" placeholder="Days impact" aria-label="Days impact" className={inputCls} />
                <SubmitButton>Log change</SubmitButton>
                <textarea name="description" rows={2} placeholder="Details" aria-label="Details" className={`${inputCls} h-auto py-1.5 sm:col-span-6`} />
              </ActionForm>
            </Panel>
          )}
          <Panel title="Change requests" bodyClassName="p-0">
            {p.changeRequests.length === 0 ? <p className="p-4 text-sm text-dim">No change requests.</p> : (
              <ul className="divide-y divide-line">
                {p.changeRequests.map((c) => (
                  <li key={c.id} className="px-4 py-2.5 text-sm">
                    <div className="flex flex-wrap items-center gap-2"><StatusBadge value={c.status} /><span className="font-medium text-fg">{c.title}</span>{c.fromClient && <StatusBadge value="CLIENT" text="From client" />}<span className="text-xs text-dim">{c.requestedBy} · {fmtDate(c.createdAt)}</span></div>
                    {c.description && <p className="mt-1 text-muted">{c.description}</p>}
                    {manage && (
                      <ActionForm action={saveChangeRequestAction.bind(null, p.id, c.id)} className="mt-2 flex flex-wrap gap-2">
                        <input type="hidden" name="title" value={c.title} />
                        <input type="hidden" name="description" value={c.description ?? ""} />
                        <input name="impactCost" defaultValue={c.impactCost?.toString() ?? ""} placeholder="Cost" aria-label="Cost impact" className={`${sel} w-28`} />
                        <input name="impactDays" type="number" defaultValue={c.impactDays ?? ""} placeholder="Days" aria-label="Days impact" className={`${sel} w-20`} />
                        <select name="status" defaultValue={c.status} aria-label="Status" className={sel}>{["PROPOSED", "UNDER_REVIEW", "APPROVED", "REJECTED", "IMPLEMENTED"].map((s) => <option key={s} value={s}>{label(s)}</option>)}</select>
                        <SubmitButton variant="secondary" className="h-8">Update</SubmitButton>
                      </ActionForm>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}

      {tab === "updates" && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <Panel title="Updates">
            {p.updates.length === 0 ? <p className="text-sm text-dim">No updates yet.</p> : (
              <ul className="space-y-4">{p.updates.map((u) => <li key={u.id} className="border-l-2 border-line-strong pl-3"><p className="text-sm whitespace-pre-wrap">{u.body}</p><p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-dim">{u.author?.name ?? "—"} · {fmtDate(u.createdAt, true)} <StatusBadge value={u.health} /><StatusBadge value={u.visibility} text={u.visibility === "CLIENT" ? "Shared with client" : "Internal"} />{u.aiDrafted && <StatusBadge value="AUTONOMOUS" text="AI-drafted" />}</p></li>)}</ul>
            )}
          </Panel>
          {manage && (
            <Panel title="Post update">
              <ActionForm action={postProjectUpdateAction.bind(null, p.id)} resetOnOk className="space-y-2">
                <textarea name="body" required rows={6} maxLength={10000} defaultValue={str(sp, "draft", 5000)} placeholder="What happened, what's next, any blockers…" aria-label="Update" className={`${inputCls} h-auto py-2`} />
                <input type="hidden" name="aiDrafted" value={str(sp, "draft", 1) ? "1" : "0"} />
                <div className="grid grid-cols-2 gap-2">
                  <select name="health" defaultValue={p.health} aria-label="Health" className={inputCls}>{["GREEN", "AMBER", "RED"].map((h) => <option key={h} value={h}>{label(h)}</option>)}</select>
                  <select name="visibility" defaultValue="INTERNAL" aria-label="Visibility" className={inputCls}><option value="INTERNAL">Internal</option><option value="CLIENT">Share with client</option></select>
                </div>
                <SubmitButton>Post update</SubmitButton>
              </ActionForm>
            </Panel>
          )}
        </div>
      )}
      {tab === "documents" && <DocumentsPanel target={{ kind: "project", id: p.id }} where={{ projectId: p.id }} canManage={manage} />}
      {tab === "activity" && <ActivityPanel where={{ projectId: p.id }} note={manage ? { kind: "project", id: p.id } : undefined} take={150} />}
    </>
  );
}
