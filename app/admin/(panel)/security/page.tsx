import { db } from "@/lib/db/client";
import { can, ROLE_LABELS, type RoleName } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { encryptionConfigured } from "@/lib/auth/totp";
import { reset2faAction, revokeSessionAction } from "@/lib/security/actions";
import { PageHeader, Panel, fmtDate } from "@/components/admin/ui";
import { DataTable, Kpi, KpiGrid, StatusBadge, Tabs, pick, type SP } from "@/components/admin/os";
import { daysFromNow } from "@/lib/os/range";

export const metadata = { title: "Security Center" };
const TABS = ["overview", "logins", "sessions", "users", "events"] as const;

/** Configuration checks report presence only — secret values are never read into the page. */
function checks() {
  const set = (k: string) => !!process.env[k];
  const stripe = set("STRIPE_SECRET_KEY");
  const razor = set("RAZORPAY_KEY_ID");
  return [
    { name: "HTTPS-only secure session cookies", ok: process.env.NODE_ENV === "production", note: "Enabled automatically in production." },
    { name: "Two-factor secrets encryption key (APP_ENCRYPTION_KEY)", ok: encryptionConfigured(), note: "Needed before anyone can enable 2FA." },
    { name: "Cron endpoint protected (CRON_SECRET)", ok: set("CRON_SECRET"), note: "Without it the daily scheduler refuses to run." },
    { name: "Stripe webhook signature (STRIPE_WEBHOOK_SECRET)", ok: !stripe || set("STRIPE_WEBHOOK_SECRET"), note: stripe ? "Stripe is configured." : "Stripe not configured." },
    { name: "Razorpay webhook signature (RAZORPAY_WEBHOOK_SECRET)", ok: !razor || set("RAZORPAY_WEBHOOK_SECRET"), note: razor ? "Razorpay is configured." : "Razorpay not configured." },
    { name: "Calendly webhook signature (CALENDLY_WEBHOOK_SIGNING_KEY)", ok: set("CALENDLY_WEBHOOK_SIGNING_KEY"), note: "Unsigned Calendly webhooks are rejected." },
    { name: "Exotel webhook token (EXOTEL_WEBHOOK_TOKEN)", ok: !set("EXOTEL_SID") || set("EXOTEL_WEBHOOK_TOKEN"), note: set("EXOTEL_SID") ? "Exotel is configured." : "Exotel not configured." },
    { name: "Signed automation webhooks (AUTOMATION_WEBHOOK_SECRET)", ok: set("AUTOMATION_WEBHOOK_SECRET"), note: "Outgoing automation webhooks are unsigned without it." },
    { name: "Bot protection on public forms (TURNSTILE_SECRET_KEY)", ok: set("TURNSTILE_SECRET_KEY"), note: "Forms still use honeypot, timing and rate limits." },
  ];
}

