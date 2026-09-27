import Link from "next/link";
import { db } from "@/lib/db/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { CURRENCIES, fmtMoney } from "@/lib/os/money";
import { LinkCell, ListView, StatusBadge, pageOf, pick, str, PAGE_SIZE, type SP } from "@/components/admin/os";
import { fmtDate } from "@/components/admin/ui";

export const metadata = { title: "Invoices" };
const FILTERS = ["DRAFT", "OPEN", "OVERDUE", "PARTIALLY_PAID", "PAID", "VOID"] as const;

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireAccess("finance:view", "FINANCE");
  const sp = await searchParams;
  const values = { q: str(sp, "q", 80), status: pick(sp, "status", FILTERS), currency: pick(sp, "currency", CURRENCIES), page: str(sp, "page") };
  const now = new Date();
  const statusWhere: Prisma.InvoiceWhereInput =
    values.status === "OPEN" ? { status: { in: ["ISSUED", "PARTIALLY_PAID"] } } : values.status === "OVERDUE" ? { status: { in: ["ISSUED", "PARTIALLY_PAID"] }, dueDate: { lt: now } } : values.status ? { status: values.status } : {};
  const where: Prisma.InvoiceWhereInput = { ...statusWhere, ...(values.currency && { currency: values.currency }), ...(values.q && { OR: [{ number: { contains: values.q, mode: "insensitive" } }, { client: { name: { contains: values.q, mode: "insensitive" } } }] }) };
  const page = pageOf(sp);
  const [total, rows] = await Promise.all([db.invoice.count({ where }), db.invoice.findMany({ where, orderBy: [{ createdAt: "desc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { client: { select: { name: true } } } })]);
  return (
    <ListView
      title="Invoices"
      description="Invoice balances only reflect confirmed payments and issued credit notes."
      crumbs={[{ label: "Finance", href: "/admin/finance" }, { label: "Invoices" }]}
      actions={can(user.role, "finance:manage") && <Link href="/admin/finance/invoices/new" className="btn-primary h-9 px-3.5 text-[13px]">New invoice</Link>}
      values={values}
      filters={[{ type: "search", name: "q", placeholder: "Search number or client…" }, { type: "select", name: "status", label: "All invoices", options: [["DRAFT", "Draft"], ["OPEN", "Open (unpaid)"], ["OVERDUE", "Overdue"], ["PARTIALLY_PAID", "Partially paid"], ["PAID", "Paid"], ["VOID", "Void"]] }, { type: "select", name: "currency", label: "Any currency", options: CURRENCIES.map((c) => [c, c] as const) }]}
      rows={rows}
      total={total}
      page={page}
      basePath="/admin/finance/invoices"
      empty={{ title: "No invoices yet", description: "Create an invoice from an accepted quote, a won deal or directly." }}
      columns={[
        { header: "Invoice", cell: (i) => <LinkCell href={`/admin/finance/invoices/${i.id}`} sub={i.client.name}>{i.number}</LinkCell> },
        { header: "Status", cell: (i) => <StatusBadge value={(i.status === "ISSUED" || i.status === "PARTIALLY_PAID") && i.dueDate && i.dueDate < now ? "OVERDUE" : i.status} /> },
        { header: "Total", cell: (i) => <span className="whitespace-nowrap tabular-nums">{fmtMoney(i.total, i.currency)}</span> },
        { header: "Balance", cell: (i) => <span className="whitespace-nowrap tabular-nums">{i.status === "DRAFT" || i.status === "VOID" ? "—" : fmtMoney(i.balanceDue, i.currency)}</span> },
        { header: "Issued", cell: (i) => <span className="text-muted">{fmtDate(i.issueDate)}</span> },
        { header: "Due", cell: (i) => <span className={i.dueDate && i.dueDate < now && (i.status === "ISSUED" || i.status === "PARTIALLY_PAID") ? "text-red-700" : "text-muted"}>{fmtDate(i.dueDate)}</span> },
      ]}
    />
  );
}
