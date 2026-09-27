import Link from "next/link";
import { db } from "@/lib/db/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { ListView, StatusBadge, pageOf, pick, str, PAGE_SIZE, type SP } from "@/components/admin/os";
import { fmtDate } from "@/components/admin/ui";

export const metadata = { title: "Documents" };

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireAccess("clients:view");
  const sp = await searchParams;
  const values = { q: str(sp, "q", 80), visibility: pick(sp, "visibility", ["INTERNAL", "CLIENT"] as const), page: str(sp, "page") };
  // Only documents attached to records the viewer may see.
  const scopes: Prisma.DocumentWhereInput[] = [{ clientId: { not: null }, projectId: null, dealId: null, contractId: null, ticketId: null }];
  if (can(user.role, "projects:view")) scopes.push({ projectId: { not: null } });
  if (can(user.role, "deals:view")) scopes.push({ dealId: { not: null } });
  if (can(user.role, "contracts:view")) scopes.push({ contractId: { not: null } });
  if (can(user.role, "support:view")) scopes.push({ ticketId: { not: null } });
  const where: Prisma.DocumentWhereInput = { deletedAt: null, AND: [{ OR: scopes }], ...(values.visibility && { visibility: values.visibility }), ...(values.q && { name: { contains: values.q, mode: "insensitive" } }) };
  const page = pageOf(sp);
  const [total, rows] = await Promise.all([db.document.count({ where }), db.document.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { client: { select: { id: true, name: true } }, project: { select: { id: true, number: true } }, deal: { select: { id: true, number: true } }, contract: { select: { id: true, number: true } }, ticket: { select: { id: true, number: true } }, uploadedBy: { select: { name: true } } } })]);
  return (
    <ListView
      title="Documents"
      description="Files attached to clients, deals, contracts, projects and tickets. Upload from the record they belong to."
      crumbs={[{ label: "Clients", href: "/admin/clients" }, { label: "Documents" }]}
      values={values}
      filters={[{ type: "search", name: "q", placeholder: "Search file name…" }, { type: "select", name: "visibility", label: "Any visibility", options: [["INTERNAL", "Internal"], ["CLIENT", "Client-visible"]] }]}
      rows={rows}
      total={total}
      page={page}
      basePath="/admin/documents"
      empty={{ title: "No documents yet" }}
      columns={[
        { header: "File", cell: (d) => <a href={`/admin/documents/${d.id}/download`} className="block max-w-[280px] truncate font-medium text-fg hover:text-brand-blue">{d.name}</a> },
        { header: "Attached to", cell: (d) => { const l = d.contract ? [`/admin/contracts/${d.contract.id}`, d.contract.number] : d.project ? [`/admin/projects/${d.project.id}`, d.project.number] : d.deal ? [`/admin/deals/${d.deal.id}`, d.deal.number] : d.ticket ? [`/admin/support/${d.ticket.id}`, d.ticket.number] : d.client ? [`/admin/clients/${d.client.id}`, d.client.name] : null; return l ? <Link href={l[0]} className="text-brand-blue hover:underline">{l[1]}</Link> : "—"; } },
        { header: "Client", cell: (d) => <span className="text-muted">{d.client?.name ?? "—"}</span> },
        { header: "Visibility", cell: (d) => <StatusBadge value={d.visibility} text={d.visibility === "CLIENT" ? "Client-visible" : "Internal"} /> },
        { header: "Uploaded", cell: (d) => <span className="whitespace-nowrap text-muted">{d.uploadedBy?.name ?? (d.portalUserId ? "Client" : "—")} · {fmtDate(d.createdAt)}</span> },
      ]}
    />
  );
}
