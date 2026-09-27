import { requireAccess } from "@/lib/os/guard";
import { getVisitorPolicy } from "@/lib/visitors/settings";
import { saveVisitorPolicyAction } from "@/lib/visitors/actions";
import { COMPANY_PROVIDERS, CONSENT_MODES, VISITOR_RETENTION_CHOICES } from "@/lib/visitors/policy";
import { CheckField, SelectField, TextArea, TextField } from "@/components/admin/os";
import { PageHeader, Panel } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/forms";
import { SubmitButton } from "@/components/admin/client";

export const metadata = { title: "Visitor tracking" };

export default async function VisitorTrackingSettings() {
  await requireAccess("visitors:manage");
  const p = await getVisitorPolicy();
  const preset = p.retentionDays == null ? "" : (VISITOR_RETENTION_CHOICES as readonly number[]).includes(p.retentionDays) ? String(p.retentionDays) : "custom";
  const ipinfo = !!process.env.IPINFO_TOKEN;
  return (
    <>
      <PageHeader title="Visitor tracking" description="Privacy settings for first-party website visitor intelligence. Changes are audited." crumbs={[{ label: "Settings", href: "/admin/settings" }, { label: "Visitor tracking" }]} />
      <ActionForm action={saveVisitorPolicyAction} className="space-y-4">
        <Panel title="Tracking and consent">
          <div className="grid gap-3 sm:grid-cols-2">
            <CheckField name="enabled" label="Record website visitor activity" defaultChecked={p.enabled} hint="Off by default. When off, nothing is recorded and no cookies are set." />
            <CheckField name="honorGpc" label="Honour Global Privacy Control (recommended)" defaultChecked={p.honorGpc} />
            <SelectField name="consentMode" label="Consent" options={Object.entries(CONSENT_MODES)} defaultValue={p.consentMode} />
            <CheckField name="captureCity" label="Store approximate city and region" defaultChecked={p.captureCity} hint="Country is always stored when tracking. The IP address itself is never stored." />
          </div>
        </Panel>
        <Panel title="Retention">
          <p className="mb-3 text-sm text-muted">How long to keep sessions and events. This is a legal decision for your business, so it is not set for you: until you choose, nothing is deleted automatically.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <SelectField name="retention" label="Keep visitor activity for" blank="Not configured (keep until deleted)" options={[...VISITOR_RETENTION_CHOICES.map((d) => [String(d), `${d} days`] as const), ["custom", "Custom…"]]} defaultValue={preset} />
            <TextField name="retentionCustom" type="number" label="Custom days (7–3650)" defaultValue={preset === "custom" ? p.retentionDays : null} />
          </div>
        </Panel>
        <Panel title="Company identification">
          <SelectField name="companyProvider" label="Provider" options={Object.entries(COMPANY_PROVIDERS)} defaultValue={p.companyProvider} />
          <p className="mt-2 text-xs text-dim">{ipinfo ? "IPINFO_TOKEN is configured." : "IPINFO_TOKEN is not set, so IPinfo lookups are skipped even if selected."} Companies are shown only for business-network matches; home, mobile and hosting networks show “Company not identified”. Individuals are never identified from their IP address.</p>
        </Panel>
        <Panel title="Scope">
          <div className="grid gap-3 sm:grid-cols-2">
            <TextArea name="excludePaths" label="Never track paths starting with (one per line)" rows={4} defaultValue={p.excludePaths.join("\n")} />
            <TextField name="liveWindowMinutes" type="number" label="Live visitor window (minutes)" defaultValue={p.liveWindowMinutes} />
          </div>
        </Panel>
        <SubmitButton>Save settings</SubmitButton>
      </ActionForm>
    </>
  );
}
