import Link from "next/link";
import { db } from "@/lib/db/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { ListView, StatusBadge, pageOf, pick, str, PAGE_SIZE, type SP } from "@/components/admin/os";
import { fmtDate } from "@/components/admin/ui";

export const metadata = { title: "AI conversations" };

export default async function ConversationsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireAccess("ai:view", "AI_WORKFORCE");
  const sp = await searchParams;
  // Transcripts are personal: you see your own; auditors can review everyone's (and every view of another person's call is audited).
  const all = can(user.role, "audit:view");
  const values = { scope: all ? pick(sp, "scope", ["all"] as const) : undefined, agent: str(sp, "agent", 40), q: str(sp, "q", 80), page: str(sp, "page") };
  const where: Prisma.VoiceSessionWhereInput = { ...(values.scope === "all" ? {} : { userId: user.id }), ...(values.agent && { agentSlug: values.agent }), ...(values.q && { messages: { some: { text: { contains: values.q, mode: "insensitive" } } } }) };
  const page = pageOf(sp);
  const [total, rows, agents, totals] = await Promise.all([
    db.voiceSession.count({ where }),
    db.voiceSession.findMany({ where, orderBy: { startedAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { user: { select: { name: true } }, _count: { select: { messages: true } } } }),
    db.voiceSession.groupBy({ by: ["agentSlug"], _count: true }),
    db.voiceSession.aggregate({ where, _sum: { costUsd: true, voiceCostUsd: true, durationSec: true } }),
  ]);
  const cost = Number(totals._sum.costUsd ?? 0) + Number(totals._sum.voiceCostUsd ?? 0);
  return (
    <ListView
      title="AI conversations"
      description={`Voice calls with AI employees. ${Math.round((totals._sum.durationSec ?? 0) / 60)} min, $${cost.toFixed(4)} in AI and voice costs for this view. Raw audio is never stored.`}
      crumbs={[{ label: "AI Workforce" }, { label: "Conversations" }]}
      actions={<Link href="/admin/ai/voice" className="btn-primary h-9 px-3 text-[13px]">Talk</Link>}
      filters={[{ type: "search", name: "q", placeholder: "Search transcripts…" }, { type: "select", name: "agent", label: "Any AI employee", options: agents.map((a) => [a.agentSlug, a.agentSlug] as const) }, ...(all ? [{ type: "select" as const, name: "scope", label: "My calls", options: [["all", "Everyone's calls"]] as const }] : [])]}
      values={values}
      rows={rows}
      total={total}
      page={page}
      basePath="/admin/ai/conversations"
      empty={{ title: "No voice conversations yet", action: <Link href="/admin/ai/voice" className="btn-primary h-9 px-3 text-[13px]">Start talking</Link> }}
      columns={[
        { header: "Started", cell: (r) => <Link href={`/admin/ai/conversations/${r.id}`} className="font-medium hover:text-brand-blue">{fmtDate(r.startedAt, true)}</Link> },
        { header: "AI employee", cell: (r) => r.agentSlug },
        ...(values.scope === "all" ? [{ header: "Person", cell: (r: (typeof rows)[number]) => r.user.name }] : []),
        { header: "Summary", cell: (r) => <span className="line-clamp-2 text-muted">{r.summary ?? "—"}</span> },
        { header: "Turns", cell: (r) => r._count.messages },
        { header: "Length", cell: (r) => `${Math.round(r.durationSec / 60)} min` },
        { header: "Cost", cell: (r) => `$${(Number(r.costUsd) + Number(r.voiceCostUsd)).toFixed(4)}` },
        { header: "Status", cell: (r) => <StatusBadge value={r.status} /> },
      ]}
    />
  );
}
