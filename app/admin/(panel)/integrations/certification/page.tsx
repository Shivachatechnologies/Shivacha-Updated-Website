import Link from "next/link";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { certificationOverview, certificationRecipient } from "@/lib/integrations/certify";
import { certifyProviderAction } from "@/lib/company/actions";
import { DataTable, StatusBadge } from "@/components/admin/os";
import { PageHeader, fmtDate } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/forms";
import { SubmitButton } from "@/components/admin/client";

export const metadata = { title: "Provider certification" };
export const dynamic = "force-dynamic";

const VERDICT_TONE = { LIVE_CERTIFIED: "DONE", PARTIALLY_CERTIFIED: "IN_PROGRESS", NOT_CONNECTED: "NOT_CONNECTED", FAILED: "FAILED" } as const;
const STEP_TONE = { PASS: "DONE", FAIL: "FAILED", NOT_CONNECTED: "NOT_CONNECTED", SKIPPED: "PENDING", REQUIRES_HUMAN: "PENDING" } as const;
const ADS = new Set(["meta-ads", "google-ads", "linkedin-ads"]);

export default async function CertificationPage() {
  const user = await requireAccess("integrations:view", "INTEGRATIONS");
  const manage = can(user.role, "integrations:manage");
  const growthControl = can(user.role, "growth:control");
  const rows = await certificationOverview();
  const recipient = certificationRecipient();
  return (
    <>
      <PageHeader
        title="Provider certification"
        description="Runs real, authenticated checks against a connected provider and records every step. Read-only by default. The only actions it can take are the ones you tick: one test email to the server's CERTIFICATION_TEST_EMAIL address, or one ad campaign created PAUSED (never launched). Social certification never publishes. Providers without credentials stay NOT CONNECTED — nothing is simulated."
        crumbs={[{ label: "Platform" }, { label: "API & Integrations", href: "/admin/integrations/connect" }, { label: "Certification" }]}
      />
      <p className="mb-4 text-sm text-muted">Certification address (server environment): {recipient ? <span className="font-mono">{recipient.replace(/^(.).*(@.*)$/, "$1…$2")}</span> : <span className="text-amber-700">not set — email sending and address verification steps are skipped</span>}</p>
      <DataTable
        rows={rows.map((r) => ({ id: r.key, ...r }))}
        columns={[
          { header: "Provider", cell: (r) => <span className="font-medium">{r.name}</span> },
          { header: "Now", cell: (r) => <StatusBadge value={r.state} /> },
          { header: "Last certification", cell: (r) => (r.run ? <span><StatusBadge value={VERDICT_TONE[r.run.verdict]} text={r.run.verdict.replace(/_/g, " ").toLowerCase()} /><span className="block text-[11px] text-dim">{fmtDate(new Date(r.run.at), true)}</span></span> : <span className="text-xs text-dim">never</span>) },
          { header: "Steps", cell: (r) => (r.run ? <ul className="space-y-0.5 text-xs">{r.run.steps.map((s) => <li key={s.name}><StatusBadge value={STEP_TONE[s.result]} text={s.result.replace("_", " ").toLowerCase()} /> {s.name}<span className="block text-dim">{s.detail}</span></li>)}</ul> : null) },
          {
            header: "",
            cell: (r) =>
              manage ? (
                <ActionForm action={certifyProviderAction.bind(null, r.key)} className="space-y-1 text-xs">
                  {r.key === "email" && <label className="flex items-center gap-1"><input type="checkbox" name="sendTestEmail" disabled={!recipient} /> send one test email</label>}
                  {ADS.has(r.key) && growthControl && <label className="flex items-center gap-1"><input type="checkbox" name="createPausedCampaign" /> create paused test campaign</label>}
                  <SubmitButton variant="secondary">Run certification</SubmitButton>
                </ActionForm>
              ) : null,
          },
        ]}
      />
      <p className="mt-4 text-xs text-dim">Connect providers on <Link href="/admin/integrations/connect" className="text-brand-blue hover:underline">API &amp; Integrations</Link>. Every run is written to the audit log.</p>
    </>
  );
}
