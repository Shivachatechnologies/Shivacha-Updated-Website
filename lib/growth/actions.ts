"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { audit } from "@/lib/audit";
import { authorizeAccess } from "@/lib/os/guard";
import { fail, formObject, okThen, optText, optUrl, reqText, UserError, type ActionState } from "@/lib/os/action";
import { can } from "@/lib/auth/permissions";
import { AGENTS } from "@/lib/ai/catalog";
import { growthSettingsSchema, isHumanActor, KILL_KEYS, CHANNEL_KEYS, BUDGET_KEYS, SOCIAL_PLATFORMS, type KillSwitch } from "./policy";
import { getGrowthSettings, GROWTH_SETTING } from "./settings";
import { contentQa, excerptFor, repurposePlan, ASSET_KINDS, POST_FORMATS } from "./content";
import { buildUtmUrl, CHANNEL_UTM } from "./attribution";
import { DEFAULT_STEPS, isEmail, normalizeEmail, type SequenceStep } from "./email-rules";
import { enroll, handleReply, parseSteps, processDueEmails, suppress, SUPPRESSION_REASONS } from "./email";
import { publishPost } from "./social";
import { qualifyLeadById, qualifyPending, upsertGrowthLead } from "./engine";
import { leadProviders } from "./providers";
import { runGrowthLoop } from "./loop";
import { siteConfig } from "@/data/siteConfig";

const F = "GROWTH" as const;
const P = "/admin/marketing";
const json = (v: unknown) => JSON.parse(JSON.stringify(v ?? null));

/* ───────────────────────── control center (humans with growth:control only) ───────────────────────── */

export async function saveGrowthControlAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("growth:control", F);
    if (!isHumanActor(user)) throw new UserError("Only a person can change growth controls.");
    const f = formObject(form);
    const before = await getGrowthSettings();
    const d = growthSettingsSchema.parse({
      autonomousMode: form.get("autonomousMode"),
      channels: Object.fromEntries(CHANNEL_KEYS.map((k) => [k, form.get(`ch_${k}`)])),
      // Kill switches change only through their own buttons, so a stale form can never resume a stop.
      stops: before.stops,
      stoppedAgents: form.getAll("stoppedAgents").map(String).filter((s) => AGENTS.some((a) => a.slug === s)),
      stoppedPlatforms: form.getAll("stoppedPlatforms").map(String),
      budgets: Object.fromEntries(BUDGET_KEYS.map((k) => [k, f[`budget_${k}`]])),
      budgetCurrency: f.budgetCurrency,
      dailyQualifiedLeadTarget: f.dailyQualifiedLeadTarget,
      languages: form.getAll("languages").map(String),
      brandVoice: f.brandVoice ?? before.brandVoice,
      bannedPhrases: f.bannedPhrases ?? "",
    });
    await db.setting.upsert({ where: { key: GROWTH_SETTING }, update: { value: json(d) }, create: { key: GROWTH_SETTING, value: json(d) } });
    const changedStops = KILL_KEYS.filter((k) => before.stops[k] !== d.stops[k]).map((k) => `${k}:${d.stops[k] ? "ON" : "off"}`);
    await audit({ userId: user.id, action: "growth.control.changed", entity: "Setting", entityId: GROWTH_SETTING, metadata: { autonomousMode: d.autonomousMode, channels: d.channels, changedStops, stoppedAgents: d.stoppedAgents, stoppedPlatforms: d.stoppedPlatforms, budgets: d.budgets } });
    return okThen(`${P}/autonomous`, "Growth controls saved.");
  } catch (e) {
    return fail(e, "growth");
  }
}

/**
 * One-click kill switch. Turning a switch ON needs only growth:manage (anyone running growth can stop it);
 * turning it OFF needs growth:control. Automation identities can never call this.
 */
