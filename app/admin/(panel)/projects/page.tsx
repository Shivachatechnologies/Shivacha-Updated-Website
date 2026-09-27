import Link from "next/link";
import { db } from "@/lib/db/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { fmtMoney } from "@/lib/os/money";
import { LinkCell, ListView, StatusBadge, pageOf, pick, str, PAGE_SIZE, type SP } from "@/components/admin/os";
import { fmtDate, label } from "@/components/admin/ui";

export const metadata = { title: "Projects" };
const STATUSES = ["PLANNED", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"] as const;

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireAccess("projects:view", "PROJECTS");
  const sp = await searchParams;
  const values = { q: str(sp, "q", 80), status: pick(sp, "status", STATUSES), health: pick(sp, "health", ["GREEN", "AMBER", "RED"] as const), mine: str(sp, "mine", 1), page: str(sp, "page") };
  const where: Prisma.ProjectWhereInput = {
    deletedAt: null,
    ...(values.status && { status: values.status }),
    ...(values.health && { health: values.health }),
    ...(values.mine && { OR: [{ managerId: user.id }, { members: { some: { userId: user.id } } }] }),
    ...(values.q && { AND: [{ OR: [{ name: { contains: values.q, mode: "insensitive" } }, { number: { contains: values.q, mode: "insensitive" } }, { client: { name: { contains: values.q, mode: "insensitive" } } }] }] }),
  };
  const page = pageOf(sp);
  const now = new Date();
  const [total, rows] = await Promise.all([
    db.project.count({ where }),
    db.project.findMany({ where, orderBy: [{ status: "asc" }, { targetDate: "asc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { client: { select: { name: true } }, manager: { select: { name: true } }, _count: { select: { tasks: { where: { status: { not: "DONE" }, dueDate: { lt: now } } }, issues: { where: { status: { in: ["OPEN", "IN_PROGRESS"] } } } } } } }),
  ]);
  return (
    <ListView
      title="Projects"
      description="Delivery for every client: milestones, tasks, issues, change requests and updates."
      crumbs={[{ label: "Projects" }]}
      actions={can(user.role, "projects:manage") && <Link href="/admin/projects/new" className="btn-primary h-9 px-3.5 text-[13px]">New project</Link>}
      values={values}
      filters={[{ type: "search", name: "q", placeholder: "Search project, number, client…" }, { type: "select", name: "status", label: "All statuses", options: STATUSES.map((s) => [s, label(s)] as const) }, { type: "select", name: "health", label: "Any health", options: [["GREEN", "Green"], ["AMBER", "Amber"], ["RED", "Red"]] }, { type: "select", name: "mine", label: "All projects", options: [["1", "My projects"]] }]}
      rows={rows}
      total={total}
      page={page}
      basePath="/admin/projects"
      empty={{ title: "No projects yet", description: "Projects are created when a deal is won, or here." }}
      columns={[
        { header: "Project", cell: (p) => <LinkCell href={`/admin/projects/${p.id}`} sub={`${p.number} · ${p.client.name}`}>{p.name}</LinkCell> },
        { header: "Status", cell: (p) => <StatusBadge value={p.status} /> },
        { header: "Health", cell: (p) => <StatusBadge value={p.health} /> },
        { header: "Progress", cell: (p) => <span className="flex items-center gap-2"><span className="h-1.5 w-16 rounded-full bg-ink-800"><span className="block h-full rounded-full bg-brand-blue" style={{ width: `${p.progress}%` }} /></span><span className="text-xs tabular-nums text-muted">{p.progress}%</span></span> },
        { header: "Target", cell: (p) => <span className={p.targetDate && p.targetDate < now && !["COMPLETED", "CANCELLED"].includes(p.status) ? "text-red-700" : "text-muted"}>{fmtDate(p.targetDate)}</span> },
        { header: "Overdue tasks", cell: (p) => <span className={p._count.tasks ? "text-red-700 tabular-nums" : "text-muted tabular-nums"}>{p._count.tasks}</span> },
        { header: "Open issues", cell: (p) => <span className="tabular-nums text-muted">{p._count.issues}</span> },
        { header: "Budget", cell: (p) => <span className="text-muted tabular-nums">{p.budget ? fmtMoney(p.budget, p.currency, { compact: true }) : "—"}</span> },
        { header: "PM", cell: (p) => <span className="text-muted">{p.manager?.name ?? "—"}</span> },
      ]}
    />
  );
}
