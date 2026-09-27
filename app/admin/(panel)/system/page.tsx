import Link from "next/link";
import { db } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { getFlags, FEATURE_FLAGS, type FeatureFlag } from "@/lib/os/flags";
import { mailMode } from "@/lib/email/mailer";
import { daysFromNow } from "@/lib/os/range";
import type { SchedulerRun } from "@/lib/automation/scheduler";
import { runSchedulerNowAction } from "@/lib/os/system-actions";
import { PageHeader, Panel, fmtDate } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/forms";
import { SubmitButton } from "@/components/admin/client";
import { DataTable, KV, Kpi, KpiGrid, StatusBadge } from "@/components/admin/os";

export const metadata = { title: "System health" };
export const dynamic = "force-dynamic";

async function timed<T>(fn: () => Promise<T>) {
  const t = performance.now();
  try {
    return { ok: true as const, value: await fn(), ms: Math.round(performance.now() - t) };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message.slice(0, 200), ms: Math.round(performance.now() - t) };
  }
}

export default async function SystemHealth() {
  const user = await requireAccess("system:view");
  const since = daysFromNow(-1);
  const [ping, migrations, flags, lastRun, autoFail, aiFail, stuckTasks, notifyBacklog, counts] = await Promise.all([
    timed(() => db.$queryRaw`SELECT 1`),
    timed(() => db.$queryRaw<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }[]>`SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at DESC`),
    getFlags(),
    db.setting.findUnique({ where: { key: "scheduler:lastRun" } }),
    db.automationRun.count({ where: { status: { in: ["FAILED", "PARTIAL"] }, startedAt: { gte: since } } }),
    db.aIExecution.count({ where: { status: "FAILED", startedAt: { gte: since } } }),
    db.aITask.count({ where: { status: "RUNNING", updatedAt: { lt: daysFromNow(-1 / 24) } } }),
    db.notification.count({ where: { readAt: null } }),
    Promise.all([db.lead.count(), db.deal.count(), db.client.count(), db.project.count(), db.invoice.count(), db.ticket.count(), db.aIExecution.count(), db.auditLog.count()]),
  ]);
  const run = lastRun?.value as SchedulerRun | undefined;
  const failedMigrations = migrations.ok ? migrations.value.filter((m) => !m.finished_at && !m.rolled_back_at) : [];
  const env = process.env.VERCEL_ENV ?? process.env.NODE_ENV;
  const stale = !run || new Date(run.at) < daysFromNow(-2);
  return (
    <>
      <PageHeader title="System health" description="Database, migrations, scheduler, background work and feature flags. Read-only diagnostics — nothing here changes data except running the idempotent daily jobs." crumbs={[{ label: "System" }, { label: "Health" }]} actions={can(user.role, "settings:manage") ? <ActionForm action={runSchedulerNowAction}><SubmitButton variant="secondary">Run daily jobs now</SubmitButton></ActionForm> : undefined} />
      <KpiGrid cols={6}>
        <Kpi label="Database" value={ping.ok ? "Online" : "Error"} hint={`${ping.ms} ms round trip`} tone={ping.ok ? "green" : "red"} />
        <Kpi label="Migrations" value={migrations.ok ? `${migrations.value.length} applied` : "Unknown"} hint={failedMigrations.length ? `${failedMigrations.length} failed` : "No failures"} tone={failedMigrations.length ? "red" : "green"} />
        <Kpi label="Scheduler" value={run ? fmtDate(new Date(run.at), true) : "Never ran"} hint={run ? `${run.trigger} · ${(run.ms / 1000).toFixed(1)} s` : "Set CRON_SECRET"} tone={stale ? "amber" : "green"} />
        <Kpi label="Automation failures (24h)" value={autoFail} tone={autoFail ? "red" : undefined} href="/admin/automations/failures" />
        <Kpi label="AI failures (24h)" value={aiFail} tone={aiFail ? "red" : undefined} href="/admin/ai/logs?status=FAILED" />
        <Kpi label="Stuck AI tasks" value={stuckTasks} tone={stuckTasks ? "amber" : undefined} href="/admin/ai/tasks" />
      </KpiGrid>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel title="Runtime">
          <KV cols={1} items={[
            ["Environment", env ?? "unknown"],
            ["Node.js", process.version],
            ["Email delivery", mailMode() === "none" ? "Not connected" : mailMode()],
            ["File storage", process.env.BLOB_READ_WRITE_TOKEN ? "Vercel Blob" : "Not connected"],
            ["Unread notifications", notifyBacklog.toLocaleString()],
            ["Records", `${counts[0]} leads · ${counts[1]} deals · ${counts[2]} clients · ${counts[3]} projects · ${counts[4]} invoices · ${counts[5]} tickets`],
            ["Audit trail", `${counts[7].toLocaleString()} audit entries · ${counts[6].toLocaleString()} AI executions`],
          ]} />
        </Panel>
        <Panel title="Feature flags" action={can(user.role, "settings:manage") ? <Link href="/admin/settings/features" className="text-xs text-brand-blue hover:underline">Manage</Link> : undefined}>
          <ul className="grid gap-1 text-sm sm:grid-cols-2">{(Object.keys(FEATURE_FLAGS) as FeatureFlag[]).map((k) => <li key={k} className="flex items-center gap-2"><StatusBadge value={flags[k] ? "ACTIVE" : "INACTIVE"} text={flags[k] ? "On" : "Off"} /><span className="text-muted">{FEATURE_FLAGS[k]}</span></li>)}</ul>
        </Panel>
        <Panel title="Last scheduler run">
          {!run ? <p className="text-sm text-muted">The daily scheduler has not run yet. On Vercel it runs from vercel.json once CRON_SECRET is set.</p> : <DataTable rows={run.reports.map((r) => ({ id: r.job, ...r }))} columns={[{ header: "Job", cell: (r) => <span className="font-mono text-xs">{r.job}</span> }, { header: "Items", cell: (r) => r.count }, { header: "Result", cell: (r) => (r.error ? <span className="text-xs text-red-700">{r.error}</span> : <StatusBadge value="SUCCEEDED" text="OK" />) }]} />}
        </Panel>
        <Panel title="Database migrations">
          {!migrations.ok ? <p className="text-sm text-red-700">{migrations.error}</p> : <ul className="space-y-1 text-sm">{migrations.value.slice(0, 10).map((m) => <li key={m.migration_name} className="flex items-center gap-2"><StatusBadge value={m.finished_at ? "SUCCEEDED" : m.rolled_back_at ? "CANCELLED" : "FAILED"} text={m.finished_at ? "Applied" : m.rolled_back_at ? "Rolled back" : "Failed"} /><span className="font-mono text-xs">{m.migration_name}</span></li>)}</ul>}
        </Panel>
      </div>
    </>
  );
}
