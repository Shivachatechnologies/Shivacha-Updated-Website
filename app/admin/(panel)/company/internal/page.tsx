import { db } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { DEPARTMENTS, ORG_EMPLOYEES } from "@/lib/company/org";
import { decidePurchaseRequestAction, saveCandidateAction, saveComplianceItemAction, saveJobOpeningAction, saveRiskAction, saveVendorAction, setCandidateStageAction, setComplianceStatusAction, setRiskStatusAction, submitPurchaseRequestAction } from "@/lib/company/actions";
import { fmtMoney } from "@/lib/os/money";
import { DataTable, SelectField, StatusBadge, Tabs, TextArea, TextField, str, type SP } from "@/components/admin/os";
import { EmptyState, PageHeader, fmtDate } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/forms";
import { SubmitButton } from "@/components/admin/client";
import { Card, CompanyTabs, COMPANY_CRUMB } from "@/components/admin/company/ui";

export const metadata = { title: "Internal systems" };
export const dynamic = "force-dynamic";

const TABS = [["recruiting", "Recruiting", "employees:view"], ["procurement", "Procurement & vendors", "finance:view"], ["compliance", "Compliance & legal ops", "contracts:view"], ["risk", "Risk register", "contracts:view"]] as const;
const NEXT_STAGE: Record<string, string[]> = { APPLIED: ["SCREENING", "REJECTED"], SCREENING: ["INTERVIEW", "REJECTED"], INTERVIEW: ["OFFER", "REJECTED"], OFFER: ["HIRED", "WITHDRAWN"] };
const PR_NEXT: Record<string, string[]> = { SUBMITTED: ["APPROVED", "REJECTED"], APPROVED: ["ORDERED", "CANCELLED"], ORDERED: ["RECEIVED"] };
const staff = ORG_EMPLOYEES.filter((e) => ["legal", "technology", "finance", "operations", "people"].includes(e.department)).map((e) => [e.slug, e.jobTitle] as const);

function Buttons({ list, action }: { list: string[]; action: (to: string) => (s: unknown, f: FormData) => Promise<unknown> }) {
  return <div className="flex flex-wrap gap-1">{list.map((to) => <ActionForm key={to} action={action(to) as never}><SubmitButton variant="secondary">{to.charAt(0) + to.slice(1).toLowerCase().replace("_", " ")}</SubmitButton></ActionForm>)}</div>;
}

export default async function InternalPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireAccess("ai:view", "AI_WORKFORCE");
  const sp = await searchParams;
  const allowed = TABS.filter(([, , p]) => can(user.role, p));
  const tab = allowed.find(([k]) => k === str(sp, "tab", 20))?.[0] ?? allowed[0]?.[0];
  return (
    <>
      <PageHeader title="Internal company systems" description="Recruiting, procurement, compliance and risk records that the AI HR, procurement, legal and risk employees work from. Decisions — hiring, purchase approval, compliance sign-off — are always made by people; nothing is bought, paid or signed by the system. No applicant tracking, procurement or e-signature provider is connected." crumbs={[COMPANY_CRUMB, { label: "Internal" }]} />
      <CompanyTabs active="internal" />
      {!tab ? <EmptyState title="No access" description="Your role cannot see these registers." /> : (
        <>
          <div className="mt-4"><Tabs active={tab} items={allowed.map(([k, l]) => ({ key: k, label: l, href: `/admin/company/internal?tab=${k}` }))} /></div>
          <div className="mt-4">{tab === "recruiting" ? <Recruiting manage={can(user.role, "employees:manage")} /> : tab === "procurement" ? <Procurement manage={can(user.role, "finance:manage")} /> : tab === "compliance" ? <Compliance manage={can(user.role, "contracts:manage")} /> : <Risk manage={can(user.role, "contracts:manage")} />}</div>
        </>
      )}
    </>
  );
}

