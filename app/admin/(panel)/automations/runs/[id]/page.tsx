import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { requireAccess } from "@/lib/os/guard";
import { TRIGGER_INFO } from "@/lib/automation/rules";
import { hrefFor } from "@/lib/automation/href";
import { PageHeader, Panel, fmtDate, label } from "@/components/admin/ui";
import { KV, StatusBadge } from "@/components/admin/os";

export const metadata = { title: "Automation run" };

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAccess("automations:view", "AUTOMATIONS");
  const r = await db.automationRun.findUnique({ where: { id: (await params).id }, include: { automation: { select: { id: true, name: true } } } });
  if (!r) notFound();
  const steps = (r.steps as { action: string; status: string; detail?: string }[] | null) ?? [];
  const href = r.entity && r.entityId ? hrefFor({ entity: r.entity, entityId: r.entityId }) : undefined;
  return (
    <>
      <PageHeader title={`Run · ${r.automation.name}`} crumbs={[{ label: "Automations", href: "/admin/automations" }, { label: "Runs", href: "/admin/automations/runs" }, { label: fmtDate(r.startedAt, true) }]} actions={<StatusBadge value={r.status} />} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Run">
          <KV cols={2} items={[["Automation", <Link key="a" href={`/admin/automations/${r.automation.id}`} className="text-brand-blue hover:underline">{r.automation.name}</Link>], ["Trigger", TRIGGER_INFO[r.trigger].label], ["Record", href ? <Link key="r" href={href} className="text-brand-blue hover:underline">{r.entity}</Link> : r.entity], ["Started", fmtDate(r.startedAt, true)], ["Finished", fmtDate(r.finishedAt, true)], ["Error", r.error]]} />
        </Panel>
        <Panel title="Steps">
          {steps.length === 0 ? <p className="text-sm text-dim">No steps recorded.</p> : <ol className="space-y-2 text-sm">{steps.map((s, i) => <li key={i} className="flex items-start justify-between gap-2"><span>{i + 1}. {label(s.action)}{s.detail && <span className="block text-xs text-muted">{s.detail}</span>}</span><StatusBadge value={s.status === "ok" ? "SUCCEEDED" : s.status === "approval" ? "PENDING_APPROVAL" : s.status.toUpperCase()} text={s.status === "approval" ? "Awaiting approval" : undefined} /></li>)}</ol>}
        </Panel>
      </div>
    </>
  );
}
