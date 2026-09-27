import Link from "next/link";
import { db } from "@/lib/db/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { fmtMoney } from "@/lib/os/money";
import { daysFromNow } from "@/lib/os/range";
import { LinkCell, ListView, StatusBadge, pageOf, pick, str, PAGE_SIZE, type SP } from "@/components/admin/os";
import { fmtDate, label } from "@/components/admin/ui";

export const metadata = { title: "Contracts" };
const STATUSES = ["DRAFT", "SENT", "SIGNED", "ACTIVE", "EXPIRED", "TERMINATED"] as const;

export default async function ContractsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireAccess("contracts:view", "PROPOSALS");
  const sp = await searchParams;
  const values = { q: str(sp, "q", 80), status: pick(sp, "status", STATUSES), renewing: str(sp, "renewing", 1), page: str(sp, "page") };
  const soon = daysFromNow(60);
  const where: Prisma.ContractWhereInput = { deletedAt: null, ...(values.status && { status: values.status }), ...(values.renewing && { renewalDate: { lte: soon, gte: new Date() } }), ...(values.q && { OR: [{ title: { contains: values.q, mode: "insensitive" } }, { number: { contains: values.q, mode: "insensitive" } }, { client: { name: { contains: values.q, mode: "insensitive" } } }] }) };
  const page = pageOf(sp);
  const [total, rows] = await Promise.all([db.contract.count({ where }), db.contract.findMany({ where, orderBy: { updatedAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { client: { select: { name: true } } } })]);
  return (
    <ListView
      title="Contracts"
      description="Agreements, signature status, terms and renewals."
      crumbs={[{ label: "Sales" }, { label: "Contracts" }]}
      actions={can(user.role, "contracts:manage") && <Link href="/admin/contracts/new" className="btn-primary h-9 px-3.5 text-[13px]">New contract</Link>}
      values={values}
      filters={[{ type: "search", name: "q", placeholder: "Search title, number, client…" }, { type: "select", name: "status", label: "All statuses", options: STATUSES.map((s) => [s, label(s)] as const) }, { type: "select", name: "renewing", label: "Any renewal", options: [["1", "Renewing in 60 days"]] }]}
      rows={rows}
      total={total}
      page={page}
      basePath="/admin/contracts"
      empty={{ title: "No contracts yet", description: "Create a contract from an accepted proposal or a won deal." }}
      columns={[
        { header: "Contract", cell: (c) => <LinkCell href={`/admin/contracts/${c.id}`} sub={`${c.number} v${c.version}`}>{c.title}</LinkCell> },
        { header: "Client", cell: (c) => <span className="text-muted">{c.client.name}</span> },
        { header: "Status", cell: (c) => <StatusBadge value={c.status} /> },
        { header: "Signature", cell: (c) => <StatusBadge value={c.signatureStatus} /> },
        { header: "Value", cell: (c) => <span className="whitespace-nowrap tabular-nums">{fmtMoney(c.value, c.currency)}</span> },
        { header: "Term", cell: (c) => <span className="whitespace-nowrap text-muted">{fmtDate(c.startDate)} → {fmtDate(c.endDate)}</span> },
        { header: "Renewal", cell: (c) => <span className={c.renewalDate && c.renewalDate < soon ? "text-amber-700" : "text-muted"}>{fmtDate(c.renewalDate)}</span> },
      ]}
    />
  );
}
