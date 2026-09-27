import { db } from "@/lib/db/client";
import { requireAccess } from "@/lib/os/guard";
import { deleteAlertRuleAction, saveAlertRuleAction, toggleAlertRuleAction } from "@/lib/visitors/actions";
import { describeRule, ruleConditionsSchema } from "@/lib/visitors/rules";
import { CheckField, DataTable, SelectField, TextField, userOptions } from "@/components/admin/os";
import { PageHeader, Panel, fmtDate } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/forms";
import { ConfirmButton, SubmitButton } from "@/components/admin/client";
import { NoData } from "@/components/admin/workforce/ui";

export const metadata = { title: "Visitor alert rules" };

export default async function VisitorRulesPage() {
  await requireAccess("visitors:manage");
  const [rules, users, alerts] = await Promise.all([
    db.visitorAlertRule.findMany({ orderBy: { createdAt: "desc" }, include: { _count: { select: { alerts: true } } } }),
    db.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.visitorAlert.findMany({ orderBy: { createdAt: "desc" }, take: 20, include: { rule: { select: { name: true } } } }),
  ]);
  const names = new Map(users.map((u) => [u.id, u.name]));
  return (
    <>
      <PageHeader title="Visitor alert rules" description="Get notified when website activity matches your conditions. Each rule fires at most once per visitor per day." crumbs={[{ label: "Visitors", href: "/admin/visitors" }, { label: "Alert rules" }]} />
      {rules.length ? (
        <DataTable
          rows={rules}
          columns={[
            { header: "Rule", cell: (r) => <span className="font-medium">{r.name}</span> },
            { header: "When", cell: (r) => { const c = ruleConditionsSchema.safeParse(r.conditions); return <span className="text-muted">{c.success ? describeRule(c.data) : "Invalid conditions"}</span>; } },
            { header: "Then", cell: (r) => `${r.action === "CREATE_TASK" ? "Notify + follow-up on linked lead" : "Notify"} ${r.assigneeId ? names.get(r.assigneeId) ?? "user" : "everyone with visitor access"}` },
            { header: "Fired", cell: (r) => r._count.alerts },
            { header: "", cell: (r) => (
              <div className="flex gap-3">
                <ActionForm action={toggleAlertRuleAction.bind(null, r.id, !r.active)}><SubmitButton variant="secondary" className="h-8 px-2 text-xs">{r.active ? "Pause" : "Enable"}</SubmitButton></ActionForm>
                <ActionForm action={deleteAlertRuleAction.bind(null, r.id)}><ConfirmButton message="Delete this rule and its alert history?" confirmLabel="Delete" className="text-xs text-red-700">Delete</ConfirmButton></ActionForm>
              </div>
            ) },
          ]}
        />
      ) : (
        <NoData>No rules yet.</NoData>
      )}
      <Panel title="New rule" className="mt-4">
        <ActionForm action={saveAlertRuleAction.bind(null, null)} resetOnOk className="grid gap-3 sm:grid-cols-3">
          <TextField name="name" label="Rule name" required placeholder="High intent from India" />
          <TextField name="minIntent" type="number" label="Minimum intent score (0–100)" placeholder="60" />
          <TextField name="countries" label="Countries (comma separated)" placeholder="India, United States" />
          <TextField name="pathContains" label="Visited a page containing" placeholder="/pricing" />
          <TextField name="industries" label="Company industries (comma separated)" />
          <div className="flex flex-col justify-end gap-1">
            <CheckField name="returning" label="Returning visitors only" />
            <CheckField name="identifiedCompany" label="Company identified only" />
          </div>
          <SelectField name="action" label="Action" options={[["NOTIFY", "Notify"], ["CREATE_TASK", "Notify and create a follow-up (when linked to a lead)"]]} />
          <SelectField name="assigneeId" label="Notify" blank="Everyone with visitor access" options={userOptions(users)} />
          <div className="flex items-end"><SubmitButton>Create rule</SubmitButton></div>
        </ActionForm>
      </Panel>
      <Panel title="Recent alerts" className="mt-4">
        {alerts.length ? <DataTable rows={alerts} columns={[{ header: "When", cell: (a) => fmtDate(a.createdAt, true) }, { header: "Rule", cell: (a) => a.rule.name }, { header: "Summary", cell: (a) => <a href={`/admin/visitors/${a.visitorId}`} className="text-muted hover:text-fg">{a.summary}</a> }]} /> : <p className="text-sm text-muted">No alerts yet.</p>}
      </Panel>
    </>
  );
}
