import "server-only";
import { db } from "@/lib/db/client";
import { Prisma } from "@/lib/generated/prisma/client";

/**
 * Marketing attribution from real records only: leads carry UTM/source/landing data captured by the website;
 * downstream conversion is traced lead → deal → proposal → won deal. Spend comes only from campaign metrics that were
 * entered or synced. Metrics that need data we do not have (e.g. ROI without spend) are returned as null.
 */
export type Dimension = "source" | "medium" | "campaign" | "landing";
const COL: Record<Dimension, Prisma.Sql> = { source: Prisma.sql`coalesce(l."utmSource", l.source, 'direct')`, medium: Prisma.sql`coalesce(l."utmMedium", '(none)')`, campaign: Prisma.sql`coalesce(l."utmCampaign", l.campaign, '(none)')`, landing: Prisma.sql`coalesce(l."landingPage", '(unknown)')` };

export interface FunnelRow {
  key: string;
  leads: number;
  qualified: number;
  proposals: number;
  won: number;
  wonValue: { currency: string; amount: number }[];
}

export async function funnelBy(dim: Dimension, range: { from?: Date; to?: Date }, limit = 25): Promise<FunnelRow[]> {
  const from = range.from ?? new Date("2000-01-01T00:00:00Z");
  const to = range.to ?? new Date("2999-01-01T00:00:00Z");
  const col = COL[dim];
  const rows = await db.$queryRaw<{ key: string; leads: bigint; qualified: bigint; proposals: bigint; won: bigint }[]>`
    SELECT ${col} AS key,
      count(*) AS leads,
      count(*) FILTER (WHERE l.status::text IN ('QUALIFIED','MEETING','PROPOSAL_SENT','NEGOTIATION','WON') OR l."lifecycleStage"::text IN ('SQL','OPPORTUNITY','CUSTOMER')) AS qualified,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "Proposal" p WHERE p."leadId" = l.id AND p."deletedAt" IS NULL AND p.status::text <> 'DRAFT')) AS proposals,
      count(*) FILTER (WHERE l.status = 'WON' OR EXISTS (SELECT 1 FROM "Deal" d WHERE d."leadId" = l.id AND d.stage = 'WON')) AS won
    FROM "Lead" l WHERE l."archivedAt" IS NULL AND l."createdAt" BETWEEN ${from} AND ${to}
    GROUP BY 1 ORDER BY leads DESC LIMIT ${limit}`;
  const keys = rows.map((r) => r.key);
  const value = keys.length
    ? await db.$queryRaw<{ key: string; currency: string; amount: Prisma.Decimal }[]>`
      SELECT ${col} AS key, d.currency::text, sum(d.value) AS amount FROM "Deal" d JOIN "Lead" l ON l.id = d."leadId"
      WHERE d.stage = 'WON' AND d."deletedAt" IS NULL AND l."createdAt" BETWEEN ${from} AND ${to} GROUP BY 1, 2`
    : [];
  return rows.map((r) => ({ key: r.key, leads: Number(r.leads), qualified: Number(r.qualified), proposals: Number(r.proposals), won: Number(r.won), wonValue: value.filter((v) => v.key === r.key).map((v) => ({ currency: v.currency, amount: Number(v.amount) })) }));
}