export async function toggleKillSwitchAction(key: KillSwitch, on: boolean): Promise<ActionState> {
  try {
    const user = await authorizeAccess(on ? "growth:manage" : "growth:control", F);
    if (!isHumanActor(user)) throw new UserError("Only a person can change kill switches.");
    if (!KILL_KEYS.includes(key)) throw new UserError("Unknown switch.");
    const s = await getGrowthSettings();
    const next = { ...s, stops: { ...s.stops, [key]: on } };
    await db.setting.upsert({ where: { key: GROWTH_SETTING }, update: { value: json(next) }, create: { key: GROWTH_SETTING, value: json(next) } });
    await audit({ userId: user.id, action: on ? "growth.killswitch.on" : "growth.killswitch.off", entity: "Setting", entityId: GROWTH_SETTING, metadata: { switch: key } });
    return okThen(`${P}/autonomous`, on ? `Stopped: ${key}.` : `Resumed: ${key}.`);
  } catch (e) {
    return fail(e, "growth");
  }
}

export async function runGrowthLoopNowAction(): Promise<ActionState> {
  try {
    const user = await authorizeAccess("growth:control", F);
    const n = await runGrowthLoop("MANUAL", user.id);
    return okThen(`${P}/autonomous`, `Growth loop finished (${n} action(s)). See the run log for details.`);
  } catch (e) {
    return fail(e, "growth");
  }
}

const listOf = (v: unknown) => String(v ?? "").split(/[\n,]/).map((x) => x.trim()).filter(Boolean).slice(0, 50);

export async function saveIcpAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("growth:manage", F);
    const f = formObject(form);
    const minBudget = f.minBudget ? Number(f.minBudget) : undefined;
    if (minBudget != null && (!Number.isFinite(minBudget) || minBudget < 0)) throw new UserError("Minimum budget must be a positive number.");
    const value = { countries: listOf(f.countries), services: form.getAll("services").map(String).slice(0, 50), minBudget };
    await db.setting.upsert({ where: { key: "growthIcp" }, update: { value: json(value) }, create: { key: "growthIcp", value: json(value) } });
    await audit({ userId: user.id, action: "growth.icp.changed", metadata: value });
    return okThen(`${P}/growth`, "Ideal customer profile saved.");
  } catch (e) {
    return fail(e, "growth");
  }
}

export async function qualifyNowAction(leadId: string | null): Promise<ActionState> {
  try {
    const user = await authorizeAccess("growth:manage", F);
    if (!can(user.role, "leads:view")) throw new UserError("You need access to leads.");
    const n = leadId ? ((await qualifyLeadById(leadId, "manual")) ? 1 : 0) : await qualifyPending();
    await audit({ userId: user.id, action: "growth.qualify", entity: leadId ? "Lead" : undefined, entityId: leadId ?? undefined, metadata: { scored: n } });
    return okThen(leadId ? `/admin/leads/${leadId}` : `${P}/growth`, `${n} lead(s) qualified.`);
  } catch (e) {
    return fail(e, "growth");
  }
}

/* ───────────────────────── demand generation (reuses Campaign) ───────────────────────── */

const demandSchema = z.object({
  objective: optText(200),
  market: optText(200),
  icp: optText(4000),
  offer: optText(4000),
  cta: optText(200),
  dailyLeadTarget: z.preprocess((v) => (v == null || v === "" ? null : Number(v)), z.number().int().min(0).max(100_000).nullable()),
  landingPage: z.preprocess((v) => (v == null ? "" : String(v).trim()), z.string().max(300)).refine((v) => !v || v.startsWith("/"), "Use a site path like /lp/fintech").transform((v) => v || null),
});

export async function saveDemandPlanAction(campaignId: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("growth:manage", F);
    const d = demandSchema.parse(formObject(form));
    const channels = form.getAll("channels").map(String).filter((c) => c in CHANNEL_UTM).slice(0, 20);
    await db.campaign.update({ where: { id: campaignId }, data: { ...d, channels } });
    await audit({ userId: user.id, action: "growth.demand.saved", entity: "Campaign", entityId: campaignId });
    revalidatePath(`${P}/demand`);
    return { ok: "Demand plan saved." };
  } catch (e) {
    return fail(e, "growth");
  }
}

