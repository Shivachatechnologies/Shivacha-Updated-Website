import "server-only";
import { db } from "@/lib/db/client";
import type { Prisma } from "@/lib/generated/prisma/client";

type Tx = Prisma.TransactionClient | typeof db;

export interface ActivityInput {
  type: string;
  summary?: string;
  data?: Record<string, unknown>;
  actorId?: string | null;
  aiAgent?: string | null;
  dealId?: string | null;
  clientId?: string | null;
  projectId?: string | null;
  ticketId?: string | null;
  proposalId?: string | null;
  quoteId?: string | null;
  contractId?: string | null;
  invoiceId?: string | null;
}

/** Appends to the unified business timeline. Pass `tx` to keep it inside the caller's transaction. */
export function logActivity(a: ActivityInput, tx: Tx = db) {
  return tx.activity.create({
    data: {
      type: a.type,
      summary: a.summary?.slice(0, 500),
      data: (a.data ?? undefined) as Prisma.InputJsonValue | undefined,
      actorId: a.actorId ?? null,
      aiAgent: a.aiAgent ?? null,
      dealId: a.dealId ?? null,
      clientId: a.clientId ?? null,
      projectId: a.projectId ?? null,
      ticketId: a.ticketId ?? null,
      proposalId: a.proposalId ?? null,
      quoteId: a.quoteId ?? null,
      contractId: a.contractId ?? null,
      invoiceId: a.invoiceId ?? null,
    },
  });
}
