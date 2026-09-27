import { db } from "@/lib/db/client";
import { requireAccess } from "@/lib/os/guard";
import { createTicketAction } from "@/lib/support/actions";
import { PRIORITIES, TICKET_CATEGORIES } from "@/lib/support/core";
import { PageHeader, Panel } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/client";
import { ActionForm } from "@/components/admin/forms";
import { SelectField, TextArea, TextField, enumOptions, str, userOptions, type SP } from "@/components/admin/os";

export const metadata = { title: "New ticket" };

export default async function NewTicketPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAccess("support:manage", "SUPPORT");
  const sp = await searchParams;
  const [clients, users] = await Promise.all([db.client.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, take: 1000, select: { id: true, name: true } }), db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } })]);
  return (
    <>
      <PageHeader title="New ticket" crumbs={[{ label: "Support", href: "/admin/support" }, { label: "New" }]} />
      <Panel>
        <ActionForm action={createTicketAction} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <TextField name="subject" label="Subject" required maxLength={200} className="sm:col-span-2 lg:col-span-4" />
          <SelectField name="category" label="Category" defaultValue="GENERAL" options={enumOptions(TICKET_CATEGORIES)} />
          <SelectField name="priority" label="Priority" defaultValue="MEDIUM" options={enumOptions(PRIORITIES)} />
          <SelectField name="source" label="Source" defaultValue="EMAIL" options={enumOptions(["EMAIL", "PHONE", "INTERNAL", "WEBSITE"])} />
          <SelectField name="assigneeId" label="Assignee" blank="Unassigned" options={userOptions(users)} />
          <SelectField name="clientId" label="Client" blank="— none —" defaultValue={str(sp, "clientId", 40)} options={clients.map((c) => [c.id, c.name] as const)} />
          <TextField name="contactName" label="Contact name" maxLength={200} />
          <TextField name="contactEmail" label="Contact email" type="email" maxLength={160} />
          <TextArea name="description" label="Description" rows={5} className="sm:col-span-2 lg:col-span-4" />
          <div className="sm:col-span-2 lg:col-span-4"><SubmitButton>Create ticket</SubmitButton></div>
        </ActionForm>
      </Panel>
    </>
  );
}