/* ───────────────────────── social ───────────────────────── */

const postSchema = z.object({
  platform: z.enum(SOCIAL_PLATFORMS),
  language: z.enum(["en", "hi", "hinglish"]).default("en"),
  format: z.enum(POST_FORMATS).default("POST"),
  body: reqText(5000),
  link: optUrl,
  mediaUrl: optUrl,
  campaignId: z.preprocess((v) => (v ? String(v) : null), z.string().max(40).nullable()),
});

export async function saveSocialPostAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("growth:manage", F);
    const d = postSchema.parse(formObject(form));
    const s = await getGrowthSettings();
    const qa = contentQa(d.link ? `${d.body}\n\n${d.link}` : d.body, d.platform, { bannedPhrases: s.bannedPhrases, mediaUrl: d.mediaUrl });
    const p = await db.socialPost.create({ data: { ...d, status: "PENDING_APPROVAL", idempotencyKey: randomUUID(), qa: json(qa), createdById: user.id } });
    await audit({ userId: user.id, action: "growth.post.created", entity: "SocialPost", entityId: p.id });
    return okThen(`${P}/social`, "Post saved for approval.");
  } catch (e) {
    return fail(e, "growth");
  }
}

/** Approve (optionally schedule) or reject a post. Only people can approve; AI-drafted posts always pass through here. */
export async function reviewPostAction(postId: string, decision: "approve" | "reject", _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("growth:manage", F);
    if (!isHumanActor(user)) throw new UserError("Only a person can approve posts.");
    const post = await db.socialPost.findUnique({ where: { id: postId } });
    if (!post) throw new UserError("Post not found.");
    if (!["PENDING_APPROVAL", "DRAFT", "FAILED", "APPROVED", "SCHEDULED"].includes(post.status)) throw new UserError(`A ${post.status.toLowerCase()} post cannot be reviewed.`);
    if (decision === "reject") {
      await db.socialPost.update({ where: { id: postId }, data: { status: "REJECTED" } });
      await audit({ userId: user.id, action: "growth.post.rejected", entity: "SocialPost", entityId: postId });
      return okThen(`${P}/social`, "Post rejected.");
    }
    const s = await getGrowthSettings();
    const qa = contentQa(post.link ? `${post.body}\n\n${post.link}` : post.body, post.platform as (typeof SOCIAL_PLATFORMS)[number], { bannedPhrases: s.bannedPhrases, mediaUrl: post.mediaUrl });
    if (qa.some((i) => i.level === "block")) {
      await db.socialPost.update({ where: { id: postId }, data: { qa: json(qa) } });
      throw new UserError(`Content QA blocks this post: ${qa.filter((i) => i.level === "block").map((i) => i.message).join(" ")}`);
    }
    const when = String(form.get("scheduledAt") ?? "").trim();
    const scheduledAt = when ? new Date(when.length === 16 ? `${when}:00Z` : when) : null;
    if (scheduledAt && Number.isNaN(scheduledAt.getTime())) throw new UserError("Invalid schedule time.");
    await db.socialPost.update({ where: { id: postId }, data: { status: scheduledAt ? "SCHEDULED" : "APPROVED", scheduledAt, approvedById: user.id, qa: json(qa), error: null } });
    await audit({ userId: user.id, action: "growth.post.approved", entity: "SocialPost", entityId: postId, metadata: { scheduledAt } });
    return okThen(`${P}/social`, scheduledAt ? "Approved and scheduled." : "Approved.");
  } catch (e) {
    return fail(e, "growth");
  }
}

export async function publishNowAction(postId: string): Promise<ActionState> {
  try {
    const user = await authorizeAccess("growth:manage", F);
    const r = await publishPost(postId, { autonomous: false });
    await audit({ userId: user.id, action: r.ok ? "growth.post.published" : "growth.post.publish_failed", entity: "SocialPost", entityId: postId, metadata: { message: r.message } });
    if (!r.ok) throw new UserError(r.message);
    return okThen(`${P}/social`, r.message);
  } catch (e) {
    return fail(e, "growth");
  }
}

