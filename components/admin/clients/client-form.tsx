import { db } from "@/lib/db/client";
import type { Client } from "@/lib/generated/prisma/client";
import { CURRENCIES } from "@/lib/os/money";
import type { ActionState } from "@/lib/os/action";
import { SubmitButton } from "@/components/admin/client";
import { ActionForm } from "@/components/admin/forms";
import { SelectField, TextArea, TextField, enumOptions, userOptions } from "@/components/admin/os";

export async function ClientForm({ action, c, submit, withContact }: { action: (s: ActionState, f: FormData) => Promise<ActionState>; c?: Client; submit: string; withContact?: boolean }) {
  const users = await db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  return (
    <ActionForm action={action} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <TextField name="name" label="Company name" required defaultValue={c?.name} maxLength={200} />
      <TextField name="legalName" label="Legal name" defaultValue={c?.legalName} maxLength={200} />
      <TextField name="industry" label="Industry" defaultValue={c?.industry} maxLength={120} />
      <TextField name="country" label="Country" defaultValue={c?.country} maxLength={80} />
      <TextField name="city" label="City" defaultValue={c?.city} maxLength={80} />
      <TextField name="website" label="Website" defaultValue={c?.website} placeholder="https://" maxLength={500} />
      <TextField name="billingEmail" label="Billing email" type="email" defaultValue={c?.billingEmail} maxLength={160} />
      <TextField name="phone" label="Phone" defaultValue={c?.phone} maxLength={40} />
      <TextField name="taxId" label="Tax / VAT ID" defaultValue={c?.taxId} maxLength={60} />
      <SelectField name="currency" label="Billing currency" defaultValue={c?.currency ?? "USD"} options={CURRENCIES.map((x) => [x, x] as const)} />
      <SelectField name="status" label="Status" defaultValue={c?.status ?? "ONBOARDING"} options={enumOptions(["ONBOARDING", "ACTIVE", "INACTIVE", "CHURNED"])} />
      <SelectField name="accountOwnerId" label="Account owner" blank="Me" defaultValue={c?.accountOwnerId} options={userOptions(users)} />
      <TextArea name="address" label="Billing address" defaultValue={c?.address} rows={2} />
      <TextField name="tags" label="Tags" defaultValue={c?.tags.join(", ")} hint="Comma separated" />
      <TextArea name="notes" label="Internal notes" defaultValue={c?.notes} rows={2} />
      {withContact && (
        <>
          <TextField name="contactName" label="Primary contact" maxLength={200} />
          <TextField name="contactEmail" label="Contact email" type="email" maxLength={160} />
          <TextField name="contactPhone" label="Contact phone" maxLength={40} />
        </>
      )}
      <div className="sm:col-span-2 lg:col-span-3"><SubmitButton>{submit}</SubmitButton></div>
    </ActionForm>
  );
}
