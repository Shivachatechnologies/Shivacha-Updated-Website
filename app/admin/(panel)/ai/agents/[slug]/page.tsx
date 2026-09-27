import { notFound } from "next/navigation";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { agentBySlug } from "@/lib/ai/catalog";
import { getAgentConfig } from "@/lib/ai/agents";
import { getTool } from "@/lib/ai/tools";
import { DEFAULT_MODEL, MODEL_OPTIONS } from "@/lib/ai/provider";
import { updateAgentAction } from "@/lib/ai/actions";
import { db } from "@/lib/db/client";
import { PageHeader, Panel, fmtDate, inputCls, labelCls } from "@/components/admin/ui";
import { ActionForm, FieldError } from "@/components/admin/forms";
import { SubmitButton } from "@/components/admin/client";
import { KV, StatusBadge } from "@/components/admin/os";
import Link from "next/link";

export const metadata = { title: "AI Agent" };

export default async function AgentDetail({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requireAccess("ai:view", "AI_WORKFORCE");
  const { slug } = await params;
  const spec = agentBySlug(slug);
  if (!spec) notFound();
  const cfg = (await getAgentConfig(slug))!;
  const rows = await db.aIAgentTool.findMany({ where: { agentId: cfg.id } });
  const toolRow = new Map(rows.map((r) => [r.tool, r]));
  const recent = await db.aIExecution.findMany({ where: { agentSlug: slug, ...(can(user.role, "ai:configure") ? {} : { userId: user.id }) }, orderBy: { startedAt: "desc" }, take: 10, select: { id: true, request: true, status: true, startedAt: true, costUsd: true } });
  const configure = can(user.role, "ai:configure");
  return (
    <>
      <PageHeader title={cfg.name} description={spec.description} crumbs={[{ label: "AI", href: "/admin/ai" }, { label: "Agents", href: "/admin/ai/agents" }, { label: cfg.name }]} actions={<Link href={`/admin/ai?agent=${slug}`} className="btn-primary h-9 px-3.5 text-[13px]">Ask this agent</Link>} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          {configure ? (
            <ActionForm action={updateAgentAction.bind(null, slug)} className="space-y-5">
              <Panel title="Behaviour">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="enabled" defaultChecked={cfg.enabled} /> Enabled</label>
                  <label className="block"><span className={labelCls}>Mode</span>
                    <select name="mode" defaultValue={cfg.mode} className={inputCls}>
                      <option value="OBSERVE">OBSERVE — analyse & recommend only</option>
                      <option value="ASSIST">ASSIST — actions need approval (default)</option>
                      <option value="AUTONOMOUS" disabled={user.role !== "SUPER_ADMIN" && cfg.mode !== "AUTONOMOUS"}>AUTONOMOUS — pre-approved low-risk actions run (Super Admin)</option>
                    </select>
                    <FieldError name="mode" />
                  </label>
                  <label className="block"><span className={labelCls}>Model</span>
                    <select name="model" defaultValue={cfg.model ?? ""} className={inputCls}>
                      <option value="">Default ({process.env.AI_MODEL || DEFAULT_MODEL})</option>
                      {MODEL_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </label>
                  <label className="block"><span className={labelCls}>Daily cost limit (USD, blank = platform limit only)</span><input name="dailyCostLimit" defaultValue={cfg.dailyCostLimit ?? ""} inputMode="decimal" className={inputCls} /><FieldError name="dailyCostLimit" /></label>
                </div>
                <label className="mt-4 block"><span className={labelCls}>Additional instructions (appended to the built-in guard-rails, which cannot be removed)</span><textarea name="systemPrompt" defaultValue={cfg.systemPrompt ?? ""} rows={5} maxLength={8000} className={`${inputCls} h-auto py-2`} /></label>
              </Panel>
              <Panel title="Tools">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-[11.5px] text-dim uppercase"><th className="py-1">Tool</th><th>Type</th><th>Needs</th><th className="text-center">Enabled</th><th className="text-center">Autonomous</th><th className="text-center">Always approve</th></tr></thead>
                  <tbody>
                    {spec.tools.map((name) => {
                      const t = getTool(name)!;
                      const row = toolRow.get(name);
                      const canAuto = t.kind === "write" && t.risk === "LOW" && !t.alwaysApprove;
                      return (
                        <tr key={name} className="border-t border-line">
                          <td className="py-1.5"><span className="font-mono text-xs text-fg">{name}</span><span className="block text-[11.5px] text-dim">{t.description.slice(0, 110)}</span></td>
                          <td className="text-xs text-muted">{t.kind}{t.kind === "write" ? ` · ${t.risk.toLowerCase()}` : ""}</td>
                          <td className="font-mono text-[11px] text-dim">{t.permissions.join(", ") || "varies"}</td>
                          <td className="text-center"><input type="checkbox" name="tools" value={name} defaultChecked={row?.enabled ?? true} aria-label={`Enable ${name}`} /></td>
                          <td className="text-center">{canAuto ? <input type="checkbox" name="autonomous" value={name} defaultChecked={row?.autonomousAllowed ?? false} aria-label={`Allow ${name} autonomously`} /> : <span className="text-dim">—</span>}</td>
                          <td className="text-center">{t.kind === "write" ? (t.alwaysApprove ? <span className="text-xs text-dim">always</span> : <input type="checkbox" name="approvalActions" value={name} defaultChecked={cfg.approvalActions.includes(name)} aria-label={`Always require approval for ${name}`} />) : <span className="text-dim">—</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="mt-2 text-[11.5px] text-dim">Customer emails always require approval. Autonomous applies only in AUTONOMOUS mode, only to low-risk internal tools, and never to automation-triggered runs.</p>
              </Panel>
              <SubmitButton>Save agent</SubmitButton>
            </ActionForm>
          ) : (
            <Panel title="Tools"><ul className="space-y-1 text-sm">{spec.tools.map((n) => <li key={n}><span className="font-mono text-xs">{n}</span> <span className="text-dim">· {getTool(n)!.kind}</span></li>)}</ul></Panel>
          )}
        </div>
        <aside className="space-y-5">
          <Panel title="Agent">
            <KV cols={1} items={[["Status", <StatusBadge key="s" value={cfg.enabled ? "ACTIVE" : "INACTIVE"} />], ["Mode", <StatusBadge key="m" value={cfg.mode} />], ["Requires", <span key="r" className="font-mono text-xs">ai:execute + {spec.requires}</span>], ["Capabilities", spec.capabilities.join(" · ")]]} />
          </Panel>
          <Panel title="Recent runs">
            {recent.length === 0 ? <p className="text-sm text-muted">No runs yet.</p> : <ul className="space-y-2 text-sm">{recent.map((e) => <li key={e.id}><Link href={`/admin/ai/logs/${e.id}`} className="line-clamp-2 text-fg hover:underline">{e.request}</Link><span className="text-xs text-dim">{e.status.toLowerCase().replace(/_/g, " ")} · ${Number(e.costUsd).toFixed(4)} · {fmtDate(e.startedAt, true)}</span></li>)}</ul>}
          </Panel>
        </aside>
      </div>
    </>
  );
}
