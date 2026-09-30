import "server-only";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { createAdCampaign, getAdsPolicy, launchAdCampaign, pauseAdCampaign, setAdBudget } from "@/lib/ads/engine";
import { checkLaunch } from "@/lib/ads/policy";
import { adsReady } from "@/lib/ads/providers";
import { createApproval } from "./runner";
import { getTool, type ToolDef } from "./tools";

/**
 * Advertising tools for AI employees. Creating a campaign (always PAUSED at the provider), launching and budget
 * increases are HIGH risk and always go to the Human Approval Center — except a launch the CEO's autonomous ads policy
 * explicitly allows (≤ its auto-approve amount, within every spend limit). Pausing only reduces spend and runs now.
 */
const def = <S extends z.ZodType>(t: ToolDef<S>) => t as unknown as ToolDef;
const id = z.string().trim().min(1).max(40);
const money = (n: number, c: string) => `${n.toFixed(2)} ${c}`;

export const ADS_TOOLS: ToolDef[] = [
  def({
    name: "getAdCampaigns",
    description: "Paid-media campaigns (Meta, Google, LinkedIn) with status, daily budget, provider-reported spend, impressions, clicks, conversions, the ads policy limits and which ad accounts are CONNECTED.",
    input: z.object({ status: z.enum(["DRAFT", "PAUSED", "ACTIVE", "ENDED", "FAILED"]).optional(), limit: z.number().int().min(1).max(25).default(10) }),
    permissions: ["marketing:view"],
    kind: "read",
    risk: "LOW",
    run: async (_c, i) => {
      const [rows, policy, accounts] = await Promise.all([db.adCampaign.findMany({ where: { status: i.status }, orderBy: { createdAt: "desc" }, take: i.limit }), getAdsPolicy(), adsReady()]);
      return { data: { policy, accounts: accounts.map((a) => ({ provider: a.key, name: a.name, status: a.connected ? "CONNECTED" : "NOT_CONNECTED" })), campaigns: rows.map((r) => ({ id: r.id, provider: r.provider, name: r.name, status: r.status, dailyBudget: money(Number(r.dailyBudget), r.currency), spendToDate: money(Number(r.spend), r.currency), impressions: r.impressions, clicks: r.clicks, conversions: r.conversions, lastSyncedAt: r.lastSyncedAt, link: "/admin/marketing/ads" })) }, records: rows.map((r) => `AdCampaign:${r.id}`) };
    },
  }),
  def({
    name: "proposeAdCampaign",
    description: "Propose a paid-media campaign. After a person approves, it is created at the provider in PAUSED state (no spend). countries = ISO codes (US, IN, AE …).",
    input: z.object({ provider: z.enum(["meta", "google", "linkedin"]), name: z.string().trim().min(3).max(200), dailyBudget: z.number().positive().max(100_000), currency: z.string().trim().length(3).default("USD"), countries: z.array(z.string().trim().length(2)).min(1).max(20), headline: z.string().trim().max(120).optional(), body: z.string().trim().max(1000).optional(), link: z.string().trim().url().max(500).optional(), campaignId: id.optional() }),
    permissions: ["marketing:manage", "growth:control"],
    kind: "write",
    risk: "HIGH",
    alwaysApprove: true,
    preview: async (i) => ({ summary: `Create ${i.provider} ad campaign "${i.name}" (PAUSED, daily budget ${money(i.dailyBudget, i.currency)}, ${i.countries.join(", ")})`, affected: [], content: [i.headline, i.body, i.link].filter(Boolean).join("\n") }),
    run: async (c, i) => {
      const row = await createAdCampaign({ ...i, currency: i.currency.toUpperCase() }, c.user.id);
      return { data: { id: row.id, status: row.status, note: "Created paused at the provider; launching needs a separate approval." }, records: [`AdCampaign:${row.id}`] };
    },
  }),
  def({
    name: "requestAdLaunch",
    description: "Ask to launch (or resume) a paused ad campaign. Goes to the Human Approval Center unless the CEO's autonomous ads policy allows this budget; spend limits always apply.",
    input: z.object({ adCampaignId: id, reason: z.string().trim().min(5).max(1000) }),
    permissions: ["marketing:view"],
    kind: "draft",
    stores: true,
    risk: "LOW",
    run: async (c, i) => {
      const a = await db.adCampaign.findUnique({ where: { id: i.adCampaignId } });
      if (!a) throw new Error("Ad campaign not found.");
      const policy = await getAdsPolicy();
      if (policy.autonomous && Number(a.dailyBudget) <= policy.autoApproveUpTo) {
        const pre = checkLaunch(policy, { dailyBudget: Number(a.dailyBudget), currency: a.currency, activeDaily: 0, monthSpend: 0, stop: null, via: "POLICY" });
        if (pre.ok) {
          await launchAdCampaign(a.id, { userId: null, via: "POLICY" });
          return { data: { storedForReview: `launched under the autonomous ads policy (≤ ${policy.autoApproveUpTo})` }, records: [`AdCampaign:${a.id}`] };
        }
      }
      const tool = getTool("launchAdCampaign")!;
      const approval = await createApproval({ executionId: c.executionId, agentSlug: c.agentSlug, tool, input: { adCampaignId: a.id }, preview: { summary: `Launch ${a.provider} ad campaign "${a.name}" (daily budget ${money(Number(a.dailyBudget), a.currency)})`, affected: [{ entity: "AdCampaign", id: a.id }], content: i.reason }, requestedById: c.user.id === "system" ? null : c.user.id, reason: i.reason });
      return { data: { storedForReview: `launch request ${approval.id} waiting for approval` }, records: [`AdCampaign:${a.id}`] };
    },
  }),
  def({
    name: "launchAdCampaign",
    description: "Launch a paused ad campaign (spends money). Only runs from an approved request.",
    input: z.object({ adCampaignId: id }),
    permissions: ["marketing:manage", "growth:control"],
    kind: "write",
    risk: "CRITICAL",
    alwaysApprove: true,
    preview: async (i) => {
      const a = await db.adCampaign.findUnique({ where: { id: i.adCampaignId }, select: { name: true, provider: true, dailyBudget: true, currency: true } });
      return { summary: `Launch ${a?.provider ?? ""} ad campaign "${a?.name ?? i.adCampaignId}"${a ? ` (${money(Number(a.dailyBudget), a.currency)}/day)` : ""}`, affected: [{ entity: "AdCampaign", id: i.adCampaignId }] };
    },
    run: async (c, i) => {
      const r = await launchAdCampaign(i.adCampaignId, { userId: c.user.id === "system" ? null : c.user.id, via: "APPROVAL" });
      return { data: { status: r.status }, records: [`AdCampaign:${i.adCampaignId}`] };
    },
  }),
  def({
    name: "pauseAdCampaign",
    description: "Pause an ad campaign now (reduces spend; no approval needed). Give the reason, e.g. no conversions after meaningful spend.",
    input: z.object({ adCampaignId: id, reason: z.string().trim().min(5).max(500) }),
    permissions: ["marketing:view"],
    kind: "draft",
    stores: true,
    risk: "LOW",
    run: async (c, i) => {
      await pauseAdCampaign(i.adCampaignId, c.user.id === "system" ? null : c.user.id, `${c.agentSlug}: ${i.reason}`);
      return { data: { storedForReview: "paused at the provider" }, records: [`AdCampaign:${i.adCampaignId}`] };
    },
  }),
  def({
    name: "changeAdBudget",
    description: "Change an ad campaign's daily budget. Increases pass the spend limits; always approved by a person.",
    input: z.object({ adCampaignId: id, dailyBudget: z.number().positive().max(100_000) }),
    permissions: ["marketing:manage", "growth:control"],
    kind: "write",
    risk: "HIGH",
    alwaysApprove: true,
    preview: async (i) => {
      const a = await db.adCampaign.findUnique({ where: { id: i.adCampaignId }, select: { name: true, dailyBudget: true, currency: true } });
      return { summary: `Change daily budget of "${a?.name ?? i.adCampaignId}" from ${a ? money(Number(a.dailyBudget), a.currency) : "?"} to ${a ? money(i.dailyBudget, a.currency) : i.dailyBudget}`, affected: [{ entity: "AdCampaign", id: i.adCampaignId }], changes: { dailyBudget: { from: a ? Number(a.dailyBudget) : null, to: i.dailyBudget } } };
    },
    run: async (c, i) => {
      await setAdBudget(i.adCampaignId, i.dailyBudget, { userId: c.user.id === "system" ? null : c.user.id, via: "APPROVAL" });
      return { data: { dailyBudget: i.dailyBudget }, records: [`AdCampaign:${i.adCampaignId}`] };
    },
  }),
];
