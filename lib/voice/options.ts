import "server-only";
import { db } from "@/lib/db/client";
import type { RoleName } from "@/lib/auth/permissions";
import { runnableAgents } from "@/lib/ai/agents";
import { availableVoiceProviders } from "./provider";

/** Everything the voice console needs for one user: the AI employees they may talk to, engines and voice profiles. */
export async function voiceConsoleOptions(role: RoleName) {
  const specs = runnableAgents(role);
  const [rows, profiles] = await Promise.all([
    db.aIAgent.findMany({ where: { slug: { in: specs.map((s) => s.slug) } }, select: { slug: true, name: true, enabled: true, personaName: true } }),
    db.aIEmployeeVoiceProfile.findMany({ where: { agentSlug: { in: specs.map((s) => s.slug) } } }),
  ]);
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  const agents = specs.filter((s) => bySlug.get(s.slug)?.enabled !== false).map((s) => ({ slug: s.slug, name: bySlug.get(s.slug)?.name ?? s.name, persona: bySlug.get(s.slug)?.personaName ?? null }));
  return {
    agents,
    providers: availableVoiceProviders(),
    profiles: Object.fromEntries(profiles.map((p) => [p.agentSlug, { provider: p.provider, voiceId: p.voiceId, language: p.language, rate: Number(p.rate) }])),
  };
}
