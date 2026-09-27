import { db } from "@/lib/db/client";
import { requireAccess } from "@/lib/os/guard";
import { createDealAction } from "@/lib/sales/deal-actions";
import { PageHeader, Panel } from "@/components/admin/ui";
import { DealForm } from "@/components/admin/sales/deal-form";
import { str, type SP } from "@/components/admin/os";

export const metadata = { title: "New deal" };

export default async function NewDealPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAccess("deals:manage", "SALES_PIPELINE");
  const sp = await searchParams;
  const clientId = str(sp, "clientId", 40);
  const client = clientId ? await db.client.findFirst({ where: { id: clientId, deletedAt: null }, select: { id: true, name: true } }) : null;
  return (
    <>
      <PageHeader title="New deal" crumbs={[{ label: "Deals", href: "/admin/deals" }, { label: "New" }]} />
      <Panel>
        <DealForm action={createDealAction} submit="Create deal" defaults={{ clientId: client?.id, company: client?.name }} />
      </Panel>
    </>
  );
}
