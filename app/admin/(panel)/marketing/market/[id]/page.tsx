import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAccess } from "@/lib/os/guard";
import { parseFindings, syncResearch } from "@/lib/company/research";
import { FINDING_LABELS, paramsSummary, RESEARCH_SECTIONS, type ResearchParams } from "@/lib/company/research-rules";
import { KV, StatusBadge } from "@/components/admin/os";
import { PageHeader, Panel, fmtDate } from "@/components/admin/ui";
import { GROWTH_CRUMB, GrowthTabs } from "@/components/admin/growth/tabs";

export const metadata = { title: "Market research" };
export const dynamic = "force-dynamic";

export default async function ResearchPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAccess("growth:view", "GROWTH");
  const { id } = await params;
  const r = await syncResearch(id);
  if (!r) notFound();
  const findings = parseFindings(r.findings);
  const sources = [...new Map(findings.filter((f) => f.sourceUrl).map((f) => [f.sourceUrl!, f.sourceTitle ?? f.sourceUrl!])).entries()];
  return (
    <>
      <PageHeader title={r.title} description={paramsSummary(r.params as ResearchParams)} crumbs={[GROWTH_CRUMB, { label: "Market intelligence", href: "/admin/marketing/market" }, { label: r.title }]} />
      <GrowthTabs active="market" />
      {r.blockedReason && <p className="mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{r.status} — {r.blockedReason}</p>}
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        <div className="min-w-0 space-y-4">
          {r.summary && <Panel title="Executive summary"><p className="text-sm whitespace-pre-wrap">{r.summary}</p></Panel>}
          {Object.entries(RESEARCH_SECTIONS).map(([k, label]) => {
            const items = findings.filter((f) => f.section === k);
            if (!items.length) return null;
            return (
              <Panel key={k} title={label}>
                <ul className="space-y-2 text-sm">
                  {items.map((f, i) => (
                    <li key={i}>
                      <StatusBadge value={f.label === "FACT" || f.label === "SOURCE" ? "REAL" : f.label === "INFERENCE" ? "ESTIMATED" : "MANUAL"} text={FINDING_LABELS[f.label]} /> <span className="text-fg">{f.statement}</span>
                      {f.sourceUrl && <a href={f.sourceUrl} target={f.sourceUrl.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer nofollow" className="ml-1 text-xs text-brand-blue hover:underline">{f.sourceTitle || "source"}</a>}
                    </li>
                  ))}
                </ul>
              </Panel>
            );
          })}
          {!findings.length && <p className="text-sm text-dim">No findings recorded yet.</p>}
        </div>
        <div className="space-y-4">
          <Panel title="Status">
            <KV cols={1} items={[["Status", <StatusBadge key="s" value={r.status} />], ["Findings", String(findings.length)], ["Requested", fmtDate(r.createdAt, true)], ["Completed", r.completedAt ? fmtDate(r.completedAt, true) : "—"]]} />
            {r.taskId && <p className="mt-2 text-sm"><Link href={`/admin/ai/tasks/${r.taskId}`} className="text-brand-blue hover:underline">Research task →</Link></p>}
            {r.knowledgeArticleId && <p className="mt-1 text-sm"><Link href={`/admin/knowledge/${r.knowledgeArticleId}`} className="text-brand-blue hover:underline">Knowledge Base draft →</Link></p>}
            {r.objectiveId && <p className="mt-1 text-sm"><Link href={`/admin/company/objectives/${r.objectiveId}`} className="text-brand-blue hover:underline">Objective →</Link></p>}
          </Panel>
          <Panel title={`Sources (${sources.length})`}>
            {sources.length ? <ul className="space-y-1 text-xs">{sources.map(([u, t]) => <li key={u} className="truncate"><a href={u} target={u.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer nofollow" className="text-brand-blue hover:underline">{t}</a></li>)}</ul> : <p className="text-xs text-dim">No sources cited yet.</p>}
          </Panel>
        </div>
      </div>
    </>
  );
}
