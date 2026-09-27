import { requirePortalUser } from "@/lib/portal/session";
import { portalContracts } from "@/lib/portal/data";
import { fmtMoney } from "@/lib/os/money";
import { EmptyState, PageHeader, Panel, fmtDate } from "@/components/admin/ui";
import { DataTable, StatusBadge } from "@/components/admin/os";

export const metadata = { title: "Contracts" };

export default async function PortalContracts() {
  const u = await requirePortalUser();
  const rows = await portalContracts(u);
  return (
    <>
      <PageHeader title="Contracts" />
      {rows.length === 0 ? <Panel><EmptyState title="No contracts yet" /></Panel> : (
        <DataTable rows={rows} columns={[
          { header: "Contract", cell: (c) => <span><a href={`/client/contracts/${c.id}/pdf`} target="_blank" rel="noopener" className="font-medium text-fg hover:text-brand-blue">{c.title}</a><span className="block text-xs text-dim">{c.number}</span></span> },
          { header: "Status", cell: (c) => <StatusBadge value={c.status} /> },
          { header: "Signature", cell: (c) => <StatusBadge value={c.signatureStatus} /> },
          { header: "Value", cell: (c) => <span className="tabular-nums">{fmtMoney(c.value, c.currency)}</span> },
          { header: "Term", cell: (c) => <span className="text-muted">{fmtDate(c.startDate)} → {fmtDate(c.endDate)}</span> },
          { header: "Renewal", cell: (c) => <span className="text-muted">{fmtDate(c.renewalDate)}</span> },
        ]} />
      )}
    </>
  );
}
