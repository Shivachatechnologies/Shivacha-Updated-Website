import { requirePortalUser } from "@/lib/portal/session";
import { portalProjects } from "@/lib/portal/data";
import { EmptyState, PageHeader, Panel, fmtDate } from "@/components/admin/ui";
import { DataTable, LinkCell, StatusBadge } from "@/components/admin/os";

export const metadata = { title: "Projects" };

export default async function PortalProjects() {
  const u = await requirePortalUser();
  const rows = await portalProjects(u);
  return (
    <>
      <PageHeader title="Projects" />
      {rows.length === 0 ? <Panel><EmptyState title="No projects yet" /></Panel> : (
        <DataTable rows={rows} columns={[
          { header: "Project", cell: (p) => <LinkCell href={`/client/projects/${p.id}`} sub={p.number}>{p.name}</LinkCell> },
          { header: "Status", cell: (p) => <StatusBadge value={p.status} /> },
          { header: "Progress", cell: (p) => <span className="tabular-nums">{p.progress}%</span> },
          { header: "Start", cell: (p) => <span className="text-muted">{fmtDate(p.startDate)}</span> },
          { header: "Target", cell: (p) => <span className="text-muted">{fmtDate(p.targetDate)}</span> },
        ]} />
      )}
    </>
  );
}
