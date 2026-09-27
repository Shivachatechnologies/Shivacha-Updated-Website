import "server-only";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { liveWorkforce, summarize } from "@/lib/workforce/attendance";
import type { ToolDef } from "./tools";

/**
 * Read tools over the human workforce and website visitor intelligence. Each needs the same permission as the page
 * that shows the data, so an AI employee never sees more than the person it is working for. Compensation, documents
 * and raw location are never exposed to AI tools.
 */
const DAY = 86400_000;
const def = <S extends z.ZodType>(t: ToolDef<S>) => t as unknown as ToolDef;

export const WORKFORCE_TOOLS: ToolDef[] = [
  def({
    name: "getWorkforceToday",
    description: "Today's human attendance: totals present/absent/late/on leave/remote/on break, plus the named exceptions (late, absent, outside geofence). Counts come from real check-ins; nothing is estimated.",
    input: z.object({}),
    permissions: ["attendance:view"],
    kind: "read",
    risk: "LOW",
    run: async () => {
      const rows = await liveWorkforce({});
      const s = summarize(rows);
      const exceptions = rows.filter((r) => r.late > 0 || r.state === "ABSENT" || r.geofence === "OUTSIDE").slice(0, 25).map((r) => ({ employee: r.name, code: r.code, department: r.department, state: r.state, lateMinutes: r.late || null, geofence: r.geofence }));
      return { data: { asOf: new Date().toISOString(), summary: s, exceptions }, records: rows.slice(0, 25).map((r) => `Employee:${r.id}`) };
    },
  }),
  def({
    name: "getLeaveOverview",
    description: "Who is on approved leave today and in the next 7 days, and how many leave requests are waiting for a manager or HR.",
    input: z.object({}),
    permissions: ["leave:view"],
    kind: "read",
    risk: "LOW",
    run: async () => {
      const now = new Date();
      const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const [upcoming, pendingManager, pendingHr] = await Promise.all([
        db.leaveRequest.findMany({ where: { status: "APPROVED", endDate: { gte: today }, startDate: { lte: new Date(today.getTime() + 7 * DAY) } }, orderBy: { startDate: "asc" }, take: 30, select: { id: true, startDate: true, endDate: true, days: true, employee: { select: { id: true, fullName: true } }, leaveType: { select: { name: true } } } }),
        db.leaveRequest.count({ where: { status: "PENDING_MANAGER" } }),
        db.leaveRequest.count({ where: { status: "PENDING_HR" } }),
      ]);
      return { data: { pending: { withManagers: pendingManager, withHr: pendingHr }, approvedNext7Days: upcoming.map((l) => ({ employee: l.employee.fullName, type: l.leaveType.name, from: l.startDate.toISOString().slice(0, 10), to: l.endDate.toISOString().slice(0, 10), days: Number(l.days) })) }, records: upcoming.map((l) => `Employee:${l.employee.id}`) };
    },
  }),
  def({
    name: "getVisitorSummary",
    description: "Website visitor intelligence for the last N days (first-party, consented): visitors, sessions, top sources, top countries, top landing pages, visitors who became leads. Companies appear only when a provider matched them.",
    input: z.object({ days: z.number().int().min(1).max(90).default(7) }),
    permissions: ["visitors:view"],
    kind: "read",
    risk: "LOW",
    run: async (_c, i) => {
      const since = new Date(Date.now() - i.days * DAY);
      const sw = { startedAt: { gte: since }, visitor: { isBot: false } };
      const [visitors, sessions, sources, countries, landing, leads, tracking] = await Promise.all([
        db.visitor.count({ where: { isBot: false, lastSeenAt: { gte: since } } }),
        db.visitorSession.count({ where: sw }),
        db.visitorSession.groupBy({ by: ["source", "medium"], where: sw, _count: true, orderBy: { _count: { source: "desc" } }, take: 8 }),
        db.visitorSession.groupBy({ by: ["country"], where: sw, _count: true, orderBy: { _count: { country: "desc" } }, take: 8 }),
        db.visitorSession.groupBy({ by: ["landingPage"], where: sw, _count: true, orderBy: { _count: { landingPage: "desc" } }, take: 8 }),
        db.visitor.count({ where: { leadId: { not: null }, identifiedAt: { gte: since } } }),
        db.setting.findUnique({ where: { key: "visitorTracking" } }),
      ]);
      const enabled = !!(tracking?.value as { enabled?: boolean } | null)?.enabled;
      return { data: { days: i.days, trackingEnabled: enabled, visitors, sessions, becameLeads: leads, sources: sources.map((s) => ({ channel: `${s.source ?? "direct"} / ${s.medium ?? "none"}`, sessions: s._count })), countries: countries.map((c) => ({ country: c.country ?? "Unknown", sessions: c._count })), landingPages: landing.map((l) => ({ page: l.landingPage, sessions: l._count })) } };
    },
  }),
  def({
    name: "listHighIntentVisitors",
    description: "Recent website visitors with the highest transparent intent scores, with the signals behind each score, identified company (only when matched) and linked CRM lead (only if they submitted a form). Never guesses who an anonymous visitor is.",
    input: z.object({ days: z.number().int().min(1).max(30).default(7), limit: z.number().int().min(1).max(20).default(10) }),
    permissions: ["visitors:view"],
    kind: "read",
    risk: "LOW",
    run: async (_c, i) => {
      const rows = await db.visitor.findMany({ where: { isBot: false, lastSeenAt: { gte: new Date(Date.now() - i.days * DAY) }, intentScore: { gt: 0 } }, orderBy: { intentScore: "desc" }, take: i.limit, include: { company: { select: { name: true, domain: true, industry: true } }, lead: { select: { id: true, name: true, ref: true } } } });
      return {
        data: rows.map((v) => ({ visitorId: v.id, intent: v.intentScore, label: v.intentLabel, signals: v.intentSignals, company: v.company ?? "Company not identified", location: [v.city, v.country].filter(Boolean).join(", ") || null, visits: v.sessionsCount, lastPage: v.lastPage, lastSeen: v.lastSeenAt.toISOString(), source: v.lastSource ? `${v.lastSource} / ${v.lastMedium}` : null, lead: v.lead ? { id: v.lead.id, name: v.lead.name, ref: v.lead.ref } : null })),
        records: rows.flatMap((v) => [`Visitor:${v.id}`, ...(v.lead ? [`Lead:${v.lead.id}`] : [])]),
      };
    },
  }),
];
