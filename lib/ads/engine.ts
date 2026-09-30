import "server-only";
import { db } from "@/lib/db/client";
import { Prisma } from "@/lib/generated/prisma/client";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/os/notify";
import { growthStop } from "@/lib/growth/settings";
import { hydrateVault } from "@/lib/integrations/vault";
import { adsProviders, type AdsProviderKey } from "./providers";
import { checkLaunch, parseAdsPolicy, type AdsPolicy } from "./policy";

/**
 * Advertising OS engine. Safety model:
 * - campaigns are created PAUSED at the provider; nothing spends until launch();
 * - launch and budget increases pass checkLaunch() (emergency stop, kill switches, daily spend limit, monthly account
 *   budget, per-campaign cap) and are executed only by a person with growth:control, via the Approval Center, or —
 *   only when the CEO enabled the autonomous policy — automatically up to its auto-approve amount;
 * - pausing and budget decreases always run immediately (they only reduce spend);
 * - spend comes only from the provider's reporting; the guard pauses everything when a limit is exceeded;
 * - every spend-affecting action is written to the audit log.
 */

const POLICY_KEY = "adsPolicy";
const json = (v: unknown) => JSON.parse(JSON.stringify(v ?? null)) as Prisma.InputJsonValue;
const utcDay = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const monthStart = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
};
const iso = (d: Date) => d.toISOString().slice(0, 10);

export class AdsError extends Error {}

export async function getAdsPolicy(): Promise<AdsPolicy> {
  const row = process.env.DATABASE_URL ? await db.setting.findUnique({ where: { key: POLICY_KEY } }).catch(() => null) : null;
  return parseAdsPolicy(row?.value);
}

export async function saveAdsPolicy(p: AdsPolicy, userId: string) {
  const prev = await getAdsPolicy();
  const next = parseAdsPolicy(p);
  await db.setting.upsert({ where: { key: POLICY_KEY }, update: { value: json(next) }, create: { key: POLICY_KEY, value: json(next) } });
  await audit({ userId, action: "ads.policy.saved", metadata: { from: prev, to: next } });
  if (next.emergencyStop && !prev.emergencyStop) await pauseAll(`Emergency stop switched on`, userId);
  return next;
}

async function blockedReason(): Promise<string | null> {
  const s = await growthStop({ kind: "channel", channel: "paidAds", autonomous: false });
  return s;
}

/** Spend context for limit checks: today's committed daily budgets and this month's reported spend (per currency). */
async function spendContext(currency: string) {
  const [active, month] = await Promise.all([
    db.adCampaign.aggregate({ where: { status: "ACTIVE", currency }, _sum: { dailyBudget: true } }),
    db.adSpendLog.aggregate({ where: { date: { gte: monthStart() }, adCampaign: { currency } }, _sum: { spend: true } }),
  ]);
  return { activeDaily: Number(active._sum.dailyBudget ?? 0), monthSpend: Number(month._sum.spend ?? 0) };
}

export interface NewAdCampaign {
  provider: AdsProviderKey;
  name: string;
  dailyBudget: number;
  currency: string;
  countries: string[];
  ageMin?: number | null;
  ageMax?: number | null;
  headline?: string | null;
  body?: string | null;
  link?: string | null;
  imageUrl?: string | null;
  campaignId?: string | null;
}

/** Creates the campaign at the provider (PAUSED) and records it. No money is committed by this step. */
export async function createAdCampaign(i: NewAdCampaign, actorId: string) {
  await hydrateVault();
  const policy = await getAdsPolicy();
  if (policy.emergencyStop) throw new AdsError("Advertising emergency stop is on.");
  const stop = await blockedReason();
  if (stop) throw new AdsError(`Advertising is stopped: ${stop}`);
  if (!(i.dailyBudget > 0)) throw new AdsError("Enter a daily budget.");
  if (policy.maxCampaignDaily != null && i.dailyBudget > policy.maxCampaignDaily) throw new AdsError(`The daily budget exceeds the per-campaign cap (${policy.maxCampaignDaily}).`);
  const p = adsProviders[i.provider];
  const r = await p.create({ ...i });
  if (!r.ok) throw new AdsError(r.error);
  const row = await db.adCampaign.create({ data: { provider: i.provider, name: i.name.slice(0, 200), campaignId: i.campaignId ?? null, status: "PAUSED", externalId: r.data.externalId, externalRefs: json(r.data.refs), currency: i.currency, dailyBudget: i.dailyBudget.toFixed(2), targeting: json({ countries: i.countries, ageMin: i.ageMin ?? null, ageMax: i.ageMax ?? null }), creative: json({ headline: i.headline ?? null, body: i.body ?? null, link: i.link ?? null, imageUrl: i.imageUrl ?? null }), error: r.data.notes.length ? r.data.notes.join(" ") : null, createdById: actorId } });
  await audit({ userId: /^c[a-z0-9]{20,}$/.test(actorId) ? actorId : null, action: "ads.campaign.created", entity: "AdCampaign", entityId: row.id, metadata: { provider: i.provider, externalId: r.data.externalId, dailyBudget: i.dailyBudget, currency: i.currency, status: "PAUSED" } });
  return row;
}

