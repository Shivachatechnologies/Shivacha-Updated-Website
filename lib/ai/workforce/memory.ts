import "server-only";
import { db } from "@/lib/db/client";
import { MEMORY_KINDS, type MemoryKind } from "./profiles";

/**
 * Employee memory scoping: an employee reads its OWN entries plus entries explicitly marked `shared` with kind
 * KNOWLEDGE (company knowledge). Another employee's instructions, preferences and task history are never loaded.
 */
export const memoryScope = (agentSlug: string) => ({
  OR: [{ agentSlug }, { shared: true, kind: "KNOWLEDGE" }],
  AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }],
});

/** Memory block for the system prompt: pinned first, then newest, capped in size. */
export async function memoryPrompt(agentSlug: string, max = 6000) {
  const rows = await db.aIEmployeeMemory.findMany({ where: memoryScope(agentSlug), orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }], take: 40, select: { kind: true, title: true, content: true, agentSlug: true, entity: true, entityId: true } });
  if (!rows.length) return "";
  let out = "";
  for (const r of rows) {
    const line = `- [${MEMORY_KINDS[r.kind as MemoryKind] ?? r.kind}${r.agentSlug !== agentSlug ? ", shared" : ""}] ${r.title}: ${r.content.replace(/\s+/g, " ").slice(0, 600)}${r.entity && r.entityId ? ` (${r.entity} ${r.entityId})` : ""}\n`;
    if (out.length + line.length > max) break;
    out += line;
  }
  return `Your business memory (from earlier work and your manager's instructions — verify facts against live data):\n${out}`;
}

export async function saveMemory(m: { agentSlug: string; kind: MemoryKind; title: string; content: string; taskId?: string | null; createdById?: string | null; shared?: boolean; pinned?: boolean; entity?: string | null; entityId?: string | null; expiresInDays?: number }) {
  return db.aIEmployeeMemory.create({
    data: {
      agentSlug: m.agentSlug,
      kind: m.kind,
      title: m.title.slice(0, 200),
      content: m.content.slice(0, 8000),
      taskId: m.taskId ?? null,
      createdById: m.createdById ?? null,
      // Only company knowledge can be shared across employees.
      shared: m.kind === "KNOWLEDGE" && !!m.shared,
      pinned: !!m.pinned,
      entity: m.entity ?? null,
      entityId: m.entityId ?? null,
      expiresAt: m.expiresInDays ? new Date(Date.now() + m.expiresInDays * 86400_000) : null,
    },
  });
}
