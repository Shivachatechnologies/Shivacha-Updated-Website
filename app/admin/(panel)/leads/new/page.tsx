import { db } from "@/lib/db/client";
import { requireAccess } from "@/lib/os/guard";
import { createLeadAction } from "@/lib/crm/actions";
import { LEAD_PRIORITIES, LEAD_STATUSES } from "@/lib/admin/leads";
import { LIFECYCLE_STAGES } from "@/lib/crm/constants";
import { CURRENCIES } from "@/lib/os/money";
import { PageHeader, Panel } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/client";
import { ActionForm } from "@/components/admin/forms";
import { SelectField, TextArea, TextField, enumOptions, userOptions } from "@/components/admin/os";

export const metadata = { title: "New lead" };

export default async function NewLeadPage() {
  const user = await requireAccess("leads:create");
  const users = await db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  return (
    <>
      <PageHeader title="New lead" description="For enquiries that arrive by phone, email, events or referrals. Website leads are created automatically." crumbs={[{ label: "Leads", href: "/admin/leads" }, { label: "New" }]} />
      <Panel>
        <ActionForm action={createLeadAction} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <TextField name="name" label="Name" required maxLength={200} />
          <TextField name="email" label="Email" type="email" required maxLength={160} />
          <TextField name="phone" label="Phone / WhatsApp" maxLength={40} />
          <TextField name="company" label="Company" maxLength={200} />
          <TextField name="website" label="Website" placeholder="https://" maxLength={300} />
          <TextField name="country" label="Country" maxLength={80} />
          <TextField name="city" label="City" maxLength={80} />
          <TextField name="service" label="Service interest" maxLength={120} />
          <TextField name="product" label="Product interest" maxLength={120} />
          <TextField name="budget" label="Budget" placeholder="$25K–$50K" maxLength={40} />
          <TextField name="estimatedValue" label="Estimated deal value" placeholder="25000" />
          <SelectField name="currency" label="Currency" defaultValue="USD" options={CURRENCIES.map((c) => [c, c] as const)} />
          <TextField name="source" label="Source" placeholder="referral, event, phone…" maxLength={120} />
          <TextField name="campaign" label="Campaign" maxLength={120} />
          <TextField name="tags" label="Tags" placeholder="fintech, enterprise" hint="Comma separated" />
          <SelectField name="status" label="Status" defaultValue="NEW" options={enumOptions(LEAD_STATUSES)} />
          <SelectField name="priority" label="Priority" defaultValue="MEDIUM" options={enumOptions(LEAD_PRIORITIES)} />
          <SelectField name="lifecycleStage" label="Lifecycle stage" defaultValue="LEAD" options={enumOptions(LIFECYCLE_STAGES)} />
          <SelectField name="assignedToId" label="Owner" defaultValue={user.id} blank="Unassigned" options={userOptions(users)} />
          <TextArea name="message" label="Requirement / notes" className="sm:col-span-2 lg:col-span-3" rows={4} />
          <div className="sm:col-span-2 lg:col-span-3">
            <SubmitButton>Create lead</SubmitButton>
          </div>
        </ActionForm>
      </Panel>
    </>
  );
}
