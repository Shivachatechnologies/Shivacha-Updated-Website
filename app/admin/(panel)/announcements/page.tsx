import { db } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { deleteAnnouncementAction, saveAnnouncementAction } from "@/lib/workforce/work-actions";
import { SelectField, TextArea, TextField } from "@/components/admin/os";
import { PageHeader, Panel, fmtDate } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/forms";
import { ConfirmButton, SubmitButton } from "@/components/admin/client";
import { NoData } from "@/components/admin/workforce/ui";

export const metadata = { title: "Announcements" };

export default async function AnnouncementsPage() {
  const user = await requireAccess("employees:view");
  const manage = can(user.role, "employees:manage");
  const [items, departments] = await Promise.all([db.announcement.findMany({ orderBy: { publishedAt: "desc" }, take: 100 }), db.department.findMany({ where: { active: true }, select: { id: true, name: true } })]);
  const dept = new Map(departments.map((d) => [d.id, d.name]));
  return (
    <>
      <PageHeader title="Announcements" description="Shown on every employee's portal home and sent as an in-app notification." crumbs={[{ label: "Human Workforce" }, { label: "Announcements" }]} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {items.length ? items.map((a) => (
            <Panel key={a.id} title={a.title} action={manage ? <ActionForm action={deleteAnnouncementAction.bind(null, a.id)}><ConfirmButton message="Remove this announcement?" confirmLabel="Remove" className="text-xs text-red-700">Remove</ConfirmButton></ActionForm> : undefined}>
              <p className="text-sm whitespace-pre-line text-fg">{a.body}</p>
              <p className="mt-2 text-xs text-dim">{fmtDate(a.publishedAt, true)} · {a.departmentId ? dept.get(a.departmentId) ?? "Department" : "Everyone"}{a.expiresAt ? ` · until ${fmtDate(a.expiresAt)}` : ""}</p>
            </Panel>
          )) : <NoData>No announcements.</NoData>}
        </div>
        {manage && (
          <Panel title="New announcement">
            <ActionForm action={saveAnnouncementAction} resetOnOk className="space-y-3">
              <TextField name="title" label="Title" required />
              <TextArea name="body" label="Message" rows={5} required />
              <SelectField name="departmentId" label="Audience" blank="Everyone" options={departments.map((d) => [d.id, d.name] as const)} />
              <TextField name="expiresAt" type="date" label="Show until" />
              <SubmitButton>Publish</SubmitButton>
            </ActionForm>
          </Panel>
        )}
      </div>
    </>
  );
}
