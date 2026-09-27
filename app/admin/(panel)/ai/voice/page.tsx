import Link from "next/link";
import { db } from "@/lib/db/client";
import { requireAccess } from "@/lib/os/guard";
import { providerStatus } from "@/lib/ai/provider";
import { voiceConsoleOptions } from "@/lib/voice/options";
import { resolveVoiceContext } from "@/lib/voice/context";
import { str, type SP } from "@/components/admin/os";
import { PageHeader, Panel, fmtDate } from "@/components/admin/ui";
import { VoiceConsole } from "@/components/admin/voice/console";

export const metadata = { title: "Talk to an AI employee" };
export const maxDuration = 300;

export default async function VoicePage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireAccess("voice:use", "AI_WORKFORCE");
  const sp = await searchParams;
  const [opts, context, recent] = await Promise.all([
    voiceConsoleOptions(user.role),
    resolveVoiceContext(user.role, str(sp, "entity", 20) || undefined, str(sp, "id", 40) || undefined),
    db.voiceSession.findMany({ where: { userId: user.id }, orderBy: { startedAt: "desc" }, take: 8, select: { id: true, agentSlug: true, startedAt: true, summary: true, status: true } }),
  ]);
  const ai = providerStatus();
  return (
    <>
      <PageHeader title="Talk to an AI employee" description="Speak or type. Answers come from the same AI employees, tools, permissions and approvals as chat; anything that changes data still waits for approval." crumbs={[{ label: "AI Workforce" }, { label: "Talk" }]} actions={<Link href="/admin/ai/conversations" className="btn-secondary h-9 px-3 text-[13px]">Conversations</Link>} />
      {!ai.connected && <p className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">The AI provider is not connected (ANTHROPIC_API_KEY), so AI employees can show live data but cannot reason or answer in their own words yet.</p>}
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <Panel>
          <VoiceConsole agents={opts.agents} initialAgent={str(sp, "agent", 40) || undefined} context={context ? { entity: context.entity, id: context.id } : null} contextLabel={context?.label} providers={opts.providers} profiles={opts.profiles} />
        </Panel>
        <Panel title="Your recent calls">
          {recent.length ? (
            <ul className="space-y-2 text-sm">
              {recent.map((r) => (
                <li key={r.id}>
                  <Link href={`/admin/ai/conversations/${r.id}`} className="hover:text-brand-blue">{fmtDate(r.startedAt, true)} · {r.agentSlug}</Link>
                  <p className="line-clamp-2 text-xs text-dim">{r.summary ?? (r.status === "ACTIVE" ? "In progress" : "")}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No voice calls yet.</p>
          )}
        </Panel>
      </div>
    </>
  );
}
