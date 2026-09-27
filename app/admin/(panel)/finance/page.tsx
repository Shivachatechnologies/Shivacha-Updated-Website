import Link from "next/link";
import { db } from "@/lib/db/client";
import { Prisma } from "@/lib/generated/prisma/client";
import { requireAccess } from "@/lib/os/guard";
import { CURRENCIES, fmtMoney, fmtMulti } from "@/lib/os/money";
import { resolveRange } from "@/lib/os/range";
import { financeSummary, monthlyRevenue } from "@/lib/finance/core";
import { PAYMENT_PROVIDERS } from "@/lib/payments";
import { PageHeader, Panel } from "@/components/admin/ui";
import { BarList, ColumnChart } from "@/components/admin/charts";
import { RangePicker } from "@/components/admin/range";
import { Kpi, KpiGrid, NotConnected, Tabs, pick, str, type SP } from "@/components/admin/os";

export const metadata = { title: "Revenue" };

export default async function FinanceDashboard({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAccess("finance:view", "FINANCE");
  const sp = await searchParams;
  const rangeKey = str(sp, "range", 10) || "ytd";
  const range = resolveRange(rangeKey, str(sp, "from", 10), str(sp, "to", 10));
  const [summary, monthly, used] = await Promise.all([
    financeSummary(range),
    monthlyRevenue(12),
    db.$queryRaw<{ currency: string; n: bigint }[]>`SELECT currency::text, count(*) AS n FROM "Invoice" WHERE status::text <> 'DRAFT' GROUP BY currency ORDER BY n DESC`,
  ]);
  const currencies = used.map((u) => u.currency);
  const cur = pick(sp, "cur", CURRENCIES) ?? (currencies[0] as (typeof CURRENCIES)[number] | undefined) ?? "USD";
  const from = range.from ?? new Date("2000-01-01T00:00:00Z");
  const to = range.to ?? new Date("2999-01-01T00:00:00Z");
  const [byService, byClient, byCountry] = await Promise.all([
    db.$queryRaw<{ label: string; amount: Prisma.Decimal }[]>`
      SELECT li.name AS label, sum(li.amount) AS amount FROM "LineItem" li JOIN "Invoice" i ON i.id = li."invoiceId"
      WHERE i.status = 'PAID' AND i.currency::text = ${cur} AND i."paidAt" BETWEEN ${from} AND ${to} GROUP BY li.name ORDER BY amount DESC LIMIT 8`,
    db.$queryRaw<{ label: string; amount: Prisma.Decimal }[]>`
      SELECT c.name AS label, sum(p.amount - p."refundedAmount") AS amount FROM "Payment" p JOIN "Client" c ON c.id = p."clientId"
      WHERE p.status::text IN ('CONFIRMED','PARTIALLY_REFUNDED','REFUNDED') AND p.currency::text = ${cur} AND p."confirmedAt" BETWEEN ${from} AND ${to} GROUP BY c.name ORDER BY amount DESC LIMIT 8`,
    db.$queryRaw<{ label: string | null; amount: Prisma.Decimal }[]>`
      SELECT coalesce(c.country, 'Unknown') AS label, sum(p.amount - p."refundedAmount") AS amount FROM "Payment" p JOIN "Client" c ON c.id = p."clientId"
      WHERE p.status::text IN ('CONFIRMED','PARTIALLY_REFUNDED','REFUNDED') AND p.currency::text = ${cur} AND p."confirmedAt" BETWEEN ${from} AND ${to} GROUP BY 1 ORDER BY amount DESC LIMIT 8`,
  ]);
  const fmt = (n: number) => fmtMoney(n, cur, { compact: true });
  const series = monthly.buckets.map((m) => ({ label: m.slice(2), value: monthly.rows.filter((r) => r.month === m && r.currency === cur).reduce((s, r) => s + r.amount, 0) }));
  const toBars = (r: { label: string | null; amount: Prisma.Decimal }[]) => r.map((x) => ({ label: x.label ?? "—", value: Number(x.amount) }));
  const extra = { range: range.key, ...(sp.from && { from: str(sp, "from", 10) }), ...(sp.to && { to: str(sp, "to", 10) }) };
  return (
    <>
      <PageHeader title="Revenue" description="Collected revenue counts confirmed payments only (net of refunds). Amounts are never converted between currencies." crumbs={[{ label: "Finance" }, { label: "Revenue" }]} actions={<><Link href="/admin/finance/invoices/new" className="btn-primary h-9 px-3.5 text-[13px]">New invoice</Link><Link href="/admin/finance/payments/new" className="btn-secondary h-9 px-3 text-[13px]">Record payment</Link></>} />
      <RangePicker active={range.key} basePath="/admin/finance" extra={{ cur }} from={str(sp, "from", 10)} to={str(sp, "to", 10)} />
      <KpiGrid cols={6}>
        <Kpi label="Collected" value={fmtMulti(summary.collected, true)} hint={`${summary.collectedCount} payments · ${range.label}`} tone="green" />
        <Kpi label="Outstanding" value={fmtMulti(summary.outstanding, true)} hint={`${summary.outstandingCount} open invoices`} href="/admin/finance/invoices?status=OPEN" />
        <Kpi label="Overdue" value={fmtMulti(summary.overdue, true)} hint={`${summary.overdueCount} invoices`} tone={summary.overdueCount ? "red" : undefined} href="/admin/finance/invoices?status=OVERDUE" />
        <Kpi label="Pending confirmation" value={summary.pendingPayments} hint="Payments not yet counted" tone={summary.pendingPayments ? "amber" : undefined} href="/admin/finance/payments?status=PENDING" />
        <Kpi label="Refunds" value={fmtMulti(summary.refunds, true)} hint={range.label} />
        <Kpi label="Expenses" value={fmtMulti(summary.expenses, true)} hint={`${range.label} · ${summary.drafts} draft invoices`} href="/admin/finance/expenses" />
      </KpiGrid>
      {!PAYMENT_PROVIDERS.some((p) => p.isConfigured()) && <div className="mt-4"><NotConnected name="Online payments (Stripe / Razorpay)" env={["STRIPE_SECRET_KEY", "RAZORPAY_KEY_ID"]}>Invoices can still be paid by bank transfer and confirmed manually by finance.</NotConnected></div>}
      <div className="mt-6">
        {currencies.length > 1 && <Tabs active={cur} items={currencies.map((c) => ({ key: c, label: c, href: `/admin/finance?${new URLSearchParams({ ...extra, cur: c })}` }))} />}
        <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          <Panel title={`Collected per month (${cur}, last 12 months)`}><ColumnChart data={series} label={`Monthly collected revenue in ${cur}`} format={fmt} empty="No confirmed payments yet" /></Panel>
          <Panel title={`Paid invoices by line item (${cur})`}><BarList data={toBars(byService)} format={fmt} empty="No paid invoices in this period" /></Panel>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Panel title={`Collected by client (${cur})`}><BarList data={toBars(byClient)} format={fmt} empty="No confirmed payments in this period" /></Panel>
          <Panel title={`Collected by country (${cur})`}><BarList data={toBars(byCountry)} format={fmt} empty="No confirmed payments in this period" /></Panel>
        </div>
      </div>
    </>
  );
}