/**
 * Launches (or resumes) a campaign after every spend check. `by` says who authorised it: a person with growth:control,
 * an approved Approval Center request, or the autonomous policy. The provider must confirm before it counts as ACTIVE.
 */
export async function launchAdCampaign(id: string, by: { userId: string | null; via: "HUMAN" | "APPROVAL" | "POLICY" }) {
  await hydrateVault();
  const c = await db.adCampaign.findUnique({ where: { id } });
  if (!c) throw new AdsError("Ad campaign not found.");
  if (c.status === "ACTIVE") return c;
  if (!c.externalId) throw new AdsError("This campaign was never created at the provider.");
  const policy = await getAdsPolicy();
  const ctx = await spendContext(c.currency);
  const check = checkLaunch(policy, { dailyBudget: Number(c.dailyBudget), currency: c.currency, ...ctx, stop: await blockedReason(), via: by.via });
  if (!check.ok) {
    await audit({ userId: by.userId, action: "ads.campaign.launch_refused", entity: "AdCampaign", entityId: id, metadata: { reason: check.reason, via: by.via } });
    throw new AdsError(check.reason);
  }
  const r = await adsProviders[c.provider as AdsProviderKey].setStatus(c.externalId, (c.externalRefs ?? {}) as Record<string, string>, "ACTIVE");
  if (!r.ok) {
    await db.adCampaign.update({ where: { id }, data: { error: r.error } });
    await audit({ userId: by.userId, action: "ads.campaign.launch_failed", entity: "AdCampaign", entityId: id, metadata: { error: r.error } });
    throw new AdsError(r.error);
  }
  const row = await db.adCampaign.update({ where: { id }, data: { status: "ACTIVE", launchedAt: c.launchedAt ?? new Date(), approvedById: by.userId, error: null } });
  await audit({ userId: by.userId, action: by.via === "POLICY" ? "ads.campaign.launched_by_policy" : "ads.campaign.launched", entity: "AdCampaign", entityId: id, metadata: { provider: c.provider, dailyBudget: Number(c.dailyBudget), currency: c.currency, via: by.via } });
  return row;
}

/** Pausing reduces spend, so it always runs immediately. */
export async function pauseAdCampaign(id: string, actorId: string | null, reason = "Paused") {
  await hydrateVault();
  const c = await db.adCampaign.findUnique({ where: { id } });
  if (!c || !c.externalId) throw new AdsError("Ad campaign not found.");
  const r = await adsProviders[c.provider as AdsProviderKey].setStatus(c.externalId, (c.externalRefs ?? {}) as Record<string, string>, "PAUSED");
  if (!r.ok) {
    await db.adCampaign.update({ where: { id }, data: { error: `Pause failed: ${r.error}` } });
    await audit({ userId: actorId, action: "ads.campaign.pause_failed", entity: "AdCampaign", entityId: id, metadata: { error: r.error, reason } });
    throw new AdsError(`The provider did not confirm the pause: ${r.error}`);
  }
  await db.adCampaign.update({ where: { id }, data: { status: "PAUSED", error: null } });
  await audit({ userId: actorId, action: "ads.campaign.paused", entity: "AdCampaign", entityId: id, metadata: { reason } });
}

/** Budget change: decreases run now; increases pass the same checks as a launch (and need growth:control / approval). */
export async function setAdBudget(id: string, dailyBudget: number, by: { userId: string | null; via: "HUMAN" | "APPROVAL" | "POLICY" }) {
  await hydrateVault();
  const c = await db.adCampaign.findUnique({ where: { id } });
  if (!c || !c.externalId) throw new AdsError("Ad campaign not found.");
  if (!(dailyBudget > 0)) throw new AdsError("Enter a positive daily budget.");
  const current = Number(c.dailyBudget);
  if (dailyBudget > current) {
    const policy = await getAdsPolicy();
    const ctx = await spendContext(c.currency);
    const check = checkLaunch(policy, { dailyBudget, currency: c.currency, activeDaily: ctx.activeDaily - (c.status === "ACTIVE" ? current : 0), monthSpend: ctx.monthSpend, stop: await blockedReason(), via: by.via });
    if (!check.ok) throw new AdsError(check.reason);
  }
  const r = await adsProviders[c.provider as AdsProviderKey].setBudget(c.externalId, (c.externalRefs ?? {}) as Record<string, string>, dailyBudget);
  if (!r.ok) throw new AdsError(r.error);
  await db.adCampaign.update({ where: { id }, data: { dailyBudget: dailyBudget.toFixed(2) } });
  await audit({ userId: by.userId, action: "ads.campaign.budget_changed", entity: "AdCampaign", entityId: id, metadata: { from: current, to: dailyBudget, currency: c.currency, via: by.via } });
}

