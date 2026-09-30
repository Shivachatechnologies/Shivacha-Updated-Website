/** Growth department unit tests (pure logic, no database): npm run test:growth */
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkBudget, DEFAULT_GROWTH_SETTINGS, isHumanActor, KILL_KEYS, parseGrowthSettings, stopReason, CHANNEL_KEYS, IMPLEMENTED_CHANNELS, NOT_IMPLEMENTED_CHANNELS, ACTIVE_KILL_KEYS } from "../../lib/growth/policy";
import { readFileSync, readdirSync } from "node:fs";
import { classifyRequest } from "../../lib/ai/router/policy";
import { budgetUpperUsd, qualify, shouldAdvanceStage } from "../../lib/growth/qualify";
import { aggregateCredit, attribute, buildUtmUrl, channelOfLead } from "../../lib/growth/attribution";
import { classifyReply, DEFAULT_CADENCE, DEFAULT_STEPS, nextStepAt, renderStep, STOPS_SEQUENCE, SUPPRESSES, unsubscribeToken, verifyUnsubscribeToken } from "../../lib/growth/email-rules";
import { contentQa, excerptFor, qaBlocks, repurposePlan, PLATFORM_LIMITS } from "../../lib/growth/content";
import { GROWTH_ROLES } from "../../lib/growth/workforce-map";
import { AGENTS } from "../../lib/ai/catalog";
import { can } from "../../lib/auth/permissions";

const on = (patch: Record<string, unknown>) => parseGrowthSettings({ ...DEFAULT_GROWTH_SETTINGS, ...patch });

test("settings: safe defaults — everything off, nothing stopped, no budgets", () => {
  const s = parseGrowthSettings(undefined);
  assert.equal(s.autonomousMode, false);
  assert.ok(CHANNEL_KEYS.every((k) => s.channels[k] === false));
  assert.ok(KILL_KEYS.every((k) => s.stops[k] === false));
  assert.equal(s.budgets.emailDaily, null);
  assert.equal(s.dailyQualifiedLeadTarget, 100);
  assert.deepEqual(parseGrowthSettings({ autonomousMode: "garbage", channels: 5 }), DEFAULT_GROWTH_SETTINGS, "invalid stored value → defaults");
  assert.equal(parseGrowthSettings({ channels: { email: true } }).channels.social, false, "partial objects keep defaults");
});

test("kill switches: STOP ALL and specific stops beat every toggle; autonomous needs mode + channel", () => {
  const all = on({ autonomousMode: true, channels: { ...DEFAULT_GROWTH_SETTINGS.channels, email: true }, stops: { ...DEFAULT_GROWTH_SETTINGS.stops, all: true } });
  assert.match(stopReason(all, { kind: "channel", channel: "email", autonomous: true })!, /STOP ALL/);
  assert.match(stopReason(all, { kind: "ai" })!, /STOP ALL/);
  const base = on({ autonomousMode: true, channels: { ...DEFAULT_GROWTH_SETTINGS.channels, email: true, social: true } });
  assert.equal(stopReason(base, { kind: "channel", channel: "email", autonomous: true }), null);
  assert.match(stopReason({ ...base, stops: { ...base.stops, email: true } }, { kind: "channel", channel: "email", autonomous: true })!, /email/i);
  assert.match(stopReason({ ...base, stops: { ...base.stops, marketing: true } }, { kind: "channel", channel: "social" })!, /marketing/i, "stops apply to humans too");
  assert.match(stopReason({ ...base, stops: { ...base.stops, publishing: true } }, { kind: "channel", channel: "social", autonomous: true })!, /publishing/i);
  assert.equal(stopReason({ ...base, stops: { ...base.stops, outbound: true } }, { kind: "channel", channel: "email", autonomous: true }), null, "outbound stop leaves nurture running");
  assert.match(stopReason({ ...base, stops: { ...base.stops, outbound: true } }, { kind: "channel", channel: "email", autonomous: true, outbound: true })!, /outbound/i);
  assert.match(stopReason({ ...base, stoppedPlatforms: ["X"] }, { kind: "channel", channel: "social", autonomous: true, platform: "X" })!, /X is stopped/);
  assert.equal(stopReason({ ...base, stoppedPlatforms: ["X"] }, { kind: "channel", channel: "social", autonomous: true, platform: "LINKEDIN" }), null);
  assert.match(stopReason({ ...base, autonomousMode: false }, { kind: "channel", channel: "email", autonomous: true })!, /Autonomous growth mode is off/);
  assert.equal(stopReason({ ...base, autonomousMode: false }, { kind: "channel", channel: "email" }), null, "a person can still act when autonomous mode is off");
  assert.match(stopReason(base, { kind: "channel", channel: "paidAds", autonomous: true })!, /channel is off/);
  assert.match(stopReason({ ...base, stops: { ...base.stops, ai: true } }, { kind: "ai", agent: "marketing" })!, /Stop all AI/);
  assert.match(stopReason({ ...base, stoppedAgents: ["sdr"] }, { kind: "ai", agent: "sdr" })!, /sdr/);
  assert.equal(stopReason({ ...base, stoppedAgents: ["sdr"] }, { kind: "ai", agent: "sales" }), null);
});

