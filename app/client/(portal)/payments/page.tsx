import Link from "next/link";
import { requirePortalUser } from "@/lib/portal/session";
import { portalPayments } from "@/lib/portal/data";
import { fmtMoney } from "@/lib/os/money";
import { EmptyState, PageHeader, Panel, fmtDate, label } from "@/components/admin/ui";
import { DataTable, StatusBadge } from "@/components/admin/os";

export const metadata = { title: "Payments" };

export default async function PortalPayments() {
  const u = await requirePortalUser();
  const rows = await portalPayments(u);
  return (
    <>
      <PageHeader title="Payments" description="Payments appear once they are confirmed by Shivacha or the payment provider." />
      {rows.length === 0 ? <Panel><EmptyState title="No confirmed payments yet" /></Panel> : (
        <DataTable rows={rows} columns={[
          { header: "Payment", cell: (p) => <span className="font-medium">{p.number}</span> },
          { header: "Amount", cell: (p) => <span className="tabular-nums">{fmtMoney(p.amount, p.currency)}</span> },
          { header: "Method", cell: (p) => <span className="text-muted">{label(p.method)}</span> },
          { header: "Status", cell: (p) => <StatusBadge value={p.status} /> },
          { header: "Confirmed", cell: (p) => <span className="text-muted">{fmtDate(p.confirmedAt)}</span> },
          { header: "Invoices", cell: (p) => <span className="text-xs">{p.allocations.map((a) => <Link key={a.invoice.id} href={`/client/invoices/${a.invoice.id}`} className="mr-2 text-brand-blue hover:underline">{a.invoice.number}</Link>)}</span> },
        ]} />
      )}
    </>
  );
}