/** Emergency: pause every active campaign; failures are reported, never hidden. */
export async function pauseAll(reason: string, actorId: string | null) {
  const active = await db.adCampaign.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true } });
  const failed: string[] = [];
  for (const a of active) await pauseAdCampaign(a.id, actorId, reason).catch(() => failed.push(a.name));
  await audit({ userId: actorId, action: "ads.pause_all", metadata: { reason, paused: active.length - failed.length, failed } });
  if (failed.length) await notify({ type: "ai.escalation", title: `Ads could not be paused at the provider: ${failed.join(", ")}`.slice(0, 200), body: "Pause them in the ad platform now.", href: "/admin/marketing/ads", permission: "growth:control" });
  return { paused: active.length - failed.length, failed };
}

/**
 * Pulls provider-reported results for the last `days` days into AdSpendLog (and the growth campaign's CampaignMetric,
 * marked with the provider as its source), then applies the spend guard.
 */
export async function syncAdSpend(days = 7): Promise<{ synced: number; errors: string[]; guard: string | null }> {
  await hydrateVault();
  const rows = await db.adCampaign.findMany({ where: { externalId: { not: null }, status: { in: ["ACTIVE", "PAUSED"] } } });
  const to = new Date();
  const from = new Date(to.getTime() - (days - 1) * 86400_000);
  const errors: string[] = [];
  let synced = 0;
  for (const c of rows) {
    const r = await adsProviders[c.provider as AdsProviderKey].insights(c.externalId!, (c.externalRefs ?? {}) as Record<string, string>, iso(from), iso(to));
    if (!r.ok) {
      errors.push(`${c.name}: ${r.error}`);
      continue;
    }
    for (const d of r.data) {
      const date = new Date(`${d.date}T00:00:00Z`);
      const data = { spend: d.spend.toFixed(2), impressions: d.impressions, clicks: d.clicks, conversions: Math.round(d.conversions) };
      await db.adSpendLog.upsert({ where: { adCampaignId_date: { adCampaignId: c.id, date } }, update: data, create: { adCampaignId: c.id, date, ...data } });
      if (c.campaignId) await db.campaignMetric.upsert({ where: { campaignId_date_source: { campaignId: c.campaignId, date, source: `${c.provider.toUpperCase()}_ADS` } }, update: { spend: data.spend, impressions: d.impressions, clicks: d.clicks }, create: { campaignId: c.campaignId, date, source: `${c.provider.toUpperCase()}_ADS`, spend: data.spend, impressions: d.impressions, clicks: d.clicks } });
    }
    const tot = await db.adSpendLog.aggregate({ where: { adCampaignId: c.id }, _sum: { spend: true, impressions: true, clicks: true, conversions: true } });
    await db.adCampaign.update({ where: { id: c.id }, data: { spend: tot._sum.spend ?? 0, impressions: tot._sum.impressions ?? 0, clicks: tot._sum.clicks ?? 0, conversions: tot._sum.conversions ?? 0, lastSyncedAt: new Date() } });
    synced++;
  }
  return { synced, errors, guard: await spendGuard() };
}

/** Pauses everything when reported spend exceeds today's limit or the month's account budget. */
export async function spendGuard(): Promise<string | null> {
  const policy = await getAdsPolicy();
  const currencies = (await db.adCampaign.findMany({ where: { status: "ACTIVE" }, select: { currency: true }, distinct: ["currency"] })).map((c) => c.currency);
  for (const cur of currencies) {
    const [today, month] = await Promise.all([
      db.adSpendLog.aggregate({ where: { date: utcDay(), adCampaign: { currency: cur } }, _sum: { spend: true } }),
      db.adSpendLog.aggregate({ where: { date: { gte: monthStart() }, adCampaign: { currency: cur } }, _sum: { spend: true } }),
    ]);
    const t = Number(today._sum.spend ?? 0);
    const m = Number(month._sum.spend ?? 0);
    const reason = policy.dailySpendLimit != null && t > policy.dailySpendLimit ? `Today's reported spend ${t.toFixed(2)} ${cur} exceeds the daily limit ${policy.dailySpendLimit}` : policy.monthlyAccountBudget != null && m > policy.monthlyAccountBudget ? `This month's reported spend ${m.toFixed(2)} ${cur} exceeds the account budget ${policy.monthlyAccountBudget}` : null;
    if (reason) {
      await pauseAll(reason, null);
      await notify({ type: "ai.escalation", title: `Ads paused automatically: ${reason}`.slice(0, 200), href: "/admin/marketing/ads", permission: "growth:control" });
      return reason;
    }
  }
  return null;
}
