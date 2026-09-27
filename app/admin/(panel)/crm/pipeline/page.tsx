import Link from "next/link";
import { db } from "@/lib/db/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { fmtMoney } from "@/lib/os/money";
import { PIPELINE } from "@/lib/crm/constants";
import { moveLeadStatusAction } from "@/lib/crm/actions";
import { PageHeader } from "@/components/admin/ui";
import { Kanban } from "@/components/admin/kanban";
import { FilterBar, str, type SP } from "@/components/admin/os";

export const metadata = { title: "Pipeline" };
const PER_COLUMN = 40;

export default async function PipelinePage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireAccess("leads:view", "ADVANCED_CRM");
  const sp = await searchParams;
  const q = str(sp, "q", 80);
  const owner = str(sp, "owner", 40);
  const where: Prisma.LeadWhereInput = {
    archivedAt: null,
    ...(q && { OR: [{ name: { contains: q, mode: "insensitive" } }, { company: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] }),
    ...(owner === "me" ? { assignedToId: user.id } : owner === "none" ? { assignedToId: null } : owner ? { assignedToId: owner } : {}),
  };
  const statuses = PIPELINE.map((p) => p.key);
  const [groups, users, ...columns] = await Promise.all([
    db.lead.groupBy({ by: ["status", "currency"], where: { ...where, status: { in: [...statuses] } }, _count: { _all: true }, _sum: { estimatedValue: true } }),
    db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ...statuses.map((s) =>
      db.lead.findMany({
        where: { ...where, status: s },
        orderBy: [{ score: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
        take: PER_COLUMN,
        select: { id: true, name: true, company: true, service: true, product: true, score: true, priority: true, estimatedValue: true, currency: true, nextFollowUpAt: true, assignedTo: { select: { name: true } } },
      }),
    ),
  ]);
  const now = new Date();
  const cols = PIPELINE.map((p) => {
    const g = groups.filter((x) => x.status === p.key);
    const count = g.reduce((n, x) => n + x._count._all, 0);
    const top = [...g].sort((a, b) => Number(b._sum.estimatedValue ?? 0) - Number(a._sum.estimatedValue ?? 0))[0];
    const total = top?._sum.estimatedValue ? `${fmtMoney(top._sum.estimatedValue, top.currency, { compact: true })}${g.filter((x) => x._sum.estimatedValue).length > 1 ? " +" : ""}` : undefined;
    return { key: p.key, label: p.label, count, total };
  });
  const cards = columns.flatMap((rows, i) =>
    rows.map((l) => ({
      id: l.id,
      column: statuses[i],
      title: l.name,
      href: `/admin/leads/${l.id}`,
      sub: [l.company, l.product ?? l.service].filter(Boolean).join(" · "),
      meta: [l.assignedTo?.name ?? "Unassigned", l.estimatedValue ? fmtMoney(l.estimatedValue, l.currency, { compact: true }) : null].filter(Boolean).join(" · "),
      badge: l.nextFollowUpAt && l.nextFollowUpAt < now ? "overdue" : l.score != null ? String(l.score) : undefined,
      tone: l.nextFollowUpAt && l.nextFollowUpAt < now ? ("red" as const) : l.priority === "URGENT" || l.priority === "HIGH" ? ("amber" as const) : undefined,
    })),
  );
  const canEdit = can(user.role, "leads:edit");
  return (
    <>
      <PageHeader
        title="Pipeline"
        description={`Leads by stage — top ${PER_COLUMN} per column by score. Drag cards or use “Move to”.`}
        crumbs={[{ label: "CRM" }, { label: "Pipeline" }]}
        actions={
          <>
            <Link href="/admin/leads" className="btn-secondary h-9 px-3 text-[13px]">Table view</Link>
            {can(user.role, "leads:create") && <Link href="/admin/leads/new" className="btn-primary h-9 px-3.5 text-[13px]">New lead</Link>}
          </>
        }
      />
      <FilterBar
        values={{ q, owner }}
        filters={[
          { type: "search", name: "q", placeholder: "Search name, company, email…" },
          { type: "select", name: "owner", label: "Any owner", options: [["me", "My leads"], ["none", "Unassigned"], ...users.map((u) => [u.id, u.name] as const)] },
        ]}
      />
      <Kanban columns={cols} cards={cards} move={canEdit ? moveLeadStatusAction : undefined} readOnly={!canEdit} />
    </>
  );
}
