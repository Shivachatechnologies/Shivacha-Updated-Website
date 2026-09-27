import Link from "next/link";
import { db } from "@/lib/db/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { fmtMoney } from "@/lib/os/money";
import { LinkCell, ListView, StatusBadge, pageOf, pick, str, PAGE_SIZE, type SP } from "@/components/admin/os";
import { fmtDate, label } from "@/components/admin/ui";

export const metadata = { title: "Payments" };
const STATUSES = ["PENDING", "CONFIRMED", "FAILED", "PARTIALLY_REFUNDED", "REFUNDED"] as const;

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireAccess("finance:view", "FINANCE");
  const sp = await searchParams;
  const values = { q: str(sp, "q", 80), status: pick(sp, "status", STATUSES), provider: pick(sp, "provider", ["MANUAL", "STRIPE", "RAZORPAY"] as const), page: str(sp, "page") };
  const where: Prisma.PaymentWhereInput = { ...(values.status && { status: values.status }), ...(values.provider && { provider: values.provider }), ...(values.q && { OR: [{ number: { contains: values.q, mode: "insensitive" } }, { reference: { contains: values.q, mode: "insensitive" } }, { client: { name: { contains: values.q, mode: "insensitive" } } }] }) };
  const page = pageOf(sp);
  const [total, rows] = await Promise.all([db.payment.count({ where }), db.payment.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { client: { select: { name: true } }, _count: { select: { allocations: true } } } })]);
  return (
    <ListView
      title="Payments"
      description="Manual receipts stay PENDING until finance confirms them; provider payments are confirmed by verified webhooks."
      crumbs={[{ label: "Finance", href: "/admin/finance" }, { label: "Payments" }]}
      actions={can(user.role, "finance:manage") && <Link href="/admin/finance/payments/new" className="btn-primary h-9 px-3.5 text-[13px]">Record payment</Link>}
      values={values}
      filters={[{ type: "search", name: "q", placeholder: "Search number, reference, client…" }, { type: "select", name: "status", label: "Any status", options: STATUSES.map((s) => [s, label(s)] as const) }, { type: "select", name: "provider", label: "Any source", options: [["MANUAL", "Manual"], ["STRIPE", "Stripe"], ["RAZORPAY", "Razorpay"]] }]}
      rows={rows}
      total={total}
      page={page}
      basePath="/admin/finance/payments"
      empty={{ title: "No payments yet" }}
      columns={[
        { header: "Payment", cell: (p) => <LinkCell href={`/admin/finance/payments/${p.id}`} sub={p.client.name}>{p.number}</LinkCell> },
        { header: "Amount", cell: (p) => <span className="whitespace-nowrap tabular-nums">{fmtMoney(p.amount, p.currency)}</span> },
        { header: "Status", cell: (p) => <StatusBadge value={p.status} /> },
        { header: "Method", cell: (p) => <span className="text-muted">{label(p.method)} · {label(p.provider)}</span> },
        { header: "Reference", cell: (p) => <span className="max-w-[160px] truncate text-muted">{p.reference ?? "—"}</span> },
        { header: "Invoices", cell: (p) => <span className="text-muted tabular-nums">{p._count.allocations}</span> },
        { header: "Confirmed", cell: (p) => <span className="text-muted">{fmtDate(p.confirmedAt)}</span> },
      ]}
    />
  );
}
