import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Tabs } from "@/components/admin/os";
import { AgentAvatar, ago } from "@/components/admin/command/workforce";
import type { EmployeeCard, GoalProgress } from "@/lib/ai/workforce/employees";
import type { EmployeeStatus, Subtask } from "@/lib/ai/workforce/profiles";

export { AgentAvatar, ago };

const STATUS: Record<EmployeeStatus, { label: string; dot: string; cls: string }> = {
  ONLINE: { label: "Online", dot: "bg-emerald-500", cls: "bg-emerald-500/12 text-emerald-700" },
  WORKING: { label: "Working", dot: "bg-brand-blue os-pulse", cls: "bg-brand-blue/10 text-brand-blue" },
  WAITING: { label: "Waiting", dot: "bg-sky-500", cls: "bg-sky-500/12 text-sky-700" },
  AWAITING_APPROVAL: { label: "Awaiting approval", dot: "bg-amber-500 os-pulse", cls: "bg-amber-500/15 text-amber-700" },
  OFFLINE: { label: "Offline", dot: "bg-slate-400", cls: "bg-ink-800 text-muted" },
  ERROR: { label: "Error", dot: "bg-red-500", cls: "bg-red-500/12 text-red-700" },
};

export function EmployeeStatusPill({ status, className }: { status: EmployeeStatus; className?: string }) {
  const s = STATUS[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-medium whitespace-nowrap", s.cls, className)}>
      <span className={cn("size-1.5 rounded-full", s.dot)} aria-hidden />
      {s.label}
    </span>
  );
}

export function ProgressBar({ value, tone = "blue", className }: { value: number; tone?: "blue" | "green" | "amber" | "red" | "gray"; className?: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const bar = { blue: "bg-brand-blue", green: "bg-emerald-500", amber: "bg-amber-500", red: "bg-red-500", gray: "bg-slate-400" }[tone];
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-ink-800", className)} role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full transition-[width]", bar)} style={{ width: `${v}%` }} />
    </div>
  );
}

export const taskTone = (status: string) => (status === "DONE" ? "green" : status === "FAILED" ? "red" : status === "AWAITING_APPROVAL" || status === "PAUSED" || status === "WAITING" ? "amber" : status === "CANCELLED" ? "gray" : "blue");

export function GoalBar({ g }: { g: GoalProgress }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-[12px]">
        <span className="truncate text-muted">{g.label} <span className="text-dim">· {g.period.toLowerCase()}</span></span>
        <span className="shrink-0 font-mono text-fg tabular-nums">{g.actual}/{g.target}</span>
      </div>
      <ProgressBar value={g.pct} tone={g.pct >= 100 ? "green" : "blue"} className="mt-1" />
    </div>
  );
}

/** Directory card: who the employee is, what they are doing now and how today is going. */
export function EmployeeCardView({ e, now }: { e: EmployeeCard; now: Date }) {
  return (
    <Link href={`/admin/ai/employees/${e.slug}`} className={cn("group flex h-full flex-col rounded-lg border border-line bg-ink-900 p-4 transition-colors hover:border-line-strong", e.status === "AWAITING_APPROVAL" && "border-amber-500/40", e.status === "ERROR" && "border-red-500/30")}>
      <div className="flex items-start gap-3">
        <AgentAvatar slug={e.slug} className="size-11 rounded-xl [&_svg]:size-5" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-fg">{e.name}</p>
          <p className="truncate text-[12.5px] text-muted">{e.jobTitle}</p>
          <p className="truncate text-[11.5px] text-dim">{e.department}{e.manager ? ` · reports to ${e.manager}` : ""}</p>
        </div>
        <EmployeeStatusPill status={e.status} />
      </div>
      <div className="mt-3 rounded-md bg-ink-850 px-3 py-2">
        <p className="text-[10.5px] font-medium tracking-wide text-dim uppercase">Current task</p>
        {e.currentTask ? (
          <>
            <p className="mt-0.5 line-clamp-1 text-[13px] text-fg">{e.currentTask.title}</p>
            <div className="mt-1.5 flex items-center gap-2">
              <ProgressBar value={e.currentTask.progress} className="flex-1" />
              <span className="font-mono text-[11px] text-muted tabular-nums">{e.currentTask.progress}%</span>
            </div>
          </>
        ) : (
          <p className="mt-0.5 text-[13px] text-dim">No task assigned</p>
        )}
        <p className="mt-1 line-clamp-1 text-[11.5px] text-muted">{e.workingStatus}</p>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        {[["Today", e.tasksToday], ["Completed", e.completedToday], ["Pending", e.pending]].map(([k, v]) => (
          <div key={k as string} className="rounded-md border border-line px-1 py-1.5">
            <dd className="font-mono text-[15px] font-semibold text-fg tabular-nums">{v}</dd>
            <dt className="text-[10px] tracking-wide text-dim uppercase">{k}</dt>
          </div>
        ))}
      </dl>
      <div className="mt-3 flex-1">{e.kpi ? <GoalBar g={e.kpi} /> : <p className="text-[12px] text-dim">No KPI set</p>}</div>
      <p className="mt-3 border-t border-line pt-2 text-[11.5px] text-dim">
        Last activity <span className="text-muted">{ago(e.lastActivity, now)}</span> · {e.completedTotal} tasks completed all-time
      </p>
    </Link>
  );
}

