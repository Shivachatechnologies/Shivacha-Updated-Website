export const VOICE_ENTITIES = ["Lead", "Deal", "Project", "Invoice", "Ticket", "Client"] as const;
export type VoiceEntity = (typeof VOICE_ENTITIES)[number];

/** The AI employee best suited to each record type (the user can still pick another). */
export const AGENT_FOR_ENTITY: Record<VoiceEntity, string> = { Lead: "sales", Deal: "sales", Project: "project", Invoice: "finance", Ticket: "support", Client: "customer-success" };

const SEGMENT: Record<string, VoiceEntity> = { leads: "Lead", deals: "Deal", projects: "Project", "finance/invoices": "Invoice", support: "Ticket", clients: "Client" };

/** Maps an admin URL to the record it shows, for contextual voice (pure). */
export function entityFromPath(path: string): { entity: VoiceEntity; id: string } | null {
  const m = path.match(/^\/admin\/(leads|deals|projects|finance\/invoices|support|clients)\/([A-Za-z0-9_-]{8,40})(?:\/|$)/);
  if (!m || m[2] === "new") return null;
  return { entity: SEGMENT[m[1]], id: m[2] };
}
