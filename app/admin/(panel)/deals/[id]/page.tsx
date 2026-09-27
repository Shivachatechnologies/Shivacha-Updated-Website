import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { fmtMoney } from "@/lib/os/money";
import { getFlags } from "@/lib/os/flags";
import { DEAL_STAGES } from "@/lib/crm/constants";
import { archiveDealAction, loseDealAction, reopenDealAction, updateDealAction, winDealAction } from "@/lib/sales/deal-actions";
import { PageHeader, Panel, fmtDate, inputCls, label } from "@/components/admin/ui";
import { ConfirmButton, SubmitButton } from "@/components/admin/client";
import { ActionForm } from "@/components/admin/forms";
import { CheckField, KV, StatusBadge } from "@/components/admin/os";
import { ActivityPanel, DocumentsPanel, RelatedList } from "@/components/admin/os-panels";
import { DealForm } from "@/components/admin/sales/deal-form";
import { AiActions } from "@/components/admin/ai/contextual";
import { cn } from "@/lib/cn";

export const metadata = { title: "Deal" };

export default async function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAccess("deals:view", "SALES_PIPELINE");
  const { id } = await params;
  const deal = await db.deal.findUnique({
    where: { id },
    include: {
      owner: { select: { name: true } },
      client: { select: { id: true, name: true, number: true } },
      lead: { select: { id: true, name: true, ref: true, email: true } },
      proposals: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, select: { id: true, number: true, title: true, status: true, total: true, currency: true } },
      quotes: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, select: { id: true, number: true, title: true, status: true, total: true, currency: true } },
      contracts: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, select: { id: true, number: true, title: true, status: true, value: true, currency: true } },
      projects: { where: { deletedAt: null }, select: { id: true, number: true, name: true, status: true } },
      invoices: { orderBy: { createdAt: "desc" }, select: { id: true, number: true, status: true, total: true, currency: true } },
      tasks: { where: { status: { not: "DONE" } }, orderBy: { dueDate: "asc" }, take: 20, select: { id: true, title: true, dueDate: true, assignee: { select: { name: true } } } },
    },
  });
  if (!deal || deal.deletedAt) notFound();
  const flags = await getFlags();
  const manage = can(user.role, "deals:manage");
  const closed = deal.stage === "WON" || deal.stage === "LOST";
  const idx = DEAL_STAGES.indexOf(deal.stage);
  const weighted = deal.value.times(deal.probability).dividedBy(100);
  const q = (extra: Record<string, string>) => new URLSearchParams({ dealId: deal.id, ...(deal.clientId && { clientId: deal.clientId }), ...extra }).toString();

  return (
    <>
      <PageHeader
        title={deal.name}
        description={`${deal.number} · ${deal.client?.name ?? deal.company ?? "No client yet"} · created ${fmtDate(deal.createdAt)}`}
        crumbs={[{ label: "Deals", href: "/admin/deals" }, { label: deal.number }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge value={deal.stage} />
            {manage && closed && (
              <form action={reopenDealAction.bind(null, deal.id)}>
                <SubmitButton variant="secondary">Reopen</SubmitButton>
              </form>
            )}
            {manage && (
              <form action={archiveDealAction.bind(null, deal.id)}>
                <ConfirmButton message="The deal is hidden from lists and reports. Linked proposals, invoices and projects are kept.">Archive</ConfirmButton>
              </form>
            )}
          </div>
        }
      />

      <ol aria-label="Deal stage" className="mb-5 grid grid-cols-4 gap-1 sm:grid-cols-8">
        {DEAL_STAGES.map((s, i) => (
          <li key={s} className={cn("truncate rounded-md border px-2 py-1.5 text-center text-[11.5px]", s === deal.stage ? (s === "LOST" ? "border-red-400 bg-red-500/10 font-semibold text-red-700" : "border-brand-blue bg-brand-blue/10 font-semibold text-fg") : i < idx && deal.stage !== "LOST" ? "border-line bg-ink-850 text-muted" : "border-line text-dim")}>
            {label(s)}
          </li>
        ))}
      </ol>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-5">
          <Panel title="Summary">
            <KV
              cols={3}
              items={[
                ["Value", fmtMoney(deal.value, deal.currency)],
                ["Probability", `${deal.probability}%`],
                ["Weighted", fmtMoney(weighted, deal.currency)],
                ["Owner", deal.owner?.name],
                ["Expected close", fmtDate(deal.expectedCloseDate)],
                ["In stage since", fmtDate(deal.stageChangedAt)],
                ["Client", deal.client ? <Link className="text-brand-blue hover:underline" href={`/admin/clients/${deal.client.id}`}>{deal.client.name}</Link> : null],
                ["Lead", deal.lead ? <Link className="text-brand-blue hover:underline" href={`/admin/leads/${deal.lead.id}`}>{deal.lead.name} · {deal.lead.ref}</Link> : null],
                ["Country / source", [deal.country, deal.source].filter(Boolean).join(" · ")],
                ["Services", deal.services.join(", ")],
                ["Products", deal.products.join(", ")],
                ["Payment status", label(deal.paymentStatus)],
                ...(deal.stage === "WON" ? ([["Won on", fmtDate(deal.wonAt, true)]] as [string, string][]) : []),
                ...(deal.stage === "LOST" ? ([["Lost reason", deal.lostReason]] as [string, string | null][]) : []),
              ]}
            />
            {deal.notes && <p className="mt-4 border-t border-line pt-3 text-sm whitespace-pre-wrap text-muted">{deal.notes}</p>}
          </Panel>

          {manage && !closed && (
            <div className="grid gap-5 md:grid-cols-2">
              <Panel title="Mark won" className="border-emerald-500/30">
                <ActionForm action={winDealAction.bind(null, deal.id)} className="space-y-3">
                  <p className="text-sm text-muted">Runs as one transaction: the deal is closed, {deal.clientId ? "the client is activated" : "a client is created from the lead"}, and the lead becomes a customer.</p>
                  {flags.PROJECTS && <CheckField name="createProject" label="Also create a project" defaultChecked />}
                  {flags.PROJECTS && <input name="projectName" placeholder="Project name (optional)" aria-label="Project name" maxLength={200} className={inputCls} />}
                  <SubmitButton>Mark as won</SubmitButton>
                </ActionForm>
              </Panel>
              <Panel title="Mark lost">
                <ActionForm action={loseDealAction.bind(null, deal.id)} className="space-y-3">
                  <input name="reason" required maxLength={300} placeholder="Why was it lost? (price, timing, competitor…)" aria-label="Lost reason" className={inputCls} />
                  <SubmitButton variant="secondary">Mark as lost</SubmitButton>
                </ActionForm>
              </Panel>
            </div>
          )}

          {manage && !closed && (
            <Panel title="Edit deal">
              <DealForm action={updateDealAction.bind(null, deal.id)} deal={deal} submit="Save deal" />
            </Panel>
          )}

          <ActivityPanel where={{ dealId: deal.id }} note={manage ? { kind: "deal", id: deal.id } : undefined} />
        </div>

        <div className="min-w-0 space-y-5">
          {flags.AI_WORKFORCE && can(user.role, "ai:execute") && <AiActions entity="Deal" id={deal.id} />}
          {flags.PROPOSALS && (
            <RelatedList
              title="Proposals"
              empty="No proposals yet."
              action={can(user.role, "proposals:manage") && <Link href={`/admin/proposals/new?${q({})}`} className="text-xs font-medium text-brand-blue hover:underline">New</Link>}
              items={deal.proposals.map((p) => ({ id: p.id, href: `/admin/proposals/${p.id}`, label: `${p.number} · ${p.title}`, right: fmtMoney(p.total, p.currency, { compact: true }), status: p.status }))}
            />
          )}
          {flags.PROPOSALS && (
            <RelatedList
              title="Quotes"
              empty="No quotes yet."
              action={can(user.role, "proposals:manage") && <Link href={`/admin/quotes/new?${q({})}`} className="text-xs font-medium text-brand-blue hover:underline">New</Link>}
              items={deal.quotes.map((p) => ({ id: p.id, href: `/admin/quotes/${p.id}`, label: `${p.number} · ${p.title}`, right: fmtMoney(p.total, p.currency, { compact: true }), status: p.status }))}
            />
          )}
          {flags.PROPOSALS && (
            <RelatedList
              title="Contracts"
              empty="No contracts yet."
              action={can(user.role, "contracts:manage") && deal.clientId && <Link href={`/admin/contracts/new?${q({})}`} className="text-xs font-medium text-brand-blue hover:underline">New</Link>}
              items={deal.contracts.map((p) => ({ id: p.id, href: `/admin/contracts/${p.id}`, label: `${p.number} · ${p.title}`, right: fmtMoney(p.value, p.currency, { compact: true }), status: p.status }))}
            />
          )}
          {flags.PROJECTS && <RelatedList title="Projects" empty="No projects yet." items={deal.projects.map((p) => ({ id: p.id, href: `/admin/projects/${p.id}`, label: `${p.number} · ${p.name}`, status: p.status }))} />}
          {flags.FINANCE && can(user.role, "finance:view") && (
            <RelatedList
              title="Invoices"
              empty="No invoices yet."
              action={can(user.role, "finance:manage") && deal.clientId && <Link href={`/admin/finance/invoices/new?${q({})}`} className="text-xs font-medium text-brand-blue hover:underline">New</Link>}
              items={deal.invoices.map((p) => ({ id: p.id, href: `/admin/finance/invoices/${p.id}`, label: p.number, right: fmtMoney(p.total, p.currency, { compact: true }), status: p.status }))}
            />
          )}
          {deal.tasks.length > 0 && (
            <RelatedList title="Open tasks" empty="" items={deal.tasks.map((t) => ({ id: t.id, href: `/admin/tasks?q=${encodeURIComponent(t.title)}`, label: t.title, right: `${t.assignee?.name ?? "Unassigned"}${t.dueDate ? ` · ${fmtDate(t.dueDate)}` : ""}` }))} />
          )}
          <DocumentsPanel target={{ kind: "deal", id: deal.id }} where={{ dealId: deal.id }} canManage={manage} />
        </div>
      </div>
    </>
  );
}