export function SubtaskList({ items }: { items: Subtask[] }) {
  if (!items.length) return <p className="text-sm text-dim">The employee has not planned this task yet.</p>;
  const mark: Record<Subtask["status"], { icon: string; cls: string }> = {
    done: { icon: "✓", cls: "text-emerald-600" },
    running: { icon: "→", cls: "text-brand-blue font-semibold" },
    failed: { icon: "✕", cls: "text-red-600" },
    skipped: { icon: "–", cls: "text-dim" },
    pending: { icon: "○", cls: "text-dim" },
  };
  return (
    <ol className="space-y-1.5">
      {items.map((s, i) => (
        <li key={`${i}-${s.title}`} className="flex gap-2.5 text-sm">
          <span className={cn("w-4 shrink-0 text-center font-mono", mark[s.status].cls)} aria-label={s.status}>{mark[s.status].icon}</span>
          <span className="min-w-0">
            <span className={cn(s.status === "running" ? "font-medium text-fg" : s.status === "pending" ? "text-muted" : "text-fg")}>{s.title}</span>
            {s.note && <span className="block text-xs text-muted">{s.note}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Secondary navigation across the AI workforce pages. */
export function WorkforceNav({ active, counts }: { active: string; counts?: { approvals?: number } }) {
  return (
    <Tabs
      active={active}
      items={[
        { key: "command", label: "Command Center", href: "/admin/ai/command-center" },
        { key: "employees", label: "Employees", href: "/admin/ai/employees" },
        { key: "tasks", label: "Tasks", href: "/admin/ai/tasks" },
        { key: "approvals", label: "Approvals", href: "/admin/ai/approvals", count: counts?.approvals || undefined },
        { key: "performance", label: "Performance", href: "/admin/ai/performance" },
        { key: "ask", label: "Ask an employee", href: "/admin/ai" },
      ]}
    />
  );
}

export function StatTile({ label, value, hint, tone, href }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "green" | "amber" | "red" | "blue"; href?: string }) {
  const body = (
    <>
      <p className="text-[11px] font-medium tracking-wide text-dim uppercase">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tracking-tight tabular-nums", tone === "green" ? "text-emerald-700" : tone === "amber" ? "text-amber-700" : tone === "red" ? "text-red-700" : tone === "blue" ? "text-brand-blue" : "text-fg")}>{value}</p>
      {hint && <p className="mt-0.5 truncate text-xs text-muted">{hint}</p>}
    </>
  );
  const cls = "block min-w-0 rounded-lg border border-line bg-ink-900 px-3.5 py-3";
  return href ? <Link href={href} className={cn(cls, "hover:border-line-strong")}>{body}</Link> : <div className={cls}>{body}</div>;
}

export const fmtDuration = (ms: number) => {
  if (ms < 0) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h}h ${m % 60}m` : `${Math.floor(h / 24)}d ${h % 24}h`;
};
