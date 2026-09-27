import Link from "next/link";
import { db } from "@/lib/db/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { fmtMoney } from "@/lib/os/money";
import { LinkCell, ListView, StatusBadge, pageOf, pick, str, PAGE_SIZE, type SP } from "@/components/admin/os";
import { fmtDate, label } from "@/components/admin/ui";

export const metadata = { title: "Quotes" };
const STATUSES = ["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED"] as const;

export default async function QuotesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireAccess("proposals:view", "PROPOSALS");
  const sp = await searchParams;
  const values = { q: str(sp, "q", 80), status: pick(sp, "status", STATUSES), page: str(sp, "page") };
  const where: Prisma.QuoteWhereInput = { deletedAt: null, ...(values.status && { status: values.status }), ...(values.q && { OR: [{ title: { contains: values.q, mode: "insensitive" } }, { number: { contains: values.q, mode: "insensitive" } }, { client: { name: { contains: values.q, mode: "insensitive" } } }] }) };
  const page = pageOf(sp);
  const [total, rows] = await Promise.all([db.quote.count({ where }), db.quote.findMany({ where, orderBy: { updatedAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { client: { select: { name: true } }, deal: { select: { name: true } } } })]);
  return (
    <ListView
      title="Quotes"
      description="Priced quotations with versions, validity and payment terms."
      crumbs={[{ label: "Sales" }, { label: "Quotes" }]}
      actions={can(user.role, "proposals:manage") && <Link href="/admin/quotes/new" className="btn-primary h-9 px-3.5 text-[13px]">New quote</Link>}
      values={values}
      filters={[{ type: "search", name: "q", placeholder: "Search title, number, client…" }, { type: "select", name: "status", label: "All statuses", options: STATUSES.map((s) => [s, label(s)] as const) }]}
      rows={rows}
      total={total}
      page={page}
      basePath="/admin/quotes"
      empty={{ title: "No quotes yet" }}
      columns={[
        { header: "Quote", cell: (q) => <LinkCell href={`/admin/quotes/${q.id}`} sub={`${q.number} v${q.version}`}>{q.title}</LinkCell> },
        { header: "Client / deal", cell: (q) => <span className="text-muted">{q.client?.name ?? q.deal?.name ?? "—"}</span> },
        { header: "Status", cell: (q) => <StatusBadge value={q.status} /> },
        { header: "Total", cell: (q) => <span className="whitespace-nowrap tabular-nums">{fmtMoney(q.total, q.currency)}</span> },
        { header: "Valid until", cell: (q) => <span className="text-muted">{fmtDate(q.validUntil)}</span> },
      ]}
    />
  );
}
