import Link from "next/link";
import { notFound } from "next/navigation";
import { Mail, MessageCircle, Phone } from "lucide-react";
import { db } from "@/lib/db/client";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { LEAD_PRIORITIES, LEAD_STATUSES } from "@/lib/admin/leads";
import { addNoteAction, assignLeadAction, markContactedAction, scheduleFollowUpAction, setFollowUpStatusAction, updateLeadAction } from "@/lib/admin/lead-actions";
import { Badge, LEAD_STATUS_TONE, PRIORITY_TONE, PageHeader, Panel, fmtDate, inputCls, label, labelCls } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/client";
import { ActionForm, FieldError } from "@/components/admin/forms";
import { convertLeadAction } from "@/lib/crm/actions";
import { LIFECYCLE_STAGES } from "@/lib/crm/constants";
import { CURRENCIES, fmtMoney } from "@/lib/os/money";
import { getFlags } from "@/lib/os/flags";
import { StatusBadge } from "@/components/admin/os";

export const metadata = { title: "Lead" };

const ACTIVITY: Record<string, string> = {
  CREATED: "Lead received from the website",
  UPDATED: "Details updated",
  STATUS_CHANGED: "Status changed",
  PRIORITY_CHANGED: "Priority changed",
  ASSIGNED: "Assignment changed",
  NOTE_ADDED: "Note added",
  CONTACTED: "Contact logged",
  FOLLOWUP_SCHEDULED: "Follow-up scheduled",
  FOLLOWUP_DONE: "Follow-up completed",
  FOLLOWUP_UPDATED: "Follow-up updated",
  ARCHIVE: "Archived",
  UNARCHIVE: "Restored",
  CONVERTED_TO_DEAL: "Converted to deal",
  MERGED: "Merged another lead into this one",
  MERGED_INTO: "Merged into another lead",
  EMAIL_SENT: "Email sent",
  CALL_LOGGED: "Call logged",
  AI_ANALYSIS: "AI analysis",
};

function describe(type: string, data: unknown, users: Map<string, string>) {
  const d = (data ?? {}) as Record<string, unknown>;
  if ((type === "STATUS_CHANGED" || type === "PRIORITY_CHANGED") && d.to) return `${label(String(d.from))} → ${label(String(d.to))}`;
  if ((type === "STATUS_CHANGED" || type === "PRIORITY_CHANGED") && d.value) return `→ ${label(String(d.value))}${d.bulk ? " (bulk)" : ""}`;
  if (type === "ASSIGNED") {
    const to = (d.to ?? d.value) as string | null;
    return to && to !== "unassigned" ? `→ ${users.get(to) ?? "user"}` : "→ unassigned";
  }
  if (type === "CONTACTED" && d.channel) return `via ${d.channel === "whatsapp" ? "WhatsApp" : d.channel}`;
  if (type === "FOLLOWUP_SCHEDULED" && d.dueAt) return `for ${fmtDate(String(d.dueAt), true)}`;
  if (type === "CONVERTED_TO_DEAL" && d.number) return String(d.number);
  if ((type === "MERGED" && d.from) || (type === "MERGED_INTO" && d.into)) return String(d.from ?? d.into);
  return "";
}

const toLocal = (d: Date | null) => (d ? d.toISOString().slice(0, 16) : "");

