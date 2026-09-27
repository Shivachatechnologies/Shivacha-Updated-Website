import { db } from "@/lib/db/client";
import { requireAccess } from "@/lib/os/guard";
import { findDuplicateGroups } from "@/lib/crm/core";
import { mergeLeadsAction } from "@/lib/crm/actions";
import { EmptyState, PageHeader, Pagination, Panel, fmtDate, label } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/client";
import { ActionForm } from "@/components/admin/forms";
import { MergeChooser } from "@/components/admin/os-client";
import { pageOf, type SP } from "@/components/admin/os";

export const metadata = { title: "Duplicate leads" };

export default async function DuplicatesPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAccess("leads:merge", "ADVANCED_CRM");
  const page = pageOf(await searchParams);
  const { groups, total } = await findDuplicateGroups(page, 20);
  const ids = [...new Set(groups.flatMap((g) => g.ids))];
  const leads = await db.lead.findMany({ where: { id: { in: ids } }, select: { id: true, ref: true, name: true, email: true, phone: true, company: true, status: true, createdAt: true, _count: { select: { notes: true, activities: true, deals: true } } } });
  const byId = new Map(leads.map((l) => [l.id, l]));
  return (
    <>
      <PageHeader title="Duplicate leads" description="Active leads that share an email address or phone number. Merging keeps one record, moves notes, activity, follow-ups and deals onto it, and archives the others — nothing is deleted." crumbs={[{ label: "CRM" }, { label: "Duplicates" }]} />
      {groups.length === 0 ? (
        <Panel><EmptyState title="No duplicates found" description="Leads are compared by email (case-insensitive) and the last 10 digits of the phone number." /></Panel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {groups.map((g) => (
            <Panel key={`${g.by}:${g.key}`} title={`Same ${g.by}: ${g.key}`}>
              <ActionForm action={mergeLeadsAction}>
                <MergeChooser
                  leads={g.ids.map((id) => byId.get(id)).filter((l): l is NonNullable<typeof l> => !!l).map((l) => ({ id: l.id, label: `${l.name} · ${l.ref}`, sub: `${[l.company, l.email, l.phone].filter(Boolean).join(" · ")} · ${label(l.status)} · ${fmtDate(l.createdAt)} · ${l._count.notes} notes, ${l._count.deals} deals` }))}
                />
                <SubmitButton variant="secondary" className="mt-3">Merge selected</SubmitButton>
              </ActionForm>
            </Panel>
          ))}
        </div>
      )}
      <Pagination page={page} pages={Math.max(1, Math.ceil(total / 20))} total={total} makeHref={(p) => `/admin/crm/duplicates?page=${p}`} />
    </>
  );
}
