import type { Campaign } from "@/lib/generated/prisma/client";
import { CURRENCIES } from "@/lib/os/money";
import { toDateInput, type ActionState } from "@/lib/os/action";
import { SubmitButton } from "@/components/admin/client";
import { ActionForm } from "@/components/admin/forms";
import { SelectField, TextArea, TextField, enumOptions } from "@/components/admin/os";

export function CampaignForm({ action, c, submit }: { action: (s: ActionState, f: FormData) => Promise<ActionState>; c?: Campaign; submit: string }) {
  return (
    <ActionForm action={action} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <TextField name="name" label="Name" required defaultValue={c?.name} maxLength={200} className="sm:col-span-2" />
      <SelectField name="channel" label="Channel" defaultValue={c?.channel ?? "GOOGLE_ADS"} options={enumOptions(["GOOGLE_ADS", "META_ADS", "LINKEDIN_ADS", "EMAIL", "SEO", "SOCIAL", "EVENT", "REFERRAL", "CONTENT", "OTHER"])} />
      <SelectField name="status" label="Status" defaultValue={c?.status ?? "PLANNED"} options={enumOptions(["PLANNED", "ACTIVE", "PAUSED", "COMPLETED"])} />
      <TextField name="utmCampaign" label="utm_campaign" defaultValue={c?.utmCampaign} hint="Leads with this value are attributed" maxLength={120} />
      <TextField name="utmSource" label="utm_source" defaultValue={c?.utmSource} maxLength={120} />
      <TextField name="utmMedium" label="utm_medium" defaultValue={c?.utmMedium} maxLength={120} />
      <TextField name="landingPage" label="Landing page" defaultValue={c?.landingPage} placeholder="/lp/…" maxLength={300} />
      <TextField name="startDate" label="Start" type="date" defaultValue={toDateInput(c?.startDate)} />
      <TextField name="endDate" label="End" type="date" defaultValue={toDateInput(c?.endDate)} />
      <TextField name="budget" label="Budget" defaultValue={c?.budget?.toString()} />
      <SelectField name="currency" label="Currency" defaultValue={c?.currency ?? "USD"} options={CURRENCIES.map((x) => [x, x] as const)} />
      <TextArea name="notes" label="Notes" defaultValue={c?.notes} rows={2} className="sm:col-span-2 lg:col-span-4" />
      <div className="sm:col-span-2 lg:col-span-4"><SubmitButton>{submit}</SubmitButton></div>
    </ActionForm>
  );
}
