import Link from "next/link";
import { db } from "@/lib/db/client";
import { requireAccess } from "@/lib/os/guard";
import { AGENTS } from "@/lib/ai/catalog";
import { canRunAgent, ensureAgents } from "@/lib/ai/agents";
import { startOfUtcDay } from "@/lib/ai/cost";
import { daysFromNow } from "@/lib/os/range";
import { PageHeader } from "@/components/admin/ui";
import { StatusBadge } from "@/components/admin/os";

export const metadata = { title: "AI Agents" };

export default async function AgentsPage() {
  const user = await requireAccess("ai:view", "AI_WORKFORCE");
  await ensureAgents();
  const [rows, runs, cost] = await Promise.all([
    db.aIAgent.findMany({ include: { tools: { where: { enabled: true }, select: { tool: true } } } }),
    db.aIExecution.groupBy({ by: ["agentSlug"], where: { startedAt: { gte: daysFromNow(-30) } }, _count: true }),
    db.aIUsage.groupBy({ by: ["agentSlug"], where: { createdAt: { gte: startOfUtcDay() } }, _sum: { costUsd: true } }),
  ]);
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  return (
    <>
      <PageHeader title="AI Workforce" description="Specialised agents. Each can use only its listed tools, and only the tools the person asking is allowed to use. Default mode is ASSIST: sensitive actions need human approval." crumbs={[{ label: "AI", href: "/admin/ai" }, { label: "Agents" }]} />
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {AGENTS.map((a) => {
          const r = bySlug.get(a.slug);
          const usable = canRunAgent(user.role, a);
          return (
            <li key={a.slug} className="flex flex-col rounded-lg border border-line bg-ink-900 p-4">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/admin/ai/agents/${a.slug}`} className="font-semibold text-fg hover:underline">{r?.name ?? a.name}</Link>
                <div className="flex shrink-0 gap-1">{r && <StatusBadge value={r.mode} />}{r && !r.enabled && <StatusBadge value="INACTIVE" text="Disabled" />}</div>
              </div>
              <p className="mt-1 line-clamp-3 text-xs text-muted">{a.description}</p>
              <p className="mt-2 text-[11.5px] text-dim">{r?.tools.length ?? 0} tools · {runs.find((x) => x.agentSlug === a.slug)?._count ?? 0} runs (30d) · ${Number(cost.find((x) => x.agentSlug === a.slug)?._sum.costUsd ?? 0).toFixed(2)} today</p>
              <p className="mt-auto pt-2 text-[11.5px]">{usable ? <Link href={`/admin/ai?agent=${a.slug}`} className="text-brand-blue hover:underline">Ask @{a.slug} →</Link> : <span className="text-dim">Needs {a.requires}</span>}</p>
            </li>
          );
        })}
      </ul>
    </>
  );
}
