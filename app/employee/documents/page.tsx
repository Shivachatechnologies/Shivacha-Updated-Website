import { db } from "@/lib/db/client";
import { requireSelf } from "@/lib/workforce/portal";
import { HR_DOC_KINDS } from "@/lib/workforce/documents";
import { DataTable } from "@/components/admin/os";
import { Panel, fmtDate } from "@/components/admin/ui";

export const metadata = { title: "Documents" };

export default async function MyDocumentsPage() {
  const { me } = await requireSelf();
  if (!me) return null;
  const docs = await db.employeeDocument.findMany({ where: { employeeId: me.id, employeeVisible: true }, orderBy: { createdAt: "desc" }, select: { id: true, kind: true, name: true, size: true, createdAt: true } });
  return (
    <Panel title="My HR documents">
      <p className="mb-3 text-xs text-dim">Documents HR has shared with you. Every download is logged.</p>
      {docs.length ? (
        <DataTable
          rows={docs}
          columns={[
            { header: "Document", cell: (d) => d.name },
            { header: "Type", cell: (d) => HR_DOC_KINDS[d.kind as keyof typeof HR_DOC_KINDS] ?? d.kind },
            { header: "Size", cell: (d) => `${Math.max(1, Math.round(d.size / 1024))} KB` },
            { header: "Added", cell: (d) => fmtDate(d.createdAt) },
            { header: "", cell: (d) => <a href={`/admin/employees/documents/${d.id}`} className="text-sm text-brand-blue">Download</a> },
          ]}
        />
      ) : (
        <p className="text-sm text-muted">No documents have been shared with you.</p>
      )}
    </Panel>
  );
}
