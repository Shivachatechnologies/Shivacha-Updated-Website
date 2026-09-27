import { requirePermission } from "@/lib/auth/session";
import { FEATURE_FLAGS, FLAG_KEYS, getFlags } from "@/lib/os/flags";
import { saveFeatureFlagsAction } from "@/lib/os/platform-actions";
import { PageHeader, Panel } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/client";
import { ActionForm } from "@/components/admin/forms";
import { CheckField } from "@/components/admin/os";

export const metadata = { title: "Feature flags" };

export default async function FeatureFlagsPage() {
  await requirePermission("settings:manage");
  const flags = await getFlags();
  return (
    <>
      <PageHeader title="Feature flags" description="Switch Shivacha OS modules on or off for everyone. Flags never grant access — permissions are always enforced separately, and switching a module off never deletes data." crumbs={[{ label: "Settings", href: "/admin/settings" }, { label: "Feature flags" }]} />
      <Panel>
        <ActionForm action={saveFeatureFlagsAction} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {FLAG_KEYS.map((k) => (
              <CheckField key={k} name={k} defaultChecked={flags[k]} label={FEATURE_FLAGS[k]} hint={k} />
            ))}
          </div>
          <SubmitButton>Save flags</SubmitButton>
        </ActionForm>
      </Panel>
    </>
  );
}
