import Link from "next/link";
import { db } from "@/lib/db/client";
import { requireAccess } from "@/lib/os/guard";
import { AGENTS } from "@/lib/ai/catalog";
import { displayName, ensureEmployees } from "@/lib/ai/workforce/employees";
import { employeePerformance } from "@/lib/ai/workforce/performance";
import { PageHeader, Panel } from "@/components/admin/ui";
import { Tabs, pick, type SP } from "@/components/admin/os";
import { AgentAvatar, GoalBar, StatTile, WorkforceNav, fmtDuration } from "@/components/admin/ai/workforce";
import { usd } from "@/components/admin/command/workforce";

export const metadata = { title: "AI Employee Performance" };

const RANGES = ["7", "30", "90"] as const;

export default async function PerformancePage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAccess("ai:view", "AI_WORKFORCE");
  const sp = await searchParams;
  const days = Number(pick(sp, "days", RANGES) ?? "30");
  await ensureEmployees();
  const [perf, agents, pendingApprovals] = await Promise.all([
    employeePerformance(days),
    db.aIAgent.findMany({ select: { slug: true, name: true, personaName: true, jobTitle: true } }),
    db.aIApproval.count({ where: { status: "PENDING" } }),
  ]);
  const byslug = new Map(agents.map((a) => [a.slug, a]));
  const total = perf.reduce((a, p) => ({ completed: a.completed + p.completed, failed: a.failed + p.failed, cost: a.cost + p.costUsd, approvals: a.approvals + p.approvalsRequested, escalations: a.escalations + p.escalations }), { completed: 0, failed: 0, cost: 0, approvals: 0, escalations: 0 });
  const rate = total.completed + total.failed ? Math.round((total.completed / (total.completed + total.failed)) * 1000) / 10 : null;

  return (
    <>
      <PageHeader title="Employee Performance" description="How each AI employee is doing against its own goals. Every figure is counted from recorded tasks, approvals, executed actions and metered AI cost. Nothing is estimated." crumbs={[{ label: "AI", href: "/admin/ai/command-center" }, { label: "Performance" }]} />
      <WorkforceNav active="performance" counts={{ approvals: pendingApprovals }} />
      <Tabs active={String(days)} items={RANGES.map((r) => ({ key: r, label: `Last ${r} days`, href: `/admin/ai/performance?days=${r}` }))} />
      <div className="mb-5 grid grid-cols-2 gap-2.5 md:grid-cols-5">
        <StatTile label="Tasks completed" value={total.completed} tone="green" />
        <StatTile label="Tasks failed" value={total.failed} tone={total.failed ? "red" : undefined} />
        <StatTile label="Success rate" value={rate != null ? `${rate}%` : "—"} />
        <StatTile label="Human approvals" value={total.approvals} hint={`${total.escalations} escalations`} />
        <StatTile label="AI cost" value={usd(total.cost)} href="/admin/ai/costs" />
      </div>
      <Panel title="By employee" bodyClassName="p-0 overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] tracking-wide text-dim uppercase">
              <th className="px-4 py-2.5">Employee</th><th className="text-right">Completed</th><th className="text-right">Failed</th><th className="text-right">Success</th><th className="text-right">Avg time</th><th className="text-right">Approvals</th><th className="text-right">Escalations</th><th className="text-right">Cost</th><th className="pl-4">Business outcomes</th><th className="w-56 px-4">Goals (current period)</th>
            </tr>
          </thead>
          <tbody>
            {AGENTS.map((spec) => {
              const p = perf.find((x) => x.slug === spec.slug)!;
              const a = byslug.get(spec.slug);
              return (
                <tr key={spec.slug} className="border-b border-line align-top last:border-0">
                  <td className="px-4 py-3"><Link href={`/admin/ai/employees/${spec.slug}?tab=performance`} className="flex items-center gap-2.5 hover:underline"><AgentAvatar slug={spec.slug} className="size-8 rounded-lg [&_svg]:size-4" /><span><span className="block font-medium text-fg">{a ? displayName(a) : spec.name}</span><span className="block text-xs text-muted">{a?.jobTitle}</span></span></Link></td>
                  <td className="py-3 text-right font-mono tabular-nums">{p.completed}</td>
                  <td className={`py-3 text-right font-mono tabular-nums ${p.failed ? "text-red-700" : ""}`}>{p.failed}</td>
                  <td className="py-3 text-right font-mono tabular-nums">{p.successRate != null ? `${p.successRate}%` : "—"}</td>
                  <td className="py-3 text-right font-mono tabular-nums">{p.avgCompletionMs != null ? fmtDuration(p.avgCompletionMs) : "—"}</td>
                  <td className="py-3 text-right font-mono tabular-nums" title={`${p.approvalsApproved} approved, ${p.approvalsRejected} rejected`}>{p.approvalsRequested}</td>
                  <td className="py-3 text-right font-mono tabular-nums">{p.escalations}</td>
                  <td className="py-3 text-right font-mono tabular-nums">{usd(p.costUsd)}</td>
                  <td className="py-3 pl-4 text-xs text-muted">{p.outcomes.length ? p.outcomes.slice(0, 3).map((o) => `${o.count} × ${o.label.toLowerCase()}`).join(" · ") : "—"}</td>
                  <td className="space-y-2 px-4 py-3">{p.goals.length ? p.goals.map((g) => <GoalBar key={g.id} g={g} />) : <span className="text-xs text-dim">No goals</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
      <p className="mt-3 text-xs text-dim">Escalations are tasks that had to go to a person (awaiting approval) or failed. Business outcomes are executed changes (autonomous or approved), such as leads created or follow-ups scheduled.</p>
    </>
  );
}
