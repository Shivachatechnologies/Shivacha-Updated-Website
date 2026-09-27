import Link from "next/link";
import { db } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { TRIGGER_INFO } from "@/lib/automation/rules";
import { createFromTemplateAction, listTemplates, toggleAutomationAction } from "@/lib/automation/actions";
import { PageHeader, Panel, fmtDate } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/client";
import { DataTable, LinkCell, StatusBadge } from "@/components/admin/os";

export const metadata = { title: "Automations" };

export default async function AutomationsPage() {
  const user = await requireAccess("automations:view", "AUTOMATIONS");
  const [rows, templates, failures] = await Promise.all([db.automation.findMany({ orderBy: [{ enabled: "desc" }, { updatedAt: "desc" }] }), listTemplates(), db.automationRun.count({ where: { status: { in: ["FAILED", "PARTIAL"] }, startedAt: { gte: new Date(new Date().getTime() - 7 * 86400_000) } } })]);
  const manage = can(user.role, "automations:manage");
  return (
    <>
      <PageHeader title="Automations" description="Trigger → conditions → actions, with every run logged. Customer-facing emails and sensitive changes always go through human approval." crumbs={[{ label: "Automations" }]} actions={<>{failures > 0 && <Link href="/admin/automations/failures" className="btn-secondary h-9 px-3 text-[13px] text-red-700">{failures} failed runs (7d)</Link>}{manage && <Link href="/admin/automations/new" className="btn-primary h-9 px-3.5 text-[13px]">New automation</Link>}</>} />
      {rows.length === 0 ? <p className="mb-5 text-sm text-dim">No automations yet. Start from a template below or build your own.</p> : (
        <DataTable rows={rows} columns={[
          { header: "Workflow", cell: (a) => <LinkCell href={`/admin/automations/${a.id}`} sub={a.description ?? undefined}>{a.name}</LinkCell> },
          { header: "Trigger", cell: (a) => <span className="text-muted">{TRIGGER_INFO[a.trigger].label}</span> },
          { header: "Actions", cell: (a) => <span className="text-xs text-muted">{(a.actions as { type: string }[]).map((x) => x.type.toLowerCase().replace(/_/g, " ")).join(" → ")}</span> },
          { header: "Status", cell: (a) => <StatusBadge value={a.enabled ? "ACTIVE" : "PAUSED"} text={a.enabled ? "Enabled" : "Disabled"} /> },
          { header: "Runs", cell: (a) => <span className="tabular-nums text-muted">{a.runCount}{a.failureCount ? <span className="text-red-700"> · {a.failureCount} failed</span> : ""}</span> },
          { header: "Last run", cell: (a) => <span className="text-muted">{fmtDate(a.lastRunAt, true)}</span> },
          { header: "", cell: (a) => (manage ? <form action={toggleAutomationAction.bind(null, a.id, !a.enabled)}><button type="submit" className="text-xs text-brand-blue hover:underline">{a.enabled ? "Disable" : "Enable"}</button></form> : null) },
        ]} />
      )}
      {manage && (
        <Panel title="Templates" className="mt-6">
          <ul className="grid gap-3 md:grid-cols-2">
            {templates.map((t) => (
              <li key={t.key} className="rounded-lg border border-line p-3">
                <p className="text-sm font-medium text-fg">{t.name}</p>
                <p className="mt-0.5 text-xs text-muted">{t.description}</p>
                <form action={createFromTemplateAction.bind(null, t.key)} className="mt-2"><SubmitButton variant="secondary" className="h-8 text-xs">Add (disabled)</SubmitButton></form>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
}
