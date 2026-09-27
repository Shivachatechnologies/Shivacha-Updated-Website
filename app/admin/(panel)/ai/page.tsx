import Link from "next/link";
import { db } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { runnableAgents } from "@/lib/ai/agents";
import { latestBriefing } from "@/lib/ai/briefing";
import { aiLimits, spentToday } from "@/lib/ai/cost";
import { providerStatus } from "@/lib/ai/provider";
import { generateBriefingAction } from "@/lib/ai/actions";
import { PageHeader, Panel, fmtDate } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/forms";
import { SubmitButton } from "@/components/admin/client";
import { Kpi, KpiGrid, NotConnected, StatusBadge, str, type SP } from "@/components/admin/os";
import { CommandCenter } from "@/components/admin/ai/command";
import { Markdown } from "@/components/admin/ai/markdown";
import { agentWorkforce, aiOperations } from "@/lib/admin/command";
import { AgentGrid, AIOperationsFlow } from "@/components/admin/command/workforce";
import { OpsPanel } from "@/components/admin/command/section";

export const metadata = { title: "AI Command Center" };

export default async function AICommandCenter({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireAccess("ai:view", "AI_WORKFORCE");
  const sp = await searchParams;
  const provider = providerStatus();
  const exec = can(user.role, "executive:view");
  const agents = runnableAgents(user.role);
  const now = new Date();
  const [spent, pending, insights, briefing, recent, workforce, ops] = await Promise.all([
    spentToday(),
    db.aIApproval.count({ where: { status: "PENDING" } }),
    db.aIRecommendation.findMany({ where: { status: "OPEN" }, orderBy: [{ severity: "desc" }, { createdAt: "desc" }], take: 60 }),
    exec ? latestBriefing() : null,
    db.aIExecution.findMany({ where: { userId: user.id }, orderBy: { startedAt: "desc" }, take: 8, select: { id: true, agentSlug: true, request: true, status: true, startedAt: true } }),
    agentWorkforce(now),
    aiOperations(8),
  ]);
  const online = workforce.filter((a) => a.status === "ONLINE").length;
  const visible = insights.filter((r) => can(user.role, r.permission as Parameters<typeof can>[1]));
  const limits = aiLimits();
  const bText = (briefing?.result as { text?: string } | null)?.text;

  return (
    <>
      <PageHeader title="AI Command Center" description="Ask the AI workforce about your business. Agents only see what you are allowed to see, work from live records and send every sensitive action to the Human Approval Center." crumbs={[{ label: "AI" }]} actions={<Link href="/admin/ai/approvals" className="btn-secondary h-9 px-3 text-[13px]">Approvals{pending ? ` (${pending})` : ""}</Link>} />
      {!provider.connected && (
        <div className="mb-4">
          <NotConnected name="AI provider" env={["ANTHROPIC_API_KEY"]}>AI provider not connected. Agents still run their tools and show live data, but no AI analysis, drafting or briefing narrative is generated.</NotConnected>
        </div>
      )}
      <KpiGrid cols={4}>
        <Kpi label="Provider" value={provider.connected ? "Connected" : "Not connected"} tone={provider.connected ? "green" : "amber"} hint={provider.connected ? process.env.AI_MODEL || "claude-opus-5" : "Set ANTHROPIC_API_KEY"} />
        <Kpi label="Spend today" value={`$${spent.toFixed(2)}`} hint={`Limit $${limits.dailyUsd.toFixed(2)} / day`} href="/admin/ai/costs" tone={spent >= limits.dailyUsd ? "red" : undefined} />
        <Kpi label="Pending approvals" value={pending} href="/admin/ai/approvals" tone={pending ? "amber" : undefined} />
        <Kpi label="Open insights" value={visible.length} href="/admin/ai/insights" />
      </KpiGrid>

      <OpsPanel dark eyebrow="AI workforce" title={`${workforce.length} agents · ${online} online now`} className="mt-5 border-violet-400/15" actions={<Link href="/admin/ai/agents" className="text-xs font-medium text-violet-200 hover:underline">Configure agents</Link>}>
        <AgentGrid agents={workforce} now={now} />
        <div className="mt-5 border-t border-white/[0.06] pt-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-mono text-[10px] tracking-[0.16em] text-[#6f86a6] uppercase">AI operations · Agent → Task → Tool → Result</p>
            <Link href="/admin/ai/logs" className="text-xs text-violet-200 hover:underline">All logs</Link>
          </div>
          <AIOperationsFlow ops={ops} names={Object.fromEntries(workforce.map((a) => [a.slug, a.name]))} now={now} />
        </div>
      </OpsPanel>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          {can(user.role, "ai:execute") ? (
            <CommandCenter agents={agents.map((a) => ({ slug: a.slug, name: a.name }))} connected={provider.connected} initial={{ q: str(sp, "q", 4000), agent: str(sp, "agent", 40), entity: str(sp, "entity", 20), entityId: str(sp, "id", 40) }} />
          ) : (
            <p className="text-sm text-muted">Your role can view AI results but cannot run agents.</p>
          )}
          {exec && (
            <Panel title="Daily CEO briefing" action={can(user.role, "ai:execute") ? <ActionForm action={generateBriefingAction}><SubmitButton variant="secondary" className="h-8 text-xs">Generate now</SubmitButton></ActionForm> : undefined}>
              <div id="briefing">{bText ? <><Markdown text={bText} /><p className="mt-2 text-[11.5px] text-dim">Generated {fmtDate(briefing!.startedAt, true)} · <Link href={`/admin/ai/logs/${briefing!.id}`} className="hover:text-fg">audit log</Link></p></> : <p className="text-sm text-muted">No briefing yet. It is generated daily by the scheduler, or on demand.</p>}</div>
            </Panel>
          )}
        </div>
        <aside className="space-y-5">
          <Panel title="Proactive insights" action={<Link href="/admin/ai/insights" className="text-xs text-brand-blue hover:underline">All</Link>}>
            {visible.length === 0 ? <p className="text-sm text-muted">Nothing needs attention right now.</p> : (
              <ul className="space-y-2">
                {visible.slice(0, 8).map((r) => (
                  <li key={r.id} className="text-sm">
                    <StatusBadge value={r.severity} /> {r.href ? <Link href={r.href} className="text-fg hover:underline">{r.title}</Link> : r.title}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Your agents">
            <ul className="space-y-1.5 text-sm">
              {agents.map((a) => <li key={a.slug}><Link href={`/admin/ai/agents/${a.slug}`} className="text-fg hover:underline">{a.name}</Link><span className="block text-xs text-dim">@{a.slug}</span></li>)}
            </ul>
          </Panel>
          {recent.length > 0 && (
            <Panel title="Your recent requests">
              <ul className="space-y-2 text-sm">
                {recent.map((e) => <li key={e.id}><Link href={`/admin/ai/logs/${e.id}`} className="line-clamp-2 text-fg hover:underline">{e.request}</Link><span className="text-xs text-dim">{e.agentSlug} · {e.status.toLowerCase().replace(/_/g, " ")} · {fmtDate(e.startedAt, true)}</span></li>)}
              </ul>
            </Panel>
          )}
        </aside>
      </div>
    </>
  );
}
