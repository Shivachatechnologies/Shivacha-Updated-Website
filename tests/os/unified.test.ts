/**
 * Pure unit tests for the human workforce, website visitor intelligence and voice layers (no database):
 *
 *   npm run test:unified
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { distanceM, evaluateGeofence, nearestOffice, validCoords } from "../../lib/workforce/geo";
import { dateKey, fmtMinutes, isEarlyCheckout, lateMinutes, leaveDays, parseHHMM, workDate } from "../../lib/workforce/time";
import { needsLocation, parseWorkforce, WORKFORCE_DEFAULTS } from "../../lib/workforce/policy";
import { evaluateCheckIn } from "../../lib/workforce/attendance";
import { isBotUserAgent, parseUserAgent } from "../../lib/os/ua";
import { can, defaultCan, LOCKED, PERMISSIONS, ROLES, ROLE_PERMISSIONS, setPermissionOverrides, type Permission, type RoleName } from "../../lib/auth/permissions";
import { parseVisitorPolicy, trackingDecision, VISITOR_DEFAULTS } from "../../lib/visitors/policy";
import { scoreIntent } from "../../lib/visitors/intent";
import { describeRule, matchRule } from "../../lib/visitors/rules";
import { deriveSource } from "../../lib/visitors/source";
import { toSpeech, voiceChannelHint, wantsBackground } from "../../lib/voice/languages";
import { entityFromPath } from "../../lib/voice/paths";
import { estimateVoiceCost } from "../../lib/voice/provider";
import { getTool } from "../../lib/ai/tools";
import { AGENTS } from "../../lib/ai/catalog";

/* ───────── geofence ───────── */

const office = { id: "o1", name: "Pune HQ", latitude: 18.5204, longitude: 73.8567, radiusM: 150 };

test("distance is symmetric and roughly right", () => {
  const a = { latitude: 18.5204, longitude: 73.8567 };
  const b = { latitude: 18.5304, longitude: 73.8567 }; // ~1.11 km north
  assert.equal(Math.round(distanceM(a, b)), Math.round(distanceM(b, a)));
  assert.ok(Math.abs(distanceM(a, b) - 1112) < 5);
});

test("geofence: inside, outside, accuracy slack capped at 100 m, missing and not required", () => {
  assert.equal(evaluateGeofence({ latitude: 18.5205, longitude: 73.8568 }, office).result, "INSIDE");
  assert.equal(evaluateGeofence({ latitude: 18.5304, longitude: 73.8567 }, office).result, "OUTSIDE");
  // 200 m away with ±80 m accuracy touches a 150 m fence.
  assert.equal(evaluateGeofence({ latitude: 18.5222, longitude: 73.8567, accuracy: 80 }, office).result, "INSIDE");
  // A 5 km-accuracy fix 1.1 km away must not count as inside.
  assert.equal(evaluateGeofence({ latitude: 18.5304, longitude: 73.8567, accuracy: 5000 }, office).result, "OUTSIDE");
  assert.equal(evaluateGeofence(null, office).result, "NO_LOCATION");
  assert.equal(evaluateGeofence({ latitude: 1, longitude: 1 }, { ...office, latitude: null }).result, "NOT_REQUIRED");
  assert.equal(evaluateGeofence({ latitude: 1, longitude: 1 }, null).result, "NOT_REQUIRED");
  assert.equal(validCoords({ latitude: 91, longitude: 0 }), false);
  assert.equal(nearestOffice({ latitude: 18.52, longitude: 73.85 }, [{ ...office, id: "far", latitude: 28.6, longitude: 77.2 }, office])?.id, "o1");
});

/* ───────── time ───────── */

test("work date, lateness and early checkout honour the shift time zone", () => {
  const at = new Date("2026-09-27T04:10:00Z"); // 09:40 IST
  assert.equal(dateKey(workDate(at, "Asia/Kolkata")), "2026-09-27");
  assert.equal(dateKey(workDate(new Date("2026-09-27T20:00:00Z"), "Asia/Kolkata")), "2026-09-28");
  const shift = { startTime: "09:30", endTime: "18:30", graceMinutes: 5, timezone: "Asia/Kolkata" };
  assert.equal(lateMinutes(at, shift), 10);
  assert.equal(lateMinutes(new Date("2026-09-27T04:03:00Z"), shift), 0); // within grace
  assert.equal(lateMinutes(at, null), 0);
  assert.equal(isEarlyCheckout(new Date("2026-09-27T12:00:00Z"), shift), true); // 17:30 IST
  assert.equal(isEarlyCheckout(new Date("2026-09-27T13:30:00Z"), shift), false);
  assert.equal(parseHHMM("24:00"), null);
  assert.equal(fmtMinutes(125), "2h 05m");
});

