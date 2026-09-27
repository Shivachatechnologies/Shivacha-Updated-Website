import { db } from "@/lib/db/client";
import { requireAccess } from "@/lib/os/guard";
import { CURRENCIES, fmtMoney } from "@/lib/os/money";
import { recordPaymentAction } from "@/lib/finance/actions";
import { PageHeader, Panel, fmtDate, inputCls } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/client";
import { ActionForm } from "@/components/admin/forms";
import { SelectField, TextArea, TextField, enumOptions, str, type SP } from "@/components/admin/os";

export const metadata = { title: "Record payment" };

export default async function NewPaymentPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAccess("finance:manage", "FINANCE");
  const sp = await searchParams;
  const clientId = str(sp, "clientId", 40);
  const preselect = str(sp, "invoiceId", 40);
  const clients = await db.client.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, take: 1000, select: { id: true, name: true, currency: true } });
  const invoices = clientId ? await db.invoice.findMany({ where: { clientId, status: { in: ["ISSUED", "PARTIALLY_PAID"] } }, orderBy: { dueDate: "asc" }, select: { id: true, number: true, balanceDue: true, currency: true, dueDate: true } }) : [];
  const client = clients.find((c) => c.id === clientId);
  const pre = invoices.find((i) => i.id === preselect);
  return (
    <>
      <PageHeader title="Record payment" description="The payment is saved as PENDING. It reduces invoice balances only after someone with payment-confirmation rights verifies the funds." crumbs={[{ label: "Payments", href: "/admin/finance/payments" }, { label: "New" }]} />
      <Panel title="1 · Client">
        <form method="get" className="flex flex-wrap gap-2">
          <select name="clientId" defaultValue={clientId} aria-label="Client" className={`${inputCls} max-w-sm`}>
            <option value="">Choose client…</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button type="submit" className="btn-secondary h-9 px-3 text-[13px]">Load open invoices</button>
        </form>
      </Panel>
      {client && (
        <Panel title="2 · Payment" className="mt-5">
          <ActionForm action={recordPaymentAction} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <input type="hidden" name="clientId" value={client.id} />
            <TextField name="amount" label="Amount received" required defaultValue={pre?.balanceDue.toFixed(2)} />
            <SelectField name="currency" label="Currency" defaultValue={pre?.currency ?? client.currency} options={CURRENCIES.map((c) => [c, c] as const)} />
            <SelectField name="method" label="Method" defaultValue="BANK_TRANSFER" options={enumOptions(["BANK_TRANSFER", "CARD", "UPI", "CRYPTO", "CHEQUE", "CASH", "OTHER"])} />
            <TextField name="reference" label="Bank / transaction reference" maxLength={200} />
            <TextField name="receivedAt" label="Received on" type="date" />
            <TextArea name="notes" label="Notes" rows={2} />
            <fieldset className="sm:col-span-2 lg:col-span-3">
              <legend className="mb-1.5 text-[12.5px] font-medium text-fg">Apply to open invoices (oldest due first)</legend>
              {invoices.length === 0 ? <p className="text-sm text-dim">No open invoices — the payment will be unallocated.</p> : (
                <ul className="space-y-1.5">
                  {invoices.map((i) => <li key={i.id}><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="invoiceIds" value={i.id} defaultChecked={i.id === preselect} className="size-4" /> {i.number} — {fmtMoney(i.balanceDue, i.currency)} due {fmtDate(i.dueDate)}</label></li>)}
                </ul>
              )}
            </fieldset>
            <div className="sm:col-span-2 lg:col-span-3"><SubmitButton>Record pending payment</SubmitButton></div>
          </ActionForm>
        </Panel>
      )}
    </>
  );
}
