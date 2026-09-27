import { notFound } from "next/navigation";
import { FileDown } from "lucide-react";
import { requirePortalUser } from "@/lib/portal/session";
import { portalProposal } from "@/lib/portal/data";
import { portalProposalDecisionAction } from "@/lib/portal/actions";
import { parseContent } from "@/lib/sales/proposals";
import { fmtMoney } from "@/lib/os/money";
import { PageHeader, Panel, fmtDate, inputCls } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/client";
import { StatusBadge } from "@/components/admin/os";
import { PortalForm } from "@/components/portal-forms";

export const metadata = { title: "Proposal" };

export default async function PortalProposal({ params }: { params: Promise<{ id: string }> }) {
  const u = await requirePortalUser();
  const p = await portalProposal(u, (await params).id);
  if (!p) notFound();
  const c = parseContent(p.content);
  const open = (p.status === "SENT" || p.status === "VIEWED") && !(p.validUntil && p.validUntil < new Date());
  const sections: [string, string][] = [["Summary", c.summary], ["Scope of work", c.scope], ["Deliverables", c.deliverables], ["Timeline", c.timeline], ["Milestones", c.milestones], ["Assumptions", c.assumptions], ["Payment schedule", c.paymentSchedule], ["Terms", c.terms]];
  return (
    <>
      <PageHeader title={p.title} description={`${p.number} · version ${p.version} · valid until ${fmtDate(p.validUntil)}`} crumbs={[{ label: "Proposals", href: "/client/proposals" }, { label: p.number }]} actions={<div className="flex items-center gap-2"><StatusBadge value={p.status} /><a href={`/client/proposals/${p.id}/pdf`} target="_blank" rel="noopener" className="btn-secondary h-9 px-3 text-[13px]"><FileDown className="size-4" aria-hidden /> PDF</a></div>} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          {sections.filter(([, v]) => v).map(([h, v]) => <Panel key={h} title={h}><p className="text-sm whitespace-pre-wrap text-fg">{v.replace(/\s*\|\s*/g, " · ")}</p></Panel>)}
          <Panel title="Pricing">
            <ul className="divide-y divide-line text-sm">
              {p.items.map((i) => <li key={i.id} className="flex justify-between gap-3 py-2"><span><span className="font-medium">{i.name}</span>{i.description && <span className="block text-xs text-muted">{i.description}</span>}</span><span className="shrink-0 tabular-nums">{fmtMoney(i.amount, p.currency)}</span></li>)}
            </ul>
            <p className="mt-3 flex justify-between border-t border-line pt-2 text-sm font-semibold"><span>Total (incl. tax {fmtMoney(p.taxTotal, p.currency)})</span><span className="tabular-nums">{fmtMoney(p.total, p.currency)}</span></p>
          </Panel>
        </div>
        <div className="min-w-0 space-y-5">
          {open ? (
            <>
              <Panel title="Accept">
                <PortalForm action={portalProposalDecisionAction.bind(null, p.id, "ACCEPTED")} className="space-y-2">
                  <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="confirm" required className="mt-1" /> I am authorised to accept this proposal for {u.clientName}.</label>
                  <SubmitButton>Accept proposal</SubmitButton>
                </PortalForm>
              </Panel>
              <Panel title="Decline">
                <PortalForm action={portalProposalDecisionAction.bind(null, p.id, "REJECTED")} className="space-y-2">
                  <textarea name="reason" rows={3} maxLength={1000} placeholder="Optional feedback" aria-label="Reason" className={`${inputCls} h-auto py-2`} />
                  <SubmitButton variant="secondary">Decline</SubmitButton>
                </PortalForm>
              </Panel>
            </>
          ) : (
            <Panel title="Status"><p className="text-sm text-muted">{p.status === "ACCEPTED" ? `Accepted by ${p.acceptedByName ?? "your team"} on ${fmtDate(p.acceptedAt)}.` : p.status === "REJECTED" ? "Declined." : "This proposal has expired or is no longer open."}</p></Panel>
          )}
        </div>
      </div>
    </>
  );
}