export default async function SecurityCenter({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireAccess("security:view");
  const tab = pick(await searchParams, "tab", TABS) ?? "overview";
  const manage = can(user.role, "security:manage");
  const since24 = daysFromNow(-1);
  const now = new Date();
  const [failed24, ok24, locked, usersTotal, with2fa, activeSessions, highEvents] = await Promise.all([
    db.loginAttempt.count({ where: { success: false, createdAt: { gte: since24 } } }),
    db.loginAttempt.count({ where: { success: true, createdAt: { gte: since24 } } }),
    db.user.count({ where: { lockedUntil: { gt: now } } }),
    db.user.count({ where: { active: true } }),
    db.twoFactorMethod.count({ where: { enabledAt: { not: null }, user: { active: true } } }),
    db.session.count({ where: { expiresAt: { gt: now } } }),
    db.securityEvent.count({ where: { severity: { in: ["HIGH", "CRITICAL"] }, createdAt: { gte: daysFromNow(-7) } } }),
  ]);
  const cfg = checks();
  return (
    <>
      <PageHeader title="Security Center" description="Sign-ins, sessions, two-factor coverage, security events and configuration checks. Secret values are never displayed." crumbs={[{ label: "System" }, { label: "Security" }]} />
      <KpiGrid cols={6}>
        <Kpi label="Failed sign-ins (24h)" value={failed24} hint={`${ok24} successful`} tone={failed24 > 20 ? "red" : failed24 ? "amber" : undefined} href="/admin/security?tab=logins" />
        <Kpi label="Locked accounts" value={locked} tone={locked ? "amber" : undefined} href="/admin/security?tab=users" />
        <Kpi label="2FA coverage" value={`${with2fa}/${usersTotal}`} hint={usersTotal ? `${Math.round((with2fa / usersTotal) * 100)}% of active users` : undefined} tone={with2fa < usersTotal ? "amber" : "green"} href="/admin/security?tab=users" />
        <Kpi label="Active sessions" value={activeSessions} href="/admin/security?tab=sessions" />
        <Kpi label="High-severity events (7d)" value={highEvents} tone={highEvents ? "red" : undefined} href="/admin/security?tab=events" />
        <Kpi label="Config checks" value={`${cfg.filter((c) => c.ok).length}/${cfg.length}`} tone={cfg.every((c) => c.ok) ? "green" : "amber"} />
      </KpiGrid>
      <div className="mt-5"><Tabs active={tab} items={TABS.map((t) => ({ key: t, label: t === "logins" ? "Sign-ins" : t.charAt(0).toUpperCase() + t.slice(1), href: `/admin/security?tab=${t}` }))} /></div>
      {tab === "overview" && (
        <Panel title="Configuration checks">
          <ul className="divide-y divide-line">
            {cfg.map((c) => <li key={c.name} className="flex items-start gap-3 py-2 text-sm"><StatusBadge value={c.ok ? "SUCCEEDED" : "PENDING"} text={c.ok ? "OK" : "Action"} /><span><span className="text-fg">{c.name}</span><span className="block text-xs text-dim">{c.note}</span></span></li>)}
          </ul>
        </Panel>
      )}
      {tab === "logins" && <Logins />}
      {tab === "sessions" && <Sessions manage={manage} actorRole={user.role} />}
      {tab === "users" && <Users manage={manage} actorRole={user.role} />}
      {tab === "events" && <Events />}
    </>
  );
}

async function Logins() {
  const rows = await db.loginAttempt.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  return <DataTable rows={rows} columns={[{ header: "When", cell: (l) => fmtDate(l.createdAt, true) }, { header: "Email", cell: (l) => l.email }, { header: "Result", cell: (l) => <StatusBadge value={l.success ? "SUCCEEDED" : "FAILED"} text={l.success ? "Success" : "Failed"} /> }, { header: "IP", cell: (l) => <span className="font-mono text-xs">{l.ip ?? "—"}</span> }]} />;
}

async function Sessions({ manage, actorRole }: { manage: boolean; actorRole: RoleName }) {
  const rows = await db.session.findMany({ where: { expiresAt: { gt: new Date() } }, orderBy: { lastSeenAt: "desc" }, take: 200, include: { user: { select: { name: true, email: true, role: true } } } });
  return <DataTable rows={rows} columns={[{ header: "User", cell: (s) => <span>{s.user.name}<span className="block text-xs text-dim">{s.user.email}</span></span> }, { header: "Device", cell: (s) => <span className="line-clamp-1 text-xs text-muted" title={s.userAgent ?? ""}>{s.userAgent ?? "—"}</span> }, { header: "IP", cell: (s) => <span className="font-mono text-xs">{s.ip ?? "—"}</span> }, { header: "Started", cell: (s) => fmtDate(s.createdAt, true) }, { header: "Last active", cell: (s) => fmtDate(s.lastSeenAt, true) }, { header: "", cell: (s) => (manage && (s.user.role !== "SUPER_ADMIN" || actorRole === "SUPER_ADMIN") ? <form action={revokeSessionAction.bind(null, s.id)}><button type="submit" className="text-xs text-red-700 hover:underline">Revoke</button></form> : null) }]} />;
}

async function Users({ manage, actorRole }: { manage: boolean; actorRole: RoleName }) {
  const rows = await db.user.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }], select: { id: true, name: true, email: true, role: true, active: true, lastLoginAt: true, lockedUntil: true, failedLoginCount: true, twoFactor: { select: { enabledAt: true } } } });
  return <DataTable rows={rows} columns={[{ header: "User", cell: (u) => <span>{u.name}<span className="block text-xs text-dim">{u.email}</span></span> }, { header: "Role", cell: (u) => ROLE_LABELS[u.role as RoleName] }, { header: "Status", cell: (u) => <StatusBadge value={!u.active ? "INACTIVE" : u.lockedUntil && u.lockedUntil > new Date() ? "BLOCKED" : "ACTIVE"} text={!u.active ? "Inactive" : u.lockedUntil && u.lockedUntil > new Date() ? "Locked" : "Active"} /> }, { header: "2FA", cell: (u) => (u.twoFactor?.enabledAt ? <StatusBadge value="ACTIVE" text="On" /> : <StatusBadge value="PENDING" text="Off" />) }, { header: "Last sign-in", cell: (u) => fmtDate(u.lastLoginAt, true) }, { header: "", cell: (u) => (manage && u.twoFactor && (u.role !== "SUPER_ADMIN" || actorRole === "SUPER_ADMIN") ? <form action={reset2faAction.bind(null, u.id)}><button type="submit" className="text-xs text-red-700 hover:underline">Reset 2FA</button></form> : null) }]} />;
}

async function Events() {
  const rows = await db.securityEvent.findMany({ orderBy: { createdAt: "desc" }, take: 200, include: { user: { select: { name: true } } } });
  return rows.length === 0 ? <p className="text-sm text-muted">No security events recorded yet.</p> : <DataTable rows={rows} columns={[{ header: "When", cell: (e) => fmtDate(e.createdAt, true) }, { header: "Event", cell: (e) => <span className="font-mono text-xs">{e.type}</span> }, { header: "Severity", cell: (e) => <StatusBadge value={e.severity} /> }, { header: "User", cell: (e) => e.user?.name ?? "—" }, { header: "IP", cell: (e) => <span className="font-mono text-xs">{e.ip ?? "—"}</span> }]} />;
}
