import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { agentBySlug } from "@/lib/ai/catalog";
import { PageHeader, Panel, fmtDate } from "@/components/admin/ui";
import { DataTable, KV, StatusBadge } from "@/components/admin/os";
import { Markdown } from "@/components/admin/ai/markdown";

export const metadata = { title: "AI execution" };

type ToolUse = { tool: string; ok: boolean; ms: number; error?: string };
type Act = { tool: string; summary: string; status: string; approvalId?: string };

export default async function ExecutionDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAccess("ai:view", "AI_WORKFORCE");
  const { id } = await params;
  const e = await db.aIExecution.findUnique({ where: { id }, include: { user: { select: { name: true } }, approvals: { select: { id: true, action: true, status: true } }, usage: { orderBy: { createdAt: "asc" } } } });
  // Scheduled executive briefings are visible to executives; everything else to its requester or configurators.
  const briefing = e?.trigger === "SCHEDULE" && e.agentSlug === "ceo" && can(user.role, "executive:view");
  if (!e || (e.userId !== user.id && !can(user.role, "ai:configure") && !briefing)) notFound();
  const result = (e.result ?? {}) as { text?: string; drafts?: { tool: string; draft: Record<string, unknown> }[] };
  const tools = (Array.isArray(e.toolsUsed) ? e.toolsUsed : []) as ToolUse[];
  const records = (Array.isArray(e.recordsAccessed) ? e.recordsAccessed : []) as string[];
  const proposed = (Array.isArray(e.actionsProposed) ? e.actionsProposed : []) as Act[];
  const executed = (Array.isArray(e.actionsExecuted) ? e.actionsExecuted : []) as Act[];
  return (
    <>
      <PageHeader title={e.request.slice(0, 120)} description={`${agentBySlug(e.agentSlug)?.name ?? e.agentSlug} · ${e.trigger.toLowerCase()} · ${e.mode.toLowerCase()} mode`} crumbs={[{ label: "AI", href: "/admin/ai" }, { label: "Logs", href: "/admin/ai/logs" }, { label: "Execution" }]} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          <Panel title="Request"><p className="whitespace-pre-wrap text-sm text-fg/90">{e.request}</p></Panel>
          <Panel title="Response">{result.text ? <Markdown text={result.text} /> : <p className="text-sm text-muted">No response recorded.</p>}{e.error && <p className="mt-2 text-sm text-red-700">{e.error}</p>}</Panel>
          {result.drafts && result.drafts.length > 0 && (
            <Panel title="Drafts (not sent)">
              {result.drafts.map((d, i) => <pre key={i} className="mb-2 whitespace-pre-wrap rounded-md border border-line bg-ink-850 p-2.5 font-sans text-[13px]">{[`${d.tool}${d.draft.to ? ` → ${String(d.draft.to)}` : ""}`, d.draft.subject && `Subject: ${String(d.draft.subject)}`, String(d.draft.body ?? "")].filter(Boolean).join("\n")}</pre>)}
            </Panel>
          )}
          <Panel title="Tools used">
            {tools.length === 0 ? <p className="text-sm text-muted">None.</p> : <DataTable rows={tools.map((t, i) => ({ id: String(i), ...t }))} columns={[{ header: "Tool", cell: (t) => <span className="font-mono text-xs">{t.tool}</span> }, { header: "Result", cell: (t) => (t.ok ? <StatusBadge value="SUCCEEDED" text="OK" /> : <StatusBadge value="FAILED" text={t.error ?? "Error"} />) }, { header: "Time", cell: (t) => `${t.ms} ms` }]} />}
          </Panel>
          <Panel title="Actions">
            {proposed.length === 0 ? <p className="text-sm text-muted">No actions proposed.</p> : (
              <ul className="space-y-1 text-sm">{proposed.map((a, i) => <li key={i}><span className="font-mono text-xs">{a.tool}</span> — {a.summary} · <span className="text-dim">{a.status.replace(/_/g, " ").toLowerCase()}</span>{a.approvalId && <> · <Link href={`/admin/ai/approvals/${a.approvalId}`} className="text-brand-blue hover:underline">approval</Link></>}</li>)}</ul>
            )}
            {executed.length > 0 && <p className="mt-2 text-xs text-muted">Executed: {executed.map((a) => a.summary ?? a.tool).join(" · ")}</p>}
          </Panel>
        </div>
        <aside className="space-y-5">
          <Panel title="Execution">
            <KV cols={1} items={[
              ["Status", <StatusBadge key="s" value={e.status} />],
              ["Requested by", e.user?.name ?? "System"],
              ["Provider", e.provider === "none" ? "Not connected (no AI)" : `${e.provider} · ${e.model ?? ""}`],
              ["Tokens", `${e.inputTokens.toLocaleString()} in / ${e.outputTokens.toLocaleString()} out`],
              ["Cost", `$${Number(e.costUsd).toFixed(6)}`],
              ["Duration", e.durationMs != null ? `${(e.durationMs / 1000).toFixed(1)} s` : "—"],
              ["Started", fmtDate(e.startedAt, true)],
              ["Model calls", String(e.usage.length)],
            ]} />
          </Panel>
          <Panel title={`Records accessed (${records.length})`}>
            {records.length === 0 ? <p className="text-sm text-muted">None.</p> : <ul className="max-h-72 space-y-0.5 overflow-auto font-mono text-[11.5px] text-muted">{records.map((r) => <li key={r}>{r}</li>)}</ul>}
          </Panel>
        </aside>
      </div>
    </>
  );
}
