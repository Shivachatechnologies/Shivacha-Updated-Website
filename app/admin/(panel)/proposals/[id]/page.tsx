import Link from "next/link";
import { notFound } from "next/navigation";
import { FileDown } from "lucide-react";
import { db } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { CURRENCIES, fmtMoney } from "@/lib/os/money";
import { toDateInput } from "@/lib/os/action";
import { getCatalog } from "@/lib/sales/catalog";
import { extraDiscountOf, linesForEditor } from "@/lib/sales/lines";
import { parseContent } from "@/lib/sales/proposals";
import { approveProposalAction, archiveProposalAction, recordDecisionAction, returnToDraftAction, reviseProposalAction, saveProposalAction, sendProposalAction, submitProposalAction } from "@/lib/sales/proposal-actions";
import { PageHeader, Panel, fmtDate, inputCls } from "@/components/admin/ui";
import { ConfirmButton, SubmitButton } from "@/components/admin/client";
import { ActionForm } from "@/components/admin/forms";
import { CheckField, KV, SelectField, StatusBadge, TextArea, TextField } from "@/components/admin/os";
import { SendLinkForm } from "@/components/admin/os-client";
import { ActivityPanel } from "@/components/admin/os-panels";
import { LineEditor } from "@/components/admin/sales/line-editor";

export const metadata = { title: "Proposal" };

