import { db } from "@/lib/db/client";
import type { Contract } from "@/lib/generated/prisma/client";
import { CURRENCIES } from "@/lib/os/money";
import { toDateInput, type ActionState } from "@/lib/os/action";
import { SubmitButton } from "@/components/admin/client";
import { ActionForm } from "@/components/admin/forms";
import { SelectField, TextArea, TextField } from "@/components/admin/os";

export async function ContractForm({ action, c, defaults = {}, submit }: { action: (s: ActionState, f: FormData) => Promise<ActionState>; c?: Contract; defaults?: Partial<Record<"clientId" | "dealId" | "proposalId" | "title" | "value" | "currency", string>>; submit: string }) {
  const [clients, deals, proposals] = await Promise.all([
    db.client.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, take: 1000, select: { id: true, name: true } }),
    db.deal.findMany({ where: { deletedAt: null }, orderBy: { updatedAt: "desc" }, take: 300, select: { id: true, number: true, name: true } }),
    db.proposal.findMany({ where: { deletedAt: null, status: "ACCEPTED" }, orderBy: { updatedAt: "desc" }, take: 300, select: { id: true, number: true, title: true } }),
  ]);
  return (
    <ActionForm action={action} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <TextField name="title" label="Title" required defaultValue={c?.title ?? defaults.title} maxLength={200} className="sm:col-span-2 lg:col-span-3" />
      <SelectField name="clientId" label="Client" required blank="Choose…" defaultValue={c?.clientId ?? defaults.clientId} options={clients.map((x) => [x.id, x.name] as const)} />
      <SelectField name="dealId" label="Deal" blank="— none —" defaultValue={c?.dealId ?? defaults.dealId} options={deals.map((x) => [x.id, `${x.number} · ${x.name}`] as const)} />
      <SelectField name="proposalId" label="Accepted proposal" blank="— none —" defaultValue={c?.proposalId ?? defaults.proposalId} options={proposals.map((x) => [x.id, `${x.number} · ${x.title}`] as const)} />
      <TextField name="value" label="Contract value" required defaultValue={c?.value.toString() ?? defaults.value} />
      <SelectField name="currency" label="Currency" defaultValue={c?.currency ?? defaults.currency ?? "USD"} options={CURRENCIES.map((x) => [x, x] as const)} />
      <TextField name="startDate" label="Start date" type="date" defaultValue={toDateInput(c?.startDate)} />
      <TextField name="endDate" label="End date" type="date" defaultValue={toDateInput(c?.endDate)} />
      <TextField name="renewalDate" label="Renewal date" type="date" defaultValue={toDateInput(c?.renewalDate)} />
      <TextArea name="terms" label="Terms" defaultValue={c?.terms} rows={10} className="sm:col-span-2 lg:col-span-3" />
      <div className="sm:col-span-2 lg:col-span-3"><SubmitButton>{submit}</SubmitButton></div>
    </ActionForm>
  );
}
