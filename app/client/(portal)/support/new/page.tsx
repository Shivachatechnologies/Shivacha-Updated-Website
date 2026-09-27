import { requirePortalUser } from "@/lib/portal/session";
import { portalProjects } from "@/lib/portal/data";
import { portalCreateTicketAction } from "@/lib/portal/actions";
import { TICKET_CATEGORIES } from "@/lib/support/core";
import { PageHeader, Panel, inputCls, labelCls } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/client";
import { enumOptions } from "@/components/admin/os";
import { PortalForm } from "@/components/portal-forms";

export const metadata = { title: "New ticket" };

export default async function PortalNewTicket() {
  const u = await requirePortalUser();
  const projects = await portalProjects(u);
  const sel = (name: string, l: string, opts: readonly (readonly [string, string])[], def: string) => (
    <div><label htmlFor={name} className={labelCls}>{l}</label><select id={name} name={name} defaultValue={def} className={inputCls}>{opts.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></div>
  );
  return (
    <>
      <PageHeader title="New support ticket" crumbs={[{ label: "Support", href: "/client/support" }, { label: "New" }]} />
      <Panel>
        <PortalForm action={portalCreateTicketAction} className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-3"><label htmlFor="subject" className={labelCls}>Subject</label><input id="subject" name="subject" required maxLength={200} className={inputCls} /></div>
          {sel("category", "Category", enumOptions(TICKET_CATEGORIES), "GENERAL")}
          {sel("priority", "Priority", enumOptions(["LOW", "MEDIUM", "HIGH", "URGENT"]), "MEDIUM")}
          {sel("projectId", "Project", [["", "— none —"], ...projects.map((p) => [p.id, p.name] as const)], "")}
          <div className="sm:col-span-3"><label htmlFor="description" className={labelCls}>Description</label><textarea id="description" name="description" required rows={6} maxLength={10000} className={`${inputCls} h-auto py-2`} /></div>
          <div className="sm:col-span-3"><label htmlFor="files" className={labelCls}>Attachments (optional, up to 3 files, 4 MB each)</label><input id="files" name="files" type="file" multiple className={`${inputCls} h-auto py-1.5`} /></div>
          <div className="sm:col-span-3"><SubmitButton>Create ticket</SubmitButton></div>
        </PortalForm>
      </Panel>
    </>
  );
}
