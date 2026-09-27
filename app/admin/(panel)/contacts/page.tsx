import { db } from "@/lib/db/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { requireAccess } from "@/lib/os/guard";
import { LinkCell, ListView, pageOf, str, PAGE_SIZE, type SP } from "@/components/admin/os";

export const metadata = { title: "Contacts" };

export default async function ContactsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAccess("clients:view");
  const sp = await searchParams;
  const values = { q: str(sp, "q", 80), page: str(sp, "page") };
  const where: Prisma.ClientContactWhereInput = { client: { deletedAt: null }, ...(values.q && { OR: [{ name: { contains: values.q, mode: "insensitive" } }, { email: { contains: values.q, mode: "insensitive" } }, { phone: { contains: values.q } }, { client: { name: { contains: values.q, mode: "insensitive" } } }] }) };
  const page = pageOf(sp);
  const [total, rows] = await Promise.all([db.clientContact.count({ where }), db.clientContact.findMany({ where, orderBy: { name: "asc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { client: { select: { id: true, name: true } } } })]);
  return (
    <ListView
      title="Contacts"
      description="People at client accounts. Manage them from each client's page."
      crumbs={[{ label: "Clients", href: "/admin/clients" }, { label: "Contacts" }]}
      values={values}
      filters={[{ type: "search", name: "q", placeholder: "Search name, email, phone, company…" }]}
      rows={rows}
      total={total}
      page={page}
      basePath="/admin/contacts"
      empty={{ title: "No contacts yet" }}
      columns={[
        { header: "Name", cell: (c) => <span className="font-medium text-fg">{c.name}{c.isPrimary && <span className="ml-1.5 text-xs text-dim">primary</span>}</span> },
        { header: "Client", cell: (c) => <LinkCell href={`/admin/clients/${c.client.id}`}>{c.client.name}</LinkCell> },
        { header: "Title", cell: (c) => <span className="text-muted">{c.title ?? "—"}</span> },
        { header: "Email", cell: (c) => (c.email ? <a href={`mailto:${c.email}`} className="text-brand-blue hover:underline">{c.email}</a> : "—") },
        { header: "Phone", cell: (c) => <span className="text-muted">{c.phone ?? "—"}</span> },
      ]}
    />
  );
}
