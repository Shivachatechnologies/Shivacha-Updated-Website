import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { canDecide } from "@/lib/ai/approvals";
import { agentBySlug } from "@/lib/ai/catalog";
import { decideApprovalAction } from "@/lib/ai/actions";
import { PageHeader, Panel, fmtDate, inputCls, labelCls } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/forms";
import { SubmitButton } from "@/components/admin/client";
import { KV, StatusBadge } from "@/components/admin/os";
import Link from "next/link";

export const metadata = { title: "Approval request" };

const HREF: Record<string, string> = { Lead: "/admin/leads/", Client: "/admin/clients/", Deal: "/admin/deals/", Ticket: "/admin/support/", Project: "/admin/projects/", Invoice: "/admin/finance/invoices/" };

export default async function ApprovalDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAccess("ai:view", "AI_WORKFORCE");
  const { id } = await params;
  const a = await db.aIApproval.findUnique({ where: { id }, include: { requestedBy: { select: { name: true } }, decidedBy: { select: { name: true } } } });
  if (!a) notFound();
  const decide = canDecide(user, a.requiredPermission);
  if (!decide && a.requestedById !== user.id && !can(user.role, "ai:configure")) notFound();
  const input = a.input as Record<string, unknown>;
  const affected = (Array.isArray(a.affectedRecords) ? a.affectedRecords : []) as { entity: string; id: string }[];
  const changes = (a.proposedChanges ?? null) as Record<string, { from: string; to: unknown }> | null;
  const isEmail = a.tool === "sendEmail";
  const pending = a.status === "PENDING" && (!a.expiresAt || a.expiresAt > new Date());
  const action = decideApprovalAction.bind(null, a.id);
  return (
    <>
      <PageHeader title={a.action} description={a.reason ? `Reason: ${a.reason}` : undefined} crumbs={[{ label: "AI", href: "/admin/ai/command-center" }, { label: "Approvals", href: "/admin/ai/approvals" }, { label: "Request" }]} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          {changes && Object.keys(changes).length > 0 && (
            <Panel title="Proposed changes">
              <ul className="space-y-1 text-sm">{Object.entries(changes).map(([k, v]) => <li key={k}><span className="font-medium text-fg">{k}</span>: <span className="text-muted line-through">{v.from}</span> → <span className="text-fg">{String(v.to)}</span></li>)}</ul>
            </Panel>
          )}
          {a.generatedContent && (
            <Panel title={isEmail ? "Email to be sent" : "Generated content"}>
              <pre className="whitespace-pre-wrap font-sans text-[13.5px] text-fg/90">{a.generatedContent}</pre>
              <p className="mt-2 text-[11.5px] text-dim">AI- or automation-generated. Review for accuracy before approving.</p>
            </Panel>
          )}
          {pending && decide ? (
            <>
              <Panel title="Decide">
                <div className="flex flex-wrap gap-3">
                  <ActionForm action={action} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="decision" value="APPROVE" />
                    <label className="text-xs"><span className="mb-0.5 block text-dim">Note (optional)</span><input name="note" maxLength={1000} className={`${inputCls} w-64`} /></label>
                    <SubmitButton>Approve &amp; execute</SubmitButton>
                  </ActionForm>
                  <ActionForm action={action} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="decision" value="REJECT" />
                    <label className="text-xs"><span className="mb-0.5 block text-dim">Reason (optional)</span><input name="note" maxLength={1000} className={`${inputCls} w-64`} /></label>
                    <SubmitButton variant="danger">Reject</SubmitButton>
                  </ActionForm>
                </div>
              </Panel>
              <Panel title="Edit & approve">
                <ActionForm action={action} className="space-y-3">
                  <input type="hidden" name="decision" value="APPROVE" />
                  <input type="hidden" name="edit" value="1" />
                  {isEmail ? (
                    <>
                      <input type="hidden" name="input" value={JSON.stringify(input)} />
                      <label className="block"><span className={labelCls}>To</span><input name="f_to" type="email" defaultValue={String(input.to ?? "")} required className={inputCls} /></label>
                      <label className="block"><span className={labelCls}>Subject</span><input name="f_subject" defaultValue={String(input.subject ?? "")} maxLength={200} required className={inputCls} /></label>
                      <label className="block"><span className={labelCls}>Body</span><textarea name="f_body" defaultValue={String(input.body ?? "")} rows={10} maxLength={10000} required className={`${inputCls} h-auto py-2`} /></label>
                    </>
                  ) : (
                    <label className="block"><span className={labelCls}>Action input (JSON — validated again before it runs)</span><textarea name="input" defaultValue={JSON.stringify(input, null, 2)} rows={12} className={`${inputCls} h-auto py-2 font-mono text-[12px]`} /></label>
                  )}
                  <label className="block"><span className={labelCls}>Note (optional)</span><input name="note" maxLength={1000} className={inputCls} /></label>
                  <SubmitButton>Save edits, approve &amp; execute</SubmitButton>
                </ActionForm>
              </Panel>
            </>
          ) : pending ? (
            <p className="text-sm text-muted">Waiting for someone with <span className="font-mono text-xs">{a.requiredPermission}</span> and AI approval rights.</p>
          ) : null}
          {a.executionResult != null && (
            <Panel title="Execution result"><pre className="max-h-80 overflow-auto font-mono text-[12px] text-fg/90">{JSON.stringify(a.executionResult, null, 2)}</pre></Panel>
          )}
        </div>
        <aside className="space-y-5">
          <Panel title="Request">
            <KV cols={1} items={[
              ["Status", <StatusBadge key="s" value={a.status} />],
              ["Risk", <StatusBadge key="r" value={a.risk} />],
              ["AI employee", a.agentSlug === "automation" ? "Automation" : agentBySlug(a.agentSlug) ? <Link key="emp" href={`/admin/ai/employees/${a.agentSlug}`} className="text-brand-blue hover:underline">{agentBySlug(a.agentSlug)!.name}</Link> : a.agentSlug],
              ["Task", a.taskId ? <Link key="task" href={`/admin/ai/tasks/${a.taskId}`} className="text-brand-blue hover:underline">View task progress</Link> : "—"],
              ["On behalf of", a.requestedBy?.name ?? "—"],
              ["Action", <span key="t" className="font-mono text-xs">{a.tool}</span>],
              ["Required permission", <span key="p" className="font-mono text-xs">{a.requiredPermission}</span>],
              ["Created", fmtDate(a.createdAt, true)],
              ["Expires", fmtDate(a.expiresAt, true)],
              ["Decided", a.decidedAt ? `${fmtDate(a.decidedAt, true)} · ${a.decidedBy?.name ?? ""}` : "—"],
              ["Note", a.decisionNote ?? "—"],
              ["Execution", a.executionId ? <Link key="e" href={`/admin/ai/logs/${a.executionId}`} className="text-brand-blue hover:underline">View AI log</Link> : "—"],
            ]} />
          </Panel>
          {affected.length > 0 && (
            <Panel title="Affected records">
              <ul className="space-y-1 text-sm">{affected.map((r) => <li key={`${r.entity}:${r.id}`}>{HREF[r.entity] ? <Link href={`${HREF[r.entity]}${r.id}`} className="text-brand-blue hover:underline">{r.entity} {r.id.slice(-6)}</Link> : `${r.entity} ${r.id}`}</li>)}</ul>
            </Panel>
          )}
        </aside>
      </div>
    </>
  );
}
