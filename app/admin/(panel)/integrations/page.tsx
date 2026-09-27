import Link from "next/link";
import { db } from "@/lib/db/client";
import { requireAccess } from "@/lib/os/guard";
import { integrations } from "@/lib/os/integrations";
import { PageHeader, Panel, fmtDate } from "@/components/admin/ui";
import { Kpi, KpiGrid, StatusBadge } from "@/components/admin/os";

export const metadata = { title: "Integrations" };

export default async function IntegrationsPage() {
  await requireAccess("integrations:view", "INTEGRATIONS");
  const list = integrations();
  const rows = await db.integration.findMany();
  const sync = new Map(rows.map((r) => [r.key, r]));
  const cats = [...new Set(list.map((i) => i.category))];
  return (
    <>
      <PageHeader title="Integration hub" description="Every external service the OS can use and whether it is configured. Credentials live only in the server environment — this page shows variable names, never values. Nothing is simulated when a service is not connected." crumbs={[{ label: "System" }, { label: "Integrations" }]} />
      <KpiGrid cols={3}>
        <Kpi label="Connected" value={list.filter((i) => i.connected).length} tone="green" />
        <Kpi label="Not connected" value={list.filter((i) => !i.connected).length} tone="amber" />
        <Kpi label="Sync errors" value={rows.filter((r) => r.lastError).length} tone={rows.some((r) => r.lastError) ? "red" : undefined} />
      </KpiGrid>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {cats.map((c) => (
          <Panel key={c} title={c}>
            <ul className="divide-y divide-line">
              {list.filter((i) => i.category === c).map((i) => {
                const s = sync.get(i.key);
                return (
                  <li key={i.key} className="py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-fg">{i.href ? <Link href={i.href} className="hover:underline">{i.name}</Link> : i.name}</span>
                      <StatusBadge value={i.connected ? "CONNECTED" : "NOT_CONNECTED"} text={i.connected ? "Connected" : "Not connected"} />
                    </div>
                    <p className="mt-0.5 text-xs text-dim">Env: <span className="font-mono">{i.env.join(", ")}</span></p>
                    {i.note && <p className="text-xs text-muted">{i.note}</p>}
                    {s?.lastSyncAt && <p className="text-xs text-muted">Last sync {fmtDate(s.lastSyncAt, true)}</p>}
                    {s?.lastError && <p className="text-xs text-red-700">Last error: {s.lastError}</p>}
                  </li>
                );
              })}
            </ul>
          </Panel>
        ))}
      </div>
    </>
  );
}