export default async function LeadDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("leads:view");
  const { id } = await params;
  const lead = await db.lead.findUnique({
    where: { id },
    include: {
      assignedTo: { select: { id: true, name: true } },
      notes: { orderBy: { createdAt: "desc" }, take: 100, include: { author: { select: { name: true } } } },
      activities: { orderBy: { createdAt: "desc" }, take: 100, include: { actor: { select: { name: true } } } },
      followUps: { orderBy: { dueAt: "asc" }, include: { assignedTo: { select: { name: true } } } },
      deals: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, number: true, name: true, stage: true, value: true, currency: true } },
      tasks: { where: { status: { not: "DONE" } }, orderBy: { dueDate: "asc" }, take: 20, select: { id: true, title: true, status: true, dueDate: true, assignee: { select: { name: true } } } },
      client: { select: { id: true, name: true, number: true } },
    },
  });
  if (!lead) notFound();
  const flags = await getFlags();
  const users = await db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const userMap = new Map(users.map((u) => [u.id, u.name]));
  const caps = { edit: can(user.role, "leads:edit"), assign: can(user.role, "leads:assign"), followups: can(user.role, "followups:manage"), deals: flags.SALES_PIPELINE && can(user.role, "deals:manage"), viewDeals: flags.SALES_PIPELINE && can(user.role, "deals:view") };
  const digits = lead.phone?.replace(/[^\d]/g, "") ?? "";
  const extra = lead.extra && typeof lead.extra === "object" && !Array.isArray(lead.extra) ? Object.entries(lead.extra as Record<string, unknown>).filter(([, v]) => v != null && v !== "" && !(Array.isArray(v) && v.length === 0)) : [];
  const now = new Date();

  const Field = ({ k, v, wide }: { k: string; v: React.ReactNode; wide?: boolean }) => (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-[11.5px] font-medium tracking-wide text-dim uppercase">{k}</dt>
      <dd className="mt-0.5 text-sm break-words text-fg">{v || "—"}</dd>
    </div>
  );
  const input = (name: string, l: string, v: string | null | undefined, type = "text") => (
    <div>
      <label htmlFor={`f-${name}`} className={labelCls}>{l}</label>
      <input id={`f-${name}`} name={name} type={type} defaultValue={v ?? ""} className={inputCls} />
      <FieldError name={name} />
    </div>
  );

  return (
    <>
      <PageHeader
        title={lead.name}
        description={`${lead.ref} · received ${fmtDate(lead.createdAt, true)}${lead.archivedAt ? " · archived" : ""}`}
        crumbs={[{ label: "Leads", href: "/admin/leads" }, { label: lead.name }]}
        actions={
          <div className="flex flex-wrap gap-2">
            <Badge tone={LEAD_STATUS_TONE[lead.status]}>{label(lead.status)}</Badge>
            <Badge tone={PRIORITY_TONE[lead.priority]}>{label(lead.priority)} priority</Badge>
            {lead.scoreLabel && <Badge tone="violet">{lead.scoreLabel}{lead.score != null ? ` · ${lead.score}` : ""}</Badge>}
          </div>
        }
      />

      <div className="mb-5 flex flex-wrap gap-2">
        <a href={`mailto:${lead.email}?subject=${encodeURIComponent(`Your enquiry to Shivacha Technologies (${lead.ref})`)}`} className="btn-secondary h-9 px-3 text-[13px]">
          <Mail className="size-4" aria-hidden /> Email
        </a>
        {digits && (
          <a href={`https://wa.me/${digits}`} target="_blank" rel="noopener noreferrer" className="btn-secondary h-9 px-3 text-[13px]">
            <MessageCircle className="size-4" aria-hidden /> WhatsApp
          </a>
        )}
        {lead.phone && (
          <a href={`tel:${lead.phone.replace(/[^\d+]/g, "")}`} className="btn-secondary h-9 px-3 text-[13px]">
            <Phone className="size-4" aria-hidden /> Call
          </a>
        )}
        {caps.edit && (
          <ActionForm action={markContactedAction.bind(null, lead.id)} className="flex items-center gap-1.5">
            <select name="channel" aria-label="Contact channel" className="h-9 rounded-md border border-line-strong bg-ink-900 px-2 text-[13px] text-fg">
              <option value="email">Email</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="call">Call</option>
            </select>
            <SubmitButton variant="secondary">Log contact</SubmitButton>
          </ActionForm>
        )}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-5">
          <Panel title="Contact & company">
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field k="Name" v={lead.name} />
              <Field k="Email" v={<a className="text-brand-blue hover:underline" href={`mailto:${lead.email}`}>{lead.email}</a>} />
              <Field k="Phone / WhatsApp" v={lead.phone} />
              <Field k="Company" v={lead.company} />
              <Field k="Country" v={[lead.city, lead.country].filter(Boolean).join(", ")} />
              <Field k="Website" v={lead.website ? <a className="text-brand-blue hover:underline" href={lead.website} target="_blank" rel="noopener noreferrer nofollow">{lead.website}</a> : null} />
              <Field k="Form" v={label(lead.formType)} />
              <Field k="Lifecycle stage" v={label(lead.lifecycleStage)} />
              <Field k="Team" v={lead.team} />
              <Field k="Tags" v={lead.tags.length ? lead.tags.map((t) => <Link key={t} href={`/admin/leads?tag=${encodeURIComponent(t)}`} className="mr-1 inline-block rounded bg-ink-800 px-1.5 text-xs text-muted hover:text-fg">{t}</Link>) : null} />
              {lead.client && <Field k="Client" v={<Link className="text-brand-blue hover:underline" href={`/admin/clients/${lead.client.id}`}>{lead.client.name} · {lead.client.number}</Link>} />}
            </dl>
          </Panel>

          <Panel title="Requirement">
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field k="Service" v={lead.service} />
              <Field k="Product" v={lead.product} />
              <Field k="Budget" v={lead.budget} />
              <Field k="Estimated value" v={lead.estimatedValue ? fmtMoney(lead.estimatedValue, lead.currency) : null} />
              <Field k="Message" v={lead.message ? <span className="whitespace-pre-wrap">{lead.message}</span> : null} wide />
              {extra.map(([k, v]) => (
                <Field key={k} k={k} v={typeof v === "string" ? v : JSON.stringify(v)} />
              ))}
            </dl>
          </Panel>

          <Panel title="Attribution">
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field k="Source" v={lead.source} />
              <Field k="Campaign" v={lead.campaign ?? lead.utmCampaign} />
              <Field k="Landing page" v={lead.landingPage} />
              <Field k="Referrer" v={lead.referrer} />
              <Field k="UTM source / medium" v={[lead.utmSource, lead.utmMedium].filter(Boolean).join(" / ")} />
              <Field k="UTM term / content" v={[lead.utmTerm, lead.utmContent].filter(Boolean).join(" / ")} />
            </dl>
          </Panel>

          {caps.edit && (
            <Panel title="Edit lead">
              <ActionForm action={updateLeadAction.bind(null, lead.id)} className="grid gap-4 sm:grid-cols-2">
                {input("name", "Name", lead.name)}
                {input("email", "Email", lead.email, "email")}
                {input("company", "Company", lead.company)}
                {input("phone", "Phone", lead.phone)}
                {input("country", "Country", lead.country)}
                {input("budget", "Budget", lead.budget)}
                {input("service", "Service", lead.service)}
                {input("product", "Product", lead.product)}
                <div>
                  <label htmlFor="f-status" className={labelCls}>Status</label>
                  <select id="f-status" name="status" defaultValue={lead.status} className={inputCls}>
                    {LEAD_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="f-priority" className={labelCls}>Priority</label>
                  <select id="f-priority" name="priority" defaultValue={lead.priority} className={inputCls}>
                    {LEAD_PRIORITIES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
                  </select>
                </div>
                {input("estimatedValue", "Estimated value", lead.estimatedValue ? String(lead.estimatedValue) : "")}
                <div>
                  <label htmlFor="f-currency" className={labelCls}>Currency</label>
                  <select id="f-currency" name="currency" defaultValue={lead.currency} className={inputCls}>
                    {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="f-lifecycleStage" className={labelCls}>Lifecycle stage</label>
                  <select id="f-lifecycleStage" name="lifecycleStage" defaultValue={lead.lifecycleStage} className={inputCls}>
                    {LIFECYCLE_STAGES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
                  </select>
                </div>
                {input("city", "City", lead.city)}
                {input("website", "Website", lead.website)}
                {input("team", "Team", lead.team)}
                {input("tags", "Tags (comma separated)", lead.tags.join(", "))}
                {input("lastContactedAt", "Last contacted (UTC)", toLocal(lead.lastContactedAt), "datetime-local")}
                {input("nextFollowUpAt", "Next follow-up (UTC)", toLocal(lead.nextFollowUpAt), "datetime-local")}
                <div className="sm:col-span-2">
                  <label htmlFor="f-message" className={labelCls}>Message</label>
                  <textarea id="f-message" name="message" rows={4} defaultValue={lead.message ?? ""} className={`${inputCls} h-auto py-2`} />
                  <FieldError name="message" />
                </div>
                <div className="sm:col-span-2">
                  <SubmitButton>Save changes</SubmitButton>
                </div>
              </ActionForm>
            </Panel>
          )}
        </div>

        <div className="min-w-0 space-y-5">
          {caps.viewDeals && (
            <Panel title="Deals">
              {lead.deals.length === 0 ? (
                <p className="text-sm text-dim">No deals yet.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {lead.deals.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-2">
                      <Link href={`/admin/deals/${d.id}`} className="min-w-0 truncate font-medium text-fg hover:text-brand-blue">{d.number} · {d.name}</Link>
                      <span className="flex shrink-0 items-center gap-2"><span className="text-xs text-muted tabular-nums">{fmtMoney(d.value, d.currency, { compact: true })}</span><StatusBadge value={d.stage} /></span>
                    </li>
                  ))}
                </ul>
              )}
              {caps.deals && !lead.archivedAt && (
                <ActionForm action={convertLeadAction.bind(null, lead.id)} className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
                  <input name="name" placeholder="Deal name (optional)" aria-label="Deal name" maxLength={200} className={`${inputCls} min-w-0 flex-1`} />
                  <SubmitButton variant="secondary">Convert to deal</SubmitButton>
                </ActionForm>
              )}
            </Panel>
          )}
          {lead.tasks.length > 0 && (
            <Panel title="Open tasks">
              <ul className="space-y-1.5 text-sm">
                {lead.tasks.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-fg">{t.title}</span>
                    <span className="shrink-0 text-xs text-dim">{t.assignee?.name ?? "Unassigned"}{t.dueDate ? ` · ${fmtDate(t.dueDate)}` : ""}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          <Panel title="Sales">
            <dl className="grid grid-cols-2 gap-4">
              <Field k="Owner" v={lead.assignedTo?.name} />
              <Field k="Last contacted" v={fmtDate(lead.lastContactedAt, true)} />
              <Field k="Next follow-up" v={lead.nextFollowUpAt ? <span className={lead.nextFollowUpAt < now ? "text-red-700" : undefined}>{fmtDate(lead.nextFollowUpAt, true)}</span> : null} />
              <Field k="Updated" v={fmtDate(lead.updatedAt, true)} />
            </dl>
            {caps.assign && (
              <ActionForm action={assignLeadAction.bind(null, lead.id)} className="mt-4 flex gap-2 border-t border-line pt-4">
                <select name="assignedToId" defaultValue={lead.assignedToId ?? ""} aria-label="Assign to" className={inputCls}>
                  <option value="">Unassigned</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
                <SubmitButton variant="secondary">Assign</SubmitButton>
              </ActionForm>
            )}
          </Panel>

          <Panel title="Follow-ups">
            {lead.followUps.length === 0 ? (
              <p className="text-sm text-dim">No follow-ups scheduled.</p>
            ) : (
              <ul className="space-y-2">
                {lead.followUps.map((fu) => (
                  <li key={fu.id} className="rounded-md border border-line p-2.5 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className={fu.status === "PENDING" && fu.dueAt < now ? "font-medium text-red-700" : "font-medium text-fg"}>{fmtDate(fu.dueAt, true)}</span>
                      <Badge tone={fu.status === "DONE" ? "green" : fu.status === "CANCELLED" ? "gray" : fu.dueAt < now ? "red" : "blue"}>{fu.status === "PENDING" && fu.dueAt < now ? "Overdue" : label(fu.status)}</Badge>
                    </div>
                    {fu.note && <p className="mt-1 text-muted">{fu.note}</p>}
                    <p className="mt-1 text-xs text-dim">{fu.assignedTo?.name ?? "Unassigned"}</p>
                    {caps.followups && fu.status === "PENDING" && (
                      <div className="mt-2 flex gap-2">
                        <form action={setFollowUpStatusAction.bind(null, fu.id, "DONE")}>
                          <SubmitButton variant="secondary" className="h-7 px-2 text-xs">Mark done</SubmitButton>
                        </form>
                        <form action={setFollowUpStatusAction.bind(null, fu.id, "CANCELLED")}>
                          <SubmitButton variant="secondary" className="h-7 px-2 text-xs">Cancel</SubmitButton>
                        </form>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {caps.followups && (
              <ActionForm action={scheduleFollowUpAction.bind(null, lead.id)} resetOnOk className="mt-4 grid grid-cols-2 gap-2 border-t border-line pt-4">
                <div>
                  <label htmlFor="fu-date" className={labelCls}>Date</label>
                  <input id="fu-date" type="date" name="date" required className={inputCls} />
                  <FieldError name="date" />
                </div>
                <div>
                  <label htmlFor="fu-time" className={labelCls}>Time (UTC)</label>
                  <input id="fu-time" type="time" name="time" className={inputCls} />
                </div>
                <div className="col-span-2">
                  <label htmlFor="fu-user" className={labelCls}>Owner</label>
                  <select id="fu-user" name="assignedToId" defaultValue={user.id} className={inputCls}>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label htmlFor="fu-note" className={labelCls}>Note</label>
                  <input id="fu-note" name="note" placeholder="What needs to happen?" className={inputCls} />
                </div>
                <div className="col-span-2">
                  <SubmitButton variant="secondary">Schedule follow-up</SubmitButton>
                </div>
              </ActionForm>
            )}
          </Panel>

          <Panel title="Notes">
            {caps.edit && (
              <ActionForm action={addNoteAction.bind(null, lead.id)} resetOnOk className="mb-4">
                <label htmlFor="note-body" className="sr-only">New note</label>
                <textarea id="note-body" name="body" rows={3} placeholder="Add an internal note…" className={`${inputCls} h-auto py-2`} />
                <FieldError name="body" />
                <SubmitButton variant="secondary" className="mt-2">Add note</SubmitButton>
              </ActionForm>
            )}
            {lead.notes.length === 0 ? (
              <p className="text-sm text-dim">No notes yet.</p>
            ) : (
              <ul className="space-y-3">
                {lead.notes.map((n) => (
                  <li key={n.id} className="border-l-2 border-line-strong pl-3">
                    <p className="text-sm whitespace-pre-wrap text-fg">{n.body}</p>
                    <p className="mt-1 text-xs text-dim">{n.author?.name ?? "Former user"} · {fmtDate(n.createdAt, true)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Activity">
            <ol className="relative space-y-3 border-l border-line pl-4">
              {lead.activities.map((a) => (
                <li key={a.id} className="relative">
                  <span aria-hidden className="absolute top-1.5 -left-[21px] size-2 rounded-full bg-brand-blue" />
                  <p className="text-sm text-fg">
                    {ACTIVITY[a.type] ?? label(a.type)} <span className="text-muted">{describe(a.type, a.data, userMap)}</span>
                  </p>
                  <p className="text-xs text-dim">{a.actor?.name ?? "System"} · {fmtDate(a.createdAt, true)}</p>
                </li>
              ))}
            </ol>
            {lead.activities.length === 0 && <p className="text-sm text-dim">No activity recorded.</p>}
          </Panel>
          <p className="text-xs text-dim">
            <Link href="/admin/leads" className="hover:text-fg">← Back to leads</Link>
          </p>
        </div>
      </div>
    </>
  );
}
