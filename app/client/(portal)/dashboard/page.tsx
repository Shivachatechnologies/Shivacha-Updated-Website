import Link from "next/link";
import { requirePortalUser } from "@/lib/portal/session";
import { portalDashboard } from "@/lib/portal/data";
import { byCurrency, fmtMoney, fmtMulti } from "@/lib/os/money";
import { PageHeader, Panel, fmtDate } from "@/components/admin/ui";
import { Kpi, KpiGrid, StatusBadge } from "@/components/admin/os";

export const metadata = { title: "Dashboard" };

export default async function PortalDashboard() {
  const u = await requirePortalUser();
  const d = await portalDashboard(u);
  const now = new Date();
  const outstanding = byCurrency(d.invoices, (i) => i.currency, (i) => i.balanceDue);
  const overdue = d.invoices.filter((i) => i.dueDate && i.dueDate < now);
  return (
    <>
      <PageHeader title={`Welcome, ${u.name.split(" ")[0]}`} description="Your projects, documents, invoices and support with Shivacha." />
      <KpiGrid cols={4}>
        <Kpi label="Active projects" value={d.projects.length} href="/client/projects" />
        <Kpi label="Outstanding" value={fmtMulti(outstanding, true)} hint={`${d.invoices.length} open invoice${d.invoices.length === 1 ? "" : "s"}`} href="/client/invoices" tone={overdue.length ? "red" : undefined} />
        <Kpi label="Open tickets" value={d.tickets} href="/client/support" />
        <Kpi label="Proposals to review" value={d.proposals.length} href="/client/proposals" tone={d.proposals.length ? "amber" : undefined} />
      </KpiGrid>
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Panel title="Projects">
          {d.projects.length === 0 ? <p className="text-sm text-dim">No active projects.</p> : (
            <ul className="space-y-3">
              {d.projects.map((p) => (
                <li key={p.id}>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <Link href={`/client/projects/${p.id}`} className="min-w-0 truncate font-medium text-fg hover:text-brand-blue">{p.name}</Link>
                    <StatusBadge value={p.status} />
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-ink-800"><div className="h-full rounded-full bg-brand-blue" style={{ width: `${p.progress}%` }} /></div>
                  <p className="mt-1 text-xs text-dim">{p.progress}% · target {fmtDate(p.targetDate)}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Invoices due">
          {d.invoices.length === 0 ? <p className="text-sm text-dim">Nothing outstanding.</p> : (
            <ul className="divide-y divide-line text-sm">
              {d.invoices.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2 py-2">
                  <Link href={`/client/invoices/${i.id}`} className="font-medium text-fg hover:text-brand-blue">{i.number}</Link>
                  <span className={i.dueDate && i.dueDate < now ? "text-red-700" : "text-muted"}>{fmtMoney(i.balanceDue, i.currency)} · due {fmtDate(i.dueDate)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        {d.proposals.length > 0 && (
          <Panel title="Proposals awaiting your decision">
            <ul className="space-y-2 text-sm">
              {d.proposals.map((p) => <li key={p.id}><Link href={`/client/proposals/${p.id}`} className="font-medium text-fg hover:text-brand-blue">{p.number} · {p.title}</Link> <span className="text-xs text-dim">valid until {fmtDate(p.validUntil)}</span></li>)}
            </ul>
          </Panel>
        )}
        <Panel title="Need help?">
          <p className="text-sm text-muted">Open a support ticket or message your account team.</p>
          <div className="mt-3 flex gap-2">
            <Link href="/client/support/new" className="btn-primary h-9 px-3.5 text-[13px]">New ticket</Link>
            <Link href="/client/messages" className="btn-secondary h-9 px-3 text-[13px]">Messages{d.messages ? ` (${d.messages} recent)` : ""}</Link>
          </div>
        </Panel>
      </div>
    </>
  );
}