test("kill switches: only humans with growth:control can lift them", () => {
  assert.equal(isHumanActor({ id: "system" }), false, "scheduler/AI identity is never human");
  assert.equal(isHumanActor({ id: "ai:marketing" }), false);
  assert.equal(isHumanActor({ id: "clx123" }), true);
  assert.equal(can("ADMIN", "growth:control"), true);
  assert.equal(can("MARKETING_MANAGER", "growth:control"), false, "marketing can stop (growth:manage) but not resume");
  assert.equal(can("MARKETING_MANAGER", "growth:manage"), true);
  assert.equal(can("SALES_MANAGER", "growth:manage"), false);
  assert.equal(can("EMPLOYEE", "growth:view"), false);
});

test("budgets: unset blocks, never exceeded, exact limit allowed", () => {
  assert.equal(checkBudget(null, 0, 1).ok, false, "no budget configured → blocked");
  assert.deepEqual(checkBudget(100, 40, 60), { ok: true, remaining: 0 });
  const r = checkBudget(100, 40, 60.01);
  assert.equal(r.ok, false);
  assert.match((r as { reason: string }).reason, /Budget reached/);
  assert.equal(checkBudget(10, 0, -5).ok, false, "negative amounts rejected");
  assert.equal(checkBudget(0, 0, 1).ok, false, "zero budget blocks");
});

test("qualification: strong B2B inquiry is sales-ready, with signals and reason", () => {
  const q = qualify(
    { email: "cto@acmebank.com", company: "Acme Bank", website: "https://acmebank.com", phone: "+971500000000", country: "AE", service: "Crypto Exchange Development", budget: "$50K+", message: "We need to launch a white-label exchange by March, please send a proposal and pricing. ".repeat(3), formType: "demo" },
    { visits: 4, pagesViewed: 12, intentPages: 2, meetingBooked: true },
    { countries: ["AE"], services: ["exchange"] },
  );
  assert.equal(q.tier, "SALES_READY");
  assert.ok(q.total >= 70 && q.fit >= 60 && q.intent >= 60);
  assert.ok(q.signals.some((s) => /work email/.test(s)));
  assert.match(q.reason, /Sales-ready/);
  for (const k of ["fit", "intent", "engagement", "budget", "timeline", "total"] as const) assert.ok(q[k] >= 0 && q[k] <= 100, `${k} in 0–100`);
});

