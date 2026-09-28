import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { growthSnapshot } from "@/lib/growth/snapshot";
import { getGrowthSettings, growthStop } from "@/lib/growth/settings";
import { qualifyLeadById } from "@/lib/growth/engine";
import { contentQa, ASSET_KINDS, POST_FORMATS } from "@/lib/growth/content";
import { SOCIAL_PLATFORMS } from "@/lib/growth/policy";
import type { ToolDef } from "./tools";

/**
 * Growth department tools for the existing AI employees. Reads return live records only. Drafts are saved as inert
 * review items (PENDING_APPROVAL / IN_REVIEW) that a person must approve before anything is published. No tool here
 * can change growth settings, budgets or kill switches.
 */
const def = <S extends z.ZodType>(t: ToolDef<S>) => t as unknown as ToolDef;
const id = z.string().trim().min(1).max(40);
const DAY = 86400_000;

export const GROWTH_TOOLS: ToolDef[] = [
  def({
    name: "getGrowthSummary",
    description: "Live growth funnel for the last N days (default 7): visitors, followers (real API/entered data only), leads, qualified, sales-ready, meetings, opportunities, proposals, deals won, revenue and ad spend per currency, CPL/cost per qualified lead/ROAS when computable, today's qualified leads vs the configured target, pending approvals and kill-switch state.",
    input: z.object({ days: z.number().int().min(1).max(365).default(7) }),
    permissions: ["growth:view"],
    kind: "read",
    risk: "LOW",
    run: async (_c, i) => {
      const s = await getGrowthSettings();
      const snap = await growthSnapshot({ from: new Date(Date.now() - i.days * DAY), to: new Date() }, s.dailyQualifiedLeadTarget);
      const stops = Object.entries(s.stops).filter(([, v]) => v).map(([k]) => k);
      return { data: { ...snap, note: "Target is a configurable goal, not a guarantee. Null metrics mean the data is not available.", autonomousMode: s.autonomousMode, channelsOn: Object.entries(s.channels).filter(([, v]) => v).map(([k]) => k), killSwitchesOn: stops } };
    },
  }),
  def({
    name: "listProspects",
    description: "B2B prospects from legitimate providers or lists (not leads). Filter by status (NEW, RESEARCHED, CONTACTED, REPLIED, CONVERTED, DISQUALIFIED).",
    input: z.object({ status: z.enum(["NEW", "RESEARCHED", "CONTACTED", "REPLIED", "CONVERTED", "DISQUALIFIED"]).optional(), limit: z.number().int().min(1).max(25).default(10) }),
    permissions: ["growth:view"],
    kind: "read",
    risk: "LOW",
    run: async (_c, i) => {
      const rows = await db.prospect.findMany({ where: { status: i.status }, orderBy: { createdAt: "desc" }, take: i.limit, select: { id: true, company: true, domain: true, contactName: true, title: true, country: true, industry: true, source: true, status: true, fitScore: true } });
      return { data: rows.map((r) => ({ ...r, link: "/admin/marketing/prospects" })), records: rows.map((r) => `Prospect:${r.id}`) };
    },
  }),
  def({
    name: "listSocialPosts",
    description: "Social posts by status (DRAFT, PENDING_APPROVAL, APPROVED, SCHEDULED, PUBLISHED, FAILED) with their QA results.",
    input: z.object({ status: z.enum(["DRAFT", "PENDING_APPROVAL", "APPROVED", "SCHEDULED", "PUBLISHED", "FAILED", "REJECTED"]).optional(), limit: z.number().int().min(1).max(25).default(10) }),
    permissions: ["growth:view"],
    kind: "read",
    risk: "LOW",
    run: async (_c, i) => {
      const rows = await db.socialPost.findMany({ where: { status: i.status }, orderBy: { createdAt: "desc" }, take: i.limit, select: { id: true, platform: true, language: true, format: true, status: true, body: true, scheduledAt: true, publishedAt: true, qa: true, error: true } });
      return { data: rows, records: rows.map((r) => `SocialPost:${r.id}`) };
    },
  }),
  def({
    name: "qualifyLead",
    description: "Re-score a lead with the growth qualification model (FIT, INTENT, ENGAGEMENT, BUDGET, TIMELINE → SALES_READY / QUALIFIED / NURTURE / LOW_FIT). Deterministic rules on recorded data only; stores the score, signals and reason on the lead.",
    input: z.object({ leadId: id }),
    permissions: ["leads:view", "growth:manage"],
    kind: "write",
    risk: "LOW",
    preview: async (i) => {
      const l = await db.lead.findUnique({ where: { id: i.leadId }, select: { name: true, ref: true, growthTier: true } });
      return { summary: `Re-qualify lead ${l ? `${l.name} (${l.ref})` : i.leadId}`, affected: [{ entity: "Lead", id: i.leadId }], changes: { growthTier: { from: l?.growthTier ?? "—", to: "(recalculated)" } } };
    },
    run: async (c, i) => {
      const stop = await growthStop({ kind: "channel", channel: "leadGen", agent: c.agentSlug });
      if (stop) throw new Error(stop);
      const q = await qualifyLeadById(i.leadId, c.agentSlug);
      if (!q) throw new Error("Lead not found or archived");
      return { data: q, records: [`Lead:${i.leadId}`] };
    },
  }),
  def({
    name: "draftSocialPost",
    description: "Save a social post DRAFT for human approval (never publishes). Include a UTM-tagged link to the site when relevant. Language en, hi or hinglish. Content QA runs automatically and blocking issues are shown to the reviewer.",
    input: z.object({
      platform: z.enum(SOCIAL_PLATFORMS),
      body: z.string().trim().min(1).max(5000),
      language: z.enum(["en", "hi", "hinglish"]).default("en"),
      format: z.enum(POST_FORMATS).default("POST"),
      link: z.string().trim().url().max(500).optional(),
      mediaUrl: z.string().trim().url().max(500).optional(),
      campaignId: id.optional(),
    }),
    permissions: ["growth:manage"],
    kind: "draft",
    risk: "LOW",
    run: async (c, i) => {
      const stop = await growthStop({ kind: "channel", channel: "content", agent: c.agentSlug });
      if (stop) throw new Error(stop);
      const s = await getGrowthSettings();
      const qa = contentQa(i.link ? `${i.body}\n\n${i.link}` : i.body, i.platform, { bannedPhrases: s.bannedPhrases, mediaUrl: i.mediaUrl });
      const p = await db.socialPost.create({ data: { platform: i.platform, body: i.body, language: i.language, format: i.format, link: i.link ?? null, mediaUrl: i.mediaUrl ?? null, campaignId: i.campaignId ?? null, status: "PENDING_APPROVAL", idempotencyKey: randomUUID(), qa: JSON.parse(JSON.stringify(qa)), createdByAgent: c.agentSlug, createdById: c.user.id === "system" ? null : c.user.id } });
      return { data: { storedForReview: `SocialPost ${p.id}`, qa, link: "/admin/marketing/social" }, records: [`SocialPost:${p.id}`] };
    },
  }),
  def({
    name: "draftContentAsset",
    description: "Save a long-form content DRAFT for review: ARTICLE, VIDEO_SCRIPT, REEL_SCRIPT, IMAGE_BRIEF, CAROUSEL, CASE_STUDY or NEWSLETTER. Never published automatically. Never invent facts, clients, numbers or testimonials.",
    input: z.object({ kind: z.enum(ASSET_KINDS), title: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(20_000), language: z.enum(["en", "hi", "hinglish"]).default("en") }),
    permissions: ["growth:manage"],
    kind: "draft",
    risk: "LOW",
    run: async (c, i) => {
      const stop = await growthStop({ kind: "channel", channel: "content", agent: c.agentSlug });
      if (stop) throw new Error(stop);
      const a = await db.contentAsset.create({ data: { kind: i.kind, title: i.title, body: i.body, language: i.language, status: "IN_REVIEW", createdByAgent: c.agentSlug, createdById: c.user.id === "system" ? null : c.user.id } });
      return { data: { storedForReview: `ContentAsset ${a.id}`, link: "/admin/marketing/content" }, records: [`ContentAsset:${a.id}`] };
    },
  }),
];
