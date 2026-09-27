import { db } from "@/lib/db/client";
import type { Deal } from "@/lib/generated/prisma/client";
import { CURRENCIES } from "@/lib/os/money";
import { DEAL_STAGES } from "@/lib/crm/constants";
import { toDateInput } from "@/lib/os/action";
import type { ActionState } from "@/lib/os/action";
import { SubmitButton } from "@/components/admin/client";
import { ActionForm } from "@/components/admin/forms";
import { SelectField, TextArea, TextField, enumOptions, userOptions } from "@/components/admin/os";

export async function DealForm({ action, deal, defaults = {}, submit }: { action: (s: ActionState, f: FormData) => Promise<ActionState>; deal?: Deal | null; defaults?: Partial<Record<"clientId" | "leadId" | "company" | "name", string>>; submit: string }) {
  const [users, clients] = await Promise.all([
    db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.client.findMany({ where: { deletedAt: null }, select: { id: true, name: true, number: true }, orderBy: { updatedAt: "desc" }, take: 500 }),
  ]);
  const openStages = DEAL_STAGES.filter((s) => s !== "WON" && s !== "LOST");
  return (
    <ActionForm action={action} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <TextField name="name" label="Deal name" required defaultValue={deal?.name ?? defaults.name} maxLength={200} className="sm:col-span-2" />
      <TextField name="company" label="Company" defaultValue={deal?.company ?? defaults.company} maxLength={200} />
      <SelectField name="clientId" label="Client" blank="— not a client yet —" defaultValue={deal?.clientId ?? defaults.clientId} options={clients.map((c) => [c.id, `${c.name} · ${c.number}`] as const)} />
      <SelectField name="ownerId" label="Owner" blank="Me" defaultValue={deal?.ownerId} options={userOptions(users)} />
      <SelectField name="stage" label="Stage" defaultValue={deal?.stage && openStages.includes(deal.stage as (typeof openStages)[number]) ? deal.stage : "DISCOVERY"} options={enumOptions(openStages)} />
      <TextField name="value" label="Value" required defaultValue={deal?.value?.toString() ?? ""} placeholder="50000" />
      <SelectField name="currency" label="Currency" defaultValue={deal?.currency ?? "USD"} options={CURRENCIES.map((c) => [c, c] as const)} />
      <TextField name="probability" label="Probability %" type="number" defaultValue={deal?.probability} hint="Blank = stage default" />
      <TextField name="expectedCloseDate" label="Expected close" type="date" defaultValue={toDateInput(deal?.expectedCloseDate)} />
      <TextField name="country" label="Country" defaultValue={deal?.country} maxLength={80} />
      <TextField name="source" label="Source" defaultValue={deal?.source} maxLength={120} />
      <TextField name="services" label="Services" defaultValue={deal?.services.join(", ")} hint="Comma separated" className="sm:col-span-2" />
      <TextField name="products" label="Products" defaultValue={deal?.products.join(", ")} hint="Comma separated" />
      <TextArea name="notes" label="Notes" defaultValue={deal?.notes} rows={4} className="sm:col-span-2 lg:col-span-3" />
      <input type="hidden" name="leadId" value={deal?.leadId ?? defaults.leadId ?? ""} />
      <div className="sm:col-span-2 lg:col-span-3">
        <SubmitButton>{submit}</SubmitButton>
      </div>
    </ActionForm>
  );
}
