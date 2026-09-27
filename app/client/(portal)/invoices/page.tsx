import { requirePortalUser } from "@/lib/portal/session";
import { portalInvoices } from "@/lib/portal/data";
import { fmtMoney } from "@/lib/os/money";
import { EmptyState, PageHeader, Panel, fmtDate } from "@/components/admin/ui";
import { DataTable, LinkCell, StatusBadge } from "@/components/admin/os";

export const metadata = { title: "Invoices" };

export default async function PortalInvoices() {
  const u = await requirePortalUser();
  const rows = await portalInvoices(u);
  const now = new Date();
  return (
    <>
      <PageHeader title="Invoices" />
      {rows.length === 0 ? <Panel><EmptyState title="No invoices yet" /></Panel> : (
        <DataTable rows={rows} columns={[
          { header: "Invoice", cell: (i) => <LinkCell href={`/client/invoices/${i.id}`}>{i.number}</LinkCell> },
          { header: "Status", cell: (i) => <StatusBadge value={(i.status === "ISSUED" || i.status === "PARTIALLY_PAID") && i.dueDate && i.dueDate < now ? "OVERDUE" : i.status} /> },
          { header: "Total", cell: (i) => <span className="tabular-nums">{fmtMoney(i.total, i.currency)}</span> },
          { header: "Balance", cell: (i) => <span className="tabular-nums">{fmtMoney(i.balanceDue, i.currency)}</span> },
          { header: "Issued", cell: (i) => <span className="text-muted">{fmtDate(i.issueDate)}</span> },
          { header: "Due", cell: (i) => <span className="text-muted">{fmtDate(i.dueDate)}</span> },
        ]} />
      )}
    </>
  );
}
