import "server-only";
import { db } from "@/lib/db/client";
import { Prisma } from "@/lib/generated/prisma/client";
import { SOCIAL_PLATFORMS } from "./policy";
import { aggregateCredit, channelOfLead, type AttributionModel, type Touch } from "./attribution";

type Money = { currency: string; amount: number }[];

export interface GrowthSnapshot {
  range: { from: string; to: string };
  visitors: number;
  followers: { total: number | null; change: number | null; platforms: { platform: string; followers: number | null; change: number | null; asOf: string | null }[] };
  leads: number;
  qualified: number;
  salesReady: number;
  nurture: number;
  lowFit: number;
  meetings: number;
  opportunities: number;
  proposals: number;
  deals: number;
  revenue: Money;
  spend: Money;
  /** Cost metrics only when all spend is in one currency (never mixed); ROAS only when revenue shares that currency. */
  cpl: { currency: string; value: number } | null;
  costPerQualified: { currency: string; value: number } | null;
  costPerMeeting: { currency: string; value: number } | null;
  roas: number | null;
  qualifiedToday: number;
  target: number;
  pendingApprovals: { posts: number; assets: number };
  emailsSentToday: number;
  suppressed: number;
}

const money = (rows: { currency: string; amount: Prisma.Decimal | number | null }[]): Money => rows.filter((r) => r.amount != null && Number(r.amount) !== 0).map((r) => ({ currency: r.currency, amount: Math.round(Number(r.amount) * 100) / 100 }));
const per = (spend: Money, n: number) => (spend.length === 1 && n > 0 ? { currency: spend[0].currency, value: Math.round((spend[0].amount / n) * 100) / 100 } : null);

export async function growthSnapshot(range: { from: Date; to: Date }, target = 100): Promise<GrowthSnapshot> {
  const { from, to } = range;
  const inRange = { gte: from, lte: to };
  const today = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
  const [visitors, leads, tiers, meetings, opportunities, proposals, deals, revenue, spend, qualifiedToday, posts, assets, emailUsage, suppressed, metrics] = await Promise.all([
    db.visitor.count({ where: { isBot: false, lastSeenAt: inRange } }),
    db.lead.count({ where: { archivedAt: null, mergedIntoId: null, createdAt: inRange } }),
    db.lead.groupBy({ by: ["growthTier"], where: { archivedAt: null, mergedIntoId: null, createdAt: inRange }, _count: { _all: true } }),
    db.communication.count({ where: { channel: "MEETING", leadId: { not: null }, occurredAt: inRange } }),
    db.deal.count({ where: { deletedAt: null, createdAt: inRange } }),
    db.proposal.count({ where: { deletedAt: null, sentAt: inRange } }),
    db.deal.count({ where: { deletedAt: null, stage: "WON", wonAt: inRange } }),
    db.$queryRaw<{ currency: string; amount: Prisma.Decimal }[]>`SELECT currency::text, sum(value) AS amount FROM "Deal" WHERE "deletedAt" IS NULL AND stage = 'WON' AND "wonAt" BETWEEN ${from} AND ${to} GROUP BY 1`,
    db.$queryRaw<{ currency: string; amount: Prisma.Decimal }[]>`SELECT c.currency::text, sum(m.spend) AS amount FROM "CampaignMetric" m JOIN "Campaign" c ON c.id = m."campaignId" WHERE m.date BETWEEN ${from} AND ${to} GROUP BY 1`,
    db.lead.count({ where: { archivedAt: null, growthTier: { in: ["QUALIFIED", "SALES_READY"] }, qualifiedAt: { gte: today } } }),
    db.socialPost.count({ where: { status: "PENDING_APPROVAL" } }),
    db.contentAsset.count({ where: { status: "IN_REVIEW" } }),
    db.growthUsage.findUnique({ where: { date_kind: { date: today, kind: "emailDaily" } }, select: { units: true } }),
    db.emailSuppression.count(),
    db.socialMetric.findMany({ where: { followers: { not: null } }, orderBy: { date: "desc" }, select: { platform: true, date: true, followers: true }, take: 400 }),
  ]);
  const tier = (t: string) => tiers.find((x) => x.growthTier === t)?._count._all ?? 0;
  const platforms = SOCIAL_PLATFORMS.map((platform) => {
    const rows = metrics.filter((m) => m.platform === platform);
    const latest = rows[0];
    const start = rows.find((m) => m.date <= from) ?? rows[rows.length - 1];
    return { platform, followers: latest?.followers ?? null, change: latest && start && latest !== start ? latest.followers! - start.followers! : null, asOf: latest ? latest.date.toISOString().slice(0, 10) : null };
  });
  const known = platforms.filter((p) => p.followers != null);
  const spendM = money(spend);
  const revenueM = money(revenue);
  const qualified = tier("QUALIFIED") + tier("SALES_READY");
  const sameRev = spendM.length === 1 ? revenueM.find((r) => r.currency === spendM[0].currency) : undefined;
  return {
    range: { from: from.toISOString(), to: to.toISOString() },
    visitors,
    followers: { total: known.length ? known.reduce((a, p) => a + p.followers!, 0) : null, change: known.some((p) => p.change != null) ? known.reduce((a, p) => a + (p.change ?? 0), 0) : null, platforms },
    leads,
    qualified,
    salesReady: tier("SALES_READY"),
    nurture: tier("NURTURE"),
    lowFit: tier("LOW_FIT"),
    meetings,
    opportunities,
    proposals,
    deals,
    revenue: revenueM,
    spend: spendM,
    cpl: per(spendM, leads),
    costPerQualified: per(spendM, qualified),
    costPerMeeting: per(spendM, meetings),
    roas: sameRev && spendM[0].amount > 0 ? Math.round((sameRev.amount / spendM[0].amount) * 100) / 100 : null,
    qualifiedToday,
    target,
    pendingApprovals: { posts, assets },
    emailsSentToday: emailUsage?.units ?? 0,
    suppressed,
  };
}

/** Qualified-lead credit per channel under an attribution model. Leads without touches use their captured UTM data. */
export async function attributionBy(model: AttributionModel, range: { from: Date; to: Date }) {
  const leads = await db.lead.findMany({
    where: { archivedAt: null, mergedIntoId: null, growthTier: { in: ["QUALIFIED", "SALES_READY"] }, createdAt: { gte: range.from, lte: range.to } },
    select: { createdAt: true, utmSource: true, utmMedium: true, source: true, touches: { select: { channel: true, campaign: true, occurredAt: true }, orderBy: { occurredAt: "asc" }, take: 50 } },
    take: 5000,
  });
  const perLead: Touch[][] = leads.map((l) => (l.touches.length ? l.touches : [{ channel: channelOfLead(l), occurredAt: l.createdAt }]));
  return aggregateCredit(perLead, model);
}
