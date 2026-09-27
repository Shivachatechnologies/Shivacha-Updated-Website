import { notFound } from "next/navigation";
import { requirePortalUser } from "@/lib/portal/session";
import { portalProject } from "@/lib/portal/data";
import { portalChangeRequestAction } from "@/lib/portal/actions";
import { fmtMoney } from "@/lib/os/money";
import { PageHeader, Panel, fmtDate, inputCls } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/client";
import { KV, StatusBadge } from "@/components/admin/os";
import { PortalForm } from "@/components/portal-forms";

export const metadata = { title: "Project" };

export default async function PortalProject({ params }: { params: Promise<{ id: string }> }) {
  const u = await requirePortalUser();
  const p = await portalProject(u, (await params).id);
  if (!p) notFound();
  return (
    <>
      <PageHeader title={p.name} description={`${p.number} · managed by ${p.manager?.name ?? "your Shivacha team"}`} crumbs={[{ label: "Projects", href: "/client/projects" }, { label: p.number }]} actions={<StatusBadge value={p.status} />} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <Panel title="Overview">
            <KV cols={3} items={[["Progress", `${p.progress}%`], ["Health", <StatusBadge key="h" value={p.health} />], ["Start", fmtDate(p.startDate)], ["Target", fmtDate(p.targetDate)], ["Completed", fmtDate(p.completedAt)]]} />
            <div className="mt-3 h-2 rounded-full bg-ink-800"><div className="h-full rounded-full bg-brand-blue" style={{ width: `${p.progress}%` }} /></div>
            {p.description && <p className="mt-4 text-sm whitespace-pre-wrap text-muted">{p.description}</p>}
          </Panel>
          <Panel title="Milestones">
            {p.milestones.length === 0 ? <p className="text-sm text-dim">No milestones shared yet.</p> : (
              <ol className="space-y-2">
                {p.milestones.map((m) => <li key={m.id} className="flex items-center justify-between gap-2 text-sm"><span className="text-fg">{m.name}</span><span className="flex items-center gap-2 text-xs text-muted">{fmtDate(m.completedAt ?? m.dueDate)} <StatusBadge value={m.status} /></span></li>)}
              </ol>
            )}
          </Panel>
          <Panel title="Updates">
            {p.updates.length === 0 ? <p className="text-sm text-dim">No updates yet.</p> : (
              <ul className="space-y-4">
                {p.updates.map((up) => <li key={up.id} className="border-l-2 border-line-strong pl-3"><p className="text-sm whitespace-pre-wrap text-fg">{up.body}</p><p className="mt-1 text-xs text-dim">{up.author?.name ?? "Shivacha"} · {fmtDate(up.createdAt, true)} · <StatusBadge value={up.health} /></p></li>)}
              </ul>
            )}
          </Panel>
        </div>
        <div className="min-w-0 space-y-5">
          <Panel title="Documents">
            {p.documents.length === 0 ? <p className="text-sm text-dim">No shared documents.</p> : <ul className="space-y-1.5 text-sm">{p.documents.map((d) => <li key={d.id}><a href={`/client/documents/${d.id}/download`} className="text-brand-blue hover:underline">{d.name}</a></li>)}</ul>}
          </Panel>
          <Panel title="Change requests">
            {p.changeRequests.length > 0 && <ul className="mb-3 space-y-1.5 text-sm">{p.changeRequests.map((c) => <li key={c.id} className="flex justify-between gap-2"><span className="min-w-0 truncate">{c.title}</span><span className="flex shrink-0 items-center gap-1.5 text-xs text-muted">{c.impactCost ? fmtMoney(c.impactCost, "USD", { compact: true }) : ""}{c.impactDays ? ` · ${c.impactDays}d` : ""}<StatusBadge value={c.status} /></span></li>)}</ul>}
            <PortalForm action={portalChangeRequestAction.bind(null, p.id)} className="space-y-2 border-t border-line pt-3" resetOnOk>
              <input name="title" required maxLength={200} placeholder="What would you like to change?" aria-label="Change title" className={inputCls} />
              <textarea name="description" required rows={3} maxLength={10000} placeholder="Details" aria-label="Change details" className={`${inputCls} h-auto py-2`} />
              <SubmitButton variant="secondary">Request change</SubmitButton>
            </PortalForm>
          </Panel>
        </div>
      </div>
    </>
  );
}
