import Link from "next/link";
import { db } from "@/lib/db/client";
import { can, type Permission } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { agentBySlug } from "@/lib/ai/catalog";
import { refreshInsightsAction, setInsightStatusAction } from "@/lib/ai/actions";
import { PageHeader, fmtDate } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/forms";
import { SubmitButton } from "@/components/admin/client";
import { DataTable, StatusBadge, Tabs, pick, type SP } from "@/components/admin/os";

export const metadata = { title: "AI Insights" };
const TABS = ["OPEN", "DISMISSED", "ACTED"] as const;

export default async function InsightsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireAccess("ai:view", "AI_WORKFORCE");
  const status = pick(await searchParams, "status", TABS) ?? "OPEN";
  const rows = (await db.aIRecommendation.findMany({ where: { status }, orderBy: [{ severity: "desc" }, { updatedAt: "desc" }], take: 300 })).filter((r) => can(user.role, r.permission as Permission));
  return (
    <>
      <PageHeader title="Proactive insights" description="Computed from live records by deterministic rules (stale high-value leads, stalled deals, overdue invoices, SLA breaches, project risk…). Refreshed daily; resolved conditions close automatically." crumbs={[{ label: "AI", href: "/admin/ai" }, { label: "Insights" }]} actions={can(user.role, "ai:execute") ? <ActionForm action={refreshInsightsAction}><SubmitButton variant="secondary">Refresh now</SubmitButton></ActionForm> : undefined} />
      <Tabs active={status} items={TABS.map((t) => ({ key: t, label: t === "ACTED" ? "Resolved" : t.charAt(0) + t.slice(1).toLowerCase(), href: `/admin/ai/insights?status=${t}` }))} />
      {rows.length === 0 ? <p className="text-sm text-muted">Nothing here.</p> : (
        <DataTable rows={rows} columns={[
          { header: "Insight", cell: (r) => <div>{r.href ? <Link href={r.href} className="font-medium text-fg hover:underline">{r.title}</Link> : <span className="font-medium text-fg">{r.title}</span>}{r.body && <p className="text-xs text-muted">{r.body}</p>}</div> },
          { header: "Severity", cell: (r) => <StatusBadge value={r.severity} /> },
          { header: "Agent", cell: (r) => <span className="text-muted">{agentBySlug(r.agentSlug)?.name ?? r.agentSlug}</span> },
          { header: "Updated", cell: (r) => <span className="text-muted">{fmtDate(r.updatedAt, true)}</span> },
          { header: "", cell: (r) => <form action={setInsightStatusAction.bind(null, r.id, r.status === "OPEN" ? "DISMISSED" : "OPEN")}><button type="submit" className="text-xs text-dim hover:text-fg">{r.status === "OPEN" ? "Dismiss" : "Reopen"}</button></form> },
        ]} />
      )}
    </>
  );
}
