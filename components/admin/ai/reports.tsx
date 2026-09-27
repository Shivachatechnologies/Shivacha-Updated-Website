import Link from "next/link";
import { Panel } from "@/components/admin/ui";
import type { EndOfDay, MorningPlan } from "@/lib/ai/workforce/reports";

/** Morning plan / end-of-day report, rendered from the stored report data. */
export function ReportPanel({ kind, title, data }: { kind: string; title: string; data: unknown }) {
  if (kind === "MORNING_PLAN") {
    const p = data as MorningPlan;
    return (
      <Panel title={title}>
        <div className="grid gap-4 text-sm md:grid-cols-3">
          <div><p className="mb-1 text-[11px] font-medium tracking-wide text-dim uppercase">Planned tasks</p>{p.tasks.length ? <ul className="space-y-0.5">{p.tasks.map((t) => <li key={t.id}><Link href={`/admin/ai/tasks/${t.id}`} className="text-fg hover:underline">{t.title}</Link> <span className="text-xs text-dim">· {t.priority.toLowerCase()}</span></li>)}</ul> : <p className="text-dim">None</p>}</div>
          <div><p className="mb-1 text-[11px] font-medium tracking-wide text-dim uppercase">Recurring today</p>{p.recurring.length ? <ul className="space-y-0.5">{p.recurring.map((r) => <li key={r.name}>{r.name} <span className="text-xs text-dim">· {r.schedule.toLowerCase()}</span></li>)}</ul> : <p className="text-dim">None</p>}</div>
          <div><p className="mb-1 text-[11px] font-medium tracking-wide text-dim uppercase">Targets</p>{p.goals.length ? <ul className="space-y-0.5">{p.goals.map((g) => <li key={g.label}>{g.target} {g.label.toLowerCase()} <span className="text-xs text-dim">· {g.period.toLowerCase()}</span></li>)}</ul> : <p className="text-dim">None</p>}{p.pendingApprovals > 0 && <p className="mt-2 text-amber-700">{p.pendingApprovals} waiting for approval</p>}</div>
        </div>
      </Panel>
    );
  }
  const r = data as EndOfDay;
  return (
    <Panel title={title}>
      <div className="grid gap-4 text-sm md:grid-cols-2">
        <div>
          <p className="mb-1 text-[11px] font-medium tracking-wide text-dim uppercase">Completed</p>
          {r.completed.length || r.actions.length ? (
            <ul className="space-y-0.5">
              {r.actions.map((a) => <li key={a.tool}><span className="font-mono tabular-nums">{a.count}</span> × {a.label.toLowerCase()}</li>)}
              {r.completed.map((t) => <li key={t.id}>✓ <Link href={`/admin/ai/tasks/${t.id}`} className="hover:underline">{t.title}</Link></li>)}
            </ul>
          ) : <p className="text-dim">Nothing completed</p>}
        </div>
        <div className="space-y-3">
          <div><p className="mb-1 text-[11px] font-medium tracking-wide text-dim uppercase">Pending</p>{r.pending.length ? <ul className="space-y-0.5">{r.pending.map((t) => <li key={t.id}><Link href={`/admin/ai/tasks/${t.id}`} className="hover:underline">{t.title}</Link> <span className="text-xs text-dim">· {t.status.toLowerCase().replace(/_/g, " ")}</span></li>)}</ul> : <p className="text-dim">None</p>}</div>
          <div><p className="mb-1 text-[11px] font-medium tracking-wide text-dim uppercase">Blocked</p>{r.blocked.length ? <ul className="space-y-0.5">{r.blocked.map((t) => <li key={t.id} className="text-red-700"><Link href={`/admin/ai/tasks/${t.id}`} className="hover:underline">{t.title}</Link>{t.error ? ` — ${t.error.slice(0, 120)}` : ""}</li>)}</ul> : <p className="text-dim">None</p>}</div>
          <div><p className="mb-1 text-[11px] font-medium tracking-wide text-dim uppercase">Requires CEO</p>{r.requiresCeo.length ? <ul className="space-y-0.5">{r.requiresCeo.map((a) => <li key={a.id}><Link href={`/admin/ai/approvals/${a.id}`} className="text-amber-700 hover:underline">Approve: {a.action}</Link></li>)}</ul> : <p className="text-dim">Nothing</p>}</div>
        </div>
      </div>
    </Panel>
  );
}

