import Link from "next/link";
import { notFound } from "next/navigation";
import { FileDown } from "lucide-react";
import { db } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { fmtMoney } from "@/lib/os/money";
import { ESIGN_PROVIDERS, activeESignProvider } from "@/lib/sales/esign";
import { archiveContractAction, recordSignatureAction, setContractStatusAction, updateContractAction } from "@/lib/sales/contract-actions";
import { PageHeader, Panel, fmtDate, inputCls } from "@/components/admin/ui";
import { ConfirmButton, SubmitButton } from "@/components/admin/client";
import { ActionForm } from "@/components/admin/forms";
import { KV, NotConnected, StatusBadge } from "@/components/admin/os";
import { ActivityPanel, DocumentsPanel } from "@/components/admin/os-panels";
import { ContractForm } from "@/components/admin/sales/contract-form";

export const metadata = { title: "Contract" };

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAccess("contracts:view", "PROPOSALS");
  const { id } = await params;
  const c = await db.contract.findUnique({ where: { id }, include: { client: { select: { id: true, name: true } }, deal: { select: { id: true, number: true } }, proposal: { select: { id: true, number: true } }, signatures: { orderBy: { createdAt: "desc" } }, documents: { where: { deletedAt: null }, select: { id: true, name: true } } } });
  if (!c || c.deletedAt) notFound();
  const versions = await db.documentVersion.findMany({ where: { entity: "CONTRACT", entityId: c.id }, orderBy: [{ version: "desc" }, { createdAt: "desc" }], take: 20 });
  const manage = can(user.role, "contracts:manage");
  const provider = activeESignProvider();
  const next: Record<string, ("SENT" | "DRAFT" | "ACTIVE" | "EXPIRED" | "TERMINATED")[]> = { DRAFT: ["SENT"], SENT: ["DRAFT"], SIGNED: ["ACTIVE", "TERMINATED"], ACTIVE: ["EXPIRED", "TERMINATED"] };
  return (
    <>
      <PageHeader
        title={c.title}
        description={`${c.number} · version ${c.version} · ${c.client.name}`}
        crumbs={[{ label: "Contracts", href: "/admin/contracts" }, { label: c.number }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge value={c.status} />
            <a href={`/admin/contracts/${c.id}/pdf`} target="_blank" rel="noopener" className="btn-secondary h-9 px-3 text-[13px]"><FileDown className="size-4" aria-hidden /> PDF</a>
            {manage && <form action={archiveContractAction.bind(null, c.id)}><ConfirmButton message="Archive this contract? Versions, signatures and documents are kept.">Archive</ConfirmButton></form>}
          </div>
        }
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          <Panel title="Agreement">
            <KV cols={3} items={[["Value", fmtMoney(c.value, c.currency)], ["Client", <Link key="c" href={`/admin/clients/${c.client.id}`} className="text-brand-blue hover:underline">{c.client.name}</Link>], ["Term", `${fmtDate(c.startDate)} → ${fmtDate(c.endDate)}`], ["Renewal", fmtDate(c.renewalDate)], ["Deal", c.deal ? <Link key="d" href={`/admin/deals/${c.deal.id}`} className="text-brand-blue hover:underline">{c.deal.number}</Link> : null], ["Proposal", c.proposal ? <Link key="p" href={`/admin/proposals/${c.proposal.id}`} className="text-brand-blue hover:underline">{c.proposal.number}</Link> : null]]} />
            {c.terms && c.status !== "DRAFT" && <p className="mt-4 border-t border-line pt-3 text-sm whitespace-pre-wrap text-fg">{c.terms}</p>}
          </Panel>
          {manage && c.status === "DRAFT" && (
            <Panel title="Edit contract">
              <ContractForm action={updateContractAction.bind(null, c.id)} c={c} submit="Save contract" />
            </Panel>
          )}
          <ActivityPanel where={{ contractId: c.id }} note={manage ? { kind: "contract", id: c.id } : undefined} />
        </div>
        <div className="min-w-0 space-y-5">
          <Panel title="Status & signature">
            <KV cols={2} items={[["Status", <StatusBadge key="s" value={c.status} />], ["Signature", <StatusBadge key="g" value={c.signatureStatus} />], ["Signed", fmtDate(c.signedAt)]]} />
            {c.signatures.length > 0 && (
              <ul className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
                {c.signatures.map((s) => <li key={s.id}>{s.signerName} <span className="text-muted">· {s.signerEmail} · {fmtDate(s.signedAt)} · {s.provider}</span></li>)}
              </ul>
            )}
            {manage && next[c.status] && (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
                {next[c.status].map((s) => (
                  <ActionForm key={s} action={setContractStatusAction.bind(null, c.id, s)}>
                    <SubmitButton variant={s === "SENT" || s === "ACTIVE" ? "primary" : "secondary"}>{s === "SENT" ? "Mark sent for signature" : s === "DRAFT" ? "Withdraw & revise" : `Mark ${s.toLowerCase()}`}</SubmitButton>
                  </ActionForm>
                ))}
              </div>
            )}
          </Panel>
          {c.status === "SENT" && (
            <>
              {!provider && <NotConnected name="E-signature" env={ESIGN_PROVIDERS.flatMap((p) => p.env.slice(0, 1))}>No e-signature provider is connected, so signatures are never requested or simulated automatically.</NotConnected>}
              {manage && (
                <Panel title="Record countersigned copy">
                  <ActionForm action={recordSignatureAction.bind(null, c.id)} className="space-y-2">
                    <p className="text-xs text-dim">Upload the signed document below first. The signature is stored with the document as evidence.</p>
                    <input name="signerName" required placeholder="Signer name" aria-label="Signer name" className={inputCls} />
                    <input name="signerEmail" type="email" required placeholder="Signer email" aria-label="Signer email" className={inputCls} />
                    <input name="signedAt" type="date" aria-label="Signed on" className={inputCls} />
                    <select name="documentId" required aria-label="Signed document" className={inputCls} defaultValue="">
                      <option value="" disabled>Signed document…</option>
                      {c.documents.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                    <SubmitButton variant="secondary">Record signature</SubmitButton>
                  </ActionForm>
                </Panel>
              )}
            </>
          )}
          <DocumentsPanel target={{ kind: "contract", id: c.id }} where={{ contractId: c.id }} canManage={manage} />
          <Panel title="Versions">
            {versions.length === 0 ? <p className="text-sm text-dim">Saved when the contract is sent, revised or signed.</p> : <ul className="space-y-1.5 text-sm">{versions.map((v) => <li key={v.id} className="flex justify-between gap-2"><span>v{v.version} · <span className="text-muted">{v.note}</span></span><span className="text-xs text-dim">{fmtDate(v.createdAt)}</span></li>)}</ul>}
          </Panel>
        </div>
      </div>
    </>
  );
}
