import { requireAccess } from "@/lib/os/guard";
import { createClientAction } from "@/lib/clients/actions";
import { PageHeader, Panel } from "@/components/admin/ui";
import { ClientForm } from "@/components/admin/clients/client-form";

export const metadata = { title: "New client" };

export default async function NewClientPage() {
  await requireAccess("clients:manage");
  return (
    <>
      <PageHeader title="New client" crumbs={[{ label: "Clients", href: "/admin/clients" }, { label: "New" }]} />
      <Panel><ClientForm action={createClientAction} submit="Create client" withContact /></Panel>
    </>
  );
}