test("leave days skip weekends and holidays; half day is 0.5", () => {
  const d = (s: string) => new Date(`${s}T00:00:00Z`);
  assert.equal(leaveDays(d("2026-09-25"), d("2026-09-29"), [1, 2, 3, 4, 5], new Set()), 3); // Fri, Mon, Tue
  assert.equal(leaveDays(d("2026-09-25"), d("2026-09-29"), [1, 2, 3, 4, 5], new Set(["2026-09-28"])), 2);
  assert.equal(leaveDays(d("2026-09-28"), d("2026-09-28"), [1, 2, 3, 4, 5], new Set(), true), 0.5);
  assert.equal(leaveDays(d("2026-09-27"), d("2026-09-27"), [1, 2, 3, 4, 5], new Set()), 0); // Sunday
});

/* ───────── attendance policy ───────── */

test("workforce policy defaults never collect more than needed and never choose a retention period", () => {
  assert.equal(WORKFORCE_DEFAULTS.locationPolicy, "ATTENDANCE_ONLY");
  assert.equal(WORKFORCE_DEFAULTS.locationRetentionDays, null);
  assert.equal(parseWorkforce({ locationPolicy: "NOPE" }).locationPolicy, "ATTENDANCE_ONLY");
  assert.equal(needsLocation({ ...WORKFORCE_DEFAULTS, locationPolicy: "NONE" }, "OFFICE"), false);
  assert.equal(needsLocation(WORKFORCE_DEFAULTS, "REMOTE"), false);
  assert.equal(needsLocation({ ...WORKFORCE_DEFAULTS, remoteLocation: true }, "REMOTE"), true);
});

test("check-in decision: FLAG records exceptions, BLOCK refuses them, remote and hybrid are respected", () => {
  const inside = { latitude: 18.5205, longitude: 73.8568 };
  const outside = { latitude: 18.54, longitude: 73.8567 };
  const flag = WORKFORCE_DEFAULTS;
  const block = { ...WORKFORCE_DEFAULTS, geofenceEnforcement: "BLOCK" as const };
  const o = { ...office, remote: false };
  assert.equal(evaluateCheckIn(flag, "OFFICE", undefined, o, inside, false).geofence, "INSIDE");
  const flagged = evaluateCheckIn(flag, "OFFICE", undefined, o, outside, false);
  assert.equal(flagged.allowed, true);
  assert.equal(flagged.geofence, "OUTSIDE");
  assert.equal(evaluateCheckIn(block, "OFFICE", undefined, o, outside, false).allowed, false);
  assert.equal(evaluateCheckIn(block, "OFFICE", undefined, o, null, true).allowed, false);
  assert.equal(evaluateCheckIn(flag, "OFFICE", undefined, o, null, true).geofence, "NO_LOCATION");
  assert.equal(evaluateCheckIn(block, "REMOTE", undefined, o, null, false).geofence, "NOT_REQUIRED");
  assert.equal(evaluateCheckIn(block, "HYBRID", "REMOTE", o, null, false).allowed, true);
  assert.equal(evaluateCheckIn(block, "HYBRID", "OFFICE", o, outside, false).allowed, false);
  assert.equal(evaluateCheckIn({ ...flag, locationPolicy: "NONE" }, "OFFICE", undefined, o, null, false).geofence, "NOT_REQUIRED");
});

