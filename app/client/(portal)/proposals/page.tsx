import { requirePortalUser } from "@/lib/portal/session";
import { portalProposals } from "@/lib/portal/data";
import { fmtMoney } from "@/lib/os/money";
import { EmptyState, PageHeader, Panel, fmtDate } from "@/components/admin/ui";
import { DataTable, LinkCell, StatusBadge } from "@/components/admin/os";

export const metadata = { title: "Proposals" };

export default async function PortalProposals() {
  const u = await requirePortalUser();
  const rows = await portalProposals(u);
  return (
    <>
      <PageHeader title="Proposals" />
      {rows.length === 0 ? <Panel><EmptyState title="No proposals yet" /></Panel> : (
        <DataTable rows={rows} columns={[
          { header: "Proposal", cell: (p) => <LinkCell href={`/client/proposals/${p.id}`} sub={`${p.number} v${p.version}`}>{p.title}</LinkCell> },
          { header: "Status", cell: (p) => <StatusBadge value={p.status} /> },
          { header: "Total", cell: (p) => <span className="tabular-nums">{fmtMoney(p.total, p.currency)}</span> },
          { header: "Sent", cell: (p) => <span className="text-muted">{fmtDate(p.sentAt)}</span> },
          { header: "Valid until", cell: (p) => <span className="text-muted">{fmtDate(p.validUntil)}</span> },
        ]} />
      )}
    </>
  );
}
