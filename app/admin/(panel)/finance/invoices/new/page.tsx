import { db } from "@/lib/db/client";
import { requireAccess } from "@/lib/os/guard";
import { CURRENCIES } from "@/lib/os/money";
import { createInvoiceAction } from "@/lib/finance/actions";
import { PageHeader, Panel } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/client";
import { ActionForm } from "@/components/admin/forms";
import { SelectField, TextField, str, type SP } from "@/components/admin/os";

export const metadata = { title: "New invoice" };

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAccess("finance:manage", "FINANCE");
  const sp = await searchParams;
  const quote = str(sp, "quoteId", 40) ? await db.quote.findUnique({ where: { id: str(sp, "quoteId", 40) }, select: { id: true, number: true, clientId: true, dealId: true, currency: true } }) : null;
  const deal = str(sp, "dealId", 40) ? await db.deal.findUnique({ where: { id: str(sp, "dealId", 40) }, select: { id: true, clientId: true, currency: true } }) : null;
  const clientId = str(sp, "clientId", 40) || quote?.clientId || deal?.clientId || "";
  const [clients, projects, contracts] = await Promise.all([
    db.client.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, take: 1000, select: { id: true, name: true, currency: true } }),
    db.project.findMany({ where: { deletedAt: null, ...(clientId && { clientId }) }, orderBy: { createdAt: "desc" }, take: 300, select: { id: true, number: true, name: true } }),
    db.contract.findMany({ where: { deletedAt: null, status: { in: ["SIGNED", "ACTIVE"] }, ...(clientId && { clientId }) }, take: 300, select: { id: true, number: true, title: true } }),
  ]);
  const client = clients.find((c) => c.id === clientId);
  return (
    <>
      <PageHeader title="New invoice" description={quote ? `Line items are copied from accepted quote ${quote.number}.` : "Create a draft, add line items, then issue it."} crumbs={[{ label: "Invoices", href: "/admin/finance/invoices" }, { label: "New" }]} />
      <Panel>
        <ActionForm action={createInvoiceAction} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SelectField name="clientId" label="Client" required blank="Choose…" defaultValue={clientId} options={clients.map((c) => [c.id, c.name] as const)} />
          <SelectField name="currency" label="Currency" defaultValue={quote?.currency ?? deal?.currency ?? client?.currency ?? "USD"} options={CURRENCIES.map((c) => [c, c] as const)} />
          <TextField name="dueDate" label="Due date" type="date" hint="Defaults to 15 days after issue" />
          <SelectField name="projectId" label="Project" blank="— none —" defaultValue={str(sp, "projectId", 40)} options={projects.map((p) => [p.id, `${p.number} · ${p.name}`] as const)} />
          <SelectField name="contractId" label="Contract" blank="— none —" options={contracts.map((c) => [c.id, `${c.number} · ${c.title}`] as const)} />
          <input type="hidden" name="quoteId" value={quote?.id ?? ""} />
          <input type="hidden" name="dealId" value={deal?.id ?? quote?.dealId ?? ""} />
          <div className="sm:col-span-2 lg:col-span-3"><SubmitButton>Create draft invoice</SubmitButton></div>
        </ActionForm>
      </Panel>
    </>
  );
}
