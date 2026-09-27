import { cookies } from "next/headers";
import { db } from "@/lib/db/client";
import { requireUser, SESSION_COOKIE } from "@/lib/auth/session";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { hashToken } from "@/lib/auth/tokens";
import { decryptSecret, encryptionConfigured, otpauthUri } from "@/lib/auth/totp";
import { confirm2faAction, disable2faAction, revokeOtherSessionsAction, revokeSessionAction, start2faAction } from "@/lib/security/actions";
import { PageHeader, Panel, fmtDate, inputCls } from "@/components/admin/ui";
import { ActionForm, FieldError } from "@/components/admin/forms";
import { SubmitButton } from "@/components/admin/client";
import { CopyButton } from "@/components/admin/CopyButton";
import { DataTable, KV, StatusBadge } from "@/components/admin/os";

export const metadata = { title: "My account" };

export default async function AccountPage() {
  const user = await requireUser();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const current = token ? hashToken(token) : null;
  const [tfa, sessions, logins, me] = await Promise.all([
    db.twoFactorMethod.findUnique({ where: { userId: user.id } }),
    db.session.findMany({ where: { userId: user.id, expiresAt: { gt: new Date() } }, orderBy: { lastSeenAt: "desc" } }),
    db.loginAttempt.findMany({ where: { email: user.email }, orderBy: { createdAt: "desc" }, take: 10 }),
    db.user.findUnique({ where: { id: user.id }, select: { lastLoginAt: true, passwordChangedAt: true, createdAt: true } }),
  ]);
  let pendingSecret: string | null = null;
  if (tfa && !tfa.enabledAt) {
    try {
      pendingSecret = decryptSecret(tfa.secretEncrypted);
    } catch {
      pendingSecret = null;
    }
  }
  return (
    <>
      <PageHeader title="My account" description="Your profile, two-factor authentication and active sessions." crumbs={[{ label: "Account" }]} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          <Panel title="Two-factor authentication">
            {tfa?.enabledAt ? (
              <div className="space-y-3">
                <p className="text-sm text-fg"><StatusBadge value="ACTIVE" text="On" /> Enabled {fmtDate(tfa.enabledAt, true)}. You will be asked for a code from your authenticator app at sign-in.</p>
                <ActionForm action={disable2faAction} className="flex flex-wrap items-end gap-2">
                  <label className="text-xs"><span className="mb-0.5 block text-dim">Current code to turn off</span><input name="code" inputMode="numeric" maxLength={7} autoComplete="one-time-code" className={`${inputCls} w-40`} /><FieldError name="code" /></label>
                  <SubmitButton variant="danger">Turn off</SubmitButton>
                </ActionForm>
              </div>
            ) : pendingSecret ? (
              <div className="space-y-3 text-sm">
                <p className="text-muted">Add this key to Google Authenticator, 1Password, Authy or similar (choose “enter a setup key”, time-based), then enter the 6-digit code it shows.</p>
                <div className="flex flex-wrap items-center gap-2"><code className="rounded bg-ink-850 px-2 py-1 font-mono text-[13px] tracking-wider">{pendingSecret.match(/.{1,4}/g)!.join(" ")}</code><CopyButton text={pendingSecret} label="Copy key" /><CopyButton text={otpauthUri(pendingSecret, user.email)} label="Copy otpauth link" /></div>
                <ActionForm action={confirm2faAction} className="flex flex-wrap items-end gap-2">
                  <label className="text-xs"><span className="mb-0.5 block text-dim">6-digit code</span><input name="code" inputMode="numeric" maxLength={7} autoComplete="one-time-code" className={`${inputCls} w-40`} /><FieldError name="code" /></label>
                  <SubmitButton>Turn on</SubmitButton>
                </ActionForm>
              </div>
            ) : encryptionConfigured() ? (
              <div className="space-y-3">
                <p className="text-sm text-muted">Protect your account with a time-based one-time code (TOTP) in addition to your password.</p>
                <ActionForm action={start2faAction}><SubmitButton>Set up two-factor authentication</SubmitButton></ActionForm>
              </div>
            ) : (
              <p className="text-sm text-muted">Two-factor authentication is available once an administrator sets <span className="font-mono text-xs">APP_ENCRYPTION_KEY</span> on the server.</p>
            )}
          </Panel>
          <Panel title="Active sessions" action={sessions.length > 1 ? <form action={revokeOtherSessionsAction}><button type="submit" className="text-xs text-red-700 hover:underline">Sign out other sessions</button></form> : undefined}>
            <DataTable rows={sessions} columns={[
              { header: "Device", cell: (s) => <span className="line-clamp-1 text-xs text-muted" title={s.userAgent ?? ""}>{s.userAgent ?? "Unknown"}</span> },
              { header: "IP", cell: (s) => <span className="font-mono text-xs">{s.ip ?? "—"}</span> },
              { header: "Last active", cell: (s) => fmtDate(s.lastSeenAt, true) },
              { header: "", cell: (s) => (s.id === current ? <span className="text-xs text-emerald-700">This device</span> : <form action={revokeSessionAction.bind(null, s.id)}><button type="submit" className="text-xs text-red-700 hover:underline">Revoke</button></form>) },
            ]} />
          </Panel>
          <Panel title="Recent sign-in attempts">
            <DataTable rows={logins} columns={[{ header: "When", cell: (l) => fmtDate(l.createdAt, true) }, { header: "Result", cell: (l) => <StatusBadge value={l.success ? "SUCCEEDED" : "FAILED"} text={l.success ? "Success" : "Failed"} /> }, { header: "IP", cell: (l) => <span className="font-mono text-xs">{l.ip ?? "—"}</span> }]} />
          </Panel>
        </div>
        <aside>
          <Panel title="Profile">
            <KV cols={1} items={[["Name", user.name], ["Email", user.email], ["Role", ROLE_LABELS[user.role]], ["Last sign-in", fmtDate(me?.lastLoginAt, true)], ["Password changed", fmtDate(me?.passwordChangedAt, true)], ["Member since", fmtDate(me?.createdAt)]]} />
            <p className="mt-3 text-xs text-dim">To change your password, use “Forgot password?” on the sign-in page; all sessions are signed out afterwards.</p>
          </Panel>
        </aside>
      </div>
    </>
  );
}
