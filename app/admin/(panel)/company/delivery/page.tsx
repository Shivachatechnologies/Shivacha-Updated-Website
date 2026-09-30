import Link from "next/link";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { clientHealth, collectionsQueue, projectHealth } from "@/lib/company/delivery";
import { fmtMoney } from "@/lib/os/money";
import { DataTable, Kpi, KpiGrid, StatusBadge } from "@/components/admin/os";
import { EmptyState, PageHeader } from "@/components/admin/ui";
import { Card, CompanyTabs, COMPANY_CRUMB } from "@/components/admin/company/ui";

export const metadata = { title: "Delivery autonomy" };
export const dynamic = "force-dynamic";

export default async function DeliveryPage() {
  const user = await requireAccess("projects:view", "AI_WORKFORCE");
  const [projects, clients, collections] = await Promise.all([projectHealth(), can(user.role, "clients:view") ? clientHealth() : Promise.resolve(null), can(user.role, "finance:view") ? collectionsQueue(30) : Promise.resolve(null)]);
  const mismatch = projects.filter((p) => p.computed !== p.recorded);
  return (
    <>
      <PageHeader title="Delivery autonomy" description="Project health, blockers, client health and collections computed from project tasks, milestones, issues, tickets and invoices. The AI COO, project manager, customer and finance teams work from these; client messages and payment reminders always need approval." crumbs={[COMPANY_CRUMB, { label: "Delivery" }]} />
      <CompanyTabs active="delivery" />
      <div className="mt-4">
        <KpiGrid cols={4}>
          <Kpi label="Projects RED (computed)" value={projects.filter((p) => p.computed === "RED").length} tone={projects.some((p) => p.computed === "RED") ? "red" : undefined} />
          <Kpi label="Blocked tasks" value={projects.reduce((a, p) => a + p.blockedTasks, 0)} />
          <Kpi label="Health differs from record" value={mismatch.length} hint="computed vs recorded" />
          <Kpi label="Clients at risk" value={clients ? clients.filter((c) => c.label === "AT_RISK").length : "—"} />
        </KpiGrid>
      </div>
      <div className="mt-5 space-y-4">
        <Card title="Project health">
          {projects.length ? <DataTable rows={projects} columns={[{ header: "Project", cell: (p) => <Link className="font-medium hover:underline" href={p.href}>{p.number} {p.name}<span className="block text-xs text-dim">{p.client}</span></Link> }, { header: "Computed", cell: (p) => <StatusBadge value={p.computed} /> }, { header: "Recorded", cell: (p) => <StatusBadge value={p.recorded} /> }, { header: "Progress", cell: (p) => `${p.progress}%` }, { header: "Signals", cell: (p) => <span className="text-xs text-muted">{p.signals.join(" · ") || "—"}</span> }]} /> : <EmptyState title="No active projects" />}
        </Card>
        <div className="grid gap-4 xl:grid-cols-2">
          {clients && (
            <Card title="Client health">
              {clients.length ? <DataTable rows={clients} columns={[{ header: "Client", cell: (c) => <Link className="hover:underline" href={c.href}>{c.name}</Link> }, { header: "Score", cell: (c) => c.score }, { header: "Status", cell: (c) => <StatusBadge value={c.label === "AT_RISK" ? "RED" : c.label === "WATCH" ? "AMBER" : "GREEN"} text={c.label.toLowerCase().replace("_", " ")} /> }, { header: "Signals", cell: (c) => <span className="text-xs text-muted">{c.signals.join(" · ") || "—"}</span> }]} /> : <p className="text-sm text-dim">No active clients.</p>}
            </Card>
          )}
          {collections && (
            <Card title="Collections queue">
              {collections.length ? <DataTable rows={collections} columns={[{ header: "Invoice", cell: (r) => <Link className="hover:underline" href={r.href}>{r.number}</Link> }, { header: "Client", cell: (r) => r.client }, { header: "Balance", cell: (r) => fmtMoney(String(r.balance), r.currency) }, { header: "Overdue", cell: (r) => `${r.daysOverdue}d` }]} /> : <p className="text-sm text-dim">No overdue invoices.</p>}
              <p className="mt-2 text-xs text-dim">The AI Collections Specialist drafts reminders; every reminder email needs a person&apos;s approval.</p>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
