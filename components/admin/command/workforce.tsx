import Link from "next/link";
import { BookOpen, Crown, DatabaseZap, FileSignature, FolderKanban, HeartHandshake, Landmark, LifeBuoy, Megaphone, Send, Telescope, TrendingUp, Wrench, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import type { AgentCard, AgentStatus, AIOperation } from "@/lib/admin/command";

const AGENT_ICONS: Record<string, LucideIcon> = {
  ceo: Crown, sales: TrendingUp, sdr: Send, crm: DatabaseZap, proposal: FileSignature, marketing: Megaphone, project: FolderKanban,
  "customer-success": HeartHandshake, support: LifeBuoy, finance: Landmark, research: Telescope, knowledge: BookOpen,
};

const STATUS: Record<AgentStatus, { label: string; dot: string; text: string; ring: string }> = {
  ONLINE: { label: "Online", dot: "bg-emerald-400 os-pulse", text: "text-emerald-300", ring: "ring-emerald-400/30" },
  IDLE: { label: "Idle", dot: "bg-[#56657d]", text: "text-[#8b97ab]", ring: "ring-white/10" },
  WAITING: { label: "Waiting", dot: "bg-sky-400", text: "text-sky-300", ring: "ring-sky-400/25" },
  APPROVAL: { label: "Approval required", dot: "bg-amber-400 os-pulse", text: "text-amber-300", ring: "ring-amber-400/35" },
  DISABLED: { label: "Disabled", dot: "bg-red-500/70", text: "text-red-300/80", ring: "ring-red-400/20" },
};

export function ago(d: Date | null, now = new Date()) {
  if (!d) return "No activity yet";
  const s = Math.max(0, Math.round((now.getTime() - d.getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export const usd = (n: number) => (n === 0 ? "$0" : n < 0.01 ? "<$0.01" : `$${n.toFixed(2)}`);

export function AgentAvatar({ slug, className }: { slug: string; className?: string }) {
  const Icon = AGENT_ICONS[slug] ?? Wrench;
  return (
    <span className={cn("relative flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/25 via-[#1a2140] to-[#0e1c30] text-violet-200 ring-1 ring-violet-300/20", className)}>
      <Icon className="size-[18px]" strokeWidth={1.75} aria-hidden />
    </span>
  );
}

/** The twelve agents with live status, today's workload, last activity, spend and 30-day success rate. */
export function AgentGrid({ agents, now = new Date() }: { agents: AgentCard[]; now?: Date }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {agents.map((a) => {
        const st = STATUS[a.status];
        return (
          <li key={a.slug}>
            <Link href={`/admin/ai/agents/${a.slug}`} className={cn("group block rounded-lg border border-white/[0.07] bg-white/[0.025] p-3 ring-1 ring-transparent transition-colors hover:border-violet-400/30 hover:bg-white/[0.045]", a.status === "APPROVAL" && "border-amber-400/25")}>
              <div className="flex items-start gap-2.5">
                <AgentAvatar slug={a.slug} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-white">{a.name}</p>
                  <p className={cn("mt-0.5 flex items-center gap-1.5 text-[11px] font-medium", st.text)}>
                    <span className={cn("size-1.5 rounded-full", st.dot)} aria-hidden />
                    {st.label}
                    {a.status === "APPROVAL" && <span className="font-mono tabular-nums">· {a.pendingApprovals}</span>}
                    {a.status === "WAITING" && <span className="font-mono tabular-nums">· {a.queued} queued</span>}
                  </p>
                </div>
                <span className="rounded border border-white/10 px-1 font-mono text-[9.5px] tracking-wide text-[#8b97ab] uppercase">{a.mode.toLowerCase()}</span>
              </div>
              <dl className="mt-3 grid grid-cols-4 gap-1 border-t border-white/[0.06] pt-2.5 text-center">
                {[
                  ["Today", String(a.tasksToday)],
                  ["Done", String(a.completedToday)],
                  ["Cost", usd(a.costToday)],
                  ["Success", a.successRate != null ? `${a.successRate}%` : "—"],
                ].map(([k, v]) => (
                  <div key={k} className="min-w-0">
                    <dd className="truncate font-mono text-[12.5px] font-semibold text-white tabular-nums">{v}</dd>
                    <dt className="text-[9.5px] tracking-wide text-[#6f7b90] uppercase">{k}</dt>
                  </div>
                ))}
              </dl>
              <p className="mt-2 truncate text-[10.5px] text-[#6f7b90]">
                Last activity <span className="text-[#9fb4cf]">{ago(a.lastActivity, now)}</span> · 30d {usd(a.cost30d)}
              </p>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

const RESULT: Record<string, { label: string; cls: string }> = {
  RUNNING: { label: "Running", cls: "border-violet-400/40 bg-violet-500/15 text-violet-200" },
  SUCCEEDED: { label: "Succeeded", cls: "border-emerald-400/30 bg-emerald-500/10 text-emerald-300" },
  FAILED: { label: "Failed", cls: "border-red-400/30 bg-red-500/10 text-red-300" },
  AWAITING_APPROVAL: { label: "Awaiting approval", cls: "border-amber-400/30 bg-amber-500/10 text-amber-300" },
  BLOCKED: { label: "Blocked", cls: "border-red-400/30 bg-red-500/10 text-red-300" },
  CANCELLED: { label: "Cancelled", cls: "border-white/10 bg-white/[0.04] text-[#8b97ab]" },
};

function Connector({ live }: { live: boolean }) {
  return (
    <svg viewBox="0 0 24 8" className="hidden h-2 w-6 shrink-0 self-center lg:block" aria-hidden>
      <line x1="0" y1="4" x2="19" y2="4" stroke={live ? "#a78bfa" : "#35507a"} strokeWidth="1.5" className={live ? "os-flow" : undefined} strokeDasharray={live ? undefined : "2 3"} />
      <path d="M18 1l4 3-4 3" fill="none" stroke={live ? "#a78bfa" : "#35507a"} strokeWidth="1.5" />
    </svg>
  );
}

/** Agent → Task → Tool → Result for the latest runs, straight from the execution audit log. */
export function AIOperationsFlow({ ops, names, now = new Date() }: { ops: AIOperation[]; names: Record<string, string>; now?: Date }) {
  if (!ops.length) return <p className="py-6 text-center text-sm text-[#8b97ab]">No agent runs yet. Runs appear here as soon as an agent is asked something or a scheduled job runs.</p>;
  return (
    <div>
      <div className="mb-1.5 hidden grid-cols-[150px_24px_minmax(0,1.2fr)_24px_minmax(0,1fr)_24px_minmax(0,1.2fr)] gap-2 px-2.5 font-mono text-[9.5px] tracking-[0.12em] text-[#6f7b90] uppercase lg:grid">
        <span>Agent</span><span /><span>Task</span><span /><span>Tools</span><span /><span>Result</span>
      </div>
      <ul className="space-y-1.5">
        {ops.map((o) => {
          const live = o.status === "RUNNING";
          const r = RESULT[o.status] ?? RESULT.CANCELLED!;
          return (
            <li key={o.id}>
              <Link href={`/admin/ai/logs/${o.id}`} className={cn("grid gap-2 rounded-lg border px-2.5 py-2 transition-colors lg:grid-cols-[150px_24px_minmax(0,1.2fr)_24px_minmax(0,1fr)_24px_minmax(0,1.2fr)] lg:items-center", live ? "border-violet-400/30 bg-violet-500/[0.06]" : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.045]")}>
                <span className="flex min-w-0 items-center gap-2">
                  <AgentAvatar slug={o.agentSlug} className="size-7 rounded-md [&_svg]:size-3.5" />
                  <span className="min-w-0">
                    <span className="block truncate text-[12px] font-medium text-white">{names[o.agentSlug] ?? o.agentSlug}</span>
                    <span className="block font-mono text-[10px] text-[#6f7b90]">{ago(o.startedAt, now)}</span>
                  </span>
                </span>
                <Connector live={live} />
                <span className="line-clamp-2 min-w-0 text-[12px] text-[#c9d2e0]">{o.request}</span>
                <Connector live={live} />
                <span className="flex min-w-0 flex-wrap gap-1">
                  {o.tools.length ? o.tools.slice(0, 3).map((t, i) => (
                    <span key={`${t.tool}${i}`} className={cn("truncate rounded border px-1.5 py-px font-mono text-[10px]", t.ok ? "border-sky-400/20 bg-sky-400/[0.07] text-sky-200" : "border-red-400/30 bg-red-500/10 text-red-300")}>{t.tool}</span>
                  )) : <span className="font-mono text-[10px] text-[#6f7b90]">no tools</span>}
                  {o.tools.length > 3 && <span className="font-mono text-[10px] text-[#6f7b90]">+{o.tools.length - 3}</span>}
                </span>
                <Connector live={live} />
                <span className="flex min-w-0 items-center gap-2">
                  <span className={cn("inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-px text-[10.5px] font-medium", r.cls)}>
                    {live && <span className="os-eq text-violet-200" aria-hidden><i /><i /><i /></span>}
                    {r.label}
                  </span>
                  <span className="truncate text-[11.5px] text-[#8b97ab]">{o.result ?? (o.durationMs != null ? `${(o.durationMs / 1000).toFixed(1)}s` : "")}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
