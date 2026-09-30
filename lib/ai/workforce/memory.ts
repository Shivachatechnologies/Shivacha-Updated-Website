import "server-only";
import { db } from "@/lib/db/client";
import { MEMORY_KINDS, type MemoryKind } from "./profiles";
import { placementOf } from "@/lib/company/org";

/** Memory scopes (AI company hierarchy). EMPLOYEE is private to one employee; the others are shared by rule below. */
export const MEMORY_SCOPES = { EMPLOYEE: "Employee", COMPANY: "Company", DEPARTMENT: "Department", REGION: "Region", CLIENT: "Client", PROJECT: "Project", CAMPAIGN: "Campaign" } as const;
export type MemoryScope = keyof typeof MEMORY_SCOPES;
const ENTITY_SCOPE: Record<string, MemoryScope> = { Client: "CLIENT", Project: "PROJECT", Campaign: "CAMPAIGN" };

export interface MemoryContext {
  department?: string | null;
  region?: string | null;
  /** The record the current task is about; only memory for THAT record is loaded. */
  taskEntity?: string | null;
  taskEntityId?: string | null;
}

/**
 * Employee memory scoping: an employee reads its OWN entries, company knowledge (`shared` KNOWLEDGE entries and
 * COMPANY scope), memory for ITS department and region, and client/project/campaign memory only while working on that
 * record. Another employee's instructions, preferences and task history are never loaded.
 */
export const memoryScope = (agentSlug: string, c: MemoryContext = {}) => {
  const entityScope = c.taskEntity ? ENTITY_SCOPE[c.taskEntity] : undefined;
  return {
    OR: [
      { agentSlug, scope: "EMPLOYEE" },
      { shared: true, kind: "KNOWLEDGE" },
      { scope: "COMPANY" },
      ...(c.department ? [{ scope: "DEPARTMENT", scopeKey: c.department }] : []),
      ...(c.region ? [{ scope: "REGION", scopeKey: c.region }] : []),
      ...(entityScope && c.taskEntityId ? [{ scope: entityScope, scopeKey: c.taskEntityId }] : []),
    ],
    AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }],
  };
};

/** Memory block for the system prompt: pinned first, then newest, capped in size. */
export async function memoryPrompt(agentSlug: string, max = 6000, task: { taskEntity?: string | null; taskEntityId?: string | null } = {}) {
  const row = await db.aIAgent.findUnique({ where: { slug: agentSlug }, select: { departmentKey: true, regionKey: true } }).catch(() => null);
  const p = placementOf(agentSlug);
  const rows = await db.aIEmployeeMemory.findMany({ where: memoryScope(agentSlug, { department: row?.departmentKey ?? p?.department, region: row?.regionKey ?? p?.region, ...task }), orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }], take: 40, select: { kind: true, title: true, content: true, agentSlug: true, entity: true, entityId: true, scope: true } });
  if (!rows.length) return "";
  let out = "";
  for (const r of rows) {
    const scope = r.scope !== "EMPLOYEE" ? `, ${MEMORY_SCOPES[r.scope as MemoryScope]?.toLowerCase() ?? r.scope}` : r.agentSlug !== agentSlug ? ", shared" : "";
    const line = `- [${MEMORY_KINDS[r.kind as MemoryKind] ?? r.kind}${scope}] ${r.title}: ${r.content.replace(/\s+/g, " ").slice(0, 600)}${r.entity && r.entityId ? ` (${r.entity} ${r.entityId})` : ""}\n`;
    if (out.length + line.length > max) break;
    out += line;
  }
  return `Your business memory (from earlier work and your manager's instructions — verify facts against live data):\n${out}`;
}

/** Secrets never enter AI memory: anything that looks like a credential is replaced before saving. */
export function redactSecrets(text: string) {
  return text
    .replace(/\b(sk|pk|rk)[-_](live|test|ant|proj)?[-_]?[A-Za-z0-9_-]{16,}\b/g, "[REDACTED]")
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, "[REDACTED]")
    .replace(/\b(xox[abprs]-[A-Za-z0-9-]{10,}|gh[pousr]_[A-Za-z0-9]{20,}|ya29\.[A-Za-z0-9_-]{20,}|EAA[A-Za-z0-9]{30,})\b/g, "[REDACTED]")
    .replace(/((?:api[_ -]?key|secret|password|passwd|token|bearer)\s*[:=]\s*)\S+/gi, "$1[REDACTED]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/g, "Bearer [REDACTED]");
}

export async function saveMemory(m: { agentSlug: string; kind: MemoryKind; title: string; content: string; taskId?: string | null; createdById?: string | null; shared?: boolean; pinned?: boolean; entity?: string | null; entityId?: string | null; expiresInDays?: number; scope?: MemoryScope; scopeKey?: string | null }) {
  const scope: MemoryScope = m.scope ?? "EMPLOYEE";
  return db.aIEmployeeMemory.create({
    data: {
      agentSlug: m.agentSlug,
      kind: m.kind,
      title: redactSecrets(m.title).slice(0, 200),
      content: redactSecrets(m.content).slice(0, 8000),
      taskId: m.taskId ?? null,
      createdById: m.createdById ?? null,
      // Only company knowledge can be shared across employees.
      shared: m.kind === "KNOWLEDGE" && !!m.shared,
      pinned: !!m.pinned,
      entity: m.entity ?? null,
      entityId: m.entityId ?? null,
      scope,
      scopeKey: scope === "EMPLOYEE" || scope === "COMPANY" ? null : (m.scopeKey ?? null),
      expiresAt: m.expiresInDays ? new Date(Date.now() + m.expiresInDays * 86400_000) : null,
    },
  });
}
