import { requireAccess } from "@/lib/os/guard";
import { saveCampaignAction } from "@/lib/marketing/actions";
import { PageHeader, Panel } from "@/components/admin/ui";
import { CampaignForm } from "@/components/admin/marketing/campaign-form";

export const metadata = { title: "New campaign" };

export default async function NewCampaign() {
  await requireAccess("marketing:manage", "MARKETING_ANALYTICS");
  return (
    <>
      <PageHeader title="New campaign" crumbs={[{ label: "Campaigns", href: "/admin/marketing/campaigns" }, { label: "New" }]} />
      <Panel><CampaignForm action={saveCampaignAction.bind(null, null)} submit="Create campaign" /></Panel>
    </>
  );
}