async function Recruiting({ manage }: { manage: boolean }) {
  const [roles, candidates] = await Promise.all([db.jobOpening.findMany({ orderBy: { createdAt: "desc" }, take: 50 }), db.candidate.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { job: { select: { title: true } } } })]);
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <div className="min-w-0 space-y-4">
        <Card title="Open roles">{roles.length ? <DataTable rows={roles} columns={[{ header: "Role", cell: (r) => r.title }, { header: "Location", cell: (r) => r.location ?? "—" }, { header: "Status", cell: (r) => <StatusBadge value={r.status === "OPEN" ? "ACTIVE" : r.status} text={r.status.toLowerCase()} /> }, { header: "Candidates", cell: (r) => candidates.filter((c) => c.jobId === r.id).length }]} /> : <p className="text-sm text-dim">No roles yet.</p>}</Card>
        <Card title="Candidates">{candidates.length ? <DataTable rows={candidates} columns={[{ header: "Candidate", cell: (c) => <span className="font-medium">{c.name}<span className="block text-xs text-dim">{c.job?.title ?? "no role"} · {c.source ?? "—"}</span></span> }, { header: "Stage", cell: (c) => <StatusBadge value={c.stage === "HIRED" ? "DONE" : c.stage === "REJECTED" ? "FAILED" : "IN_PROGRESS"} text={c.stage.toLowerCase()} /> }, { header: "AI screening (draft)", cell: (c) => <span className="line-clamp-3 max-w-sm text-xs text-muted">{c.aiSummary ?? "—"}</span> }, { header: "", cell: (c) => (manage && NEXT_STAGE[c.stage] ? <Buttons list={NEXT_STAGE[c.stage]} action={(to) => setCandidateStageAction.bind(null, c.id, to) as never} /> : null) }]} /> : <p className="text-sm text-dim">No candidates yet.</p>}</Card>
      </div>
      {manage && (
        <div className="space-y-4">
          <Card title="Open a role"><ActionForm action={saveJobOpeningAction} className="space-y-2" resetOnOk><TextField name="title" label="Title" /><SelectField name="departmentKey" label="Department" blank="—" options={DEPARTMENTS.map((d) => [d.key, d.name] as const)} /><TextField name="location" label="Location" /><TextField name="employmentType" label="Type" placeholder="Full time" /><TextArea name="description" label="Description" rows={3} /><SubmitButton>Open role</SubmitButton></ActionForm></Card>
          <Card title="Add a candidate"><ActionForm action={saveCandidateAction} className="space-y-2" resetOnOk><TextField name="name" label="Name" /><TextField name="email" label="Email" /><SelectField name="jobId" label="Role" blank="—" options={roles.map((r) => [r.id, r.title] as const)} /><TextField name="source" label="Source" /><TextArea name="resumeText" label="Resume text (pasted)" rows={3} /><TextArea name="notes" label="Notes" rows={2} /><SubmitButton>Add candidate</SubmitButton></ActionForm><p className="mt-2 text-xs text-dim">The AI Recruiter can add a screening summary as a draft; it never moves candidates or infers protected characteristics.</p></Card>
        </div>
      )}
    </div>
  );
}

async function Procurement({ manage }: { manage: boolean }) {
  const [vendors, reqs] = await Promise.all([db.vendor.findMany({ orderBy: { name: "asc" }, take: 100 }), db.purchaseRequest.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { vendor: { select: { name: true } } } })]);
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <div className="min-w-0 space-y-4">
        <Card title="Purchase requests">{reqs.length ? <DataTable rows={reqs} columns={[{ header: "Request", cell: (r) => <span className="font-medium">{r.title}<span className="block text-xs text-dim">{r.vendor?.name ?? "no vendor"} · {fmtDate(r.createdAt)}</span></span> }, { header: "Amount", cell: (r) => (r.amount ? fmtMoney(r.amount.toString(), r.currency) : "—") }, { header: "Status", cell: (r) => <StatusBadge value={r.status === "SUBMITTED" ? "PENDING" : r.status} text={r.status.toLowerCase()} /> }, { header: "", cell: (r) => (manage && PR_NEXT[r.status] ? <Buttons list={PR_NEXT[r.status]} action={(to) => decidePurchaseRequestAction.bind(null, r.id, to) as never} /> : null) }]} /> : <p className="text-sm text-dim">No requests.</p>}</Card>
        <Card title="Vendors">{vendors.length ? <DataTable rows={vendors} columns={[{ header: "Vendor", cell: (v) => v.name }, { header: "Category", cell: (v) => v.category ?? "—" }, { header: "Risk", cell: (v) => <StatusBadge value={v.riskLevel} /> }, { header: "Status", cell: (v) => <StatusBadge value={v.status === "ACTIVE" ? "ACTIVE" : "PENDING"} text={v.status.toLowerCase().replace("_", " ")} /> }]} /> : <p className="text-sm text-dim">No vendors.</p>}</Card>
      </div>
      <div className="space-y-4">
        <Card title="Submit a purchase request"><ActionForm action={submitPurchaseRequestAction} className="space-y-2" resetOnOk><TextField name="title" label="What" /><SelectField name="vendorId" label="Vendor" blank="—" options={vendors.map((v) => [v.id, v.name] as const)} /><div className="grid grid-cols-2 gap-2"><TextField name="amount" label="Amount" /><TextField name="currency" label="Currency" defaultValue="USD" /></div><TextArea name="justification" label="Justification" rows={3} /><SubmitButton>Submit</SubmitButton></ActionForm><p className="mt-2 text-xs text-dim">Approval by a finance manager (not the requester). The system never places orders or pays.</p></Card>
        {manage && <Card title="Add a vendor"><ActionForm action={saveVendorAction} className="space-y-2" resetOnOk><TextField name="name" label="Name" /><TextField name="category" label="Category" /><TextField name="contactName" label="Contact" /><TextField name="email" label="Email" /><SelectField name="riskLevel" label="Risk" options={[["LOW", "Low"], ["MEDIUM", "Medium"], ["HIGH", "High"]]} /><SubmitButton>Add vendor</SubmitButton></ActionForm></Card>}
      </div>
    </div>
  );
}

