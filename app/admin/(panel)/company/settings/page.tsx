import { db } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { getCompanyProfile } from "@/lib/company/profile";
import { COMPANY_TEMPLATES, DEPARTMENTS, REGIONS, TEMPLATE_KEYS, riskTier } from "@/lib/company/org";
import { addCompanyMemoryAction, deleteCompanyMemoryAction, saveCompanyProfileAction, saveDepartmentBudgetAction } from "@/lib/company/actions";
import { ALL_AGENTS } from "@/lib/ai/catalog";
import { getTool } from "@/lib/ai/tools";
import { permissionLabel } from "@/lib/ai/workforce/profiles";
import { aiLimits } from "@/lib/ai/cost";
import { PageHeader, fmtDate } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/forms";
import { SubmitButton } from "@/components/admin/client";
import { CheckField, SelectField, StatusBadge, TextArea, TextField } from "@/components/admin/os";
import { Card, CompanyTabs, COMPANY_CRUMB } from "@/components/admin/company/ui";

export const metadata = { title: "AI company settings" };
export const dynamic = "force-dynamic";

export default async function CompanySettingsPage() {
  const user = await requireAccess("ai:view", "AI_WORKFORCE");
  const manage = can(user.role, "ai:configure");
  const [profile, depts, memory, spend] = await Promise.all([
    getCompanyProfile(),
    db.aIDepartment.findMany({ orderBy: { sort: "asc" } }),
    db.aIEmployeeMemory.findMany({ where: { scope: { in: ["COMPANY", "DEPARTMENT", "REGION"] } }, orderBy: { updatedAt: "desc" }, take: 50 }),
    db.aIUsage.groupBy({ by: ["agentSlug"], where: { createdAt: { gte: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)) } }, _sum: { costUsd: true } }),
  ]);
  const agents = await db.aIAgent.findMany({ select: { slug: true, departmentKey: true } });
  const deptOf = new Map(agents.map((a) => [a.slug, a.departmentKey]));
  const monthSpend = (key: string) => spend.filter((s) => deptOf.get(s.agentSlug) === key).reduce((a, s) => a + Number(s._sum.costUsd ?? 0), 0);
  const tiers = { LOW: new Set<string>(), MEDIUM: new Set<string>(), HIGH: new Set<string>() };
  for (const a of ALL_AGENTS) for (const t of a.tools) {
    const def = getTool(t);
    if (def) tiers[riskTier(def)].add(t);
  }
  const limits = aiLimits();

  return (
    <>
      <PageHeader title="AI company settings" description="Company configuration, governance, budgets and shared memory. Kill switches stay on the Growth → Autonomous Control page and stop the whole AI company." crumbs={[COMPANY_CRUMB, { label: "Settings" }]} />
      <CompanyTabs active="settings" />
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card title="Company configuration">
          {manage ? (
            <ActionForm action={saveCompanyProfileAction} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField name="name" label="Company name" defaultValue={profile.name} />
                <SelectField name="template" label="Business type" options={TEMPLATE_KEYS.map((k) => [k, COMPANY_TEMPLATES[k].label] as const)} defaultValue={profile.template} />
              </div>
              <fieldset>
                <legend className="mb-1 text-[12.5px] font-medium">Departments switched on</legend>
                <div className="grid grid-cols-2 gap-1 text-sm">
                  {DEPARTMENTS.map((d) => (
                    <label key={d.key} className="flex items-center gap-2"><input type="checkbox" name="departments" value={d.key} defaultChecked={profile.departments.includes(d.key)} disabled={d.key === "executive"} /> {d.name}</label>
                  ))}
                </div>
                <p className="mt-1 text-xs text-dim">Switched-off departments receive no delegated work and are left out of playbooks. The Executive office is always on.</p>
              </fieldset>
              <CheckField name="strictApprovals" label="Strict approval mode" defaultChecked={profile.strictApprovals} hint="Every AI change goes to the Approval Center — no autonomous or instant actions, whatever an employee's mode says." />
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField name="dailyDelegationLimit" type="number" label="Delegated tasks per day (company)" defaultValue={profile.dailyDelegationLimit} />
                <TextField name="objectiveTaskLimit" type="number" label="Tasks per objective" defaultValue={profile.objectiveTaskLimit} />
              </div>
              <SubmitButton>Save configuration</SubmitButton>
            </ActionForm>
          ) : (
            <p className="text-sm text-muted">{profile.name} · {COMPANY_TEMPLATES[profile.template].label} · strict approvals {profile.strictApprovals ? "on" : "off"}. Only administrators can change this.</p>
          )}
        </Card>

        <Card title="Governance: action risk tiers">
          <ul className="space-y-2 text-sm">
            <li><StatusBadge value="LOW" text="Low risk" /> <span className="text-muted">internal planning, analysis, read-only research, internal task creation — runs inside each employee&apos;s tools and the requester&apos;s permissions.</span></li>
            <li><StatusBadge value="MEDIUM" text="Medium risk" /> <span className="text-muted">CRM changes, drafts that are stored, scheduling, lead pipeline runs — Approval Center in ASSIST mode; only pre-approved low-risk tools run autonomously.</span></li>
            <li><StatusBadge value="HIGH" text="High risk" /> <span className="text-muted">external communication, publishing — always a person&apos;s approval. Advertising spend, payments, refunds, legal commitments and deletions have no AI tool at all.</span></li>
          </ul>
          <details className="mt-3 text-xs">
            <summary className="cursor-pointer text-dim">Tools by tier ({tiers.LOW.size} low · {tiers.MEDIUM.size} medium · {tiers.HIGH.size} high)</summary>
            {(["HIGH", "MEDIUM", "LOW"] as const).map((k) => <p key={k} className="mt-1.5"><b>{k}</b>: {[...tiers[k]].map(permissionLabel).join(", ")}</p>)}
          </details>
        </Card>

        <Card title="Budgets">
          <p className="mb-2 text-xs text-muted">Company AI limit: ${limits.dailyUsd.toFixed(2)} per UTC day (MAX_DAILY_AI_COST) · {limits.requestTokens.toLocaleString("en-US")} tokens per request. Each employee can also have a daily limit on its profile. Department limits below cover all of a department&apos;s employees for the calendar month.</p>
          <ul className="divide-y divide-line">
            {depts.map((d) => (
              <li key={d.key} className="flex flex-wrap items-end justify-between gap-2 py-2">
                <div className="text-sm">
                  <p className="font-medium">{d.name}</p>
                  <p className="text-xs text-dim">This month: ${monthSpend(d.key).toFixed(2)}{d.monthlyCostLimit != null ? ` of $${Number(d.monthlyCostLimit).toFixed(2)}` : " · no limit"}</p>
                </div>
                {manage && (
                  <ActionForm action={saveDepartmentBudgetAction.bind(null, d.key)} className="flex items-end gap-2">
                    <TextField name="limit" label="USD / month" defaultValue={d.monthlyCostLimit != null ? Number(d.monthlyCostLimit).toFixed(2) : ""} placeholder="no limit" />
                    <SubmitButton variant="secondary">Save</SubmitButton>
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-dim">Email, social and AI growth budgets are enforced atomically on the Growth → Autonomous Control page. Ad spend is not automated, so no ad budget applies.</p>
        </Card>

        <Card title="Company, department & region memory">
          <p className="mb-2 text-xs text-muted">Shared context for AI employees: company memory reaches everyone, department memory only that department, region memory only that region. Employee memory stays private. Credentials are redacted automatically — never store secrets here.</p>
          {manage && (
            <ActionForm action={addCompanyMemoryAction} className="mb-3 space-y-2" resetOnOk>
              <div className="grid gap-2 sm:grid-cols-3">
                <SelectField name="scope" label="Scope" options={[["COMPANY", "Company"], ["DEPARTMENT", "Department"], ["REGION", "Region"]]} />
                <SelectField name="scopeKey" label="Department / region" blank="—" options={[...DEPARTMENTS.map((d) => [d.key, d.name] as const), ...REGIONS.map((r) => [r.key, r.name] as const)]} />
                <SelectField name="kind" label="Kind" options={[["INSTRUCTION", "Instruction"], ["PREFERENCE", "Preference"], ["KNOWLEDGE", "Knowledge"]]} />
              </div>
              <TextField name="title" label="Title" />
              <TextArea name="content" label="Content" rows={3} />
              <SubmitButton variant="secondary">Add memory</SubmitButton>
            </ActionForm>
          )}
          <ul className="divide-y divide-line text-sm">
            {memory.map((m) => (
              <li key={m.id} className="flex items-start justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p><StatusBadge value={m.scope} text={`${m.scope.toLowerCase()}${m.scopeKey ? `: ${m.scopeKey}` : ""}`} /> <span className="font-medium">{m.title}</span></p>
                  <p className="text-xs text-muted">{m.content.slice(0, 240)}</p>
                  <p className="text-[11px] text-dim">{fmtDate(m.updatedAt, true)}{m.expiresAt ? ` · expires ${fmtDate(m.expiresAt)}` : ""}</p>
                </div>
                {manage && <ActionForm action={deleteCompanyMemoryAction.bind(null, m.id)}><SubmitButton variant="secondary">Remove</SubmitButton></ActionForm>}
              </li>
            ))}
            {!memory.length && <li className="py-2 text-dim">No shared memory yet.</li>}
          </ul>
        </Card>
      </div>
    </>
  );
}
