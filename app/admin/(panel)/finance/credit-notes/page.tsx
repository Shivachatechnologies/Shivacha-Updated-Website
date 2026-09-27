import { db } from "@/lib/db/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { CURRENCIES, fmtMoney } from "@/lib/os/money";
import { createCreditNoteAction } from "@/lib/finance/actions";
import { Panel, fmtDate } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/client";
import { ActionForm } from "@/components/admin/forms";
import { CheckField, LinkCell, ListView, SelectField, StatusBadge, TextField, pageOf, str, PAGE_SIZE, type SP } from "@/components/admin/os";

export const metadata = { title: "Credit notes" };

export default async function CreditNotesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireAccess("finance:view", "FINANCE");
  const sp = await searchParams;
  const values = { q: str(sp, "q", 80), page: str(sp, "page") };
  const where: Prisma.CreditNoteWhereInput = values.q ? { OR: [{ number: { contains: values.q, mode: "insensitive" } }, { client: { name: { contains: values.q, mode: "insensitive" } } }] } : {};
  const page = pageOf(sp);
  const clientId = str(sp, "clientId", 40);
  const [total, rows, clients, invoices] = await Promise.all([
    db.creditNote.count({ where }),
    db.creditNote.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { client: { select: { id: true, name: true } }, invoice: { select: { id: true, number: true } } } }),
    db.client.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, take: 1000, select: { id: true, name: true } }),
    clientId ? db.invoice.findMany({ where: { clientId, status: { in: ["ISSUED", "PARTIALLY_PAID"] } }, select: { id: true, number: true, balanceDue: true, currency: true } }) : Promise.resolve([]),
  ]);
  const form = can(user.role, "finance:manage") && (
    <Panel title="New credit note" className="mb-5">
      <ActionForm action={createCreditNoteAction} resetOnOk className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <SelectField name="clientId" label="Client" required blank="Choose…" defaultValue={clientId} options={clients.map((c) => [c.id, c.name] as const)} />
        <SelectField name="invoiceId" label="Apply to invoice" blank={clientId ? "— none —" : "Pick client via ?clientId"} defaultValue={str(sp, "invoiceId", 40)} options={invoices.map((i) => [i.id, `${i.number} (${fmtMoney(i.balanceDue, i.currency)})`] as const)} />
        <TextField name="amount" label="Amount" required />
        <SelectField name="currency" label="Currency" defaultValue={invoices[0]?.currency ?? "USD"} options={CURRENCIES.map((c) => [c, c] as const)} />
        <TextField name="reason" label="Reason" required maxLength={500} />
        <div className="flex flex-col justify-end gap-2"><CheckField name="issue" label="Issue now" defaultChecked /><SubmitButton>Create</SubmitButton></div>
      </ActionForm>
    </Panel>
  );
  return (
    <ListView title="Credit notes" description="Credits reduce an invoice balance once issued. Nothing is deleted." crumbs={[{ label: "Finance", href: "/admin/finance" }, { label: "Credit notes" }]} above={form} values={values} filters={[{ type: "search", name: "q", placeholder: "Search number or client…" }]} rows={rows} total={total} page={page} basePath="/admin/finance/credit-notes" empty={{ title: "No credit notes" }}
      columns={[
        { header: "Credit note", cell: (c) => <span className="font-medium">{c.number}</span> },
        { header: "Client", cell: (c) => <LinkCell href={`/admin/clients/${c.client.id}`}>{c.client.name}</LinkCell> },
        { header: "Invoice", cell: (c) => (c.invoice ? <LinkCell href={`/admin/finance/invoices/${c.invoice.id}`}>{c.invoice.number}</LinkCell> : <span className="text-muted">—</span>) },
        { header: "Amount", cell: (c) => <span className="tabular-nums">{fmtMoney(c.amount, c.currency)}</span> },
        { header: "Status", cell: (c) => <StatusBadge value={c.status} /> },
        { header: "Reason", cell: (c) => <span className="max-w-[240px] truncate text-muted">{c.reason}</span> },
        { header: "Issued", cell: (c) => <span className="text-muted">{fmtDate(c.issuedAt)}</span> },
      ]}
    />
  );
}
