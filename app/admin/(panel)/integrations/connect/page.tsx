import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { encryptionConfigured } from "@/lib/auth/totp";
import { integrationStatuses } from "@/lib/integrations/health";
import { vaultEntries } from "@/lib/integrations/vault";
import { connectIntegrationAction, disconnectIntegrationAction, testIntegrationAction } from "@/lib/company/actions";
import { Kpi, KpiGrid, StatusBadge, TextField } from "@/components/admin/os";
import { PageHeader, fmtDate } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/forms";
import { ConfirmButton, SubmitButton } from "@/components/admin/client";

export const metadata = { title: "API & Integrations" };
export const dynamic = "force-dynamic";

const SUPPORT_TEXT = { SUPPORTED: "Supported", STATUS_ONLY: "Status only", NOT_SUPPORTED: "Not supported" } as const;

export default async function IntegrationsCenter() {
  const user = await requireAccess("integrations:view", "INTEGRATIONS");
  const manage = can(user.role, "integrations:manage");
  const [rows, stored] = await Promise.all([integrationStatuses(), vaultEntries()]);
  const hints = new Map(stored.map((s) => [s.name, s]));
  const encryption = encryptionConfigured();
  const cats = [...new Set(rows.map((r) => r.def.category))];
  const n = (s: string) => rows.filter((r) => r.state === s).length;
  return (
    <>
      <PageHeader title="API & Integrations" description="Connect, configure, test and disconnect providers without editing environment variables. Credentials are encrypted (AES-256-GCM) on the server, masked here, never logged and never sent to the browser; environment variables, when set, always take precedence. Statuses are real: CONNECTED only when credentials exist (and ERROR when the last real test failed)." crumbs={[{ label: "Platform" }, { label: "API & Integrations" }]} />
      {!encryption && <p className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">BLOCKED: APP_ENCRYPTION_KEY (32+ characters) is not set on the server, so credentials cannot be stored here. Environment-variable configuration still works.</p>}
      <KpiGrid cols={4}>
        <Kpi label="Connected" value={n("CONNECTED")} tone="green" />
        <Kpi label="Not connected" value={n("NOT_CONNECTED")} />
        <Kpi label="Errors" value={n("ERROR")} tone={n("ERROR") ? "red" : undefined} />
        <Kpi label="Not supported" value={n("NOT_SUPPORTED")} hint="No adapter in this release" />
      </KpiGrid>
      <div className="mt-5 space-y-6">
        {cats.map((cat) => (
          <section key={cat}>
            <h2 className="mb-2 text-base font-semibold">{cat}</h2>
            <div className="grid gap-3 lg:grid-cols-2">
              {rows.filter((r) => r.def.category === cat).map(({ def, state, source, lastTestedAt, lastError, usage }) => (
                <article key={def.key} className="min-w-0 rounded-lg border border-line bg-ink-900 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold">{def.name}</h3>
                      <p className="text-xs text-dim">{SUPPORT_TEXT[def.support]}{source ? ` · credentials from ${source === "ENV" ? "environment" : source === "VAULT" ? "encrypted vault" : "environment + vault"}` : ""}</p>
                    </div>
                    <StatusBadge value={state} />
                  </div>
                  {def.capabilities.length > 0 && <p className="mt-2 text-xs text-muted">Can: {def.capabilities.join(" · ")}</p>}
                  {def.note && <p className="mt-1 text-xs text-muted">{def.note}</p>}
                  {def.oauthNote && <p className="mt-1 text-xs text-amber-700">{def.oauthNote}</p>}
                  {usage && <p className="mt-1 text-xs text-dim">Usage: {usage}</p>}
                  {lastTestedAt && <p className="mt-1 text-xs text-dim">Last tested {fmtDate(lastTestedAt, true)}{lastError ? "" : " · OK"}</p>}
                  {lastError && <p className="mt-1 text-xs text-red-700">Last test failed: {lastError}</p>}
                  {def.fields.length > 0 && (
                    <ul className="mt-2 space-y-0.5 text-xs">
                      {def.fields.map((f) => (
                        <li key={f.name} className="flex flex-wrap gap-x-2"><span className="font-mono text-dim">{f.name}</span><span className="text-muted">{hints.get(f.name) ? `stored ${f.secret ? hints.get(f.name)!.hint : "(set)"}` : "—"}{f.optional ? " · optional" : ""}</span></li>
                      ))}
                    </ul>
                  )}
                  {manage && def.support !== "NOT_SUPPORTED" && (
                    <div className="mt-3 space-y-2">
                      {def.vault && encryption && (
                        <details>
                          <summary className="cursor-pointer text-xs font-medium text-brand-blue">{def.fields.some((f) => hints.get(f.name)) ? "Update credentials" : "Connect"}</summary>
                          <ActionForm action={connectIntegrationAction.bind(null, def.key)} className="mt-2 space-y-2" resetOnOk>
                            {def.fields.map((f) => <TextField key={f.name} name={f.name} type={f.secret ? "password" : "text"} label={`${f.label}${f.optional ? " (optional)" : ""}`} placeholder={hints.get(f.name) ? "leave blank to keep" : ""} />)}
                            <SubmitButton>Save & test</SubmitButton>
                          </ActionForm>
                        </details>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {state !== "NOT_CONNECTED" && <ActionForm action={testIntegrationAction.bind(null, def.key)}><SubmitButton variant="secondary">Test connection</SubmitButton></ActionForm>}
                        {def.vault && def.fields.some((f) => hints.get(f.name)) && (
                          <ActionForm action={disconnectIntegrationAction.bind(null, def.key)}>
                            <ConfirmButton message={`Remove the stored ${def.name} credentials? Environment variables are not affected.`}>Disconnect</ConfirmButton>
                          </ActionForm>
                        )}
                      </div>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
