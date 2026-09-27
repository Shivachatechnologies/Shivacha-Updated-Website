import { db } from "@/lib/db/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { requireAccess } from "@/lib/os/guard";
import { fmtMoney } from "@/lib/os/money";
import { daysFromNow } from "@/lib/os/range";
import { LinkCell, ListView, StatusBadge, pageOf, pick, str, PAGE_SIZE, type SP } from "@/components/admin/os";
import { fmtDate, label } from "@/components/admin/ui";

export const metadata = { title: "Milestones" };
const STATUSES = ["PENDING", "IN_PROGRESS", "COMPLETED", "MISSED"] as const;

export default async function MilestonesPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAccess("projects:view", "PROJECTS");
  const sp = await searchParams;
  const values = { status: pick(sp, "status", STATUSES), due: pick(sp, "due", ["overdue", "30d"] as const), page: str(sp, "page") };
  const now = new Date();
  const where: Prisma.MilestoneWhereInput = { project: { deletedAt: null }, ...(values.status && { status: values.status }), ...(values.due === "overdue" ? { dueDate: { lt: now }, status: { not: "COMPLETED" } } : values.due === "30d" ? { dueDate: { gte: now, lte: daysFromNow(30) } } : {}) };
  const page = pageOf(sp);
  const [total, rows] = await Promise.all([db.milestone.count({ where }), db.milestone.findMany({ where, orderBy: { dueDate: { sort: "asc", nulls: "last" } }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { project: { select: { id: true, name: true, currency: true, client: { select: { name: true } } } } } })]);
  return (
    <ListView title="Milestones" description="Milestones across all projects." crumbs={[{ label: "Projects" }, { label: "Milestones" }]} values={values}
      filters={[{ type: "select", name: "status", label: "Any status", options: STATUSES.map((s) => [s, label(s)] as const) }, { type: "select", name: "due", label: "Any date", options: [["overdue", "Overdue"], ["30d", "Due in 30 days"]] }]}
      rows={rows} total={total} page={page} basePath="/admin/milestones" empty={{ title: "No milestones" }}
      columns={[
        { header: "Milestone", cell: (m) => <LinkCell href={`/admin/projects/${m.project.id}?tab=milestones`} sub={`${m.project.name} · ${m.project.client.name}`}>{m.name}</LinkCell> },
        { header: "Status", cell: (m) => <StatusBadge value={m.dueDate && m.dueDate < now && m.status !== "COMPLETED" ? "MISSED" : m.status} text={m.dueDate && m.dueDate < now && m.status !== "COMPLETED" ? "Overdue" : undefined} /> },
        { header: "Due", cell: (m) => <span className="text-muted">{fmtDate(m.dueDate)}</span> },
        { header: "Billing", cell: (m) => <span className="text-muted tabular-nums">{m.amount ? fmtMoney(m.amount, m.project.currency) : "—"}</span> },
        { header: "Client-visible", cell: (m) => <span className="text-muted">{m.clientVisible ? "Yes" : "No"}</span> },
      ]}
    />
  );
}
