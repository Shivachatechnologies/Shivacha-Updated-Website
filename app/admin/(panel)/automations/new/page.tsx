import { requireAccess } from "@/lib/os/guard";
import { PageHeader, Panel } from "@/components/admin/ui";
import { AutomationForm } from "@/components/admin/automation-form";

export const metadata = { title: "New automation" };

export default async function NewAutomation() {
  await requireAccess("automations:manage", "AUTOMATIONS");
  return (
    <>
      <PageHeader title="New automation" crumbs={[{ label: "Automations", href: "/admin/automations" }, { label: "New" }]} />
      <Panel><AutomationForm /></Panel>
    </>
  );
}