/** For platforms without API publishing (e.g. YouTube uploads): record that a person published it, with its ID. */
export async function markPublishedAction(postId: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("growth:manage", F);
    const externalId = reqText(200).parse(form.get("externalId"));
    const r = await db.socialPost.updateMany({ where: { id: postId, approvedById: { not: null }, status: { in: ["APPROVED", "SCHEDULED", "FAILED"] } }, data: { status: "PUBLISHED", publishedAt: new Date(), externalId, error: null } });
    if (!r.count) throw new UserError("Only an approved post can be marked as published.");
    await audit({ userId: user.id, action: "growth.post.marked_published", entity: "SocialPost", entityId: postId, metadata: { externalId } });
    return okThen(`${P}/social`, "Marked as published.");
  } catch (e) {
    return fail(e, "growth");
  }
}

/** Figures typed from a platform's own analytics (source MANUAL). Never estimated. */
export async function saveSocialMetricAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("growth:manage", F);
    const n = z.preprocess((v) => (v == null || v === "" ? null : Number(v)), z.number().int().min(0).max(1e10).nullable());
    const d = z.object({ platform: z.enum(SOCIAL_PLATFORMS), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"), followers: n, reach: n, impressions: n, engagements: n, clicks: n }).parse(formObject(form));
    const date = new Date(`${d.date}T00:00:00Z`);
    const { platform, followers, reach, impressions, engagements, clicks } = d;
    const vals = { followers, reach, impressions, engagements, clicks };
    await db.socialMetric.upsert({ where: { platform_date_source: { platform, date, source: "MANUAL" } }, create: { platform, date, source: "MANUAL", ...vals }, update: vals });
    await audit({ userId: user.id, action: "growth.social.metric", metadata: d });
    return okThen(`${P}/social`, "Metrics saved.");
  } catch (e) {
    return fail(e, "growth");
  }
}

/* ───────────────────────── content & repurposing ───────────────────────── */

export async function saveContentAssetAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("growth:manage", F);
    const d = z.object({ kind: z.enum(ASSET_KINDS), title: reqText(200), body: reqText(20_000), language: z.enum(["en", "hi", "hinglish"]).default("en"), mediaUrl: optUrl }).parse(formObject(form));
    const a = await db.contentAsset.create({ data: { ...d, status: "IN_REVIEW", createdById: user.id } });
    await audit({ userId: user.id, action: "growth.asset.created", entity: "ContentAsset", entityId: a.id });
    return okThen(`${P}/content`, "Content saved for review.");
  } catch (e) {
    return fail(e, "growth");
  }
}

export async function reviewAssetAction(assetId: string, decision: "APPROVED" | "ARCHIVED"): Promise<ActionState> {
  try {
    const user = await authorizeAccess("growth:manage", F);
    await db.contentAsset.update({ where: { id: assetId }, data: { status: decision } });
    await audit({ userId: user.id, action: `growth.asset.${decision.toLowerCase()}`, entity: "ContentAsset", entityId: assetId });
    return okThen(`${P}/content`, decision === "APPROVED" ? "Content approved." : "Content archived.");
  } catch (e) {
    return fail(e, "growth");
  }
}

