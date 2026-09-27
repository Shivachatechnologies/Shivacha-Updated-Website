import { db } from "@/lib/db/client";
import { requireAccess } from "@/lib/os/guard";
import { CURRENCIES } from "@/lib/os/money";
import { createProposalAction } from "@/lib/sales/proposal-actions";
import { PageHeader, Panel } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/client";
import { ActionForm } from "@/components/admin/forms";
import { SelectField, TextField, str, type SP } from "@/components/admin/os";

export const metadata = { title: "New proposal" };

export default async function NewProposalPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAccess("proposals:manage", "PROPOSALS");
  const sp = await searchParams;
  const dealId = str(sp, "dealId", 40);
  const [deal, deals, clients] = await Promise.all([
    dealId ? db.deal.findUnique({ where: { id: dealId }, select: { id: true, name: true, currency: true, clientId: true } }) : null,
    db.deal.findMany({ where: { deletedAt: null, stage: { notIn: ["LOST"] } }, orderBy: { updatedAt: "desc" }, take: 300, select: { id: true, name: true, number: true } }),
    db.client.findMany({ where: { deletedAt: null }, orderBy: { updatedAt: "desc" }, take: 500, select: { id: true, name: true } }),
  ]);
  return (
    <>
      <PageHeader title="New proposal" crumbs={[{ label: "Proposals", href: "/admin/proposals" }, { label: "New" }]} />
      <Panel>
        <ActionForm action={createProposalAction} className="grid gap-4 sm:grid-cols-2">
          <TextField name="title" label="Title" required defaultValue={deal ? `${deal.name} — Proposal` : ""} maxLength={200} className="sm:col-span-2" />
          <SelectField name="dealId" label="Deal" blank="— none —" defaultValue={deal?.id} options={deals.map((d) => [d.id, `${d.number} · ${d.name}`] as const)} />
          <SelectField name="clientId" label="Client" blank="— from the deal / none —" defaultValue={deal?.clientId} options={clients.map((c) => [c.id, c.name] as const)} />
          <SelectField name="currency" label="Currency" defaultValue={deal?.currency ?? "USD"} options={CURRENCIES.map((c) => [c, c] as const)} />
          <TextField name="validUntil" label="Valid until" type="date" hint="Defaults to 30 days" />
          <SelectField name="template" label="Start from" defaultValue={deal ? "deal" : "blank"} options={[["deal", "The deal's services, products and value (needs a deal)"], ["blank", "A blank proposal"]]} className="sm:col-span-2" />
          <div className="sm:col-span-2"><SubmitButton>Create draft</SubmitButton></div>
        </ActionForm>
      </Panel>
    </>
  );
}
