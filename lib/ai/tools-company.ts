import "server-only";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { orgChart } from "@/lib/company/organisation";
import { progressFrom } from "@/lib/company/objective-status";
import { objectiveScope } from "@/lib/company/access";
import { regionalPerformance, workforcePerformance } from "@/lib/company/analytics";
import { enrollQualified, leadGenFunnel, runLeadPipeline } from "@/lib/company/leadgen";
import { addFinding, completeResearch } from "@/lib/company/research";
import { RESEARCH_SECTIONS } from "@/lib/company/research-rules";
import { engagementOf, getSocialStrategy, parseMetrics } from "@/lib/growth/social-metrics";
import { capabilityState, objectiveBlockers } from "@/lib/company/blockers";
import { CAPABILITY_PROVIDERS, type Capability } from "@/lib/company/blocker-rules";
import type { ToolDef } from "./tools";

/**
 * AI company tools. Reads return live records; runLeadPipeline is a governed write (approval in ASSIST mode) that
 * calls only connected, legitimate providers; research tools store findings that must carry sources.
 */
const def = <S extends z.ZodType>(t: ToolDef<S>) => t as unknown as ToolDef;
const id = z.string().trim().min(1).max(40);

export const COMPANY_TOOLS: ToolDef[] = [
  def({
    name: "getProviderBlockers",
    description: "Which external providers are CONNECTED or NOT_CONNECTED right now (AI, lead discovery, email verification, outreach email, social, ads) and, for an objective, every stage that is \"BLOCKED BY <provider>\" plus the human actions it waits on. Use it before planning or reporting; never report a blocked stage as done.",
    input: z.object({ objectiveId: id.optional() }),
    permissions: ["ai:view"],
    kind: "read",
    risk: "LOW",
    run: async (_c, i) => {
      const state = await capabilityState();
      const providers = (Object.keys(CAPABILITY_PROVIDERS) as Capability[]).map((k) => ({ capability: k, provider: CAPABILITY_PROVIDERS[k], status: state[k] ? "CONNECTED" : "NOT_CONNECTED" }));
      const objective = i.objectiveId ? await objectiveBlockers(i.objectiveId) : null;
      return { data: { providers, objective: objective && { blockedStages: objective.stages.map((b) => b.message), requiresHumanAction: objective.actions.map((a) => a.text) } }, records: i.objectiveId ? [`AIObjective:${i.objectiveId}`] : [] };
    },
  }),
  def({
    name: "getOrgChart",
    description: "The AI company organisation: every AI employee with slug, title, level, department, region and manager. Optionally one department.",
    input: z.object({ department: z.string().trim().max(40).optional() }),
    permissions: ["ai:view"],
    kind: "read",
    risk: "LOW",
    run: async (_c, i) => {
      const org = await orgChart();
      return { data: org.filter((n) => !i.department || n.department === i.department).map(({ slug, jobTitle, level, department, region, manager, enabled, available }) => ({ slug, jobTitle, level, department, region, manager, enabled, available })) };
    },
  }),
  def({
    name: "getObjectiveStatus",
    description: "Company objectives with real task progress (by status), blockers and open escalations. Pass objectiveId for one objective.",
    input: z.object({ objectiveId: id.optional(), limit: z.number().int().min(1).max(20).default(10) }),
    permissions: ["ai:view"],
    kind: "read",
    risk: "LOW",
    run: async (c, i) => {
      // Same visibility as the objective pages: own objectives unless executive / AI administrator.
      const scope = objectiveScope(c.user);
      const objectives = await db.aIObjective.findMany({ where: { ...scope, ...(i.objectiveId ? { id: i.objectiveId } : { status: { in: ["PLANNING", "ACTIVE", "BLOCKED"] } }) }, orderBy: { createdAt: "desc" }, take: i.limit });
      const out = [];
      for (const o of objectives) {
        const [tasks, esc] = await Promise.all([
          db.aITask.findMany({ where: { objectiveId: o.id }, select: { id: true, agentSlug: true, title: true, status: true, blockedReason: true } }),
          db.aIWorkMessage.findMany({ where: { objectiveId: o.id, kind: { in: ["ESCALATION", "BLOCKER"] }, status: "OPEN" }, select: { fromSlug: true, subject: true, body: true }, take: 10 }),
        ]);
        out.push({ id: o.id, title: o.title, status: o.status, playbook: o.playbook, target: o.targetMetric ? `${o.targetMetric} = ${o.targetValue}` : null, blockedReason: o.blockedReason, progress: progressFrom(tasks), blocked: tasks.filter((t) => t.status === "FAILED" || t.blockedReason).map((t) => ({ task: t.title, agent: t.agentSlug, status: t.status, reason: t.blockedReason })), openEscalations: esc, link: `/admin/company/objectives/${o.id}` });
      }
      return { data: out, records: objectives.map((o) => `AIObjective:${o.id}`) };
    },
  }),
  def({
    name: "getRegionalPerformance",
    description: "Leads, qualified leads, prospects, open deals, won deals and won value (per currency) by region (North America, UK/Europe, MENA, Asia, India) for the last N days. Records without a country are reported separately.",
    input: z.object({ days: z.number().int().min(1).max(365).default(30) }),
    permissions: ["leads:view"],
    kind: "read",
    risk: "LOW",
    run: async (c, i) => {
      const deals = can(c.user.role, "deals:view");
      const r = await regionalPerformance(i.days, { deals });
      return { data: { ...r, note: deals ? "Won value is per currency." : "Deal figures hidden: you lack deals:view." } };
    },
  }),
  def({
    name: "getWorkforcePerformance",
    description: "AI workforce performance for the last N days: per employee tasks done/failed/open, average duration, escalations, AI cost and success rate.",
    input: z.object({ days: z.number().int().min(1).max(365).default(30), department: z.string().trim().max(40).optional() }),
    permissions: ["ai:view"],
    kind: "read",
    risk: "LOW",
    run: async (_c, i) => {
      const rows = await workforcePerformance(i.days);
      return { data: rows.filter((r) => !i.department || r.department === i.department) };
    },
  }),
  def({
    name: "getLeadGenFunnel",
    description: "Lead generation funnel from real rows: discovered, with email, verified, duplicates avoided, qualified, contacted, replied, converted to CRM leads, meetings, opportunities, won — and source performance. Optionally for one campaign.",
    input: z.object({ campaignId: id.optional() }),
    permissions: ["growth:view"],
    kind: "read",
    risk: "LOW",
    run: async (_c, i) => ({ data: await leadGenFunnel(i.campaignId), records: i.campaignId ? [`Campaign:${i.campaignId}`] : [] }),
  }),
  def({
    name: "runLeadPipeline",
    description: "Run a lead generation campaign's pipeline: discover prospects from CONNECTED providers (Apollo/Hunter) up to the daily target, deduplicate, skip suppressed addresses, verify emails, add website intent, score ICP fit and qualify. Reports NOT_CONNECTED steps honestly. Uses provider credits.",
    input: z.object({ campaignId: id, maxDiscover: z.number().int().min(1).max(100).default(25) }),
    permissions: ["growth:manage"],
    kind: "write",
    risk: "MEDIUM",
    preview: async (i) => {
      const c = await db.campaign.findUnique({ where: { id: i.campaignId }, select: { name: true, dailyLeadTarget: true } });
      return { summary: `Run the lead pipeline for "${c?.name ?? i.campaignId}" (discover up to ${i.maxDiscover}; daily target ${c?.dailyLeadTarget ?? 25})`, affected: [{ entity: "Campaign", id: i.campaignId }] };
    },
    run: async (c, i) => {
      const r = await runLeadPipeline(i.campaignId, { actor: `${c.agentSlug}:${c.user.id}`, maxDiscover: i.maxDiscover });
      return { data: r, records: [`Campaign:${i.campaignId}`] };
    },
  }),
  def({
    name: "getSocialPerformance",
    description: "Social strategy (pillars, audience, tone, posts per week) and real post performance for the last 30 days from the platforms (null = not provided by the platform).",
    input: z.object({ days: z.number().int().min(1).max(90).default(30) }),
    permissions: ["growth:view"],
    kind: "read",
    risk: "LOW",
    run: async (_c, i) => {
      const [strategy, posts] = await Promise.all([getSocialStrategy(), db.socialPost.findMany({ where: { status: "PUBLISHED", publishedAt: { gte: new Date(Date.now() - i.days * 86400_000) } }, select: { id: true, platform: true, body: true, publishedAt: true, metrics: true }, orderBy: { publishedAt: "desc" }, take: 50 })]);
      return { data: { strategy, posts: posts.map((p) => ({ platform: p.platform, published: p.publishedAt, excerpt: p.body.slice(0, 140), metrics: parseMetrics(p.metrics), engagement: engagementOf(parseMetrics(p.metrics)) })) }, records: posts.map((p) => `SocialPost:${p.id}`) };
    },
  }),
  def({
    name: "enrollProspectsInSequence",
    description: "Request outreach: enrol a lead campaign's qualified prospects (verified email, not suppressed) in an OUTBOUND email sequence. Always needs a person's approval; sending then follows the email kill switches, daily email budget and unsubscribe rules.",
    input: z.object({ campaignId: id, sequenceId: id, max: z.number().int().min(1).max(200).default(50) }),
    permissions: ["growth:manage"],
    kind: "write",
    risk: "HIGH",
    alwaysApprove: true,
    preview: async (i) => {
      const [c, s, n] = await Promise.all([db.campaign.findUnique({ where: { id: i.campaignId }, select: { name: true } }), db.emailSequence.findUnique({ where: { id: i.sequenceId }, select: { name: true } }), db.prospect.count({ where: { campaignId: i.campaignId, status: "RESEARCHED", verification: "VALID" } })]);
      return { summary: `Enrol up to ${Math.min(i.max, n)} qualified prospects of "${c?.name ?? i.campaignId}" in sequence "${s?.name ?? i.sequenceId}"`, affected: [{ entity: "Campaign", id: i.campaignId }] };
    },
    run: async (c, i) => ({ data: await enrollQualified(i.campaignId, i.sequenceId, { actor: c.user.id, max: i.max }), records: [`Campaign:${i.campaignId}`] }),
  }),
  def({
    name: "recordMarketFinding",
    description: `Record one market research finding. section: ${Object.keys(RESEARCH_SECTIONS).join(", ")}. label: FACT (internal record — sourceUrl = its /admin link), SOURCE (web page you read — https sourceUrl), INFERENCE, RECOMMENDATION. Statistics without a source are rejected.`,
    input: z.object({ researchId: id, section: z.string().trim().max(40), statement: z.string().trim().min(10).max(1500), label: z.enum(["FACT", "SOURCE", "INFERENCE", "RECOMMENDATION"]), sourceUrl: z.string().trim().max(500).optional(), sourceTitle: z.string().trim().max(200).optional() }),
    permissions: ["leads:view"],
    kind: "draft",
    stores: true,
    risk: "LOW",
    run: async (_c, i) => {
      const r = await addFinding(i.researchId, i);
      if (!r.ok) throw new Error(r.error);
      return { data: { storedForReview: `finding ${r.count} on research ${i.researchId}` }, records: [`MarketResearch:${i.researchId}`] };
    },
  }),
  def({
    name: "completeMarketResearch",
    description: "Finish a market research request: executive summary (no new numbers). Saves the report to the Knowledge Base as a draft for review and to company memory.",
    input: z.object({ researchId: id, summary: z.string().trim().min(20).max(6000) }),
    permissions: ["leads:view"],
    kind: "draft",
    stores: true,
    risk: "LOW",
    run: async (c, i) => {
      const r = await completeResearch(i.researchId, i.summary, c.user.id === "system" ? null : c.user.id);
      if (!r.ok) throw new Error(r.error);
      return { data: { storedForReview: `Knowledge Base draft ${r.articleId}` }, records: [`MarketResearch:${i.researchId}`] };
    },
  }),
];
