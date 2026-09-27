"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { audit } from "@/lib/audit";
import { authorizeAccess } from "@/lib/os/guard";
import { fail, formObject, moneyStr, optDate, optId, optText, reqText, currency, type ActionState } from "@/lib/os/action";

const F = "MARKETING_ANALYTICS" as const;
const schema = z.object({
  name: reqText(200),
  channel: z.enum(["GOOGLE_ADS", "META_ADS", "LINKEDIN_ADS", "EMAIL", "SEO", "SOCIAL", "EVENT", "REFERRAL", "CONTENT", "OTHER"]),
  status: z.enum(["PLANNED", "ACTIVE", "PAUSED", "COMPLETED"]),
  utmCampaign: z.preprocess((v) => (v == null ? "" : String(v).trim().toLowerCase()), z.string().max(120).regex(/^[\w.\-+]*$/, "Letters, numbers, - _ . + only")).transform((v) => v || null),
  utmSource: optText(120),
  utmMedium: optText(120),
  landingPage: z.preprocess((v) => (v == null ? "" : String(v).trim()), z.string().max(300)).refine((v) => !v || v.startsWith("/"), "Use a site path like /lp/fintech").transform((v) => v || null),
  startDate: optDate,
  endDate: optDate,
  budget: moneyStr(),
  currency,
  notes: optText(5000),
  ownerId: optId,
});

export async function saveCampaignAction(id: string | null, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("marketing:manage", F);
    const d = schema.parse(formObject(form));
    const c = id ? await db.campaign.update({ where: { id }, data: d }) : await db.campaign.create({ data: { ...d, ownerId: d.ownerId ?? user.id } });
    await audit({ userId: user.id, action: id ? "campaign.updated" : "campaign.created", entity: "Campaign", entityId: c.id });
    revalidatePath("/admin/marketing/campaigns");
    return id ? { ok: "Campaign saved." } : { ok: "Campaign created.", redirect: `/admin/marketing/campaigns/${c.id}` };
  } catch (e) {
    return fail(e, "marketing");
  }
}

/** Daily spend / impressions / clicks entered from the ad platform's report (source MANUAL). */
export async function saveCampaignMetricAction(campaignId: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("marketing:manage", F);
    const d = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"), spend: moneyStr(true), impressions: z.coerce.number().int().min(0).max(1e10).default(0), clicks: z.coerce.number().int().min(0).max(1e9).default(0) }).parse(formObject(form));
    const date = new Date(`${d.date}T00:00:00Z`);
    await db.campaignMetric.upsert({ where: { campaignId_date_source: { campaignId, date, source: "MANUAL" } }, create: { campaignId, date, spend: d.spend!, impressions: d.impressions, clicks: d.clicks, source: "MANUAL" }, update: { spend: d.spend!, impressions: d.impressions, clicks: d.clicks } });
    await audit({ userId: user.id, action: "campaign.metric", entity: "Campaign", entityId: campaignId, metadata: d });
    revalidatePath(`/admin/marketing/campaigns/${campaignId}`);
    return { ok: "Metrics saved." };
  } catch (e) {
    return fail(e, "marketing");
  }
}
