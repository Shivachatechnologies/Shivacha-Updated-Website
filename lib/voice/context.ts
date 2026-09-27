import "server-only";
import { db } from "@/lib/db/client";
import { can, type RoleName } from "@/lib/auth/permissions";

import { VOICE_ENTITIES, type VoiceEntity } from "./paths";

/** Resolves a record the user is looking at into a label, only if they may view it. Returns null otherwise. */
export async function resolveVoiceContext(role: RoleName, entity: string | undefined, id: string | undefined): Promise<{ entity: VoiceEntity; id: string; label: string } | null> {
  if (!entity || !id || !(VOICE_ENTITIES as readonly string[]).includes(entity) || id.length > 40) return null;
  const e = entity as VoiceEntity;
  const q = async (): Promise<string | null | undefined> => {
    switch (e) {
      case "Lead":
        return can(role, "leads:view") ? (await db.lead.findUnique({ where: { id }, select: { name: true, ref: true } }).then((r) => r && `${r.name} (${r.ref})`)) : null;
      case "Deal":
        return can(role, "deals:view") ? (await db.deal.findUnique({ where: { id }, select: { name: true, number: true } }).then((r) => r && `${r.number} · ${r.name}`)) : null;
      case "Project":
        return can(role, "projects:view") ? (await db.project.findUnique({ where: { id }, select: { name: true, number: true } }).then((r) => r && `${r.number} · ${r.name}`)) : null;
      case "Invoice":
        return can(role, "finance:view") ? (await db.invoice.findUnique({ where: { id }, select: { number: true } }).then((r) => r?.number)) : null;
      case "Ticket":
        return can(role, "support:view") ? (await db.ticket.findUnique({ where: { id }, select: { number: true, subject: true } }).then((r) => r && `${r.number} · ${r.subject}`)) : null;
      case "Client":
        return can(role, "clients:view") ? (await db.client.findUnique({ where: { id }, select: { name: true } }).then((r) => r?.name)) : null;
    }
  };
  const label = await q().catch(() => null);
  return label ? { entity: e, id, label: `${e}: ${label}` } : null;
}
