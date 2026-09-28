import { db } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { DEFAULT_STEPS } from "@/lib/growth/email-rules";
import { parseSteps, SUPPRESSION_REASONS } from "@/lib/growth/email";
import { emailProvider, unsubscribeSecret } from "@/lib/growth/providers";
import { LANGUAGES } from "@/lib/growth/policy";
import { enrollAction, logReplyAction, saveSequenceAction, sendDueEmailsAction, suppressAction, toggleSequenceAction } from "@/lib/growth/actions";
import { DataTable, enumOptions, NotConnected, SelectField, StatusBadge, TextArea, TextField } from "@/components/admin/os";
import { Badge, EmptyState, PageHeader, Panel, fmtDate, label } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/forms";
import { SubmitButton } from "@/components/admin/client";
import { GROWTH_CRUMB, GrowthTabs } from "@/components/admin/growth/tabs";

export const metadata = { title: "Email sequences" };
export const dynamic = "force-dynamic";

export default async function EmailPage() {
  const user = await requireAccess("growth:view", "GROWTH");
  const manage = can(user.role, "growth:manage");
  const [sequences, enrollments, suppressed, suppressedCount] = await Promise.all([
    db.emailSequence.findMany({ orderBy: { createdAt: "desc" }, include: { _count: { select: { enrollments: true } } } }),
    db.sequenceEnrollment.findMany({ orderBy: { updatedAt: "desc" }, take: 30, include: { sequence: { select: { name: true } } } }),
    db.emailSuppression.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
    db.emailSuppression.count(),
  ]);
  const connected = emailProvider.status().connected;
  const signed = !!unsubscribeSecret();
  return (
    <>
      <PageHeader title="Email sequences" description="Nurture and outbound sequences (default Day 0 / 2 / 5 / 9 / 14). Every email has an unsubscribe link; unsubscribes, bounces, complaints and negative replies suppress the address permanently, and any reply stops the sequence so a person takes over." crumbs={[GROWTH_CRUMB, { label: "Email" }]} />
      <GrowthTabs active="email" />
      {(!connected || !signed) && (
        <div className="mt-4 space-y-2">
          {!connected && <NotConnected name="Email sending" env={["SMTP_USER", "SMTP_PASS"]}>Sequences can be built and enrolled, but nothing is sent until email is connected.</NotConnected>}
          {!signed && <NotConnected name="Unsubscribe links" env={["GROWTH_UNSUBSCRIBE_SECRET"]}>Growth emails are blocked until unsubscribe links can be signed.</NotConnected>}
        </div>
      )}
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="min-w-0 space-y-4">
          <Panel title="Sequences" action={manage ? <ActionForm action={sendDueEmailsAction}><SubmitButton variant="secondary">Send due emails now</SubmitButton></ActionForm> : undefined}>
            {sequences.length ? (
              <ul className="space-y-3">
                {sequences.map((s) => {
                  const steps = parseSteps(s.steps);
                  return (
                    <li key={s.id} className="rounded-md border border-line p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-fg">{s.name}</span>
                        <Badge>{label(s.purpose)}</Badge>
                        <Badge>{LANGUAGES[s.language as keyof typeof LANGUAGES] ?? s.language}</Badge>
                        <StatusBadge value={s.active ? "ACTIVE" : "PAUSED"} />
                        <span className="text-xs text-dim">{s._count.enrollments} enrolled · days {steps.map((x) => x.day).join(" / ")}</span>
                      </div>
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-muted">Steps</summary>
                        <ol className="mt-2 space-y-2 text-sm">
                          {steps.map((x, i) => (
                            <li key={i}><span className="text-dim">Day {x.day}:</span> <strong>{x.subject}</strong><p className="text-xs whitespace-pre-wrap text-muted">{x.body}</p></li>
                          ))}
                        </ol>
                      </details>
                      {manage && (
                        <div className="mt-2 flex flex-wrap items-end gap-2">
                          <ActionForm action={toggleSequenceAction.bind(null, s.id, !s.active)}><SubmitButton variant="secondary">{s.active ? "Pause" : "Activate"}</SubmitButton></ActionForm>
                          <ActionForm action={enrollAction.bind(null, s.id)} className="flex flex-wrap items-end gap-2" resetOnOk>
                            <TextField name="email" label="Enroll email" />
                            <SelectField name="tier" label="…or all leads in tier" blank="—" options={[["NURTURE", "Nurture"], ["QUALIFIED", "Qualified"], ["SALES_READY", "Sales-ready"]]} />
                            <SubmitButton variant="secondary">Enroll</SubmitButton>
                          </ActionForm>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState title="No sequences yet" description="Create one on the right; it starts paused." />
            )}
          </Panel>
          <Panel title="Recent enrollments" bodyClassName="p-0">
            {enrollments.length ? (
              <DataTable
                rows={enrollments}
                columns={[
                  { header: "Email", cell: (e) => <span className="text-xs">{e.email}</span> },
                  { header: "Sequence", cell: (e) => e.sequence.name },
                  { header: "Step", cell: (e) => e.step },
                  { header: "Status", cell: (e) => <StatusBadge value={e.status} /> },
                  { header: "Next", cell: (e) => fmtDate(e.nextAt, true) },
                  { header: "Note", cell: (e) => <span className="text-xs text-muted">{e.stopReason ?? ""}</span> },
                ]}
              />
            ) : (
              <p className="p-4 text-sm text-dim">No enrollments yet.</p>
            )}
          </Panel>
        </div>
        {manage && (
          <div className="min-w-0 space-y-4">
            <Panel title="New sequence">
              <ActionForm action={saveSequenceAction.bind(null, null)} className="space-y-3" resetOnOk>
                <TextField name="name" label="Name" required />
                <div className="grid grid-cols-2 gap-2">
                  <SelectField name="purpose" label="Purpose" options={[["NURTURE", "Nurture (inbound)"], ["OUTBOUND", "Outbound"]]} />
                  <SelectField name="language" label="Language" options={Object.entries(LANGUAGES)} />
                </div>
                <TextArea name="steps" label="Steps (JSON, blank = default 5-step nurture)" rows={6} placeholder={JSON.stringify(DEFAULT_STEPS.slice(0, 1))} hint="{{firstName}}, {{name}} and {{company}} are filled in. The unsubscribe footer is added automatically." />
                <SubmitButton>Create sequence</SubmitButton>
              </ActionForm>
            </Panel>
            <Panel title="Log a reply">
              <ActionForm action={logReplyAction} className="space-y-3" resetOnOk>
                <TextField name="email" label="From" required />
                <TextArea name="text" label="Reply text" rows={4} required />
                <SubmitButton variant="secondary">Classify & stop sequence</SubmitButton>
              </ActionForm>
            </Panel>
            <Panel title={`Suppression list (${suppressedCount})`}>
              <ActionForm action={suppressAction} className="mb-3 space-y-2" resetOnOk>
                <TextField name="email" label="Email" required />
                <SelectField name="reason" label="Reason" options={enumOptions(SUPPRESSION_REASONS)} defaultValue="MANUAL" />
                <SubmitButton variant="secondary">Suppress</SubmitButton>
              </ActionForm>
              <ul className="space-y-1 text-xs">
                {suppressed.map((x) => (
                  <li key={x.id} className="flex justify-between gap-2"><span className="truncate">{x.email}</span><span className="text-dim">{label(x.reason)}</span></li>
                ))}
              </ul>
            </Panel>
          </div>
        )}
      </div>
    </>
  );
}
