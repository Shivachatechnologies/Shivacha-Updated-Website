import "server-only";
import { db } from "@/lib/db/client";
import { Prisma } from "@/lib/generated/prisma/client";
import { nextNumber } from "@/lib/os/numbers";
import { logActivity } from "@/lib/os/activity";
import { round2 } from "@/lib/os/money";
import { OPEN_DEAL_STAGES } from "@/lib/crm/constants";

export interface Range {
  from?: Date;
  to?: Date;
}

export interface CurrencyAmount {
  currency: string;
  amount: Prisma.Decimal;
}

const rows2 = (r: { currency: string; amount: Prisma.Decimal | string | null }[]): CurrencyAmount[] => r.filter((x) => x.amount != null).map((x) => ({ currency: x.currency, amount: round2(x.amount!) })).sort((a, b) => b.amount.comparedTo(a.amount));

/**
 * Sales metrics from real deal records. Amounts are grouped per currency (never converted or mixed).
 * `range` filters closed deals by close date and new deals by creation date; open pipeline is always "now".
 */
export async function dealMetrics(range: Range = {}, ownerId?: string) {
  const from = range.from ?? new Date("2000-01-01T00:00:00Z");
  const to = range.to ?? new Date("2999-01-01T00:00:00Z");
  const owner = ownerId ? Prisma.sql`AND "ownerId" = ${ownerId}` : Prisma.empty;
  const open = OPEN_DEAL_STAGES as readonly string[];
  const [pipeline, won, lost, counts, cycle] = await Promise.all([
    db.$queryRaw<{ currency: string; amount: Prisma.Decimal; weighted: Prisma.Decimal; n: bigint }[]>`
      SELECT currency::text, sum(value) AS amount, sum(value * probability / 100.0) AS weighted, count(*) AS n
      FROM "Deal" WHERE "deletedAt" IS NULL AND stage::text = ANY(${open}) ${owner} GROUP BY currency`,
    db.$queryRaw<{ currency: string; amount: Prisma.Decimal; avg: Prisma.Decimal; n: bigint }[]>`
      SELECT currency::text, sum(value) AS amount, avg(value) AS avg, count(*) AS n
      FROM "Deal" WHERE "deletedAt" IS NULL AND stage = 'WON' AND "wonAt" BETWEEN ${from} AND ${to} ${owner} GROUP BY currency`,
    db.$queryRaw<{ currency: string; amount: Prisma.Decimal; n: bigint }[]>`
      SELECT currency::text, sum(value) AS amount, count(*) AS n
      FROM "Deal" WHERE "deletedAt" IS NULL AND stage = 'LOST' AND "lostAt" BETWEEN ${from} AND ${to} ${owner} GROUP BY currency`,
    db.$queryRaw<{ created: bigint }[]>`SELECT count(*) AS created FROM "Deal" WHERE "deletedAt" IS NULL AND "createdAt" BETWEEN ${from} AND ${to} ${owner}`,
    db.$queryRaw<{ days: number | null }[]>`
      SELECT avg(extract(epoch FROM ("wonAt" - "createdAt")) / 86400.0)::float AS days
      FROM "Deal" WHERE "deletedAt" IS NULL AND stage = 'WON' AND "wonAt" BETWEEN ${from} AND ${to} ${owner}`,
  ]);
  const wonCount = won.reduce((n, r) => n + Number(r.n), 0);
  const lostCount = lost.reduce((n, r) => n + Number(r.n), 0);
  return {
    pipeline: rows2(pipeline),
    weighted: rows2(pipeline.map((r) => ({ currency: r.currency, amount: r.weighted }))),
    openCount: pipeline.reduce((n, r) => n + Number(r.n), 0),
    won: rows2(won),
    wonCount,
    lost: rows2(lost),
    lostCount,
    avgDeal: rows2(won.map((r) => ({ currency: r.currency, amount: r.avg }))),
    winRate: wonCount + lostCount ? Math.round((wonCount / (wonCount + lostCount)) * 1000) / 10 : null,
    salesCycleDays: cycle[0]?.days != null ? Math.round(cycle[0].days * 10) / 10 : null,
    created: Number(counts[0]?.created ?? 0),
  };
}

export interface WinOptions {
  createProject: boolean;
  projectName?: string | null;
}

/**
 * Marks a deal WON in one transaction: deal → client (created from the lead/company if missing) → lead lifecycle →
 * optional project → activity → audit row. If any step fails nothing is written.
 */
export async function markDealWon(dealId: string, actorId: string, opts: WinOptions) {
  return db.$transaction(async (tx) => {
    const deal = await tx.deal.findUnique({ where: { id: dealId }, include: { lead: { include: { client: { select: { id: true } } } } } });
    if (!deal || deal.deletedAt) throw new Error("Deal not found.");
    if (deal.stage === "WON") throw new Error("This deal is already won.");
    let clientId = deal.clientId ?? deal.lead?.client?.id ?? null;
    let clientCreated = false;
    if (!clientId) {
      const number = await nextNumber("client", tx);
      const l = deal.lead;
      const client = await tx.client.create({
        data: {
          number,
          name: (deal.company || l?.company || l?.name || deal.name).slice(0, 200),
          country: deal.country ?? l?.country,
          city: l?.city,
          website: l?.website,
          billingEmail: l?.email,
          phone: l?.phone,
          currency: deal.currency,
          status: "ONBOARDING",
          accountOwnerId: deal.ownerId ?? actorId,
          leadId: l?.id ?? null,
          contacts: l ? { create: { name: l.name, email: l.email, phone: l.phone, isPrimary: true } } : undefined,
        },
      });
      clientId = client.id;
      clientCreated = true;
      await logActivity({ type: "CREATED", summary: `Client created from won deal ${deal.number}`, actorId, clientId, dealId }, tx);
    }
    const now = new Date();
    await tx.deal.update({ where: { id: dealId }, data: { stage: "WON", probability: 100, wonAt: now, lostAt: null, lostReason: null, stageChangedAt: now, clientId } });
    if (deal.leadId) {
      await tx.lead.update({ where: { id: deal.leadId }, data: { status: "WON", lifecycleStage: "CUSTOMER" } });
      await tx.leadActivity.create({ data: { leadId: deal.leadId, actorId, type: "STATUS_CHANGED", data: { from: deal.lead?.status, to: "WON", via: `deal ${deal.number}` } } });
    }
    let projectId: string | null = null;
    if (opts.createProject) {
      const number = await nextNumber("project", tx);
      const p = await tx.project.create({ data: { number, name: (opts.projectName || deal.name).slice(0, 200), clientId, dealId, managerId: null, budget: deal.value, currency: deal.currency, status: "PLANNED" } });
      projectId = p.id;
      await logActivity({ type: "CREATED", summary: `Project created from won deal ${deal.number}`, actorId, projectId, clientId, dealId }, tx);
    }
    await tx.client.update({ where: { id: clientId }, data: { status: "ACTIVE" } });
    // Commercial documents created before the client existed now belong to it.
    await tx.proposal.updateMany({ where: { dealId, clientId: null }, data: { clientId } });
    await tx.quote.updateMany({ where: { dealId, clientId: null }, data: { clientId } });
    await logActivity({ type: "WON", summary: `Deal won${clientCreated ? " — client created" : ""}${projectId ? " — project created" : ""}`, actorId, dealId, clientId, data: { value: deal.value.toString(), currency: deal.currency } }, tx);
    await tx.auditLog.create({ data: { userId: actorId, action: "deal.won", entity: "Deal", entityId: dealId, metadata: { clientId, clientCreated, projectId } } });
    return { deal, clientId, clientCreated, projectId };
  });
}