test("qualification: thin personal-email inquiry is low fit; budget alone never qualifies", () => {
  const low = qualify({ email: "someone@gmail.com", message: "hi" });
  assert.equal(low.tier, "LOW_FIT");
  assert.ok(low.signals.some((s) => s.startsWith("-") && /personal email/.test(s)));
  const rich = qualify({ email: "x@gmail.com", budget: "$50K+" });
  assert.notEqual(rich.tier, "SALES_READY");
  const later = qualify({ email: "a@corp.io", company: "Corp", message: "Just exploring for next year, no rush." });
  assert.ok(later.timeline < 40);
  assert.equal(budgetUpperUsd("$10K–$25K"), 25_000);
  assert.equal(budgetUpperUsd("Under $5K"), 5_000);
  assert.equal(budgetUpperUsd("Not Sure Yet"), null);
  assert.equal(shouldAdvanceStage("LEAD", "SALES_READY"), true);
  assert.equal(shouldAdvanceStage("OPPORTUNITY", "QUALIFIED"), false, "never downgrades sales progress");
  assert.equal(shouldAdvanceStage("DISQUALIFIED", "SALES_READY"), false);
});

test("UTM builder: tags site links, replaces old utm params, keeps others", () => {
  const u = new URL(buildUtmUrl("/services/fintech?ref=a&utm_source=old", { source: "LinkedIn", medium: "social", campaign: "Q4 FinTech!", content: "carousel 1" }, "https://shivacha.com"));
  assert.equal(u.origin, "https://shivacha.com");
  assert.equal(u.searchParams.get("ref"), "a");
  assert.equal(u.searchParams.get("utm_source"), "linkedin");
  assert.equal(u.searchParams.get("utm_campaign"), "q4-fintech");
  assert.equal(u.searchParams.get("utm_content"), "carousel-1");
  assert.equal(u.searchParams.get("utm_term"), null);
  assert.throws(() => buildUtmUrl("javascript:alert(1)", { source: "x", medium: "y", campaign: "z" }));
});

test("attribution: first, last, linear and position-based credit", () => {
  const d = (n: number) => new Date(Date.UTC(2026, 0, n));
  const t = [{ channel: "LINKEDIN", occurredAt: d(3) }, { channel: "EMAIL", occurredAt: d(5) }, { channel: "ORGANIC_SEARCH", occurredAt: d(1) }, { channel: "EMAIL", occurredAt: d(7) }];
  assert.deepEqual(attribute(t, "first"), { ORGANIC_SEARCH: 1 });
  assert.deepEqual(attribute(t, "last"), { EMAIL: 1 });
  const lin = attribute(t, "linear");
  assert.equal(lin.EMAIL, 0.5);
  const pos = attribute(t, "position");
  assert.ok(Math.abs(Object.values(pos).reduce((a, b) => a + b, 0) - 1) < 1e-9, "credits sum to 1");
  assert.equal(pos.ORGANIC_SEARCH, 0.4);
  assert.deepEqual(attribute([], "first"), {}, "no touches → no credit invented");
  assert.deepEqual(aggregateCredit([t, [{ channel: "X", occurredAt: d(1) }]], "first"), [{ channel: "ORGANIC_SEARCH", credit: 1 }, { channel: "X", credit: 1 }]);
  assert.equal(channelOfLead({ utmSource: "linkedin", utmMedium: "cpc" }), "LINKEDIN_ADS");
  assert.equal(channelOfLead({ utmSource: "google", utmMedium: "organic" }), "ORGANIC_SEARCH");
  assert.equal(channelOfLead({ source: "direct" }), "DIRECT");
});

