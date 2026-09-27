import { db } from "@/lib/db/client";
import { requireAccess } from "@/lib/os/guard";
import { createContractAction } from "@/lib/sales/contract-actions";
import { parseContent } from "@/lib/sales/proposals";
import { PageHeader, Panel } from "@/components/admin/ui";
import { ContractForm } from "@/components/admin/sales/contract-form";
import { str, type SP } from "@/components/admin/os";

export const metadata = { title: "New contract" };

export default async function NewContractPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAccess("contracts:manage", "PROPOSALS");
  const sp = await searchParams;
  const proposal = str(sp, "proposalId", 40) ? await db.proposal.findUnique({ where: { id: str(sp, "proposalId", 40) } }) : null;
  const deal = str(sp, "dealId", 40) ? await db.deal.findUnique({ where: { id: str(sp, "dealId", 40) } }) : null;
  return (
    <>
      <PageHeader title="New contract" crumbs={[{ label: "Contracts", href: "/admin/contracts" }, { label: "New" }]} />
      <Panel>
        <ContractForm
          action={createContractAction}
          submit="Create contract"
          defaults={{
            clientId: str(sp, "clientId", 40) || proposal?.clientId || deal?.clientId || undefined,
            dealId: deal?.id ?? proposal?.dealId ?? undefined,
            proposalId: proposal?.id,
            title: proposal ? `${proposal.title} — Agreement` : deal ? `${deal.name} — Agreement` : "",
            value: (proposal?.total ?? deal?.value)?.toString(),
            currency: proposal?.currency ?? deal?.currency,
          }}
        />
        {proposal && <p className="mt-3 text-xs text-dim">Terms from the proposal: {parseContent(proposal.content).terms.split("\n")[0]}…</p>}
      </Panel>
    </>
  );
}
