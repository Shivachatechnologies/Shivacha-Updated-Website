import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { audit } from "@/lib/audit";
import { KV, StatusBadge } from "@/components/admin/os";
import { PageHeader, Panel, fmtDate, label } from "@/components/admin/ui";

export const metadata = { title: "Conversation" };

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAccess("ai:view", "AI_WORKFORCE");
  const { id } = await params;
  const s = await db.voiceSession.findUnique({ where: { id }, include: { user: { select: { name: true } }, messages: { orderBy: { createdAt: "asc" } } } });
  if (!s || (s.userId !== user.id && !can(user.role, "audit:view"))) notFound();
  if (s.userId !== user.id) await audit({ userId: user.id, action: "voice.transcript.viewed", entity: "VoiceSession", entityId: id, metadata: { owner: s.userId } });
  const ctx = s.context as { entity?: string; id?: string } | null;
  return (
    <>
      <PageHeader title={`Call with ${s.agentSlug}`} description={`${s.user.name} · ${fmtDate(s.startedAt, true)}`} crumbs={[{ label: "Conversations", href: "/admin/ai/conversations" }, { label: fmtDate(s.startedAt, true) }]} actions={<StatusBadge value={s.status} />} />
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <Panel title="Transcript">
          {s.messages.length ? (
            <ol className="space-y-3">
              {s.messages.map((m) => {
                const d = m.data as { actions?: { summary: string; status: string }[]; taskId?: string; status?: string } | null;
                return (
                  <li key={m.id} className={m.role === "user" ? "ml-8 rounded-lg bg-brand-blue/10 p-3" : "mr-8 rounded-lg bg-ink-850 p-3"}>
                    <p className="mb-1 text-xs text-dim">{m.role === "user" ? s.user.name : s.agentSlug} · {fmtDate(m.createdAt, true)}{m.latencyMs != null ? ` · ${(m.latencyMs / 1000).toFixed(1)}s` : ""}{m.interrupted ? " · interrupted" : ""}</p>
                    <p className="whitespace-pre-wrap text-sm">{m.text}</p>
                    {d?.actions?.map((a, i) => <p key={i} className="mt-1 text-xs text-muted">{label(a.status)}: {a.summary}</p>)}
                    {d?.taskId && <Link href={`/admin/ai/tasks/${d.taskId}`} className="mt-1 block text-xs text-brand-blue">Background task</Link>}
                    {m.executionId && <Link href={`/admin/ai/logs/${m.executionId}`} className="mt-1 block text-xs text-dim hover:text-fg">Execution log</Link>}
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="text-sm text-muted">No messages.</p>
          )}
        </Panel>
        <Panel title="Call details">
          <KV
            cols={1}
            items={[
              ["Engine", s.provider === "openai" ? "OpenAI speech (server)" : "Browser speech"],
              ["Language", s.language],
              ["Context", ctx?.entity ? `${ctx.entity} ${ctx.id}` : "—"],
              ["Duration", `${Math.round(s.durationSec / 60)} min`],
              ["Audio transcribed", `${s.audioInSec}s`],
              ["Tokens", `${s.inputTokens.toLocaleString()} in / ${s.outputTokens.toLocaleString()} out`],
              ["AI cost", `$${Number(s.costUsd).toFixed(4)}`],
              ["Voice cost (estimate)", `$${Number(s.voiceCostUsd).toFixed(4)}`],
              ["Summary", s.summary],
            ]}
          />
          <p className="mt-3 text-xs text-dim">Raw audio is never stored; only this transcript.</p>
        </Panel>
      </div>
    </>
  );
}