export async function campaignPerformance(c: { id: string; utmCampaign: string | null; currency: string }) {
  const [spend, metrics, funnel] = await Promise.all([
    db.campaignMetric.aggregate({ where: { campaignId: c.id }, _sum: { spend: true, impressions: true, clicks: true } }),
    db.campaignMetric.findMany({ where: { campaignId: c.id }, orderBy: { date: "desc" }, take: 60 }),
    c.utmCampaign
      ? db.$queryRaw<{ leads: bigint; qualified: bigint; won: bigint }[]>`
        SELECT count(*) AS leads,
          count(*) FILTER (WHERE status::text IN ('QUALIFIED','MEETING','PROPOSAL_SENT','NEGOTIATION','WON')) AS qualified,
          count(*) FILTER (WHERE status = 'WON' OR EXISTS (SELECT 1 FROM "Deal" d WHERE d."leadId" = "Lead".id AND d.stage = 'WON')) AS won
        FROM "Lead" WHERE "archivedAt" IS NULL AND lower(coalesce("utmCampaign", campaign)) = lower(${c.utmCampaign})`
      : Promise.resolve([{ leads: BigInt(0), qualified: BigInt(0), won: BigInt(0) }]),
  ]);
  const revenue = c.utmCampaign
    ? await db.$queryRaw<{ currency: string; amount: Prisma.Decimal }[]>`
      SELECT d.currency::text, sum(d.value) AS amount FROM "Deal" d JOIN "Lead" l ON l.id = d."leadId"
      WHERE d.stage = 'WON' AND d."deletedAt" IS NULL AND lower(coalesce(l."utmCampaign", l.campaign)) = lower(${c.utmCampaign}) GROUP BY 1`
    : [];
  const leads = Number(funnel[0]?.leads ?? 0);
  const won = Number(funnel[0]?.won ?? 0);
  const spendAmt = spend._sum.spend ? Number(spend._sum.spend) : 0;
  const sameCurrencyRevenue = revenue.find((r) => r.currency === c.currency);
  const rev = sameCurrencyRevenue ? Number(sameCurrencyRevenue.amount) : null;
  return {
    spend: spendAmt,
    impressions: spend._sum.impressions ?? 0,
    clicks: spend._sum.clicks ?? 0,
    leads,
    qualified: Number(funnel[0]?.qualified ?? 0),
    won,
    revenue: revenue.map((r) => ({ currency: r.currency, amount: Number(r.amount) })),
    cpl: spendAmt > 0 && leads > 0 ? spendAmt / leads : null,
    conversion: leads > 0 ? (won / leads) * 100 : null,
    /** Only when real spend and won revenue exist in the campaign's currency. */
    roi: spendAmt > 0 && rev != null ? ((rev - spendAmt) / spendAmt) * 100 : null,
    metrics,
  };
}

export const analyticsConnections = () => [
  { key: "ga", name: "Google Analytics 4", connected: !!process.env.GA4_PROPERTY_ID && !!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, tracking: !!process.env.NEXT_PUBLIC_GA_ID, env: ["GA4_PROPERTY_ID", "GOOGLE_SERVICE_ACCOUNT_EMAIL"] },
  { key: "gsc", name: "Google Search Console", connected: !!process.env.GSC_SITE_URL && !!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, tracking: !!process.env.NEXT_PUBLIC_GSC_VERIFICATION, env: ["GSC_SITE_URL", "GOOGLE_SERVICE_ACCOUNT_EMAIL"] },
  { key: "meta", name: "Meta Ads", connected: !!process.env.META_ADS_ACCESS_TOKEN && !!process.env.META_ADS_ACCOUNT_ID, tracking: !!process.env.NEXT_PUBLIC_META_PIXEL_ID, env: ["META_ADS_ACCESS_TOKEN", "META_ADS_ACCOUNT_ID"] },
  { key: "gads", name: "Google Ads", connected: !!process.env.GOOGLE_ADS_DEVELOPER_TOKEN && !!process.env.GOOGLE_ADS_CUSTOMER_ID, tracking: !!process.env.NEXT_PUBLIC_GA_ID, env: ["GOOGLE_ADS_DEVELOPER_TOKEN", "GOOGLE_ADS_CUSTOMER_ID"] },
  { key: "linkedin", name: "LinkedIn Ads", connected: !!process.env.LINKEDIN_ADS_ACCESS_TOKEN && !!process.env.LINKEDIN_ADS_ACCOUNT_ID, tracking: !!process.env.NEXT_PUBLIC_LINKEDIN_PARTNER_ID, env: ["LINKEDIN_ADS_ACCESS_TOKEN", "LINKEDIN_ADS_ACCOUNT_ID"] },
];
