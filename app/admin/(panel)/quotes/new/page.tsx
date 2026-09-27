import { db } from "@/lib/db/client";
import { requireAccess } from "@/lib/os/guard";
import { CURRENCIES } from "@/lib/os/money";
import { createQuoteAction } from "@/lib/sales/quote-actions";
import { PageHeader, Panel } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/client";
import { ActionForm } from "@/components/admin/forms";
import { SelectField, TextField, str, type SP } from "@/components/admin/os";

export const metadata = { title: "New quote" };

export default async function NewQuotePage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAccess("proposals:manage", "PROPOSALS");
  const sp = await searchParams;
  const [deals, clients] = await Promise.all([
    db.deal.findMany({ where: { deletedAt: null, stage: { notIn: ["LOST"] } }, orderBy: { updatedAt: "desc" }, take: 300, select: { id: true, name: true, number: true } }),
    db.client.findMany({ where: { deletedAt: null }, orderBy: { updatedAt: "desc" }, take: 500, select: { id: true, name: true } }),
  ]);
  return (
    <>
      <PageHeader title="New quote" crumbs={[{ label: "Quotes", href: "/admin/quotes" }, { label: "New" }]} />
      <Panel>
        <ActionForm action={createQuoteAction} className="grid gap-4 sm:grid-cols-2">
          <TextField name="title" label="Title" required maxLength={200} className="sm:col-span-2" />
          <SelectField name="dealId" label="Deal" blank="— none —" defaultValue={str(sp, "dealId", 40)} options={deals.map((d) => [d.id, `${d.number} · ${d.name}`] as const)} />
          <SelectField name="clientId" label="Client" blank="— from the deal / none —" defaultValue={str(sp, "clientId", 40)} options={clients.map((c) => [c.id, c.name] as const)} />
          <SelectField name="currency" label="Currency" defaultValue="USD" options={CURRENCIES.map((c) => [c, c] as const)} />
          <TextField name="validUntil" label="Valid until" type="date" hint="Defaults to 30 days" />
          <div className="sm:col-span-2"><SubmitButton>Create quote</SubmitButton></div>
        </ActionForm>
      </Panel>
    </>
  );
}
