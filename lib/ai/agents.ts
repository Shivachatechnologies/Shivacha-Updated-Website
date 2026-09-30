import "server-only";
import { db } from "@/lib/db/client";
import { can, type Permission, type RoleName } from "@/lib/auth/permissions";
import { ALL_AGENTS, agentBySlug, type AgentSpec } from "./catalog";
import { getTool } from "./tools";

export type AIModeName = "OBSERVE" | "ASSIST" | "AUTONOMOUS";

/** Creates any missing agent/tool rows from the catalogue. Never overwrites an admin's configuration. */
export async function ensureAgents() {
  const existing = await db.aIAgent.findMany({ select: { slug: true, id: true, tools: { select: { tool: true } } } });
  const bySlug = new Map(existing.map((a) => [a.slug, a]));
  for (const spec of ALL_AGENTS) {
    let row = bySlug.get(spec.slug);
    if (!row) {
      const created = await db.aIAgent.upsert({ where: { slug: spec.slug }, update: {}, create: { slug: spec.slug, name: spec.name, description: spec.description, mode: "ASSIST" }, select: { id: true, slug: true } });
      row = { ...created, tools: [] };
    }
    const have = new Set(row.tools.map((t) => t.tool));
    const missing = spec.tools.filter((t) => !have.has(t));
    if (missing.length) await db.aIAgentTool.createMany({ data: missing.map((tool) => ({ agentId: row!.id, tool })), skipDuplicates: true });
  }
}

export interface AgentConfig {
  spec: AgentSpec;
  id: string;
  name: string;
  enabled: boolean;
  mode: AIModeName;
  model: string | null;
  systemPrompt: string | null;
  dailyCostLimit: number | null;
  approvalActions: string[];
  /** Enabled tools → autonomousAllowed. */
  tools: Map<string, boolean>;
}

export async function getAgentConfig(slug: string): Promise<AgentConfig | null> {
  const spec = agentBySlug(slug);
  if (!spec) return null;
  let row = await db.aIAgent.findUnique({ where: { slug }, include: { tools: true } });
  if (!row) {
    await ensureAgents();
    row = await db.aIAgent.findUnique({ where: { slug }, include: { tools: true } });
  }
  if (!row) return null;
  return {
    spec,
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    mode: row.mode,
    model: row.model,
    systemPrompt: row.systemPrompt,
    dailyCostLimit: row.dailyCostLimit == null ? null : Number(row.dailyCostLimit),
    approvalActions: row.approvalActions,
    // Only catalogue tools can ever be enabled for an agent.
    tools: new Map(row.tools.filter((t) => t.enabled && spec.tools.includes(t.tool) && getTool(t.tool)).map((t) => [t.tool, t.autonomousAllowed])),
  };
}

export const canRunAgent = (role: RoleName, spec: AgentSpec) => can(role, "ai:execute") && can(role, spec.requires);
export const runnableAgents = (role: RoleName) => ALL_AGENTS.filter((a) => canRunAgent(role, a));
export const agentPermission = (slug: string): Permission => agentBySlug(slug)?.requires ?? "ai:configure";
