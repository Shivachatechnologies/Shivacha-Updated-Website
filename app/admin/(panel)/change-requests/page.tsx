import { db } from "@/lib/db/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { requireAccess } from "@/lib/os/guard";
import { fmtMoney } from "@/lib/os/money";
import { LinkCell, ListView, StatusBadge, pageOf, pick, str, PAGE_SIZE, type SP } from "@/components/admin/os";
import { fmtDate, label } from "@/components/admin/ui";

export const metadata = { title: "Change requests" };
const STATUSES = ["PROPOSED", "UNDER_REVIEW", "APPROVED", "REJECTED", "IMPLEMENTED"] as const;

export default async function ChangeRequestsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAccess("projects:view", "PROJECTS");
  const sp = await searchParams;
  const values = { status: pick(sp, "status", STATUSES), client: str(sp, "client", 1), page: str(sp, "page") };
  const where: Prisma.ChangeRequestWhereInput = { project: { deletedAt: null }, ...(values.status && { status: values.status }), ...(values.client && { fromClient: true }) };
  const page = pageOf(sp);
  const [total, rows] = await Promise.all([db.changeRequest.count({ where }), db.changeRequest.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { project: { select: { id: true, name: true, currency: true } } } })]);
  return (
    <ListView title="Change requests" description="Scope changes with their cost and schedule impact." crumbs={[{ label: "Projects" }, { label: "Change requests" }]} values={values}
      filters={[{ type: "select", name: "status", label: "Any status", options: STATUSES.map((s) => [s, label(s)] as const) }, { type: "select", name: "client", label: "Any source", options: [["1", "Requested by clients"]] }]}
      rows={rows} total={total} page={page} basePath="/admin/change-requests" empty={{ title: "No change requests" }}
      columns={[
        { header: "Change", cell: (c) => <LinkCell href={`/admin/projects/${c.project.id}?tab=changes`} sub={c.project.name}>{c.title}</LinkCell> },
        { header: "Status", cell: (c) => <StatusBadge value={c.status} /> },
        { header: "Cost impact", cell: (c) => <span className="tabular-nums text-muted">{c.impactCost ? fmtMoney(c.impactCost, c.project.currency) : "—"}</span> },
        { header: "Days", cell: (c) => <span className="tabular-nums text-muted">{c.impactDays ?? "—"}</span> },
        { header: "Requested", cell: (c) => <span className="text-muted">{c.fromClient ? "Client · " : ""}{c.requestedBy ?? "—"} · {fmtDate(c.createdAt)}</span> },
      ]}
    />
  );
}