/** Drafts derivative posts from an approved asset (each still needs its own approval before publishing). */
export async function repurposeAssetAction(assetId: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("growth:manage", F);
    const a = await db.contentAsset.findUnique({ where: { id: assetId } });
    if (!a) throw new UserError("Content not found.");
    if (a.status !== "APPROVED" && a.status !== "PUBLISHED") throw new UserError("Approve the content before repurposing it.");
    const path = String(form.get("path") ?? "").trim() || "/";
    if (!path.startsWith("/")) throw new UserError("Link must be a site path like /services/fintech.");
    const campaign = String(form.get("campaign") ?? "").trim() || `content-${a.id.slice(-6)}`;
    const s = await getGrowthSettings();
    const plan = repurposePlan(a.kind as (typeof ASSET_KINDS)[number]);
    for (const x of plan) {
      const utm = CHANNEL_UTM[x.platform];
      const link = buildUtmUrl(path, { ...utm, campaign, content: `${x.format.toLowerCase()}-${a.id.slice(-6)}` }, siteConfig.url);
      const body = excerptFor(a.body, x.platform);
      const qa = contentQa(`${body}\n\n${link}`, x.platform, { bannedPhrases: s.bannedPhrases, mediaUrl: a.mediaUrl });
      await db.socialPost.create({ data: { platform: x.platform, format: x.format, language: a.language, body, link, mediaUrl: a.mediaUrl, status: "PENDING_APPROVAL", idempotencyKey: randomUUID(), qa: json(qa), sourceAssetId: a.id, createdById: user.id } });
    }
    await audit({ userId: user.id, action: "growth.asset.repurposed", entity: "ContentAsset", entityId: a.id, metadata: { posts: plan.length } });
    return okThen(`${P}/social`, `${plan.length} post draft(s) created for approval.`);
  } catch (e) {
    return fail(e, "growth");
  }
}

/* ───────────────────────── prospects (a prospect is not a lead) ───────────────────────── */

export async function addProspectAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("growth:manage", F);
    const d = z.object({ company: reqText(200), domain: optText(200), contactName: optText(200), title: optText(200), email: z.preprocess((v) => (v == null ? "" : String(v).trim().toLowerCase()), z.string().max(200)).refine((v) => !v || isEmail(v), "Invalid email").transform((v) => v || null), country: optText(80), industry: optText(120), source: z.preprocess((v) => (v ? v : "manual"), z.string().trim().max(60)), notes: optText(4000) }).parse(formObject(form));
    const p = await db.prospect.create({ data: { ...d, provenance: json({ addedBy: user.id, how: "manual entry" }) } });
    await audit({ userId: user.id, action: "growth.prospect.created", entity: "Prospect", entityId: p.id });
    return okThen(`${P}/prospects`, "Prospect added.");
  } catch (e) {
    return fail(e, "growth");
  }
}

/** Pulls business contacts from a connected, legitimate B2B data provider. Never scrapes. */
export async function importProspectsAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("growth:manage", F);
    const provider = String(form.get("provider") ?? "");
    const domain = String(form.get("domain") ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) throw new UserError("Enter a company domain like example.com.");
    const r = provider === "apollo" ? await leadProviders.apollo.peopleSearch({ domains: [domain], perPage: 10 }) : await leadProviders.hunter.domainSearch(domain, 10);
    if (!r.ok) throw new UserError(r.error);
    let added = 0;
    for (const x of r.data) {
      const email = x.email ? normalizeEmail(x.email) : null;
      if (email && (await db.prospect.findFirst({ where: { source: provider, email } }))) continue;
      await db.prospect.create({ data: { company: x.company, domain: x.domain, contactName: x.contactName, title: x.title, email, country: x.country, industry: x.industry, source: provider, provenance: json({ provider, domain, confidence: x.confidence, importedBy: user.id, at: new Date().toISOString() }) } });
      added++;
    }
    await audit({ userId: user.id, action: "growth.prospects.imported", metadata: { provider, domain, added } });
    return okThen(`${P}/prospects`, `${added} prospect(s) imported from ${provider}.`);
  } catch (e) {
    return fail(e, "growth");
  }
}

export async function setProspectStatusAction(prospectId: string, status: string): Promise<ActionState> {
  try {
    const user = await authorizeAccess("growth:manage", F);
    if (!["NEW", "RESEARCHED", "CONTACTED", "REPLIED", "DISQUALIFIED"].includes(status)) throw new UserError("Invalid status.");
    await db.prospect.update({ where: { id: prospectId }, data: { status } });
    await audit({ userId: user.id, action: "growth.prospect.status", entity: "Prospect", entityId: prospectId, metadata: { status } });
    return okThen(`${P}/prospects`, "Prospect updated.");
  } catch (e) {
    return fail(e, "growth");
  }
}