async function Compliance({ manage }: { manage: boolean }) {
  const items = await db.complianceItem.findMany({ orderBy: [{ status: "asc" }, { dueDate: "asc" }], take: 200 });
  const now = new Date();
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <Card title="Compliance & legal-operations checklist">{items.length ? <DataTable rows={items} columns={[{ header: "Item", cell: (c) => <span className="font-medium">{c.title}<span className="block text-xs text-dim">{c.framework ?? "—"}{c.ownerSlug ? ` · ${c.ownerSlug}` : ""}</span></span> }, { header: "Due", cell: (c) => (c.dueDate ? <span className={c.dueDate < now && !["DONE", "NOT_APPLICABLE"].includes(c.status) ? "text-red-700" : ""}>{fmtDate(c.dueDate)}</span> : "—") }, { header: "Status", cell: (c) => <StatusBadge value={c.status} /> }, { header: "", cell: (c) => (manage ? <Buttons list={["OPEN", "IN_PROGRESS", "DONE", "NOT_APPLICABLE"].filter((s) => s !== c.status)} action={(to) => setComplianceStatusAction.bind(null, c.id, to) as never} /> : null) }]} /> : <p className="text-sm text-dim">No items. Not legal advice — review obligations with counsel.</p>}</Card>
      {manage && <Card title="Add an item"><ActionForm action={saveComplianceItemAction} className="space-y-2" resetOnOk><TextField name="title" label="Obligation / task" /><TextField name="framework" label="Framework" placeholder="GDPR, SOC2, CONTRACT…" /><SelectField name="ownerSlug" label="AI owner" blank="—" options={staff} /><TextField name="dueDate" type="date" label="Due" /><TextArea name="notes" label="Notes" rows={2} /><SubmitButton>Add</SubmitButton></ActionForm></Card>}
    </div>
  );
}

async function Risk({ manage }: { manage: boolean }) {
  const items = (await db.riskItem.findMany({ take: 200 })).map((r) => ({ ...r, score: r.likelihood * r.impact })).sort((a, b) => b.score - a.score);
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <Card title="Risk register">{items.length ? <DataTable rows={items} columns={[{ header: "Risk", cell: (r) => <span className="font-medium">{r.title}<span className="block text-xs text-dim">{r.category ?? "—"}{r.ownerSlug ? ` · ${r.ownerSlug}` : ""}</span></span> }, { header: "Score", cell: (r) => <span className={r.score >= 15 ? "font-semibold text-red-700" : r.score >= 8 ? "text-amber-700" : ""}>{r.score} ({r.likelihood}×{r.impact})</span> }, { header: "Mitigation", cell: (r) => <span className="text-xs text-muted">{r.mitigation ?? "—"}</span> }, { header: "Status", cell: (r) => <StatusBadge value={r.status === "CLOSED" ? "DONE" : r.status === "OPEN" ? "OPEN" : "IN_PROGRESS"} text={r.status.toLowerCase()} /> }, { header: "", cell: (r) => (manage ? <Buttons list={["MITIGATING", "ACCEPTED", "CLOSED"].filter((s) => s !== r.status)} action={(to) => setRiskStatusAction.bind(null, r.id, to) as never} /> : null) }]} /> : <p className="text-sm text-dim">No risks recorded.</p>}</Card>
      {manage && <Card title="Add a risk"><ActionForm action={saveRiskAction} className="space-y-2" resetOnOk><TextField name="title" label="Risk" /><TextField name="category" label="Category" /><div className="grid grid-cols-2 gap-2"><TextField name="likelihood" type="number" label="Likelihood 1–5" defaultValue={3} /><TextField name="impact" type="number" label="Impact 1–5" defaultValue={3} /></div><SelectField name="ownerSlug" label="AI owner" blank="—" options={staff} /><TextArea name="mitigation" label="Mitigation" rows={2} /><SubmitButton>Add risk</SubmitButton></ActionForm></Card>}
    </div>
  );
}
