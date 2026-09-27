import { requirePortalUser } from "@/lib/portal/session";
import { portalDocuments } from "@/lib/portal/data";
import { EmptyState, PageHeader, Panel, fmtDate } from "@/components/admin/ui";
import { DataTable } from "@/components/admin/os";

export const metadata = { title: "Documents" };

export default async function PortalDocuments() {
  const u = await requirePortalUser();
  const rows = await portalDocuments(u);
  return (
    <>
      <PageHeader title="Documents" description="Files your Shivacha team has shared with you." />
      {rows.length === 0 ? <Panel><EmptyState title="No shared documents yet" /></Panel> : (
        <DataTable rows={rows} columns={[
          { header: "File", cell: (d) => <a href={`/client/documents/${d.id}/download`} className="font-medium text-fg hover:text-brand-blue">{d.name}</a> },
          { header: "Related to", cell: (d) => <span className="text-muted">{d.project?.name ?? d.contract?.number ?? "Account"}</span> },
          { header: "Size", cell: (d) => <span className="text-muted tabular-nums">{Math.max(1, Math.round(d.size / 1024))} KB</span> },
          { header: "Shared", cell: (d) => <span className="text-muted">{fmtDate(d.createdAt)}</span> },
        ]} />
      )}
    </>
  );
}
