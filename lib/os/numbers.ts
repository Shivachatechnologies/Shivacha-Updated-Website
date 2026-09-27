import "server-only";
import { db } from "@/lib/db/client";
import type { Prisma } from "@/lib/generated/prisma/client";

export const NUMBER_PREFIX = {
  deal: "DL",
  proposal: "PR",
  quote: "QT",
  contract: "CT",
  client: "CL",
  project: "PJ",
  invoice: "INV",
  payment: "PAY",
  creditNote: "CN",
  ticket: "TK",
} as const;
export type NumberKind = keyof typeof NUMBER_PREFIX;

type Tx = Prisma.TransactionClient | typeof db;

/**
 * Next human-readable number, e.g. INV-2026-00042. Atomic (single UPSERT … RETURNING), safe under concurrency,
 * sequences restart per calendar year. Pass the transaction client to keep numbering inside the same transaction.
 */
export async function nextNumber(kind: NumberKind, tx: Tx = db): Promise<string> {
  const year = new Date().getUTCFullYear();
  const key = `${kind}:${year}`;
  const [row] = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "Counter" ("key", "value") VALUES (${key}, 1)
    ON CONFLICT ("key") DO UPDATE SET "value" = "Counter"."value" + 1
    RETURNING "value"`;
  return `${NUMBER_PREFIX[kind]}-${year}-${String(row.value).padStart(5, "0")}`;
}
