import Link from "next/link";
import { db } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { leadProviders } from "@/lib/growth/providers";
import { addProspectAction, convertProspectAction, importProspectsAction, setProspectStatusAction } from "@/lib/growth/actions";
import { DataTable, NotConnected, SelectField, StatusBadge, Tabs, TextArea, TextField, str, type SP } from "@/components/admin/os";
import { EmptyState, PageHeader, Panel, label } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/forms";
import { SubmitButton } from "@/components/admin/client";
import { GROWTH_CRUMB, GrowthTabs } from "@/components/admin/growth/tabs";

export const metadata = { title: "Prospects" };
export const dynamic = "force-dynamic";

const STATUSES = ["NEW", "RESEARCHED", "CONTACTED", "REPLIED", "CONVERTED", "DISQUALIFIED"] as const;

export default async function ProspectsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireAccess("growth:view", "GROWTH");
  const manage = can(user.role, "growth:manage");
  const sp = await searchParams;
  const status = (STATUSES.find((s) => s === str(sp, "s", 20)) ?? "NEW") as (typeof STATUSES)[number];
  const [rows, counts] = await Promise.all([db.prospect.findMany({ where: { status }, orderBy: { createdAt: "desc" }, take: 100 }), db.prospect.groupBy({ by: ["status"], _count: { _all: true } })]);
  const hunter = leadProviders.hunter.status();
  const apollo = leadProviders.apollo.status();
  const providers = [hunter, apollo].filter((p) => p.connected);
  return (
    <>
      <PageHeader title="Prospects" description="B2B outbound from legitimate data providers (Apollo, Hunter) or your own lists. A contact is not a lead: prospects become CRM leads only after they reply and a person converts them — merged into the existing lead if one exists." crumbs={[GROWTH_CRUMB, { label: "Prospects" }]} />
      <GrowthTabs active="prospects" />
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="min-w-0">
          <Tabs active={status} items={STATUSES.map((s) => ({ key: s, label: label(s), count: counts.find((c) => c.status === s)?._count._all ?? 0, href: `/admin/marketing/prospects?s=${s}` }))} />
          <div className="mt-3">
            {rows.length ? (
              <DataTable
                rows={rows}
                columns={[
                  { header: "Company", cell: (p) => <span className="font-medium">{p.company}{p.domain && <span className="block text-xs text-dim">{p.domain}</span>}</span> },
                  { header: "Contact", cell: (p) => <span>{p.contactName ?? "—"}{p.title && <span className="block text-xs text-dim">{p.title}</span>}</span> },
                  { header: "Email", cell: (p) => <span className="text-xs">{p.email ?? "—"}</span> },
                  { header: "Country", cell: (p) => p.country ?? "—" },
                  { header: "Source", cell: (p) => p.source },
                  { header: "Status", cell: (p) => <StatusBadge value={p.status} /> },
                  {
                    header: "",
                    cell: (p) =>
                      manage ? (
                        <div className="flex flex-wrap gap-1.5">
                          {p.status === "NEW" && <ActionForm action={setProspectStatusAction.bind(null, p.id, "RESEARCHED")}><SubmitButton variant="secondary">Researched</SubmitButton></ActionForm>}
                          {["NEW", "RESEARCHED", "CONTACTED"].includes(p.status) && <ActionForm action={setProspectStatusAction.bind(null, p.id, "REPLIED")}><SubmitButton variant="secondary">Replied</SubmitButton></ActionForm>}
                          {p.status === "REPLIED" && <ActionForm action={convertProspectAction.bind(null, p.id)}><SubmitButton>Convert to lead</SubmitButton></ActionForm>}
                          {p.status !== "DISQUALIFIED" && p.status !== "CONVERTED" && <ActionForm action={setProspectStatusAction.bind(null, p.id, "DISQUALIFIED")}><SubmitButton variant="secondary">Disqualify</SubmitButton></ActionForm>}
                          {p.leadId && <Link className="text-xs text-brand-blue hover:underline" href={`/admin/leads/${p.leadId}`}>Lead</Link>}
                        </div>
                      ) : null,
                  },
                ]}
              />
            ) : (
              <EmptyState title="No prospects here" />
            )}
          </div>
        </div>
        {manage && (
          <div className="min-w-0 space-y-4">
            <Panel title="Import from a provider">
              {providers.length ? (
                <ActionForm action={importProspectsAction} className="space-y-3">
                  <SelectField name="provider" label="Provider" options={providers.map((p) => [p.key, p.name] as const)} />
                  <TextField name="domain" label="Company domain" placeholder="example.com" required />
                  <SubmitButton>Import contacts</SubmitButton>
                </ActionForm>
              ) : (
                <NotConnected name="B2B data providers" env={["APOLLO_API_KEY", "HUNTER_API_KEY"]}>Prospects can still be added by hand. No scraping is ever used.</NotConnected>
              )}
            </Panel>
            <Panel title="Add a prospect">
              <ActionForm action={addProspectAction} className="space-y-3" resetOnOk>
                <TextField name="company" label="Company" required />
                <TextField name="domain" label="Domain" />
                <div className="grid grid-cols-2 gap-2">
                  <TextField name="contactName" label="Contact" />
                  <TextField name="title" label="Title" />
                </div>
                <TextField name="email" label="Business email" />
                <div className="grid grid-cols-2 gap-2">
                  <TextField name="country" label="Country" />
                  <TextField name="industry" label="Industry" />
                </div>
                <TextField name="source" label="Source" placeholder="event, referral, list name…" />
                <TextArea name="notes" label="Notes" rows={3} />
                <SubmitButton variant="secondary">Add prospect</SubmitButton>
              </ActionForm>
            </Panel>
          </div>
        )}
      </div>
    </>
  );
}