export default async function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAccess("proposals:view", "PROPOSALS");
  const { id } = await params;
  const p = await db.proposal.findUnique({ where: { id }, include: { items: { orderBy: { sortOrder: "asc" } }, client: { select: { id: true, name: true } }, deal: { select: { id: true, name: true, number: true } }, createdBy: { select: { name: true } }, approvedBy: { select: { name: true } } } });
  if (!p || p.deletedAt) notFound();
  const versions = await db.documentVersion.findMany({ where: { entity: "PROPOSAL", entityId: p.id }, orderBy: [{ version: "desc" }, { createdAt: "desc" }], take: 20, select: { id: true, version: true, note: true, createdAt: true } });
  const c = parseContent(p.content);
  const manage = can(user.role, "proposals:manage");
  const approve = can(user.role, "proposals:approve");
  const editable = manage && p.status === "DRAFT";
  const catalog = getCatalog().map(({ kind, slug, name, description }) => ({ kind, slug, name, description }));
  const expired = p.validUntil && p.validUntil < new Date();

  return (
    <>
      <PageHeader
        title={p.title}
        description={`${p.number} · version ${p.version}${p.client ? ` · ${p.client.name}` : ""}${p.aiGenerated ? " · drafted by AI" : ""}`}
        crumbs={[{ label: "Proposals", href: "/admin/proposals" }, { label: p.number }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge value={p.status} />
            <a href={`/admin/proposals/${p.id}/pdf`} target="_blank" rel="noopener" className="btn-secondary h-9 px-3 text-[13px]"><FileDown className="size-4" aria-hidden /> PDF</a>
            {manage && (
              <form action={archiveProposalAction.bind(null, p.id)}>
                <ConfirmButton message="The proposal is archived and its client link stops working. Versions are kept.">Archive</ConfirmButton>
              </form>
            )}
          </div>
        }
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          {editable ? (
            <ActionForm action={saveProposalAction.bind(null, p.id)} className="space-y-5">
              <Panel title="Details">
                <div className="grid gap-4 sm:grid-cols-3">
                  <TextField name="title" label="Title" required defaultValue={p.title} maxLength={200} className="sm:col-span-3" />
                  <SelectField name="currency" label="Currency" defaultValue={p.currency} options={CURRENCIES.map((x) => [x, x] as const)} />
                  <TextField name="validUntil" label="Valid until" type="date" defaultValue={toDateInput(p.validUntil)} />
                </div>
              </Panel>
              <Panel title="Client information">
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField name="clientName" label="Company" defaultValue={c.clientName} maxLength={200} />
                  <TextField name="clientContact" label="Contact person" defaultValue={c.clientContact} maxLength={200} />
                  <TextField name="clientEmail" label="Email" defaultValue={c.clientEmail} maxLength={160} />
                  <TextField name="clientAddress" label="Address" defaultValue={c.clientAddress} maxLength={1000} />
                </div>
              </Panel>
              <Panel title="Proposal content">
                <div className="grid gap-4">
                  <TextArea name="summary" label="Executive summary" defaultValue={c.summary} rows={3} />
                  <TextArea name="scope" label="Scope of work" defaultValue={c.scope} rows={6} />
                  <TextArea name="deliverables" label="Deliverables" defaultValue={c.deliverables} rows={5} hint="One per line" />
                  <TextArea name="assumptions" label="Assumptions" defaultValue={c.assumptions} rows={4} hint="One per line" />
                  <TextArea name="timeline" label="Timeline" defaultValue={c.timeline} rows={3} hint="One per line" />
                  <TextArea name="milestones" label="Milestones" defaultValue={c.milestones} rows={4} hint="One per line: Milestone | Due | Payment" />
                  <TextArea name="paymentSchedule" label="Payment schedule" defaultValue={c.paymentSchedule} rows={3} hint="One per line" />
                  <TextArea name="terms" label="Terms" defaultValue={c.terms} rows={6} />
                </div>
              </Panel>
              <Panel title="Pricing">
                <LineEditor initial={linesForEditor(p.items)} catalog={catalog} currency={p.currency} extraDiscount={extraDiscountOf(p.items, p.discountTotal).toFixed(2)} />
              </Panel>
              <div className="sticky bottom-0 z-10 -mx-1 flex items-center gap-3 border-t border-line bg-ink-950/95 px-1 py-3">
                <SubmitButton>Save draft</SubmitButton>
                <span className="text-xs text-dim">Totals are recalculated on the server.</span>
              </div>
            </ActionForm>
          ) : (
            <>
              <Panel title="Summary">
                <KV cols={3} items={[["Client", c.clientName || p.client?.name], ["Contact", [c.clientContact, c.clientEmail].filter(Boolean).join(" · ")], ["Valid until", <span key="v" className={expired ? "text-red-700" : undefined}>{fmtDate(p.validUntil)}</span>]]} />
                {c.summary && <p className="mt-4 text-sm whitespace-pre-wrap text-fg">{c.summary}</p>}
              </Panel>
              {(["scope", "deliverables", "assumptions", "timeline", "milestones", "paymentSchedule", "terms"] as const).filter((k) => c[k]).map((k) => (
                <Panel key={k} title={{ scope: "Scope of work", deliverables: "Deliverables", assumptions: "Assumptions", timeline: "Timeline", milestones: "Milestones", paymentSchedule: "Payment schedule", terms: "Terms" }[k]}>
                  <p className="text-sm whitespace-pre-wrap text-fg">{c[k]}</p>
                </Panel>
              ))}
              <Panel title="Pricing">
                <LineEditor readOnly initial={linesForEditor(p.items)} catalog={[]} currency={p.currency} extraDiscount={extraDiscountOf(p.items, p.discountTotal).toFixed(2)} />
              </Panel>
            </>
          )}
          <ActivityPanel where={{ proposalId: p.id }} note={manage ? { kind: "proposal", id: p.id } : undefined} />
        </div>

        <div className="min-w-0 space-y-5">
          <Panel title="Workflow">
            <KV
              cols={2}
              items={[
                ["Total", fmtMoney(p.total, p.currency)],
                ["Status", <StatusBadge key="s" value={p.status} />],
                ["Owner", p.createdBy?.name],
                ["Approved", p.approvedAt ? `${p.approvedBy?.name ?? "—"} · ${fmtDate(p.approvedAt)}` : "Not yet"],
                ["Sent", fmtDate(p.sentAt, true)],
                ["Client views", p.viewCount ? `${p.viewCount} · last ${fmtDate(p.lastViewedAt, true)}` : "None"],
                ...(p.acceptedAt ? ([["Accepted", `${p.acceptedByName ?? "—"} · ${fmtDate(p.acceptedAt, true)}`]] as [string, string][]) : []),
                ...(p.rejectedAt ? ([["Rejected", `${fmtDate(p.rejectedAt)}${p.rejectionReason ? ` — ${p.rejectionReason}` : ""}`]] as [string, string][]) : []),
                ["Deal", p.deal ? <Link key="d" href={`/admin/deals/${p.deal.id}`} className="text-brand-blue hover:underline">{p.deal.number}</Link> : null],
              ]}
            />
            <div className="mt-4 space-y-3 border-t border-line pt-4">
              {manage && p.status === "DRAFT" && (
                <ActionForm action={submitProposalAction.bind(null, p.id)}>
                  <SubmitButton variant="secondary">Submit for internal review</SubmitButton>
                  <p className="mt-1 text-xs text-dim">Save your changes first. A reviewer with approval rights must approve before sending.</p>
                </ActionForm>
              )}
              {p.status === "INTERNAL_REVIEW" && !p.approvedAt && (
                <div className="flex flex-wrap gap-2">
                  {approve && (
                    <ActionForm action={approveProposalAction.bind(null, p.id)}>
                      <SubmitButton>Approve</SubmitButton>
                    </ActionForm>
                  )}
                  {manage && (
                    <ActionForm action={returnToDraftAction.bind(null, p.id)}>
                      <SubmitButton variant="secondary">Return to draft</SubmitButton>
                    </ActionForm>
                  )}
                  {!approve && <p className="text-xs text-dim">Waiting for someone with approval rights.</p>}
                </div>
              )}
              {manage && ((p.status === "INTERNAL_REVIEW" && p.approvedAt) || p.status === "SENT" || p.status === "VIEWED") && !expired && (
                <SendLinkForm action={sendProposalAction.bind(null, p.id)}>
                  <CheckField name="sendEmail" label="Email the link to the client" defaultChecked={p.status === "INTERNAL_REVIEW"} />
                  <input name="email" type="email" defaultValue={c.clientEmail} placeholder="client@company.com" aria-label="Recipient email" className={inputCls} />
                  <SubmitButton>{p.status === "INTERNAL_REVIEW" ? "Send proposal" : "Generate a new link"}</SubmitButton>
                </SendLinkForm>
              )}
              {manage && (p.status === "SENT" || p.status === "VIEWED") && (
                <ActionForm action={recordDecisionAction.bind(null, p.id)} className="space-y-2 border-t border-line pt-3">
                  <p className="text-xs font-medium text-muted">Client replied outside the link?</p>
                  <select name="decision" aria-label="Decision" className={inputCls}>
                    <option value="ACCEPTED">Accepted</option>
                    <option value="REJECTED">Rejected</option>
                  </select>
                  <input name="by" required placeholder="Client name" aria-label="Decided by" className={inputCls} />
                  <input name="note" placeholder="Note / reason" aria-label="Note" className={inputCls} />
                  <SubmitButton variant="secondary">Record decision</SubmitButton>
                </ActionForm>
              )}
              {manage && ["SENT", "VIEWED", "REJECTED", "EXPIRED"].includes(p.status) && (
                <ActionForm action={reviseProposalAction.bind(null, p.id)}>
                  <SubmitButton variant="secondary">Create new version</SubmitButton>
                  <p className="mt-1 text-xs text-dim">Keeps v{p.version} in history, disables the current link and reopens as a draft.</p>
                </ActionForm>
              )}
              {p.status === "ACCEPTED" && can(user.role, "contracts:manage") && p.clientId && (
                <Link href={`/admin/contracts/new?${new URLSearchParams({ proposalId: p.id, clientId: p.clientId, ...(p.dealId && { dealId: p.dealId }) })}`} className="btn-primary h-9 px-3.5 text-[13px]">Create contract</Link>
              )}
            </div>
          </Panel>
          <Panel title="Versions">
            {versions.length === 0 ? (
              <p className="text-sm text-dim">A snapshot is saved at review, send and every decision.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {versions.map((v) => (
                  <li key={v.id} className="flex justify-between gap-2">
                    <span className="text-fg">v{v.version} · <span className="text-muted">{v.note}</span></span>
                    <span className="shrink-0 text-xs text-dim">{fmtDate(v.createdAt, true)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
