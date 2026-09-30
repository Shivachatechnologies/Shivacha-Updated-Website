import Link from "next/link";
import { db } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { progressFrom, OBJECTIVE_STATUSES } from "@/lib/company/objective-status";
import { PLAYBOOKS, type Playbook } from "@/lib/company/objective-rules";
import { createObjectiveAction } from "@/lib/company/actions";
import { EmptyState, PageHeader, fmtDate } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/forms";
import { SubmitButton } from "@/components/admin/client";
import { DataTable, StatusBadge, Tabs, TextArea, TextField, str, type SP } from "@/components/admin/os";
import { CompanyTabs, COMPANY_CRUMB, Meter } from "@/components/admin/company/ui";

export const metadata = { title: "Company objectives" };
export const dynamic = "force-dynamic";

export default async function ObjectivesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireAccess("ai:view", "AI_WORKFORCE");
  const sp = await searchParams;
  const s = OBJECTIVE_STATUSES.find((x) => x === str(sp, "s", 20));
  const [rows, counts] = await Promise.all([db.aIObjective.findMany({ where: s ? { status: s } : {}, orderBy: { createdAt: "desc" }, take: 100 }), db.aIObjective.groupBy({ by: ["status"], _count: { _all: true } })]);
  const tasks = rows.length ? await db.aITask.findMany({ where: { objectiveId: { in: rows.map((r) => r.id) } }, select: { objectiveId: true, status: true } }) : [];
  return (
    <>
      <PageHeader title="Company objectives" description="Every objective the CEO gave the AI company, its plan and real progress. Status is derived from the underlying tasks — never set by hand." crumbs={[COMPANY_CRUMB, { label: "Objectives" }]} />
      <CompanyTabs active="objectives" />
      <div className="mt-4">
        <Tabs active={s ?? "all"} items={[{ key: "all", label: "All", href: "/admin/company/objectives", count: counts.reduce((n, c) => n + c._count._all, 0) }, ...OBJECTIVE_STATUSES.map((k) => ({ key: k, label: k.charAt(0) + k.slice(1).toLowerCase(), href: `/admin/company/objectives?s=${k}`, count: counts.find((c) => c.status === k)?._count._all ?? 0 }))]} />
      </div>
      <div className="mt-3">
        {rows.length ? (
          <DataTable
            rows={rows}
            columns={[
              { header: "Objective", cell: (o) => <Link href={`/admin/company/objectives/${o.id}`} className="font-medium hover:underline">{o.title}</Link> },
              { header: "Playbook", cell: (o) => <span className="text-xs">{PLAYBOOKS[o.playbook as Playbook] ?? o.playbook}</span> },
              { header: "Target", cell: (o) => (o.targetMetric ? <span className="text-xs">{o.targetMetric.replace(/_/g, " ")} = {o.targetValue}</span> : <span className="text-dim">—</span>) },
              {
                header: "Progress",
                className: "w-48",
                cell: (o) => {
                  const p = progressFrom(tasks.filter((t) => t.objectiveId === o.id));
                  return (
                    <div className="min-w-32">
                      <Meter pct={p.pct} tone={o.status === "BLOCKED" ? "red" : o.status === "COMPLETED" ? "green" : "blue"} />
                      <p className="mt-0.5 text-[11px] text-dim">{p.done}/{p.total} done{p.failed ? ` · ${p.failed} failed` : ""}</p>
                    </div>
                  );
                },
              },
              { header: "Status", cell: (o) => <StatusBadge value={o.status} /> },
              { header: "Created", cell: (o) => <span className="text-xs">{fmtDate(o.createdAt, true)}</span> },
            ]}
          />
        ) : (
          <EmptyState title="No objectives" description="Objectives are created from the Command Center." />
        )}
      </div>
      {can(user.role, "executive:view") && (
        <section className="mt-5 max-w-3xl rounded-lg border border-line bg-ink-900 p-4">
          <h2 className="text-sm font-semibold">New objective</h2>
          <ActionForm action={createObjectiveAction} className="mt-3 space-y-3">
            <TextArea name="statement" label="What do you want the company to achieve?" rows={3} required />
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField name="title" label="Short title (optional)" />
              <TextField name="dueAt" type="date" label="Due (optional)" />
            </div>
            <SubmitButton>Plan & start</SubmitButton>
          </ActionForm>
        </section>
      )}
    </>
  );
}
