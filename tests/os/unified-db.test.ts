/**
 * Integration tests for attendance, visitor intelligence and voice sessions against the TEST database (refuses any
 * other database). No AI provider is used: ANTHROPIC_API_KEY must be unset so the orchestrator's data fallback runs.
 *
 *   DATABASE_URL=postgresql://…/shivacha_test npm run test:unified:db
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../../lib/db/client";
import type { SessionUser } from "../../lib/auth/session";
import type { RoleName } from "../../lib/auth/permissions";
import { AttendanceError, attendanceDailyJob, liveWorkforce, punch, summarize } from "../../lib/workforce/attendance";
import { WORKFORCE_DEFAULTS } from "../../lib/workforce/policy";
import { VISITOR_DEFAULTS } from "../../lib/visitors/policy";
import { linkVisitorToLead, recordVisit, refreshIntent, visitorRetentionJob } from "../../lib/visitors/collect";
import { endVoiceSession, interruptVoice, startVoiceSession, voiceTurn } from "../../lib/voice/session";

if (!/shivacha_test/.test(process.env.DATABASE_URL ?? "")) throw new Error("Integration tests only run against the shivacha_test database.");
if (process.env.ANTHROPIC_API_KEY) throw new Error("Unset ANTHROPIC_API_KEY for these tests (no provider calls are made).");

const TAG = `t${Date.now().toString(36)}`;
const users: Record<string, SessionUser> = {};
let employeeId = "";

async function mkUser(role: RoleName) {
  const u = await db.user.create({ data: { email: `${TAG}-${role.toLowerCase()}@unified.test`, name: `${role} ${TAG}`, role, passwordHash: "x", active: true } });
  return (users[role] = { id: u.id, email: u.email, name: u.name, role });
}

before(async () => {
  await db.setting.upsert({ where: { key: "workforce" }, update: { value: WORKFORCE_DEFAULTS }, create: { key: "workforce", value: WORKFORCE_DEFAULTS } });
  const emp = await mkUser("EMPLOYEE");
  await mkUser("SALES_MANAGER");
  await mkUser("CONTENT_MANAGER");
  const office = await db.officeLocation.create({ data: { name: `HQ ${TAG}`, latitude: "18.520400", longitude: "73.856700", radiusM: 150, timezone: "Asia/Kolkata" } });
  const shift = await db.shift.create({ data: { name: `General ${TAG}`, startTime: "09:30", endTime: "18:30", graceMinutes: 10, breakMinutes: 60, weekDays: [1, 2, 3, 4, 5, 6, 7], timezone: "Asia/Kolkata" } });
  employeeId = (await db.employee.create({ data: { employeeCode: `SHV-E-${TAG}`, fullName: `Employee ${TAG}`, userId: emp.id, officeId: office.id, shiftId: shift.id, workMode: "OFFICE", workingDays: [1, 2, 3, 4, 5, 6, 7] } })).id;
});

after(async () => {
  await db.$disconnect();
});

test("attendance: check-in → break → back → check-out, with an immutable event trail", async () => {
  const inside = { latitude: 18.5205, longitude: 73.8568, accuracy: 20 };
  const t = (h: string) => new Date(`2026-09-28T${h}:00+05:30`);
  const a = await punch({ employeeId, action: "CHECK_IN", coords: inside, actorId: users.EMPLOYEE.id, now: t("09:50") });
  assert.equal(a.status, "WORKING");
  assert.equal(a.geofence, "INSIDE");
  await assert.rejects(punch({ employeeId, action: "CHECK_IN", coords: inside, actorId: users.EMPLOYEE.id, now: t("09:55") }), AttendanceError);
  assert.equal((await punch({ employeeId, action: "BREAK_START", actorId: users.EMPLOYEE.id, now: t("13:00") })).status, "ON_BREAK");
  assert.equal((await punch({ employeeId, action: "BREAK_END", actorId: users.EMPLOYEE.id, now: t("13:40") })).status, "WORKING");
  const out = await punch({ employeeId, action: "CHECK_OUT", coords: inside, actorId: users.EMPLOYEE.id, now: t("18:40") });
  assert.equal(out.status, "CHECKED_OUT");
  const day = await db.attendanceDay.findFirstOrThrow({ where: { employeeId }, orderBy: { date: "desc" } });
  assert.equal(day.lateMinutes, 20);
  assert.equal(day.breakMinutes, 40);
  assert.equal(day.workMinutes, 8 * 60 + 50 - 40);
  assert.equal(await db.attendanceEvent.count({ where: { dayId: day.id } }), 4);
  await assert.rejects(punch({ employeeId, action: "BREAK_START", actorId: users.EMPLOYEE.id, now: t("18:45") }), AttendanceError);
});

test("attendance: BLOCK refuses an office check-in outside the geofence; FLAG records it for review", async () => {
  const far = { latitude: 18.6, longitude: 73.9 };
  await db.setting.update({ where: { key: "workforce" }, data: { value: { ...WORKFORCE_DEFAULTS, geofenceEnforcement: "BLOCK" } } });
  await assert.rejects(punch({ employeeId, action: "CHECK_IN", coords: far, actorId: users.EMPLOYEE.id, now: new Date("2026-09-29T09:30:00+05:30") }), /outside the authorized office area/);
  await assert.rejects(punch({ employeeId, action: "CHECK_IN", coords: null, locationDenied: true, actorId: users.EMPLOYEE.id, now: new Date("2026-09-29T09:31:00+05:30") }), /Location permission is required/);
  await db.setting.update({ where: { key: "workforce" }, data: { value: WORKFORCE_DEFAULTS } });
  const r = await punch({ employeeId, action: "CHECK_IN", coords: far, actorId: users.EMPLOYEE.id, now: new Date("2026-09-29T09:32:00+05:30") });
  assert.equal(r.geofence, "OUTSIDE");
  assert.ok((r.distanceM ?? 0) > 1000);
  const ev = await db.attendanceEvent.findFirstOrThrow({ where: { employeeId, type: "CHECK_IN" }, orderBy: { at: "desc" } });
  assert.equal(ev.geofence, "OUTSIDE");
});

test("attendance: live board counts only real check-ins; the daily job marks no-shows absent and purges nothing without a retention period", async () => {
  const rows = await liveWorkforce({ id: employeeId }, new Date("2026-09-29T10:00:00+05:30"));
  assert.equal(rows.length, 1);
  assert.equal(summarize(rows).present, 1);
  await db.locationPing.create({ data: { employeeId, latitude: "18.5", longitude: "73.8", at: new Date("2020-01-01T00:00:00Z") } });
  const r = await attendanceDailyJob(new Date("2026-10-02T06:00:00+05:30"));
  assert.equal(r.locationPointsPurged, 0);
  const absent = await db.attendanceDay.findFirst({ where: { employeeId, date: new Date("2026-10-01T00:00:00Z") } });
  assert.equal(absent?.status, "ABSENT");
  assert.equal(absent?.checkInAt, null);
  await db.setting.update({ where: { key: "workforce" }, data: { value: { ...WORKFORCE_DEFAULTS, locationRetentionDays: 90 } } });
  assert.ok((await attendanceDailyJob(new Date("2026-10-02T06:00:00+05:30"))).locationPointsPurged >= 1);
  await db.setting.update({ where: { key: "workforce" }, data: { value: WORKFORCE_DEFAULTS } });
});

const ctx = (anonId: string | null, sessionKey: string | null) => ({ anonId, sessionKey, userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36", ip: "203.0.113.9", host: "shivacha.test", geo: { country: "India", region: "MH", city: "Pune" } });

test("visitors: sessions, events, transparent intent, rule alerts (once per day) and lead linking", async () => {
  const policy = { ...VISITOR_DEFAULTS, enabled: true };
  const rule = await db.visitorAlertRule.create({ data: { name: `Pricing ${TAG}`, conditions: { pathContains: "/pricing", countries: ["India"] }, action: "NOTIFY", assigneeId: users.SALES_MANAGER.id } });
  const first = await recordVisit({ type: "page_view", path: "/services/web3", title: "Web3", referrer: "https://www.google.com/", utm: null, screen: null, language: "en-IN", timezone: "Asia/Kolkata", label: null, data: null, seconds: null }, ctx(null, null), policy);
  await first.background();
  const v0 = await db.visitor.findUniqueOrThrow({ where: { anonId: first.anonId } });
  assert.equal(v0.sessionsCount, 1);
  assert.equal(v0.firstSource, "google");
  assert.equal(v0.city, "Pune");
  assert.equal(v0.companyId, null); // provider NONE: never fabricated
  const second = await recordVisit({ type: "page_view", path: "/pricing", title: "Pricing", referrer: null, utm: null, screen: null, language: null, timezone: null, label: null, data: null, seconds: null }, ctx(first.anonId, first.sessionKey), policy);
  assert.equal(second.sessionKey, first.sessionKey);
  await second.background();
  await recordVisit({ type: "cta_click", path: "/pricing", label: "get-quote", title: null, referrer: null, utm: null, screen: null, language: null, timezone: null, data: null, seconds: null }, ctx(first.anonId, first.sessionKey), policy).then((r) => r.background());
  await recordVisit({ type: "page_leave", path: "/pricing", seconds: 240, label: null, title: null, referrer: null, utm: null, screen: null, language: null, timezone: null, data: null }, ctx(first.anonId, first.sessionKey), policy);
  const v1 = await db.visitor.findUniqueOrThrow({ where: { anonId: first.anonId } });
  assert.equal(v1.pageViews, 2);
  assert.equal(v1.totalSeconds, 240);
  const signals = v1.intentSignals as { signal: string; points: number }[];
  assert.ok(signals.some((s) => s.signal === "Pricing / estimate pages"));
  assert.equal(v1.intentScore, signals.reduce((a, s) => a + s.points, 0));
  assert.equal(await db.visitorAlert.count({ where: { ruleId: rule.id, visitorId: v1.id } }), 1);
  await refreshIntent(v1.id);
  assert.equal(await db.visitorAlert.count({ where: { ruleId: rule.id, visitorId: v1.id } }), 1, "one alert per rule, visitor and day");
  assert.equal(await db.notification.count({ where: { userId: users.SALES_MANAGER.id, type: "visitor.alert" } }), 1);

  // A forged session cookie from another visitor is ignored.
  const other = await recordVisit({ type: "page_view", path: "/", title: null, referrer: null, utm: null, screen: null, language: null, timezone: null, label: null, data: null, seconds: null }, ctx(null, first.sessionKey), policy);
  assert.notEqual(other.sessionKey, first.sessionKey);

  const lead = await db.lead.create({ data: { ref: `SHV-${TAG}`, name: "Asha Test", email: `${TAG}@example.test`, formType: "contact" } });
  assert.equal(await linkVisitorToLead(first.anonId, lead.id), true);
  const lead2 = await db.lead.create({ data: { ref: `SHV-${TAG}-2`, name: "Other Person", email: `${TAG}-2@example.test`, formType: "contact" } });
  assert.equal(await linkVisitorToLead(first.anonId, lead2.id), false, "first lead wins; a shared browser never merges two people");
  const v2 = await db.visitor.findUniqueOrThrow({ where: { anonId: first.anonId } });
  assert.equal(v2.leadId, lead.id);
  assert.ok(v2.intentScore >= 30);
  assert.equal(await linkVisitorToLead("not-a-uuid", lead.id), false);
});

test("visitors: retention does nothing until configured, then removes old anonymous activity but keeps lead-linked visitors", async () => {
  assert.equal(await visitorRetentionJob(VISITOR_DEFAULTS), 0);
  const old = new Date("2020-01-01T00:00:00Z");
  const anon = await db.visitor.create({ data: { anonId: crypto.randomUUID(), firstSeenAt: old, lastSeenAt: old } });
  const lead = await db.lead.create({ data: { ref: `SHV-${TAG}-3`, name: "Kept", email: `${TAG}-3@example.test`, formType: "contact" } });
  const linked = await db.visitor.create({ data: { anonId: crypto.randomUUID(), firstSeenAt: old, lastSeenAt: old, leadId: lead.id } });
  assert.ok((await visitorRetentionJob({ ...VISITOR_DEFAULTS, retentionDays: 365 })) >= 1);
  assert.equal(await db.visitor.count({ where: { id: anon.id } }), 0);
  assert.equal(await db.visitor.count({ where: { id: linked.id } }), 1);
});

test("voice: permissions are enforced, turns go through the orchestrator, background tasks and barge-in are recorded", async () => {
  await assert.rejects(startVoiceSession(users.EMPLOYEE, { agentSlug: "sales", language: "en-IN", provider: "browser", context: null }), /permission/i);
  await assert.rejects(startVoiceSession(users.CONTENT_MANAGER, { agentSlug: "finance", language: "en-IN", provider: "browser", context: null }), /permission/i);
  const s = await startVoiceSession(users.SALES_MANAGER, { agentSlug: "sales", language: "hinglish", provider: "openai", context: null });
  assert.equal(s.provider, "browser", "OpenAI voice falls back to browser speech when not configured");
  const r = await voiceTurn(users.SALES_MANAGER, s.id, "Show me my open leads", { audioSec: 3 });
  assert.equal(r.agent, "sales");
  assert.ok(r.executionId, "an orchestrator execution is recorded");
  assert.match(r.spoken, /provider isn't connected/);
  const exec = await db.aIExecution.findUniqueOrThrow({ where: { id: r.executionId! } });
  assert.equal(exec.userId, users.SALES_MANAGER.id);
  await interruptVoice(users.SALES_MANAGER, s.id, r.messageId);
  assert.equal((await db.voiceMessage.findUniqueOrThrow({ where: { id: r.messageId } })).interrupted, true);
  const bg = await voiceTurn(users.SALES_MANAGER, s.id, "Prepare follow-up notes for stale leads in the background");
  assert.ok(bg.taskId);
  const task = await db.aITask.findUniqueOrThrow({ where: { id: bg.taskId! } });
  assert.equal(task.requestedById, users.SALES_MANAGER.id);
  assert.equal(task.source, "voice");
  // Another user cannot use this session.
  await assert.rejects(voiceTurn(users.CONTENT_MANAGER, s.id, "hello"), /not found/i);
  await endVoiceSession(users.SALES_MANAGER, s.id);
  const ended = await db.voiceSession.findUniqueOrThrow({ where: { id: s.id }, include: { messages: true } });
  assert.equal(ended.status, "ENDED");
  assert.equal(ended.messages.length, 4);
  assert.match(ended.summary ?? "", /2 request\(s\), 1 background task/);
  await assert.rejects(voiceTurn(users.SALES_MANAGER, s.id, "again"), /ended/);
});
