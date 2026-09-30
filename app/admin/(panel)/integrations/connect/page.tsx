import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { encryptionConfigured } from "@/lib/auth/totp";
import { integrationStatuses } from "@/lib/integrations/health";
import { vaultEntries } from "@/lib/integrations/vault";
import { oauthStatus, redirectUri } from "@/lib/integrations/oauth";
import { connectIntegrationAction, disconnectIntegrationAction, selectMetaPageAction, testIntegrationAction } from "@/lib/company/actions";
import { Kpi, KpiGrid, SelectField, StatusBadge, TextField } from "@/components/admin/os";
import { PageHeader, fmtDate } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/forms";
import { ConfirmButton, SubmitButton } from "@/components/admin/client";

export const metadata = { title: "API & Integrations" };
export const dynamic = "force-dynamic";

const SUPPORT_TEXT = { SUPPORTED: "Supported", STATUS_ONLY: "Status only", NOT_SUPPORTED: "Not supported" } as const;

export default async function IntegrationsCenter() {
  const user = await requireAccess("integrations:view", "INTEGRATIONS");
  const manage = can(user.role, "integrations:manage");
  const [rows, stored, oauth] = await Promise.all([integrationStatuses(), vaultEntries(), oauthStatus()]);
  const redirect = redirectUri();
  const hints = new Map(stored.map((s) => [s.name, s]));
  const encryption = encryptionConfigured();
  const cats = [...new Set(rows.map((r) => r.def.category))];
  const n = (s: string) => rows.filter((r) => r.state === s).length;
  return (
    <>
      <PageHeader title="API & Integrations" description="Connect providers with OAuth sign-in or API keys, then configure, test and disconnect them without editing environment variables. Credentials are encrypted (AES-256-GCM) on the server, masked here, never logged and never sent to the browser; environment variables, when set, always take precedence. Statuses are real: CONNECTED only when credentials exist and the last real check did not fail; EXPIRED when a sign-in expired or was revoked; RATE_LIMITED while the provider asks us to slow down; ERROR with the classified reason otherwise." crumbs={[{ label: "Platform" }, { label: "API & Integrations" }]} />
      {!encryption && <p className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">BLOCKED: APP_ENCRYPTION_KEY (32+ characters) is not set on the server, so credentials cannot be stored here. Environment-variable configuration still works.</p>}
      <KpiGrid cols={6}>
        <Kpi label="Connected" value={n("CONNECTED")} tone="green" />
        <Kpi label="Not connected" value={n("NOT_CONNECTED")} />
        <Kpi label="Errors" value={n("ERROR")} tone={n("ERROR") ? "red" : undefined} />
        <Kpi label="Expired" value={n("EXPIRED")} tone={n("EXPIRED") ? "red" : undefined} hint="Sign in again" />
        <Kpi label="Rate limited" value={n("RATE_LIMITED")} tone={n("RATE_LIMITED") ? "amber" : undefined} />
        <Kpi label="Not supported" value={n("NOT_SUPPORTED")} hint="No adapter in this release" />
      </KpiGrid>
      <div className="mt-5 space-y-6">
        {cats.map((cat) => (
          <section key={cat}>
            <h2 className="mb-2 text-base font-semibold">{cat}</h2>
            <div className="grid gap-3 lg:grid-cols-2">
              {rows.filter((r) => r.def.category === cat).map(({ def, state, source, lastTestedAt, lastError, usage, lastSuccessAt, lastFailureAt, failureKind, expiresAt, account }) => (
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
                  {def.oauth && def.category === "OAuth apps" && (() => {
                    const o = oauth.find((x) => x.provider === def.oauth);
                    return (
                      <div className="mt-2 rounded-md border border-line bg-ink-850 p-2 text-xs">
                        <p className="text-muted">Redirect URL to register at the provider: <span className="font-mono break-all text-fg">{redirect}</span></p>
                        <p className="mt-1">Sign-in: <StatusBadge value={o?.state ?? "NOT_CONNECTED"} />{o?.expiresAt ? <span className="ml-1 text-dim">{o.state === "EXPIRED" ? "expired" : "expires"} {fmtDate(new Date(o.expiresAt), true)}{o.canRefresh ? " (auto-refresh)" : ""}</span> : null}{o?.lastError ? <span className="ml-1 text-red-700">{o.lastError}</span> : null}</p>
                        {o?.missingScopes && o.missingScopes.length > 0 && <p className="mt-1 text-amber-700">Insufficient permission — not granted: {o.missingScopes.join(", ")}</p>}
                        {manage && (o?.clientReady ? <a href={`/api/integrations/oauth/start?provider=${def.oauth}`} className="btn-primary mt-2 inline-flex h-8 items-center px-3 text-xs">Sign in with {def.name.split(" ")[0]}</a> : <p className="mt-1 text-dim">Save the client ID and secret first.</p>)}
                        {def.oauth === "meta" && manage && Array.isArray(o?.config?.pages) && (o!.config!.pages as { id: string; name: string; instagram: string | null }[]).length > 0 && (
                          <ActionForm action={selectMetaPageAction} className="mt-2 flex flex-wrap items-end gap-2">
                            <SelectField name="pageId" label="Facebook Page to use" options={(o!.config!.pages as { id: string; name: string; instagram: string | null }[]).map((p) => [p.id, `${p.name}${p.instagram ? " (+ Instagram)" : ""}`] as const)} />
                            <SubmitButton variant="secondary">Use this Page</SubmitButton>
                          </ActionForm>
                        )}
                      </div>
                    );
                  })()}
                  {usage && <p className="mt-1 text-xs text-dim">Usage: {usage}</p>}
                  {account && state !== "NOT_CONNECTED" && <p className="mt-1 text-xs text-dim">Account: {account}</p>}
                  {(lastSuccessAt || lastFailureAt || lastTestedAt) && <p className="mt-1 text-xs text-dim">Last check {lastTestedAt ? fmtDate(lastTestedAt, true) : "—"} · last success {lastSuccessAt ? fmtDate(lastSuccessAt, true) : "never"}{lastFailureAt ? ` · last failure ${fmtDate(lastFailureAt, true)}` : ""}</p>}
                  {expiresAt && state !== "NOT_CONNECTED" && <p className="mt-1 text-xs text-dim">Sign-in {state === "EXPIRED" ? "expired" : "expires"} {fmtDate(new Date(expiresAt), true)}</p>}
                  {lastError && <p className="mt-1 text-xs text-red-700">{failureKind ? `${failureKind.replace(/_/g, " ").toLowerCase()}: ` : ""}{lastError}</p>}
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
