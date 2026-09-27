import { db } from "@/lib/db/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { moveTaskAction, saveTaskAction } from "@/lib/projects/actions";
import { Kanban } from "@/components/admin/kanban";
import { FilterBar, LinkCell, ListView, StatusBadge, Tabs, pageOf, pick, str, PAGE_SIZE, type SP } from "@/components/admin/os";
import { PageHeader, Panel, fmtDate, inputCls, label } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/client";
import { ActionForm } from "@/components/admin/forms";

export const metadata = { title: "Tasks" };
const STATUSES = ["TODO", "IN_PROGRESS", "REVIEW", "BLOCKED", "DONE"] as const;

export default async function TasksPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireAccess("projects:view", "PROJECTS");
  const sp = await searchParams;
  const board = str(sp, "view") === "board";
  const values = { q: str(sp, "q", 80), status: pick(sp, "status", STATUSES), mine: str(sp, "mine", 1), overdue: str(sp, "overdue", 1), scope: pick(sp, "scope", ["project", "crm"] as const), view: board ? "board" : undefined, page: str(sp, "page") };
  const now = new Date();
  const where: Prisma.TaskWhereInput = {
    ...(values.status && { status: values.status }),
    ...(values.mine && { assigneeId: user.id }),
    ...(values.overdue && { dueDate: { lt: now }, status: { not: "DONE" } }),
    ...(values.scope === "project" ? { projectId: { not: null } } : values.scope === "crm" ? { projectId: null } : {}),
    ...(values.q && { title: { contains: values.q, mode: "insensitive" } }),
    OR: [{ projectId: null }, { project: { deletedAt: null } }],
  };
  const manage = can(user.role, "projects:manage");
  const tabs = <Tabs active={board ? "board" : "list"} items={[{ key: "list", label: "List", href: "/admin/tasks" }, { key: "board", label: "Board", href: "/admin/tasks?view=board" }]} />;
  const filters = [
    { type: "search" as const, name: "q", placeholder: "Search tasks…" },
    ...(board ? [] : [{ type: "select" as const, name: "status", label: "Any status", options: STATUSES.map((s) => [s, label(s)] as const) }]),
    { type: "select" as const, name: "mine", label: "Everyone", options: [["1", "Assigned to me"]] as const },
    { type: "select" as const, name: "overdue", label: "Any due date", options: [["1", "Overdue"]] as const },
    { type: "select" as const, name: "scope", label: "All tasks", options: [["project", "Project tasks"], ["crm", "CRM / AI / automation tasks"]] as const },
  ];
  const quickAdd = manage && (
    <Panel title="Quick task (not tied to a project)" className="mb-4">
      <ActionForm action={saveTaskAction.bind(null, null, null)} resetOnOk className="flex flex-wrap gap-2">
        <input name="title" required maxLength={200} placeholder="Task" aria-label="Task" className={`${inputCls} min-w-0 flex-1`} />
        <input name="dueDate" type="date" aria-label="Due date" className={`${inputCls} w-auto`} />
        <input type="hidden" name="assigneeId" value={user.id} />
        <SubmitButton variant="secondary">Add</SubmitButton>
      </ActionForm>
    </Panel>
  );
  const include = { project: { select: { id: true, name: true, number: true } }, lead: { select: { id: true, name: true } }, deal: { select: { id: true, name: true } }, assignee: { select: { name: true } } } as const;
  const link = (t: { project: { id: string } | null; lead: { id: string } | null; deal: { id: string } | null }) => (t.project ? `/admin/projects/${t.project.id}?tab=tasks` : t.deal ? `/admin/deals/${t.deal.id}` : t.lead ? `/admin/leads/${t.lead.id}` : "/admin/tasks");

  if (board) {
    const cols = await Promise.all(STATUSES.map((s) => db.task.findMany({ where: { ...where, status: s }, orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }], take: 50, include })));
    const counts = await db.task.groupBy({ by: ["status"], where, _count: { _all: true } });
    return (
      <>
        <PageHeader title="Tasks" description="Drag cards between columns or use “Move to”." crumbs={[{ label: "Projects" }, { label: "Tasks" }]} />
        {tabs}
        {quickAdd}
        <FilterBar filters={filters} values={values} hidden={{ view: "board" }} />
        <Kanban columns={STATUSES.map((s) => ({ key: s, label: label(s), count: counts.find((c) => c.status === s)?._count._all ?? 0 }))} cards={cols.flatMap((rows) => rows.map((t) => ({ id: t.id, column: t.status, title: t.title, href: link(t), sub: t.project?.name ?? t.deal?.name ?? t.lead?.name ?? t.source ?? undefined, meta: `${t.assignee?.name ?? "Unassigned"}${t.dueDate ? ` · ${fmtDate(t.dueDate)}` : ""}`, tone: t.dueDate && t.dueDate < now && t.status !== "DONE" ? ("red" as const) : undefined })))} move={manage ? moveTaskAction : undefined} readOnly={!manage} />
      </>
    );
  }
  const page = pageOf(sp);
  const [total, rows] = await Promise.all([db.task.count({ where }), db.task.findMany({ where, orderBy: [{ status: "asc" }, { dueDate: { sort: "asc", nulls: "last" } }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include })]);
  return (
    <ListView
      title="Tasks"
      description="Project tasks plus follow-up work created by automations and the AI workforce."
      crumbs={[{ label: "Projects" }, { label: "Tasks" }]}
      tabs={tabs}
      above={quickAdd}
      filters={filters}
      values={values}
      rows={rows}
      total={total}
      page={page}
      basePath="/admin/tasks"
      empty={{ title: "No tasks" }}
      columns={[
        { header: "Task", cell: (t) => <LinkCell href={link(t)} sub={t.project ? `${t.project.number} · ${t.project.name}` : t.deal ? `Deal · ${t.deal.name}` : t.lead ? `Lead · ${t.lead.name}` : t.source ?? undefined}>{t.title}</LinkCell> },
        { header: "Status", cell: (t) => <StatusBadge value={t.status} /> },
        { header: "Priority", cell: (t) => <StatusBadge value={t.priority} /> },
        { header: "Assignee", cell: (t) => <span className="text-muted">{t.assignee?.name ?? "—"}</span> },
        { header: "Due", cell: (t) => <span className={t.dueDate && t.dueDate < now && t.status !== "DONE" ? "text-red-700" : "text-muted"}>{fmtDate(t.dueDate)}</span> },
      ]}
    />
  );
}