test("user-agent parsing and bot detection", () => {
  const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
  assert.deepEqual(parseUserAgent(iphone), { device: "Mobile", browser: "Safari", os: "iOS" });
  assert.equal(parseUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 Edg/129.0").browser, "Edge");
  assert.equal(isBotUserAgent("Googlebot/2.1 (+http://www.google.com/bot.html)"), true);
  assert.equal(isBotUserAgent(iphone), false);
  assert.equal(isBotUserAgent(""), true);
});

/* ───────── RBAC ───────── */

test("every role grant is a known permission and every role has a label-able bundle", () => {
  for (const r of ROLES) for (const p of ROLE_PERMISSIONS[r]) assert.ok(PERMISSIONS.includes(p), `${r} → ${p}`);
});

test("self-service staff cannot see HR data; HR managers cannot see pay", () => {
  const deny = (r: RoleName, ps: Permission[]) => ps.forEach((p) => assert.equal(can(r, p), false, `${r} must not have ${p}`));
  for (const r of ["EMPLOYEE", "CONTRACTOR", "INTERN"] as RoleName[]) {
    assert.equal(can(r, "selfservice:use"), true);
    deny(r, ["employees:view", "compensation:view", "employeeDocs:view", "attendance:view", "attendance:location", "leave:approve", "visitors:view", "dashboard:view", "leads:view", "ai:execute"]);
  }
  assert.equal(can("HR_MANAGER", "employees:manage"), true);
  deny("HR_MANAGER", ["compensation:view", "attendance:override"]);
  assert.equal(can("HR_ADMIN", "compensation:view"), true);
  assert.equal(can("TEAM_MANAGER", "team:view"), true);
  deny("TEAM_MANAGER", ["employees:view", "compensation:view"]);
  assert.equal(can("MARKETING_MANAGER", "visitors:view"), true);
  assert.equal(can("MARKETING_MANAGER", "visitors:manage"), false);
  assert.equal(can("SUPER_ADMIN", "compensation:manage"), true);
});

test("DB permission overrides grant and revoke, but never unlock locked admin permissions or touch SUPER_ADMIN", () => {
  try {
    setPermissionOverrides([
      { role: "EMPLOYEE", permission: "leads:view", granted: true },
      { role: "SALES_MANAGER", permission: "visitors:view", granted: false },
      { role: "ADMIN", permission: "users:manage", granted: false },
      { role: "SUPER_ADMIN", permission: "leads:view", granted: false },
    ]);
    assert.equal(can("EMPLOYEE", "leads:view"), true);
    assert.equal(defaultCan("EMPLOYEE", "leads:view"), false);
    assert.equal(can("SALES_MANAGER", "visitors:view"), false);
    assert.ok(LOCKED.ADMIN?.includes("users:manage"));
    assert.equal(can("ADMIN", "users:manage"), true);
    assert.equal(can("SUPER_ADMIN", "leads:view"), true);
  } finally {
    setPermissionOverrides([]);
  }
  assert.equal(can("EMPLOYEE", "leads:view"), false);
});

test("new AI tools require the same permission as the matching page (user ∩ AI employee)", () => {
  const need = { getWorkforceToday: "attendance:view", getLeaveOverview: "leave:view", getVisitorSummary: "visitors:view", listHighIntentVisitors: "visitors:view" } as const;
  for (const [name, perm] of Object.entries(need)) {
    const t = getTool(name);
    assert.ok(t, name);
    assert.deepEqual(t!.permissions, [perm]);
    assert.equal(t!.kind, "read");
  }
  // A sales manager can run the Sales agent but cannot use the attendance tool through the CEO agent.
  assert.equal(can("SALES_MANAGER", "attendance:view"), false);
  for (const a of AGENTS) for (const tool of a.tools) assert.ok(getTool(tool), `${a.slug} → ${tool}`);
});

/* ───────── visitor tracking ───────── */

test("visitor tracking is off by default, consent-first, honours GPC and never sets a retention period", () => {
  assert.equal(VISITOR_DEFAULTS.enabled, false);
  assert.equal(VISITOR_DEFAULTS.consentMode, "REQUIRED");
  assert.equal(VISITOR_DEFAULTS.retentionDays, null);
  const on = parseVisitorPolicy({ enabled: true });
  const base = { consent: "granted", gpc: false, bot: false, path: "/services/web3" };
  assert.deepEqual(trackingDecision(VISITOR_DEFAULTS, base), { track: false, reason: "disabled" });
  assert.equal(trackingDecision(on, base).track, true);
  assert.equal(trackingDecision(on, { ...base, consent: null }).reason, "no-consent");
  assert.equal(trackingDecision(on, { ...base, consent: "denied" }).reason, "declined");
  assert.equal(trackingDecision({ ...on, consentMode: "NOT_REQUIRED" }, { ...base, consent: "denied" }).reason, "declined");
  assert.equal(trackingDecision({ ...on, consentMode: "NOT_REQUIRED" }, { ...base, consent: null }).track, true);
  assert.equal(trackingDecision(on, { ...base, gpc: true }).reason, "gpc");
  assert.equal(trackingDecision(on, { ...base, bot: true }).reason, "bot");
  assert.equal(trackingDecision(on, { ...base, path: "/admin/leads" }).reason, "excluded");
  assert.equal(trackingDecision(on, { ...base, path: "/p/abc" }).reason, "excluded");
  assert.equal(trackingDecision(on, { ...base, path: "/pricing" }).track, true);
});

test("intent score is explained signal by signal, capped at 100", () => {
  const cold = scoreIntent({ paths: ["/"], eventTypes: ["page_view"], sessions: 1, totalSeconds: 20, companyIdentified: false, identifiedLead: false });
  assert.equal(cold.score, 0);
  assert.equal(cold.label, "LOW");
  const hot = scoreIntent({ paths: ["/pricing", "/contact", "/services/a", "/services/b", "/services/c", "/services/d", "/case-studies/x"], eventTypes: ["cta_click", "cta_click", "cta_click", "form_start", "whatsapp_click", "download"], sessions: 5, totalSeconds: 900, companyIdentified: true, identifiedLead: true });
  assert.equal(hot.score, 100);
  assert.equal(hot.label, "HIGH");
  assert.ok(hot.signals.every((s) => s.points > 0 && s.signal && typeof s.detail === "string"));
  const mid = scoreIntent({ paths: ["/pricing", "/services/a"], eventTypes: [], sessions: 2, totalSeconds: 60, companyIdentified: false, identifiedLead: false });
  assert.equal(mid.score, 30);
  assert.equal(mid.label, "MEDIUM");
});

test("alert rules match on every set condition", () => {
  const v = { intentScore: 70, country: "India", sessionsCount: 3, paths: ["/pricing"], company: { name: "Acme", industry: "Fintech" } };
  assert.equal(matchRule({ minIntent: 60, countries: ["india"] }, v), true);
  assert.equal(matchRule({ minIntent: 80 }, v), false);
  assert.equal(matchRule({ pathContains: "/contact" }, v), false);
  assert.equal(matchRule({ returning: true, identifiedCompany: true, industries: ["fintech"] }, v), true);
  assert.equal(matchRule({ identifiedCompany: true }, { ...v, company: null }), false);
  assert.equal(matchRule({}, v), true);
  assert.match(describeRule({ minIntent: 60, countries: ["India"] }), /intent ≥ 60 and country in India/);
});

test("source attribution from UTM and referrer", () => {
  assert.deepEqual(deriveSource({ utmSource: "LinkedIn", utmMedium: "CPC" }), { source: "linkedin", medium: "cpc" });
  assert.deepEqual(deriveSource({ referrer: "https://www.google.com/search?q=x", host: "shivacha.com" }), { source: "google", medium: "organic" });
  assert.deepEqual(deriveSource({ referrer: "https://lnkd.in/abc", host: "shivacha.com" }), { source: "linkedin", medium: "social" });
  assert.deepEqual(deriveSource({ referrer: "https://www.linkedin.com/feed", host: "shivacha.com" }), { source: "linkedin", medium: "social" });
  assert.deepEqual(deriveSource({ referrer: "https://shivacha.com/services", host: "shivacha.com" }), { source: "direct", medium: "none" });
  assert.deepEqual(deriveSource({}), { source: "direct", medium: "none" });
  assert.deepEqual(deriveSource({ referrer: "https://blog.example.org/post", host: "shivacha.com" }), { source: "blog.example.org", medium: "referral" });
});

/* ───────── voice ───────── */

test("spoken replies drop markdown and stay short", () => {
  const md = "## Pipeline\n\n**3 deals** are at risk:\n\n- [Acme](/admin/deals/1) — ₹12L\n- Beta\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```json\n{}\n```";
  const s = toSpeech(md);
  assert.doesNotMatch(s, /[#*|`[\]]/);
  assert.match(s, /3 deals are at risk/);
  assert.match(s, /Acme/);
  const long = toSpeech("One sentence here. ".repeat(100), 120);
  assert.ok(long.length < 180);
  assert.match(long, /on screen/);
});

test("voice hints, delegation phrases, contextual records and cost estimates", () => {
  assert.match(voiceChannelHint("hinglish"), /Hinglish/);
  assert.match(voiceChannelHint("hi-IN"), /Devanagari/);
  assert.equal(wantsBackground("Prepare the proposal in the background"), true);
  assert.equal(wantsBackground("isko baad mein kar dena"), true);
  assert.equal(wantsBackground("What is our pipeline?"), false);
  assert.deepEqual(entityFromPath("/admin/leads/cmabc12345xyz"), { entity: "Lead", id: "cmabc12345xyz" });
  assert.deepEqual(entityFromPath("/admin/finance/invoices/cmabc12345xyz/edit"), { entity: "Invoice", id: "cmabc12345xyz" });
  assert.equal(entityFromPath("/admin/leads/new"), null);
  assert.equal(entityFromPath("/admin/leads"), null);
  assert.equal(estimateVoiceCost("browser", 600, 10_000), 0);
  assert.ok(Math.abs(estimateVoiceCost("openai", 60, 1_000_000) - (0.003 + 15)) < 1e-9);
});
