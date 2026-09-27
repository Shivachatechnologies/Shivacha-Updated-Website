import { db } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { agentBySlug } from "@/lib/ai/catalog";
import { aiLimits, startOfUtcDay } from "@/lib/ai/cost";
import { priceFor, providerStatus } from "@/lib/ai/provider";
import { PageHeader, Panel } from "@/components/admin/ui";
import { DataTable, Kpi, KpiGrid } from "@/components/admin/os";

export const metadata = { title: "AI Costs" };

const usd = (n: number) => `$${n.toFixed(n < 1 ? 4 : 2)}`;

export default async function CostsPage() {
  const user = await requireAccess("ai:view", "AI_WORKFORCE");
  const mine = can(user.role, "ai:configure") ? {} : { userId: user.id };
  const today = startOfUtcDay();
  const since = (d: number) => new Date(today.getTime() - d * 86400_000);
  const sum = (from: Date) => db.aIUsage.aggregate({ where: { ...mine, createdAt: { gte: from } }, _sum: { costUsd: true, inputTokens: true, outputTokens: true }, _count: true });
  const [d1, d7, d30, byAgent, byModel, byUser] = await Promise.all([
    sum(today),
    sum(since(6)),
    sum(since(29)),
    db.aIUsage.groupBy({ by: ["agentSlug"], where: { ...mine, createdAt: { gte: since(29) } }, _sum: { costUsd: true, inputTokens: true, outputTokens: true }, _count: true }),
    db.aIUsage.groupBy({ by: ["model"], where: { ...mine, createdAt: { gte: since(29) } }, _sum: { costUsd: true, inputTokens: true, outputTokens: true }, _count: true }),
    can(user.role, "ai:configure") ? db.aIUsage.groupBy({ by: ["userId"], where: { createdAt: { gte: since(29) } }, _sum: { costUsd: true }, _count: true }) : Promise.resolve([]),
  ]);
  const users = byUser.length ? await db.user.findMany({ where: { id: { in: byUser.map((u) => u.userId).filter((x): x is string => !!x) } }, select: { id: true, name: true } }) : [];
  const limits = aiLimits();
  const n = (v: unknown) => Number(v ?? 0);
  return (
    <>
      <PageHeader title="AI costs" description={`Every model call is metered from the provider's reported token usage and priced per model. ${can(user.role, "ai:configure") ? "Company-wide." : "Your usage only."}`} crumbs={[{ label: "AI", href: "/admin/ai" }, { label: "Costs" }]} />
      <KpiGrid cols={4}>
        <Kpi label="Today (UTC)" value={usd(n(d1._sum.costUsd))} hint={`${d1._count} calls · limit ${usd(limits.dailyUsd)}`} tone={n(d1._sum.costUsd) >= limits.dailyUsd ? "red" : undefined} />
        <Kpi label="Last 7 days" value={usd(n(d7._sum.costUsd))} hint={`${d7._count} calls`} />
        <Kpi label="Last 30 days" value={usd(n(d30._sum.costUsd))} hint={`${(n(d30._sum.inputTokens) + n(d30._sum.outputTokens)).toLocaleString()} tokens`} />
        <Kpi label="Provider" value={providerStatus().connected ? "Connected" : "Not connected"} hint={`MAX_REQUEST_TOKENS ${limits.requestTokens.toLocaleString()}`} />
      </KpiGrid>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel title="By agent (30 days)">
          {byAgent.length === 0 ? <p className="text-sm text-muted">No usage yet.</p> : <DataTable rows={byAgent.map((r) => ({ id: r.agentSlug, ...r }))} columns={[{ header: "Agent", cell: (r) => agentBySlug(r.agentSlug)?.name ?? r.agentSlug }, { header: "Calls", cell: (r) => r._count }, { header: "Tokens in/out", cell: (r) => `${n(r._sum.inputTokens).toLocaleString()} / ${n(r._sum.outputTokens).toLocaleString()}` }, { header: "Cost", cell: (r) => usd(n(r._sum.costUsd)) }]} />}
        </Panel>
        <Panel title="By model (30 days)">
          {byModel.length === 0 ? <p className="text-sm text-muted">No usage yet.</p> : <DataTable rows={byModel.map((r) => ({ id: r.model, ...r }))} columns={[{ header: "Model", cell: (r) => <span className="font-mono text-xs">{r.model}</span> }, { header: "Price in/out per 1M", cell: (r) => `$${priceFor(r.model)[0]} / $${priceFor(r.model)[1]}` }, { header: "Calls", cell: (r) => r._count }, { header: "Cost", cell: (r) => usd(n(r._sum.costUsd)) }]} />}
        </Panel>
        {byUser.length > 0 && (
          <Panel title="By user (30 days)">
            <DataTable rows={byUser.map((r) => ({ id: r.userId ?? "system", ...r }))} columns={[{ header: "User", cell: (r) => users.find((u) => u.id === r.userId)?.name ?? "Automation / scheduler" }, { header: "Calls", cell: (r) => r._count }, { header: "Cost", cell: (r) => usd(n(r._sum.costUsd)) }]} />
          </Panel>
        )}
        <Panel title="Guard-rails">
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            <li>Daily company budget: <strong className="text-fg">{usd(limits.dailyUsd)}</strong> (MAX_DAILY_AI_COST). Requests stop once reached.</li>
            <li>Per-request token ceiling: <strong className="text-fg">{limits.requestTokens.toLocaleString()}</strong> (MAX_REQUEST_TOKENS) across the whole tool loop.</li>
            <li>Per-agent daily limits are set in each agent&apos;s settings.</li>
            <li>At most {limits.maxIterations} model calls per request; {limits.callMaxTokens.toLocaleString()} output tokens per call.</li>
          </ul>
        </Panel>
      </div>
    </>
  );
}
