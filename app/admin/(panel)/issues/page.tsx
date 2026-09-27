import { db } from "@/lib/db/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { requireAccess } from "@/lib/os/guard";
import { LinkCell, ListView, StatusBadge, pageOf, pick, str, PAGE_SIZE, type SP } from "@/components/admin/os";
import { fmtDate, label } from "@/components/admin/ui";

export const metadata = { title: "Issues" };
const STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const;

export default async function IssuesPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAccess("projects:view", "PROJECTS");
  const sp = await searchParams;
  const values = { q: str(sp, "q", 80), status: pick(sp, "status", STATUSES), severity: pick(sp, "severity", ["LOW", "MEDIUM", "HIGH", "URGENT"] as const), page: str(sp, "page") };
  const where: Prisma.ProjectIssueWhereInput = { project: { deletedAt: null }, ...(values.status && { status: values.status }), ...(values.severity && { severity: values.severity }), ...(values.q && { title: { contains: values.q, mode: "insensitive" } }) };
  const page = pageOf(sp);
  const [total, rows] = await Promise.all([db.projectIssue.count({ where }), db.projectIssue.findMany({ where, orderBy: [{ status: "asc" }, { createdAt: "desc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { project: { select: { id: true, name: true } } } })]);
  return (
    <ListView title="Issues" description="Delivery issues logged on projects." crumbs={[{ label: "Projects" }, { label: "Issues" }]} values={values}
      filters={[{ type: "search", name: "q", placeholder: "Search issues…" }, { type: "select", name: "status", label: "Any status", options: STATUSES.map((s) => [s, label(s)] as const) }, { type: "select", name: "severity", label: "Any severity", options: ["LOW", "MEDIUM", "HIGH", "URGENT"].map((s) => [s, label(s)] as const) }]}
      rows={rows} total={total} page={page} basePath="/admin/issues" empty={{ title: "No issues" }}
      columns={[
        { header: "Issue", cell: (i) => <LinkCell href={`/admin/projects/${i.project.id}?tab=issues`} sub={i.project.name}>{i.title}</LinkCell> },
        { header: "Status", cell: (i) => <StatusBadge value={i.status} /> },
        { header: "Severity", cell: (i) => <StatusBadge value={i.severity} /> },
        { header: "Reported", cell: (i) => <span className="text-muted">{i.reportedBy ?? "—"} · {fmtDate(i.createdAt)}</span> },
      ]}
    />
  );
}