test("email: default cadence is Day 0/2/5/9/14 and every message has an unsubscribe link", () => {
  assert.deepEqual(DEFAULT_STEPS.map((s) => s.day), [...DEFAULT_CADENCE]);
  const start = new Date("2026-01-01T00:00:00Z");
  assert.equal(nextStepAt(DEFAULT_STEPS, 2, start)!.toISOString(), "2026-01-06T00:00:00.000Z");
  assert.equal(nextStepAt(DEFAULT_STEPS, 5, start), null, "sequence finished");
  const m = renderStep(DEFAULT_STEPS[0], { name: "Priya Sharma", company: "Acme", unsubscribeUrl: "https://x/u?t=1" });
  assert.match(m.subject, /Priya/);
  assert.match(m.body, /Unsubscribe: https:\/\/x\/u\?t=1/);
  assert.doesNotMatch(m.body, /\{\{/);
});

test("email: replies — negative and opt-out suppress; any real reply stops the sequence", () => {
  assert.equal(classifyReply("Please unsubscribe me"), "UNSUBSCRIBE");
  assert.equal(classifyReply("Not interested, thanks"), "NEGATIVE");
  assert.equal(classifyReply("I'm out of office until Monday"), "OUT_OF_OFFICE");
  assert.equal(classifyReply("Yes, let's schedule a call next week"), "POSITIVE");
  assert.equal(classifyReply("Who is this?"), "NEUTRAL");
  assert.ok(SUPPRESSES.UNSUBSCRIBE && SUPPRESSES.NEGATIVE && !SUPPRESSES.POSITIVE);
  assert.ok(STOPS_SEQUENCE.POSITIVE && STOPS_SEQUENCE.NEGATIVE && STOPS_SEQUENCE.NEUTRAL && !STOPS_SEQUENCE.OUT_OF_OFFICE);
});

test("email: unsubscribe tokens are signed, address-bound and tamper-proof", () => {
  const secret = "s".repeat(40);
  const t = unsubscribeToken("Priya@Acme.com", secret);
  assert.equal(verifyUnsubscribeToken(t, secret), "priya@acme.com");
  assert.equal(verifyUnsubscribeToken(t, "other-secret".repeat(4)), null, "wrong secret");
  const forged = `${Buffer.from("victim@acme.com").toString("base64url")}.${t.split(".")[1]}`;
  assert.equal(verifyUnsubscribeToken(forged, secret), null, "signature bound to the address");
  assert.equal(verifyUnsubscribeToken("garbage", secret), null);
});

test("content QA: blocks guarantees, financial promises, engagement bait, banned phrases and over-length", () => {
  assert.ok(qaBlocks(contentQa("Guaranteed returns of 20% APY!", "LINKEDIN")));
  assert.ok(qaBlocks(contentQa("Follow for follow 🙌", "INSTAGRAM", { mediaUrl: "https://x/a.jpg" })));
  assert.ok(qaBlocks(contentQa("x".repeat(281), "X")));
  assert.ok(qaBlocks(contentQa("Nice launch", "INSTAGRAM")), "Instagram requires media");
  assert.ok(qaBlocks(contentQa("We are the best, get rich", "FACEBOOK", { bannedPhrases: ["get rich"] })));
  const ok = contentQa("How we ship secure exchanges: https://shivacha.com/products/crypto-exchange?utm_campaign=q4", "LINKEDIN");
  assert.equal(qaBlocks(ok), false);
  assert.ok(contentQa("Read more https://shivacha.com/blog", "LINKEDIN").some((i) => i.code === "NO_UTM"), "untagged site link warns");
  assert.ok(contentQa("Grew 300% in a year", "LINKEDIN").some((i) => i.code === "NUMERIC_CLAIM"), "numeric claims need a source");
});

test("repurposing: plans per asset kind and excerpts stay within platform limits", () => {
  assert.deepEqual(repurposePlan("REEL_SCRIPT").map((p) => p.platform), ["INSTAGRAM", "YOUTUBE", "LINKEDIN"]);
  const long = Array.from({ length: 30 }, (_, i) => `Paragraph ${i} ${"word ".repeat(20)}`).join("\n\n");
  const link = "https://shivacha.com/x?utm_campaign=a";
  for (const p of ["X", "LINKEDIN"] as const) {
    const e = excerptFor(long, p, link);
    assert.ok(e.length <= PLATFORM_LIMITS[p].chars, `${p} excerpt within limit`);
    assert.ok(e.endsWith(link));
  }
});

test("AI workforce: all 24 growth responsibilities map onto existing agents and registered tools only", () => {
  assert.equal(GROWTH_ROLES.length, 24);
  const slugs = new Set(AGENTS.map((a) => a.slug));
  for (const r of GROWTH_ROLES) assert.ok(slugs.has(r.agent), `${r.key} → existing agent ${r.agent}`);
  assert.equal(new Set(GROWTH_ROLES.map((r) => r.key)).size, 24, "unique responsibilities");
  const marketing = AGENTS.find((a) => a.slug === "marketing")!;
  assert.ok(marketing.tools.includes("draftSocialPost") && marketing.tools.includes("getGrowthSummary"));
  for (const a of AGENTS) assert.ok(!a.tools.some((t) => /growth.*(settings|control|kill)/i.test(t)), "no agent has a tool that changes growth control");
});

test("controls: every switch shown in the UI is read by server code; the rest are labelled and always off", () => {
  const src = readdirSync("lib/growth").filter((f) => f.endsWith(".ts") && f !== "policy.ts").map((f) => readFileSync(`lib/growth/${f}`, "utf8")).join("\n") + readFileSync("lib/ai/tools-growth.ts", "utf8");
  for (const c of IMPLEMENTED_CHANNELS) assert.match(src, new RegExp(`channel: "${c}"|gate\\("${c}"\\)`), `channel ${c} is checked server-side`);
  for (const c of CHANNEL_KEYS.filter((k) => !IMPLEMENTED_CHANNELS.includes(k))) {
    assert.ok(NOT_IMPLEMENTED_CHANNELS[c], `${c} is labelled not implemented`);
    assert.doesNotMatch(src, new RegExp(`channel: "${c}"`), `${c} is not wired anywhere`);
  }
  assert.deepEqual([...CHANNEL_KEYS].sort(), [...IMPLEMENTED_CHANNELS, ...Object.keys(NOT_IMPLEMENTED_CHANNELS)].sort());
  // Phase 34: the Advertising OS makes the paid-ads kill switch real (it stops create/launch/budget increases).
  assert.ok(ACTIVE_KILL_KEYS.includes("ads"), "the paid-ads kill switch is offered now that ad actions exist");
  const stale = parseGrowthSettings({ channels: { paidAds: true, seo: true, community: true, email: true }, stops: { ads: true } });
  assert.equal(stale.channels.paidAds || stale.channels.seo || stale.channels.community, false, "unimplemented channels can never read as on");
  assert.equal(stale.channels.email, true);
  assert.equal(stale.stops.ads, true, "a stored ads stop is honoured");
  assert.match(stopReason(stale, { kind: "channel", channel: "paidAds" }) ?? "", /paid ads/i);
  const page = readFileSync("app/admin/(panel)/marketing/autonomous/page.tsx", "utf8");
  assert.match(page, /IMPLEMENTED_CHANNELS\.map/);
  assert.match(page, /ACTIVE_KILL_KEYS\.map/);
  assert.doesNotMatch(page, /(?<![A-Z_])(CHANNEL_KEYS|KILL_KEYS)\.map/, "the page never lists every channel or switch");
});

test("router: campaign sends and launches need approval; reads, drafts and daily runs keep their class", () => {
  const cases: [string, string][] = [
    ["Send this campaign", "APPROVAL_REQUIRED"], ["Send this campaign.", "APPROVAL_REQUIRED"], ["Send the campaign now", "APPROVAL_REQUIRED"], ["Launch the campaign", "APPROVAL_REQUIRED"],
    ["Launch this campaign", "APPROVAL_REQUIRED"], ["Email the newsletter", "APPROVAL_REQUIRED"], ["Mail the campaign", "APPROVAL_REQUIRED"], ["Blast the newsletter", "APPROVAL_REQUIRED"],
    ["Send the newsletter", "APPROVAL_REQUIRED"], ["Launch today's campaign", "APPROVAL_REQUIRED"], ["Send this campaign to all leads", "APPROVAL_REQUIRED"], ["Publish today's posts", "APPROVAL_REQUIRED"],
    ["How many campaigns do we have?", "INSTANT_READ"], ["Show me today's campaigns", "INSTANT_READ"], ["What campaigns are active?", "INSTANT_READ"],
    ["Create a campaign draft", "INSTANT_ACTION"], ["Run today's marketing", "BACKGROUND_TASK"], ["aaj ki marketing chalao", "BACKGROUND_TASK"],
  ];
  for (const [t, want] of cases) assert.equal(classifyRequest(t).cls, want, t);
});