/** A person decides the prospect is a real opportunity (e.g. they replied): it becomes (or merges into) a CRM lead. */
export async function convertProspectAction(prospectId: string): Promise<ActionState> {
  try {
    const user = await authorizeAccess("growth:manage", F);
    if (!can(user.role, "leads:create")) throw new UserError("You need permission to create leads.");
    const p = await db.prospect.findUnique({ where: { id: prospectId } });
    if (!p) throw new UserError("Prospect not found.");
    if (!p.email) throw new UserError("The prospect has no email address.");
    if (p.status !== "REPLIED") throw new UserError("Only prospects who replied can become leads.");
    const lead = await upsertGrowthLead({ email: p.email, name: p.contactName, company: p.company, website: p.domain ? `https://${p.domain}` : null, country: p.country, source: `outbound:${p.source}`, utm: { source: "outbound", medium: "email" }, formType: "outbound", createdBy: user.id });
    await db.prospect.update({ where: { id: p.id }, data: { status: "CONVERTED", leadId: lead.id } });
    await qualifyLeadById(lead.id);
    await audit({ userId: user.id, action: "growth.prospect.converted", entity: "Lead", entityId: lead.id, metadata: { prospectId, created: lead.created } });
    return okThen(`/admin/leads/${lead.id}`, lead.created ? "Lead created from prospect." : "Prospect matched an existing lead (no duplicate created).");
  } catch (e) {
    return fail(e, "growth");
  }
}

/* ───────────────────────── email sequences & suppression ───────────────────────── */

export async function saveSequenceAction(sequenceId: string | null, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("growth:manage", F);
    const f = formObject(form);
    const name = reqText(200).parse(f.name);
    const purpose = z.enum(["NURTURE", "OUTBOUND"]).parse(f.purpose ?? "NURTURE");
    const language = z.enum(["en", "hi", "hinglish"]).parse(f.language ?? "en");
    let steps: SequenceStep[] = DEFAULT_STEPS;
    const raw = String(f.steps ?? "").trim();
    if (raw) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new UserError("Steps must be valid JSON: [{\"day\":0,\"subject\":\"…\",\"body\":\"…\"}].");
      }
      steps = parseSteps(parsed);
      if (!steps.length) throw new UserError("Add at least one step with day, subject and body.");
    }
    const data = { name, purpose, language, steps: json(steps) };
    const s = sequenceId ? await db.emailSequence.update({ where: { id: sequenceId }, data }) : await db.emailSequence.create({ data: { ...data, createdById: user.id } });
    await audit({ userId: user.id, action: sequenceId ? "growth.sequence.updated" : "growth.sequence.created", entity: "EmailSequence", entityId: s.id });
    return okThen(`${P}/email`, "Sequence saved.");
  } catch (e) {
    return fail(e, "growth");
  }
}

export async function toggleSequenceAction(sequenceId: string, active: boolean): Promise<ActionState> {
  try {
    const user = await authorizeAccess("growth:manage", F);
    await db.emailSequence.update({ where: { id: sequenceId }, data: { active } });
    await audit({ userId: user.id, action: active ? "growth.sequence.activated" : "growth.sequence.paused", entity: "EmailSequence", entityId: sequenceId });
    return okThen(`${P}/email`, active ? "Sequence activated." : "Sequence paused.");
  } catch (e) {
    return fail(e, "growth");
  }
}

