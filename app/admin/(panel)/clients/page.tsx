import Link from "next/link";
import { db } from "@/lib/db/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { LinkCell, ListView, StatusBadge, pageOf, pick, str, PAGE_SIZE, type SP } from "@/components/admin/os";
import { label } from "@/components/admin/ui";

export const metadata = { title: "Clients" };
const STATUSES = ["ONBOARDING", "ACTIVE", "INACTIVE", "CHURNED"] as const;

export default async function ClientsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireAccess("clients:view");
  const sp = await searchParams;
  const values = { q: str(sp, "q", 80), status: pick(sp, "status", STATUSES), owner: str(sp, "owner", 40), page: str(sp, "page") };
  const where: Prisma.ClientWhereInput = { deletedAt: null, ...(values.status && { status: values.status }), ...(values.owner === "me" ? { accountOwnerId: user.id } : values.owner ? { accountOwnerId: values.owner } : {}), ...(values.q && { OR: [{ name: { contains: values.q, mode: "insensitive" } }, { number: { contains: values.q, mode: "insensitive" } }, { billingEmail: { contains: values.q, mode: "insensitive" } }, { contacts: { some: { OR: [{ name: { contains: values.q, mode: "insensitive" } }, { email: { contains: values.q, mode: "insensitive" } }] } } }] }) };
  const page = pageOf(sp);
  const [total, rows, users] = await Promise.all([
    db.client.count({ where }),
    db.client.findMany({ where, orderBy: { updatedAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { accountOwner: { select: { name: true } }, _count: { select: { projects: { where: { status: { in: ["ACTIVE", "PLANNED"] } } }, invoices: { where: { status: { in: ["ISSUED", "PARTIALLY_PAID"] } } }, tickets: { where: { status: { in: ["OPEN", "IN_PROGRESS", "WAITING_FOR_CLIENT"] } } } } } } }),
    db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <ListView
      title="Clients"
      description="Customer accounts — created automatically when a deal is won, or added here."
      crumbs={[{ label: "Clients" }]}
      actions={can(user.role, "clients:manage") && <Link href="/admin/clients/new" className="btn-primary h-9 px-3.5 text-[13px]">New client</Link>}
      values={values}
      filters={[{ type: "search", name: "q", placeholder: "Search company, contact, email…" }, { type: "select", name: "status", label: "All statuses", options: STATUSES.map((s) => [s, label(s)] as const) }, { type: "select", name: "owner", label: "Any owner", options: [["me", "My accounts"], ...users.map((u) => [u.id, u.name] as const)] }]}
      rows={rows}
      total={total}
      page={page}
      basePath="/admin/clients"
      empty={{ title: "No clients yet", description: "Mark a deal as won to create the first client automatically." }}
      columns={[
        { header: "Client", cell: (c) => <LinkCell href={`/admin/clients/${c.id}`} sub={[c.number, c.industry].filter(Boolean).join(" · ")}>{c.name}</LinkCell> },
        { header: "Status", cell: (c) => <StatusBadge value={c.status} /> },
        { header: "Country", cell: (c) => <span className="text-muted">{c.country ?? "—"}</span> },
        { header: "Owner", cell: (c) => <span className="text-muted">{c.accountOwner?.name ?? "—"}</span> },
        { header: "Active projects", cell: (c) => <span className="tabular-nums">{c._count.projects}</span> },
        { header: "Unpaid invoices", cell: (c) => <span className={c._count.invoices ? "text-amber-700 tabular-nums" : "text-muted tabular-nums"}>{c._count.invoices}</span> },
        { header: "Open tickets", cell: (c) => <span className="tabular-nums text-muted">{c._count.tickets}</span> },
      ]}
    />
  );
}
