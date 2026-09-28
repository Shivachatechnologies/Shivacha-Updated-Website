import { db } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { savePartnerAction } from "@/lib/growth/actions";
import { DataTable, SelectField, StatusBadge, TextArea, TextField, enumOptions } from "@/components/admin/os";
import { EmptyState, PageHeader, Panel, label } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/forms";
import { SubmitButton } from "@/components/admin/client";
import { GROWTH_CRUMB, GrowthTabs } from "@/components/admin/growth/tabs";

export const metadata = { title: "Partners" };
export const dynamic = "force-dynamic";

const TYPES = ["REFERRAL", "RESELLER", "TECHNOLOGY", "AGENCY", "COMMUNITY", "MEDIA"] as const;
const STATUSES = ["PROSPECT", "CONTACTED", "ACTIVE", "PAUSED", "ENDED"] as const;

export default async function PartnersPage() {
  const user = await requireAccess("growth:view", "GROWTH");
  const manage = can(user.role, "growth:manage");
  const partners = await db.growthPartner.findMany({ orderBy: [{ status: "asc" }, { updatedAt: "desc" }], take: 200 });
  const referred = await db.lead.groupBy({ by: ["utmCampaign"], where: { archivedAt: null, utmMedium: "referral" }, _count: { _all: true } });
  return (
    <>
      <PageHeader title="Partners" description="Referral, reseller, technology, agency, community and media partners. Give each partner a UTM link (medium “referral”, campaign = partner key) so their leads are attributed." crumbs={[GROWTH_CRUMB, { label: "Partners" }]} />
      <GrowthTabs active="partners" />
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="min-w-0 space-y-4">
          {partners.length ? (
            <DataTable
              rows={partners}
              columns={[
                { header: "Partner", cell: (p) => <span className="font-medium">{p.name}{p.website && <span className="block text-xs text-dim">{p.website}</span>}</span> },
                { header: "Type", cell: (p) => label(p.type) },
                { header: "Status", cell: (p) => <StatusBadge value={p.status} /> },
                { header: "Contact", cell: (p) => <span className="text-xs">{[p.contactName, p.email].filter(Boolean).join(" · ") || "—"}</span> },
                { header: "Country", cell: (p) => p.country ?? "—" },
              ]}
            />
          ) : (
            <EmptyState title="No partners yet" />
          )}
          <Panel title="Referral leads by campaign key">
            {referred.length ? (
              <ul className="space-y-1 text-sm">
                {referred.map((r) => (
                  <li key={r.utmCampaign ?? "none"} className="flex justify-between"><span>{r.utmCampaign ?? "(no campaign key)"}</span><span className="tabular-nums">{r._count._all}</span></li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-dim">No referral-attributed leads yet.</p>
            )}
          </Panel>
        </div>
        {manage && (
          <Panel title="Add partner">
            <ActionForm action={savePartnerAction} className="space-y-3" resetOnOk>
              <TextField name="name" label="Name" required />
              <div className="grid grid-cols-2 gap-2">
                <SelectField name="type" label="Type" options={enumOptions(TYPES)} />
                <SelectField name="status" label="Status" options={enumOptions(STATUSES)} />
              </div>
              <TextField name="website" label="Website" placeholder="https://…" />
              <div className="grid grid-cols-2 gap-2">
                <TextField name="contactName" label="Contact" />
                <TextField name="email" label="Email" />
              </div>
              <TextField name="country" label="Country" />
              <TextArea name="terms" label="Terms (commission, territory…)" rows={3} />
              <TextArea name="notes" label="Notes" rows={3} />
              <SubmitButton>Save partner</SubmitButton>
            </ActionForm>
          </Panel>
        )}
      </div>
    </>
  );
}
