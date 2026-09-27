import { requirePortalUser } from "@/lib/portal/session";
import { portalChangePasswordAction, portalProfileAction } from "@/lib/portal/actions";
import { PageHeader, Panel, inputCls, labelCls } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/client";
import { PortalForm } from "@/components/portal-forms";

export const metadata = { title: "Profile" };

export default async function PortalProfile() {
  const u = await requirePortalUser();
  return (
    <>
      <PageHeader title="Profile" description={`${u.email} · ${u.clientName}`} />
      <div className="grid gap-5 md:grid-cols-2">
        <Panel title="Your details">
          <PortalForm action={portalProfileAction} className="space-y-3">
            <div><label htmlFor="name" className={labelCls}>Name</label><input id="name" name="name" defaultValue={u.name} required maxLength={200} className={inputCls} /></div>
            <SubmitButton>Save</SubmitButton>
          </PortalForm>
        </Panel>
        <Panel title="Change password">
          <PortalForm action={portalChangePasswordAction} className="space-y-3">
            <div><label htmlFor="current" className={labelCls}>Current password</label><input id="current" name="current" type="password" autoComplete="current-password" required className={inputCls} /></div>
            <div><label htmlFor="password" className={labelCls}>New password</label><input id="password" name="password" type="password" autoComplete="new-password" required minLength={12} className={inputCls} /></div>
            <div><label htmlFor="confirm" className={labelCls}>Confirm new password</label><input id="confirm" name="confirm" type="password" autoComplete="new-password" required className={inputCls} /></div>
            <SubmitButton>Change password</SubmitButton>
          </PortalForm>
        </Panel>
      </div>
    </>
  );
}
