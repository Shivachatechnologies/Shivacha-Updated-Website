import { db } from "@/lib/db/client";
import type { Project } from "@/lib/generated/prisma/client";
import { CURRENCIES } from "@/lib/os/money";
import { toDateInput, type ActionState } from "@/lib/os/action";
import { SubmitButton } from "@/components/admin/client";
import { ActionForm } from "@/components/admin/forms";
import { SelectField, TextArea, TextField, enumOptions, userOptions } from "@/components/admin/os";

export async function ProjectForm({ action, p, defaults = {}, submit, hasTasks }: { action: (s: ActionState, f: FormData) => Promise<ActionState>; p?: Project; defaults?: Partial<Record<"clientId" | "dealId" | "name", string>>; submit: string; hasTasks?: boolean }) {
  const [users, clients, deals] = await Promise.all([
    db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.client.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, take: 1000, select: { id: true, name: true } }),
    db.deal.findMany({ where: { deletedAt: null, stage: "WON" }, orderBy: { wonAt: "desc" }, take: 300, select: { id: true, number: true, name: true } }),
  ]);
  return (
    <ActionForm action={action} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <TextField name="name" label="Project name" required defaultValue={p?.name ?? defaults.name} maxLength={200} className="sm:col-span-2" />
      <SelectField name="clientId" label="Client" required blank="Choose…" defaultValue={p?.clientId ?? defaults.clientId} options={clients.map((c) => [c.id, c.name] as const)} />
      <SelectField name="managerId" label="Project manager" blank="Me" defaultValue={p?.managerId} options={userOptions(users)} />
      <SelectField name="dealId" label="Won deal" blank="— none —" defaultValue={p?.dealId ?? defaults.dealId} options={deals.map((d) => [d.id, `${d.number} · ${d.name}`] as const)} />
      <SelectField name="status" label="Status" defaultValue={p?.status ?? "PLANNED"} options={enumOptions(["PLANNED", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"])} />
      <SelectField name="priority" label="Priority" defaultValue={p?.priority ?? "MEDIUM"} options={enumOptions(["LOW", "MEDIUM", "HIGH", "URGENT"])} />
      <SelectField name="health" label="Health" defaultValue={p?.health ?? "GREEN"} options={enumOptions(["GREEN", "AMBER", "RED"])} />
      <TextField name="progress" label="Progress %" type="number" defaultValue={p?.progress ?? 0} hint={hasTasks ? "Calculated from completed tasks" : "Manual until tasks are added"} />
      <TextField name="startDate" label="Start date" type="date" defaultValue={toDateInput(p?.startDate)} />
      <TextField name="targetDate" label="Target date" type="date" defaultValue={toDateInput(p?.targetDate)} />
      <TextField name="budget" label="Budget" defaultValue={p?.budget?.toString()} />
      <SelectField name="currency" label="Currency" defaultValue={p?.currency ?? "USD"} options={CURRENCIES.map((c) => [c, c] as const)} />
      <TextArea name="description" label="Description / scope" defaultValue={p?.description} rows={4} className="sm:col-span-2 lg:col-span-3" />
      <div className="sm:col-span-2 lg:col-span-3"><SubmitButton>{submit}</SubmitButton></div>
    </ActionForm>
  );
}
