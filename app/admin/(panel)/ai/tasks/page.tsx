import Link from "next/link";
import { db } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { runnableAgents } from "@/lib/ai/agents";
import { agentBySlug } from "@/lib/ai/catalog";
import { cancelTaskAction, queueTaskAction, runQueuedTasksAction } from "@/lib/ai/actions";
import { providerStatus } from "@/lib/ai/provider";
import { PageHeader, Panel, fmtDate, inputCls, labelCls } from "@/components/admin/ui";
import { ActionForm, FieldError } from "@/components/admin/forms";
import { SubmitButton } from "@/components/admin/client";
import { DataTable, StatusBadge } from "@/components/admin/os";

export const metadata = { title: "AI Tasks" };

export default async function AITasksPage() {
  const user = await requireAccess("ai:view", "AI_WORKFORCE");
  const all = can(user.role, "ai:configure");
  const rows = await db.aITask.findMany({ where: all ? {} : { requestedById: user.id }, orderBy: { createdAt: "desc" }, take: 100 });
  const agents = runnableAgents(user.role);
  return (
    <>
      <PageHeader title="AI Tasks" description="Queued work for agents — from automations or people. Tasks run in the daily scheduler (or on demand) and follow the same approval rules as live requests." crumbs={[{ label: "AI", href: "/admin/ai" }, { label: "Tasks" }]} actions={all ? <ActionForm action={runQueuedTasksAction}><SubmitButton variant="secondary">Run due tasks now</SubmitButton></ActionForm> : undefined} />
      {!providerStatus().connected && <p className="mb-4 text-sm text-amber-700">AI provider not connected — queued tasks will fail with a clear “not connected” error until ANTHROPIC_API_KEY is set.</p>}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          {rows.length === 0 ? <p className="text-sm text-muted">No AI tasks yet.</p> : (
            <DataTable rows={rows} columns={[
              { header: "Task", cell: (t) => <div><p className="font-medium text-fg">{t.title}</p><p className="line-clamp-2 text-xs text-muted">{t.request}</p>{t.error && <p className="text-xs text-red-700">{t.error}</p>}</div> },
              { header: "Agent", cell: (t) => <span className="text-muted">{agentBySlug(t.agentSlug)?.name ?? t.agentSlug}</span> },
              { header: "Source", cell: (t) => <span className="text-xs text-muted">{t.source}</span> },
              { header: "Status", cell: (t) => <StatusBadge value={t.status} /> },
              { header: "Run after", cell: (t) => <span className="text-muted">{fmtDate(t.runAfter, true)}</span> },
              { header: "", cell: (t) => (t.executionId ? <Link href={`/admin/ai/logs/${t.executionId}`} className="text-xs text-brand-blue hover:underline">Result</Link> : t.status === "QUEUED" ? <form action={cancelTaskAction.bind(null, t.id)}><button type="submit" className="text-xs text-dim hover:text-red-700">Cancel</button></form> : null) },
            ]} />
          )}
        </div>
        {can(user.role, "ai:execute") && agents.length > 0 && (
          <Panel title="Queue a task">
            <ActionForm action={queueTaskAction} className="space-y-3" resetOnOk>
              <label className="block"><span className={labelCls}>Agent</span><select name="agent" className={inputCls}>{agents.map((a) => <option key={a.slug} value={a.slug}>{a.name}</option>)}</select><FieldError name="agent" /></label>
              <label className="block"><span className={labelCls}>Title</span><input name="title" maxLength={200} className={inputCls} /><FieldError name="title" /></label>
              <label className="block"><span className={labelCls}>Instructions</span><textarea name="request" rows={4} maxLength={4000} className={`${inputCls} h-auto py-2`} /><FieldError name="request" /></label>
              <label className="block"><span className={labelCls}>Run after (UTC, optional)</span><input type="datetime-local" name="runAfter" className={inputCls} /></label>
              <SubmitButton>Queue task</SubmitButton>
            </ActionForm>
          </Panel>
        )}
      </div>
    </>
  );
}
