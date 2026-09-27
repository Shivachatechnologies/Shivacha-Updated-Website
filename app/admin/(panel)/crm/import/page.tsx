import { db } from "@/lib/db/client";
import { requireAccess } from "@/lib/os/guard";
import { importLeadsAction } from "@/lib/crm/actions";
import { PageHeader, Panel, inputCls, labelCls } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/client";
import { ImportForm } from "@/components/admin/os-client";
import { CheckField, SelectField, TextField, userOptions } from "@/components/admin/os";

export const metadata = { title: "Import leads" };

export default async function ImportPage() {
  const user = await requireAccess("leads:import", "ADVANCED_CRM");
  const users = await db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  return (
    <>
      <PageHeader title="Import leads" description="Upload a CSV exported from a spreadsheet, event list or another CRM. Existing leads are never overwritten." crumbs={[{ label: "CRM" }, { label: "Import" }]} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Panel title="Upload CSV">
          <ImportForm action={importLeadsAction}>
            <div>
              <label htmlFor="file" className={labelCls}>CSV file (max 2 MB, 5,000 rows)</label>
              <input id="file" name="file" type="file" accept=".csv,text/csv" required className={`${inputCls} h-auto py-1.5`} />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <SelectField name="duplicates" label="Existing email" defaultValue="skip" options={[["skip", "Skip the row"], ["flag", "Import and tag possible-duplicate"]]} />
              <SelectField name="ownerId" label="Owner" defaultValue={user.id} blank="Unassigned" options={userOptions(users)} />
              <TextField name="source" label="Source label" defaultValue="csv-import" maxLength={120} />
            </div>
            <CheckField name="dryRun" label="Dry run — validate and count without importing" defaultChecked />
            <SubmitButton>Run import</SubmitButton>
          </ImportForm>
        </Panel>
        <Panel title="Columns">
          <p className="text-sm text-muted">The first row must be a header. Required: <b>name</b>, <b>email</b>. Recognised (case-insensitive):</p>
          <p className="mt-2 font-mono text-[12px] leading-relaxed text-fg">phone, company, country, city, website, service, product, budget, source, campaign, message, status, priority, tags, estimated value, currency</p>
          <p className="mt-3 text-xs text-dim">Status and priority must match CRM values (e.g. QUALIFIED, HIGH) or default to NEW / MEDIUM. Tags are separated by commas or semicolons. Imports are audited.</p>
        </Panel>
      </div>
    </>
  );
}
