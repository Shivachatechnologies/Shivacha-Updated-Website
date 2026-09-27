import Link from "next/link";
import { db } from "@/lib/db/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { DEFAULT_SLA, PRIORITIES, TICKET_CATEGORIES, TICKET_STATUSES, slaPolicy, slaState } from "@/lib/support/core";
import { saveSlaAction } from "@/lib/support/actions";
import { PageHeader, Panel, fmtDate, inputCls, label } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/client";
import { ActionForm } from "@/components/admin/forms";
import { Kpi, KpiGrid, LinkCell, ListView, StatusBadge, Tabs, pageOf, pick, str, PAGE_SIZE, type SP } from "@/components/admin/os";

export const metadata = { title: "Support" };
const SLA_TEXT: Record<string, string> = { BREACHED: "SLA breached", AT_RISK: "SLA at risk", ON_TRACK: "On track", MET: "SLA met", NONE: "—" };
const SLA_TONE: Record<string, string> = { BREACHED: "CRITICAL", AT_RISK: "HIGH", ON_TRACK: "ACTIVE", MET: "COMPLETED", NONE: "DRAFT" };

export default async function SupportPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireAccess("support:view", "SUPPORT");
  const sp = await searchParams;
  const view = str(sp, "view", 10) === "sla" ? "sla" : "queue";
  const values = { q: str(sp, "q", 80), status: pick(sp, "status", [...TICKET_STATUSES, "ACTIVE"] as const), priority: pick(sp, "priority", PRIORITIES), category: pick(sp, "category", TICKET_CATEGORIES), mine: str(sp, "mine", 1), sla: pick(sp, "sla", ["breached"] as const), page: str(sp, "page") };
  const now = new Date();
  const where: Prisma.TicketWhereInput = {
    ...(values.status === "ACTIVE" ? { status: { in: ["OPEN", "IN_PROGRESS", "WAITING_FOR_CLIENT"] } } : values.status ? { status: values.status } : {}),
    ...(values.priority && { priority: values.priority }),
    ...(values.category && { category: values.category }),
    ...(values.mine && { assigneeId: user.id }),
    ...(values.sla && { status: { in: ["OPEN", "IN_PROGRESS", "WAITING_FOR_CLIENT"] }, OR: [{ resolutionDueAt: { lt: now } }, { firstResponseAt: null, firstResponseDueAt: { lt: now } }] }),
    ...(values.q && { AND: [{ OR: [{ subject: { contains: values.q, mode: "insensitive" } }, { number: { contains: values.q, mode: "insensitive" } }, { contactEmail: { contains: values.q, mode: "insensitive" } }, { client: { name: { contains: values.q, mode: "insensitive" } } }] }] }),
  };
  const page = pageOf(sp);
  const active = { status: { in: ["OPEN", "IN_PROGRESS", "WAITING_FOR_CLIENT"] as ("OPEN" | "IN_PROGRESS" | "WAITING_FOR_CLIENT")[] } };
  const [total, rows, open, breached, unassigned, resolvedWeek, policy] = await Promise.all([
    db.ticket.count({ where }),
    db.ticket.findMany({ where, orderBy: [{ resolutionDueAt: { sort: "asc", nulls: "last" } }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { client: { select: { name: true } }, assignee: { select: { name: true } } } }),
    db.ticket.count({ where: active }),
    db.ticket.count({ where: { ...active, OR: [{ resolutionDueAt: { lt: now } }, { firstResponseAt: null, firstResponseDueAt: { lt: now } }] } }),
    db.ticket.count({ where: { ...active, assigneeId: null } }),
    db.ticket.count({ where: { resolvedAt: { gte: new Date(now.getTime() - 7 * 86400_000) } } }),
    slaPolicy(),
  ]);
  const manage = can(user.role, "support:manage");
  const tabs = <Tabs active={view} items={[{ key: "queue", label: "Queue", href: "/admin/support" }, { key: "sla", label: "SLA targets", href: "/admin/support?view=sla" }]} />;
  if (view === "sla")
    return (
      <>
        <PageHeader title="Support" crumbs={[{ label: "Support" }]} />
        {tabs}
          <Panel title="SLA targets (hours)" className="mb-5">
            <ActionForm action={saveSlaAction} className="space-y-3">
              <table className="w-full max-w-lg text-sm">
                <thead><tr className="text-left text-xs text-dim uppercase"><th className="py-1">Priority</th><th className="py-1">First response</th><th className="py-1">Resolution</th></tr></thead>
                <tbody>{PRIORITIES.map((p) => <tr key={p}><td className="py-1">{label(p)}</td><td className="py-1 pr-2"><input name={`${p}:response`} defaultValue={policy[p].response} aria-label={`${p} response hours`} disabled={!manage} className={inputCls} /></td><td className="py-1"><input name={`${p}:resolution`} defaultValue={policy[p].resolution} aria-label={`${p} resolution hours`} disabled={!manage} className={inputCls} /></td></tr>)}</tbody>
              </table>
              <p className="text-xs text-dim">Defaults: {PRIORITIES.map((p) => `${label(p)} ${DEFAULT_SLA[p].response}h/${DEFAULT_SLA[p].resolution}h`).join(" · ")}</p>
              {manage && <SubmitButton>Save SLA targets</SubmitButton>}
            </ActionForm>
          </Panel>
      </>
    );
  return (
    <ListView
      title="Support"
      description="Client tickets from the portal, email, phone and internal teams, with SLA tracking."
      crumbs={[{ label: "Support" }]}
      tabs={tabs}
      actions={manage && <Link href="/admin/support/new" className="btn-primary h-9 px-3.5 text-[13px]">New ticket</Link>}
      above={<div className="mb-5"><KpiGrid cols={4}><Kpi label="Active tickets" value={open} href="/admin/support?status=ACTIVE" /><Kpi label="SLA breached" value={breached} tone={breached ? "red" : undefined} href="/admin/support?sla=breached" /><Kpi label="Unassigned" value={unassigned} tone={unassigned ? "amber" : undefined} /><Kpi label="Resolved (7 days)" value={resolvedWeek} tone="green" /></KpiGrid></div>}
      values={values}
      filters={[
        { type: "search", name: "q", placeholder: "Search subject, number, contact, client…" },
        { type: "select", name: "status", label: "Any status", options: [["ACTIVE", "Active (not resolved)"], ...TICKET_STATUSES.map((s) => [s, label(s)] as const)] },
        { type: "select", name: "priority", label: "Any priority", options: PRIORITIES.map((s) => [s, label(s)] as const) },
        { type: "select", name: "category", label: "Any category", options: TICKET_CATEGORIES.map((s) => [s, label(s)] as const) },
        { type: "select", name: "mine", label: "Everyone", options: [["1", "Assigned to me"]] },
        { type: "select", name: "sla", label: "Any SLA", options: [["breached", "Breached"]] },
      ]}
      rows={rows}
      total={total}
      page={page}
      basePath="/admin/support"
      empty={{ title: "No tickets", description: "Tickets from the client portal and your team appear here." }}
      columns={[
        { header: "Ticket", cell: (t) => <LinkCell href={`/admin/support/${t.id}`} sub={`${t.number} · ${t.client?.name ?? t.contactEmail ?? label(t.source)}`}>{t.subject}</LinkCell> },
        { header: "Status", cell: (t) => <StatusBadge value={t.status} /> },
        { header: "Priority", cell: (t) => <StatusBadge value={t.priority} /> },
        { header: "Category", cell: (t) => <span className="text-muted">{label(t.category)}</span> },
        { header: "SLA", cell: (t) => { const s = slaState(t, now); return <StatusBadge value={SLA_TONE[s]} text={SLA_TEXT[s]} />; } },
        { header: "Due", cell: (t) => <span className="whitespace-nowrap text-muted">{fmtDate(!t.firstResponseAt ? t.firstResponseDueAt : t.resolutionDueAt, true)}</span> },
        { header: "Assignee", cell: (t) => <span className="text-muted">{t.assignee?.name ?? "—"}</span> },
      ]}
    />
  );
}
