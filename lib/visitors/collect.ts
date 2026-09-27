import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { notify } from "@/lib/os/notify";
import { parseUserAgent } from "@/lib/os/ua";
import { companyProvider } from "./company";
import { scoreIntent } from "./intent";
import { deriveSource } from "./source";
import { matchRule, ruleConditionsSchema, describeRule } from "./rules";
import type { VisitorPolicy } from "./policy";

export const VISITOR_COOKIE = "shivacha_visitor_id";
export const SESSION_COOKIE = "shivacha_session_id";
export const CONSENT_COOKIE = "shivacha_consent";
/** A session ends after 30 minutes without activity (industry-standard definition). */
export const SESSION_IDLE_MS = 30 * 60_000;

export const EVENT_TYPES = ["page_view", "page_leave", "cta_click", "form_start", "form_submit", "calendly_click", "whatsapp_click", "phone_click", "email_click", "download", "search", "interaction"] as const;
export type VisitorEventType = (typeof EVENT_TYPES)[number];

const ID = /^[a-f0-9-]{36}$/;
const s = (max: number) => z.string().trim().max(max).nullish().transform((v) => v || null);

export const collectSchema = z.object({
  type: z.enum(EVENT_TYPES),
  path: z.string().trim().max(500).regex(/^\//),
  title: s(300),
  referrer: s(500),
  label: s(200),
  seconds: z.number().int().min(0).max(1800).nullish(),
  utm: z.object({ source: s(100), medium: s(100), campaign: s(150), term: s(150), content: s(150) }).partial().nullish(),
  screen: s(20),
  language: s(20),
  timezone: s(60),
  data: z.record(z.string(), z.union([z.string().max(300), z.number(), z.boolean(), z.null()])).nullish(),
});
export type CollectInput = z.infer<typeof collectSchema>;

export interface CollectContext {
  anonId: string | null;
  sessionKey: string | null;
  userAgent: string;
  ip: string | null;
  host: string | null;
  geo: { country: string | null; region: string | null; city: string | null };
}

export const validId = (v: string | null | undefined): v is string => !!v && ID.test(v);

/** Records one first-party event. Returns the (possibly new) cookie ids and follow-up work to run after the response. */
export async function recordVisit(input: CollectInput, ctx: CollectContext, policy: VisitorPolicy, now = new Date()) {
  const ua = parseUserAgent(ctx.userAgent);
  const geo = { country: ctx.geo.country, region: policy.captureCity ? ctx.geo.region : null, city: policy.captureCity ? ctx.geo.city : null };
  const anonId = validId(ctx.anonId) ? ctx.anonId : randomUUID();

  // upsert: parallel first requests from one browser must not create two visitors.
  const visitor = await db.visitor.upsert({ where: { anonId }, update: {}, create: { anonId, firstSeenAt: now, lastSeenAt: now, firstPage: input.path, ...geo, device: ua.device, browser: ua.browser, os: ua.os, language: input.language, timezone: input.timezone } });

  let session = validId(ctx.sessionKey) ? await db.visitorSession.findUnique({ where: { sessionKey: ctx.sessionKey } }) : null;
  if (session && (session.visitorId !== visitor.id || now.getTime() - session.lastSeenAt.getTime() > SESSION_IDLE_MS)) session = null;
  const newSession = !session;
  if (!session) {
    const src = deriveSource({ utmSource: input.utm?.source, utmMedium: input.utm?.medium, referrer: input.referrer, host: ctx.host });
    session = await db.visitorSession.create({
      data: {
        sessionKey: randomUUID(),
        visitorId: visitor.id,
        startedAt: now,
        lastSeenAt: now,
        landingPage: input.path,
        referrer: input.referrer,
        utmSource: input.utm?.source ?? null,
        utmMedium: input.utm?.medium ?? null,
        utmCampaign: input.utm?.campaign ?? null,
        utmTerm: input.utm?.term ?? null,
        utmContent: input.utm?.content ?? null,
        source: src.source,
        medium: src.medium,
        device: ua.device,
        browser: ua.browser,
        os: ua.os,
        screen: input.screen,
        language: input.language,
        timezone: input.timezone,
        ...geo,
      },
    });
    await db.visitor.update({
      where: { id: visitor.id },
      data: {
        sessionsCount: { increment: 1 },
        lastSource: src.source,
        lastMedium: src.medium,
        lastCampaign: input.utm?.campaign ?? null,
        ...(visitor.firstSource ? {} : { firstSource: src.source, firstMedium: src.medium, firstCampaign: input.utm?.campaign ?? null }),
        ...geo,
      },
    });
  }

  const isView = input.type === "page_view";
  if (input.type === "page_leave") {
    // Engagement time only; no event row.
    const secs = input.seconds ?? 0;
    await db.visitor.update({ where: { id: visitor.id }, data: { totalSeconds: { increment: secs }, lastSeenAt: now } });
    await db.visitorSession.update({ where: { id: session.id }, data: { lastSeenAt: now } });
  } else {
    await db.visitorEvent.create({ data: { visitorId: visitor.id, sessionId: session.id, type: input.type, path: input.path, title: input.title, label: input.label, data: input.data ?? undefined, at: now } });
    await db.visitorSession.update({ where: { id: session.id }, data: { lastSeenAt: now, events: { increment: 1 }, ...(isView ? { pageViews: { increment: 1 }, previousPage: session.currentPage, currentPage: input.path } : {}) } });
    await db.visitor.update({ where: { id: visitor.id }, data: { lastSeenAt: now, ...(isView ? { pageViews: { increment: 1 }, lastPage: input.path } : {}) } });
  }

  const visitorId = visitor.id;
  const background = async () => {
    if (newSession && !visitor.companyId && ctx.ip) await identifyCompany(visitorId, ctx.ip, policy).catch((e) => console.error("[visitors] company lookup failed", (e as Error).message));
    if (input.type !== "page_leave" || newSession) await refreshIntent(visitorId, now).catch((e) => console.error("[visitors] intent failed", (e as Error).message));
  };
  return { anonId, sessionKey: session.sessionKey, newSession, background };
}

async function identifyCompany(visitorId: string, ip: string, policy: VisitorPolicy) {
  const provider = companyProvider(policy.companyProvider);
  if (!provider) return;
  const m = await provider.lookup(ip);
  if (!m) return;
  const company = await db.visitorCompany.upsert({ where: { providerKey: m.key }, update: { name: m.name, domain: m.domain, industry: m.industry, sizeRange: m.sizeRange }, create: { providerKey: m.key, provider: m.provider, name: m.name, domain: m.domain, industry: m.industry, country: m.country, city: m.city, asn: m.asn, sizeRange: m.sizeRange } });
  await db.visitor.update({ where: { id: visitorId }, data: { companyId: company.id } });
}

/** Recomputes the transparent intent score from stored facts, then evaluates alert rules. */
export async function refreshIntent(visitorId: string, now = new Date()) {
  const v = await db.visitor.findUnique({ where: { id: visitorId }, include: { company: { select: { name: true, industry: true } } } });
  if (!v || v.isBot) return;
  const events = await db.visitorEvent.findMany({ where: { visitorId }, orderBy: { at: "desc" }, take: 500, select: { type: true, path: true } });
  const paths = events.filter((e) => e.type === "page_view" && e.path).map((e) => e.path!);
  const r = scoreIntent({ paths, eventTypes: events.map((e) => e.type), sessions: v.sessionsCount, totalSeconds: v.totalSeconds, companyIdentified: !!v.companyId, identifiedLead: !!v.leadId });
  if (r.score !== v.intentScore || r.label !== v.intentLabel || !v.intentSignals) await db.visitor.update({ where: { id: visitorId }, data: { intentScore: r.score, intentLabel: r.label, intentSignals: r.signals as object[] } });
  await evaluateRules({ ...v, intentScore: r.score }, paths, now);
}

async function evaluateRules(v: { id: string; intentScore: number; country: string | null; sessionsCount: number; leadId: string | null; city: string | null; company: { name: string; industry: string | null } | null }, paths: string[], now: Date) {
  const rules = await db.visitorAlertRule.findMany({ where: { active: true } });
  const day = now.toISOString().slice(0, 10);
  for (const rule of rules) {
    const c = ruleConditionsSchema.safeParse(rule.conditions);
    if (!c.success || !matchRule(c.data, { intentScore: v.intentScore, country: v.country, sessionsCount: v.sessionsCount, paths, company: v.company })) continue;
    const who = v.company?.name ?? "A visitor";
    const summary = `${who}${v.city || v.country ? ` from ${[v.city, v.country].filter(Boolean).join(", ")}` : ""} matched “${rule.name}” (${describeRule(c.data)}; intent ${v.intentScore}).`;
    const created = await db.visitorAlert.create({ data: { ruleId: rule.id, visitorId: v.id, day, summary } }).then(() => true).catch(() => false); // unique per rule/visitor/day
    if (!created) continue;
    await notify({ type: "visitor.alert", title: `Visitor alert: ${rule.name}`, body: summary, href: `/admin/visitors/${v.id}`, entity: "Visitor", entityId: v.id, userIds: [rule.assigneeId], permission: rule.assigneeId ? undefined : ((rule.notifyPermission as "visitors:view" | null) ?? "visitors:view") });
    if (rule.action === "CREATE_TASK" && v.leadId) await db.followUp.create({ data: { leadId: v.leadId, assignedToId: rule.assigneeId, dueAt: new Date(now.getTime() + 24 * 3600_000), note: `Website activity: ${summary}` } });
  }
}

/**
 * Links the anonymous visitor to the CRM lead they just created by submitting a first-party form. The first lead
 * wins: an already-linked visitor is never re-pointed, so one browser cannot merge two people's records.
 */
export async function linkVisitorToLead(anonId: string | null | undefined, leadId: string, now = new Date()) {
  if (!validId(anonId)) return false;
  const v = await db.visitor.findUnique({ where: { anonId }, select: { id: true, leadId: true } });
  if (!v) return false;
  if (!v.leadId) await db.visitor.update({ where: { id: v.id }, data: { leadId, identifiedAt: now } });
  const session = await db.visitorSession.findFirst({ where: { visitorId: v.id }, orderBy: { lastSeenAt: "desc" }, select: { id: true } });
  if (session) await db.visitorEvent.create({ data: { visitorId: v.id, sessionId: session.id, type: "form_submit", label: "lead", data: { leadId }, at: now } });
  await refreshIntent(v.id, now);
  return !v.leadId || v.leadId === leadId;
}

/** Daily retention job: only runs when an administrator has chosen a retention period. */
export async function visitorRetentionJob(policy: VisitorPolicy, now = new Date()) {
  if (!policy.retentionDays) return 0;
  const cutoff = new Date(now.getTime() - policy.retentionDays * 86_400_000);
  const events = await db.visitorEvent.deleteMany({ where: { at: { lt: cutoff } } });
  const sessions = await db.visitorSession.deleteMany({ where: { lastSeenAt: { lt: cutoff } } });
  // Anonymous visitors with no remaining activity are removed; visitors linked to a CRM lead keep their summary row.
  const visitors = await db.visitor.deleteMany({ where: { lastSeenAt: { lt: cutoff }, leadId: null } });
  await db.visitorAlert.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return events.count + sessions.count + visitors.count;
}
