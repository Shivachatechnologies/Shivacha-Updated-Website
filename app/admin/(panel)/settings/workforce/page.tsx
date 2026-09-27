import { requireAccess } from "@/lib/os/guard";
import { saveWorkforcePolicyAction } from "@/lib/workforce/attendance-actions";
import { getWorkforcePolicy } from "@/lib/workforce/settings";
import { LOCATION_POLICIES, RETENTION_CHOICES } from "@/lib/workforce/policy";
import { CheckField, SelectField, TextArea, TextField } from "@/components/admin/os";
import { PageHeader, Panel } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/forms";
import { SubmitButton } from "@/components/admin/client";

export const metadata = { title: "Workforce policy" };

export default async function WorkforcePolicyPage() {
  await requireAccess("attendance:manage");
  const p = await getWorkforcePolicy();
  return (
    <>
      <PageHeader title="Attendance & location policy" description="Location is only collected in the ways chosen here, always with the browser's permission prompt and an on-screen explanation." crumbs={[{ label: "Settings", href: "/admin/settings" }, { label: "Workforce policy" }]} />
      <ActionForm action={saveWorkforcePolicyAction} className="space-y-4">
        <Panel title="Location">
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField name="locationPolicy" label="Location policy" options={Object.entries(LOCATION_POLICIES)} defaultValue={p.locationPolicy} />
            <TextField name="periodicMinutes" type="number" label="Periodic update interval (minutes)" defaultValue={p.periodicMinutes} hint="Only for the periodic policy. Employees must turn sharing on and can stop it at any time." />
            <SelectField name="geofenceEnforcement" label="Office check-in outside the geofence" options={[["FLAG", "Allow and flag for review"], ["BLOCK", "Refuse the check-in"]]} defaultValue={p.geofenceEnforcement} />
            <TextField name="awayAfterMinutes" type="number" label="Show as Away after (minutes without activity)" defaultValue={p.awayAfterMinutes} />
            <CheckField name="remoteLocation" label="Also ask remote employees for location at check-in" defaultChecked={p.remoteLocation} />
            <TextArea name="locationPurpose" label="Purpose shown to employees" defaultValue={p.locationPurpose} rows={3} className="sm:col-span-2" />
          </div>
        </Panel>
        <Panel title="Retention">
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField name="locationRetentionDays" label="Keep raw location data for" blank="Not configured — nothing is deleted automatically" options={RETENTION_CHOICES.map((d) => [String(d), `${d} days`] as const)} defaultValue={p.locationRetentionDays ? String(p.locationRetentionDays) : ""} />
            <p className="text-xs text-dim sm:pt-6">Choose a period that fits your legal and HR obligations; Shivacha OS does not pick one for you. After the period, location points are deleted and coordinates are removed from check-in events (the attendance record itself is kept). A custom value between 7 and 3650 days can be saved through the API.</p>
          </div>
        </Panel>
        <SubmitButton>Save policy</SubmitButton>
      </ActionForm>
    </>
  );
}
