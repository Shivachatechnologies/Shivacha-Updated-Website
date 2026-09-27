import Link from "next/link";
import { db } from "@/lib/db/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { fmtMoney } from "@/lib/os/money";
import { LinkCell, ListView, StatusBadge, pageOf, pick, str, PAGE_SIZE, type SP } from "@/components/admin/os";
import { fmtDate, label } from "@/components/admin/ui";

export const metadata = { title: "Proposals" };
const STATUSES = ["DRAFT", "INTERNAL_REVIEW", "SENT", "VIEWED", "ACCEPTED", "REJECTED", "EXPIRED"] as const;

export default async function ProposalsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireAccess("proposals:view", "PROPOSALS");
  const sp = await searchParams;
  const values = { q: str(sp, "q", 80), status: pick(sp, "status", STATUSES), page: str(sp, "page") };
  const where: Prisma.ProposalWhereInput = { deletedAt: null, ...(values.status && { status: values.status }), ...(values.q && { OR: [{ title: { contains: values.q, mode: "insensitive" } }, { number: { contains: values.q, mode: "insensitive" } }, { client: { name: { contains: values.q, mode: "insensitive" } } }] }) };
  const page = pageOf(sp);
  const [total, rows] = await Promise.all([db.proposal.count({ where }), db.proposal.findMany({ where, orderBy: { updatedAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { client: { select: { name: true } }, deal: { select: { name: true } }, createdBy: { select: { name: true } } } })]);
  const canManage = can(user.role, "proposals:manage");
  return (
    <ListView
      title="Proposals"
      description="Draft → internal review → approval → client. Every sent version is kept."
      crumbs={[{ label: "Sales" }, { label: "Proposals" }]}
      actions={canManage && <Link href="/admin/proposals/new" className="btn-primary h-9 px-3.5 text-[13px]">New proposal</Link>}
      values={values}
      filters={[{ type: "search", name: "q", placeholder: "Search title, number, client…" }, { type: "select", name: "status", label: "All statuses", options: STATUSES.map((s) => [s, label(s)] as const) }]}
      rows={rows}
      total={total}
      page={page}
      basePath="/admin/proposals"
      empty={{ title: "No proposals yet", description: "Create one from a deal to pre-fill services, client details and pricing." }}
      columns={[
        { header: "Proposal", cell: (p) => <LinkCell href={`/admin/proposals/${p.id}`} sub={`${p.number} v${p.version}${p.aiGenerated ? " · AI draft" : ""}`}>{p.title}</LinkCell> },
        { header: "Client / deal", cell: (p) => <span className="text-muted">{p.client?.name ?? p.deal?.name ?? "—"}</span> },
        { header: "Status", cell: (p) => <StatusBadge value={p.status} /> },
        { header: "Total", cell: (p) => <span className="whitespace-nowrap tabular-nums">{fmtMoney(p.total, p.currency)}</span> },
        { header: "Views", cell: (p) => <span className="text-muted tabular-nums">{p.viewCount}</span> },
        { header: "Valid until", cell: (p) => <span className={p.validUntil && p.validUntil < new Date() && ["SENT", "VIEWED"].includes(p.status) ? "text-red-700" : "text-muted"}>{fmtDate(p.validUntil)}</span> },
        { header: "Owner", cell: (p) => <span className="text-muted">{p.createdBy?.name ?? "—"}</span> },
      ]}
    />
  );
}
