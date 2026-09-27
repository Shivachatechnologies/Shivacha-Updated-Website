import { requirePermission } from "@/lib/auth/session";
import { assignableRoles } from "@/lib/auth/permissions";
import { saveUserAction } from "@/lib/admin/system-actions";
import { PageHeader, Panel } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/client";
import { ActionForm } from "@/components/admin/forms";
import { UserFields } from "../fields";

export const metadata = { title: "Invite user" };

export default async function NewUser() {
  const actor = await requirePermission("users:manage");
  return (
    <>
      <PageHeader title="Invite user" crumbs={[{ label: "Users", href: "/admin/users" }, { label: "New" }]} />
      <Panel className="max-w-3xl">
        <ActionForm action={saveUserAction.bind(null, null)} className="space-y-4">
          <UserFields roles={assignableRoles(actor.role)} isNew />
          <SubmitButton>Create user</SubmitButton>
        </ActionForm>
      </Panel>
    </>
  );
}
