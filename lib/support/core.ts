import "server-only";
import { db } from "@/lib/db/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { nextNumber } from "@/lib/os/numbers";
import { logActivity } from "@/lib/os/activity";
import { notify } from "@/lib/os/notify";
import { queueEvent } from "@/lib/automation/engine";

export const TICKET_CATEGORIES = ["BUG", "FEATURE", "TECHNICAL", "BILLING", "GENERAL", "URGENT"] as const;
export const TICKET_STATUSES = ["OPEN", "IN_PROGRESS", "WAITING_FOR_CLIENT", "RESOLVED", "CLOSED"] as const;
export const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export type Priority = (typeof PRIORITIES)[number];

/** SLA targets in hours (first response / resolution). Overridable via Setting "sla". */
export const DEFAULT_SLA: Record<Priority, { response: number; resolution: number }> = {
  URGENT: { response: 1, resolution: 8 },
  HIGH: { response: 4, resolution: 24 },
  MEDIUM: { response: 8, resolution: 72 },
  LOW: { response: 24, resolution: 120 },
};

export async function slaPolicy(): Promise<typeof DEFAULT_SLA> {
  const row = await db.setting.findUnique({ where: { key: "sla" } }).catch(() => null);
  const v = (row?.value ?? {}) as Partial<typeof DEFAULT_SLA>;
  return Object.fromEntries(PRIORITIES.map((p) => [p, { response: Number(v[p]?.response) > 0 ? Number(v[p]!.response) : DEFAULT_SLA[p].response, resolution: Number(v[p]?.resolution) > 0 ? Number(v[p]!.resolution) : DEFAULT_SLA[p].resolution }])) as typeof DEFAULT_SLA;
}

export const slaDates = (policy: typeof DEFAULT_SLA, priority: Priority, from = new Date()) => ({
  firstResponseDueAt: new Date(from.getTime() + policy[priority].response * 3600_000),
  resolutionDueAt: new Date(from.getTime() + policy[priority].resolution * 3600_000),
});

/** SLA state for display: breached, at risk (< 25% of the window left) or on track. */
export function slaState(t: { status: string; firstResponseAt: Date | null; firstResponseDueAt: Date | null; resolutionDueAt: Date | null; resolvedAt: Date | null; createdAt: Date }, now = new Date()) {
  if (t.status === "RESOLVED" || t.status === "CLOSED") return t.resolutionDueAt && t.resolvedAt && t.resolvedAt > t.resolutionDueAt ? "BREACHED" : "MET";
  const due = !t.firstResponseAt && t.firstResponseDueAt ? t.firstResponseDueAt : t.resolutionDueAt;
  if (!due) return "NONE";
  if (due < now) return "BREACHED";
  const window = due.getTime() - t.createdAt.getTime();
  return due.getTime() - now.getTime() < window * 0.25 ? "AT_RISK" : "ON_TRACK";
}

export interface NewTicket {
  subject: string;
  description?: string | null;
  category: (typeof TICKET_CATEGORIES)[number];
  priority: Priority;
  source: "PORTAL" | "EMAIL" | "PHONE" | "INTERNAL" | "WEBSITE";
  clientId?: string | null;
  projectId?: string | null;
  portalUserId?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  assigneeId?: string | null;
}

export async function createTicket(t: NewTicket, actorId: string | null, tx?: Prisma.TransactionClient) {
  const policy = await slaPolicy();
  const run = async (c: Prisma.TransactionClient) => {
    const number = await nextNumber("ticket", c);
    const ticket = await c.ticket.create({ data: { ...t, number, priority: t.category === "URGENT" ? "URGENT" : t.priority, ...slaDates(policy, t.category === "URGENT" ? "URGENT" : t.priority) } });
    await logActivity({ type: "CREATED", summary: `Ticket ${number} created (${t.source.toLowerCase()})`, actorId, ticketId: ticket.id, clientId: t.clientId }, c);
    return ticket;
  };
  const ticket = tx ? await run(tx) : await db.$transaction(run);
  queueEvent({ trigger: "TICKET_CREATED", entity: "Ticket", entityId: ticket.id, ownerId: ticket.assigneeId, actorId, payload: { ticket: { id: ticket.id, number: ticket.number, subject: ticket.subject, category: ticket.category, priority: ticket.priority, source: ticket.source, clientId: ticket.clientId, email: ticket.contactEmail } } });
  await notify({ type: "ticket.created", title: `New ticket ${ticket.number}: ${ticket.subject}`, body: `${ticket.priority} · ${ticket.category}`, href: `/admin/support/${ticket.id}`, entity: "Ticket", entityId: ticket.id, permission: "support:manage", exceptUserId: actorId });
  if (ticket.assigneeId && ticket.assigneeId !== actorId) await notify({ type: "ticket.assigned", title: `Ticket assigned: ${ticket.number}`, href: `/admin/support/${ticket.id}`, userIds: [ticket.assigneeId] });
  return ticket;
}