/** Enrolls one address, or every lead of a tier that is not suppressed (people who gave their email to Shivacha). */
export async function enrollAction(sequenceId: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("growth:manage", F);
    const email = String(form.get("email") ?? "").trim();
    const tier = String(form.get("tier") ?? "").trim();
    let ok = 0;
    let refused = 0;
    if (email) {
      const r = await enroll(sequenceId, { email, name: String(form.get("name") ?? "") || null });
      if (!r.ok) throw new UserError(r.reason ?? "Could not enroll.");
      ok = 1;
    } else if (["NURTURE", "QUALIFIED", "SALES_READY"].includes(tier)) {
      const leads = await db.lead.findMany({ where: { archivedAt: null, mergedIntoId: null, growthTier: tier }, select: { id: true, email: true, name: true }, take: 500 });
      for (const l of leads) {
        const r = await enroll(sequenceId, { email: l.email, name: l.name, leadId: l.id });
        if (r.ok) ok++;
        else refused++;
      }
    } else throw new UserError("Enter an email or pick a lead tier.");
    await audit({ userId: user.id, action: "growth.sequence.enrolled", entity: "EmailSequence", entityId: sequenceId, metadata: { ok, refused, tier: tier || undefined } });
    return okThen(`${P}/email`, `${ok} enrolled${refused ? `, ${refused} skipped (suppressed or invalid)` : ""}.`);
  } catch (e) {
    return fail(e, "growth");
  }
}

export async function logReplyAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("growth:manage", F);
    const email = String(form.get("email") ?? "").trim();
    if (!isEmail(email)) throw new UserError("Enter the sender's email.");
    const text = reqText(5000).parse(form.get("text"));
    const r = await handleReply(email, text);
    await audit({ userId: user.id, action: "growth.email.reply", metadata: { cls: r.cls, stopped: r.stopped } });
    return okThen(`${P}/email`, `Reply classified as ${r.cls}. ${r.stopped} sequence(s) stopped${r.suppressed ? "; address suppressed" : ""}.`);
  } catch (e) {
    return fail(e, "growth");
  }
}

export async function suppressAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("growth:manage", F);
    const email = String(form.get("email") ?? "").trim();
    if (!isEmail(email)) throw new UserError("Invalid email.");
    const reason = z.enum(SUPPRESSION_REASONS).parse(form.get("reason") ?? "MANUAL");
    const n = await suppress(email, reason, String(form.get("note") ?? "") || undefined);
    await audit({ userId: user.id, action: "growth.email.suppressed", metadata: { reason, stopped: n } });
    return okThen(`${P}/email`, `Suppressed; ${n} active sequence(s) stopped.`);
  } catch (e) {
    return fail(e, "growth");
  }
}

export async function sendDueEmailsAction(): Promise<ActionState> {
  try {
    const user = await authorizeAccess("growth:manage", F);
    const r = await processDueEmails({ autonomous: false, limit: 100 });
    await audit({ userId: user.id, action: "growth.email.run", metadata: { ...r } });
    if (r.blocked && !r.sent) throw new UserError(r.blocked);
    return okThen(`${P}/email`, `${r.sent} sent, ${r.skipped} skipped${r.blocked ? ` — stopped: ${r.blocked}` : ""}.`);
  } catch (e) {
    return fail(e, "growth");
  }
}

/* ───────────────────────── partners ───────────────────────── */

export async function savePartnerAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("growth:manage", F);
    const d = z
      .object({
        name: reqText(200),
        type: z.enum(["REFERRAL", "RESELLER", "TECHNOLOGY", "AGENCY", "COMMUNITY", "MEDIA"]),
        status: z.enum(["PROSPECT", "CONTACTED", "ACTIVE", "PAUSED", "ENDED"]).default("PROSPECT"),
        website: optUrl,
        contactName: optText(200),
        email: z.preprocess((v) => (v == null ? "" : String(v).trim()), z.string().max(200)).refine((v) => !v || isEmail(v), "Invalid email").transform((v) => v || null),
        country: optText(80),
        terms: optText(4000),
        notes: optText(4000),
      })
      .parse(formObject(form));
    const id = String(form.get("id") ?? "");
    const p = id ? await db.growthPartner.update({ where: { id }, data: d }) : await db.growthPartner.create({ data: d });
    await audit({ userId: user.id, action: id ? "growth.partner.updated" : "growth.partner.created", entity: "GrowthPartner", entityId: p.id });
    return okThen(`${P}/partners`, "Partner saved.");
  } catch (e) {
    return fail(e, "growth");
  }
}
