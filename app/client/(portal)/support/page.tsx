import Link from "next/link";
import { requirePortalUser } from "@/lib/portal/session";
import { portalTickets } from "@/lib/portal/data";
import { EmptyState, PageHeader, Panel, fmtDate, label } from "@/components/admin/ui";
import { DataTable, LinkCell, StatusBadge } from "@/components/admin/os";

export const metadata = { title: "Support" };

export default async function PortalSupport() {
  const u = await requirePortalUser();
  const rows = await portalTickets(u);
  return (
    <>
      <PageHeader title="Support" actions={<Link href="/client/support/new" className="btn-primary h-9 px-3.5 text-[13px]">New ticket</Link>} />
      {rows.length === 0 ? <Panel><EmptyState title="No tickets yet" description="Open a ticket for bugs, questions, billing or anything else." /></Panel> : (
        <DataTable rows={rows} columns={[
          { header: "Ticket", cell: (t) => <LinkCell href={`/client/support/${t.id}`} sub={t.number}>{t.subject}</LinkCell> },
          { header: "Status", cell: (t) => <StatusBadge value={t.status} /> },
          { header: "Priority", cell: (t) => <StatusBadge value={t.priority} /> },
          { header: "Category", cell: (t) => <span className="text-muted">{label(t.category)}</span> },
          { header: "Updated", cell: (t) => <span className="text-muted">{fmtDate(t.updatedAt, true)}</span> },
        ]} />
      )}
    </>
  );
}
