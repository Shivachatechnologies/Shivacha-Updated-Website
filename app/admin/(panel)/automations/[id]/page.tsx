import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { TRIGGER_INFO } from "@/lib/automation/rules";
import { PageHeader, Panel, fmtDate } from "@/components/admin/ui";
import { KV, StatusBadge } from "@/components/admin/os";
import { AutomationForm } from "@/components/admin/automation-form";

export const metadata = { title: "Automation" };

export default async function AutomationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAccess("automations:view", "AUTOMATIONS");
  const a = await db.automation.findUnique({ where: { id: (await params).id }, include: { runs: { orderBy: { startedAt: "desc" }, take: 20 }, createdBy: { select: { name: true } } } });
  if (!a) notFound();
  return (
    <>
      <PageHeader title={a.name} description={a.description ?? TRIGGER_INFO[a.trigger].label} crumbs={[{ label: "Automations", href: "/admin/automations" }, { label: a.name }]} actions={<StatusBadge value={a.enabled ? "ACTIVE" : "PAUSED"} text={a.enabled ? "Enabled" : "Disabled"} />} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Panel title="Rule">{can(user.role, "automations:manage") ? <AutomationForm a={a} /> : <pre className="overflow-x-auto text-xs">{JSON.stringify({ trigger: a.trigger, conditions: a.conditions, actions: a.actions }, null, 2)}</pre>}</Panel>
        <div className="space-y-5">
          <Panel title="Stats"><KV cols={2} items={[["Runs", a.runCount], ["Failures", a.failureCount], ["Last run", fmtDate(a.lastRunAt, true)], ["Created by", a.createdBy?.name]]} /></Panel>
          <Panel title="Recent runs">
            {a.runs.length === 0 ? <p className="text-sm text-dim">Not run yet.</p> : <ul className="space-y-1.5 text-sm">{a.runs.map((r) => <li key={r.id} className="flex items-center justify-between gap-2"><Link href={`/admin/automations/runs/${r.id}`} className="text-fg hover:text-brand-blue">{fmtDate(r.startedAt, true)}</Link><StatusBadge value={r.status} /></li>)}</ul>}
          </Panel>
        </div>
      </div>
    </>
  );
}
