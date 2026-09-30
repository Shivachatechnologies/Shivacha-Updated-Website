/**
 * Phase 30+ integration tests against the TEST database (refuses any other database): OAuth sign-in, provider usage
 * limits, the Advertising OS (policy, launch, spend guard, emergency stop, kill switch), lead enrichment and sequence
 * enrolment, the objective control loop, and sales/delivery intelligence. A fetch stub stands in for every provider
 * API, so nothing leaves the machine and every assertion is about what the system does with the provider's answer.
 *
 *   DATABASE_URL=postgresql://…/shivacha_test npm run test:company:ops
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../../lib/db/client";
import { completeOAuth, OAuthError, startOAuth } from "../../lib/integrations/oauth";
import { hydrateVault, removeSecrets, secretValue } from "../../lib/integrations/vault";
import { trackedFetch } from "../../lib/integrations/usage";
import { AdsError, createAdCampaign, launchAdCampaign, saveAdsPolicy, setAdBudget, syncAdSpend } from "../../lib/ads/engine";
import { DEFAULT_ADS_POLICY } from "../../lib/ads/policy";
import { enrollQualified, runLeadPipeline } from "../../lib/company/leadgen";
import { controlObjective, measureObjective, MAX_LOOP_TASKS, parseMeasurement } from "../../lib/company/measure";
import { dealRisks, leadPriorities, nextBestActions, salesForecast } from "../../lib/company/sales";
import { clientHealth, collectionsQueue, projectHealth } from "../../lib/company/delivery";
import { stuckTasks, workforceTrend } from "../../lib/company/analytics";
import { GROWTH_SETTING } from "../../lib/growth/settings";
import { DEFAULT_GROWTH_SETTINGS } from "../../lib/growth/policy";

if (!/shivacha_test/.test(process.env.DATABASE_URL ?? "")) throw new Error("These integration tests only run against the shivacha_test database.");
if (process.env.ANTHROPIC_API_KEY) throw new Error("Unset ANTHROPIC_API_KEY for these tests.");

const RUN = Date.now().toString(36);
const PREV_KEY = process.env.APP_ENCRYPTION_KEY;
process.env.APP_ENCRYPTION_KEY = "k".repeat(40);
let SUPER = "";
let OTHER = "";
const today = new Date().toISOString().slice(0, 10);

/* ───── fetch stub: every provider endpoint used below ───── */
const realFetch = globalThis.fetch;
const hits: { url: string; method: string; body: unknown }[] = [];
let tokenReply: { status: number; body: unknown } = { status: 200, body: {} };
let metaSpend = "0";
let apolloMatchEmail: string | null = null;
let seq = 0;
const queued: Record<string, { status: number; headers?: Record<string, string> }[]> = {};
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  const method = (init?.method ?? "GET").toUpperCase();
  const body = typeof init?.body === "string" ? (init.body.startsWith("{") ? JSON.parse(init.body) : init.body) : null;
  const res = (status: number, b: unknown, headers: Record<string, string> = {}) => {
    hits.push({ url, method, body });
    return new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json", ...headers } });
  };
  for (const [prefix, list] of Object.entries(queued)) if (url.startsWith(prefix) && list.length) {
    const q = list.shift()!;
    return res(q.status, {}, q.headers);
  }
  if (url === "https://www.linkedin.com/oauth/v2/accessToken") return res(tokenReply.status, tokenReply.body);
  if (url.startsWith("https://graph.facebook.com/")) {
    const path = new URL(url).pathname;
    if (/\/act_123\/campaigns$/.test(path)) return res(200, { id: `cmp-${RUN}-${++seq}` });
    if (/\/act_123\/adsets$/.test(path)) return res(200, { id: `set-${RUN}` });
    if (/\/insights$/.test(path)) return res(200, { data: [{ date_start: today, spend: metaSpend, impressions: "1000", clicks: "30", actions: [{ action_type: "lead", value: "2" }] }] });
    if (method === "POST") return res(200, { success: true });
  }
  if (url.startsWith("https://api.apollo.io/api/v1/people/match")) return res(200, { person: { email: apolloMatchEmail } });
  if (url.startsWith("https://api.apollo.io/")) return res(200, { people: [] });
  if (url.startsWith("https://api.neverbounce.com/")) return res(200, { status: "success", result: "valid" });
  if (url.startsWith("https://api.anthropic.com/")) return res(401, { type: "error", error: { type: "authentication_error", message: "test stub" } });
  return realFetch(input as RequestInfo, init);
}) as typeof fetch;

async function setGrowth(patch: Record<string, unknown>) {
  const v = JSON.parse(JSON.stringify({ ...DEFAULT_GROWTH_SETTINGS, ...patch }));
  await db.setting.upsert({ where: { key: GROWTH_SETTING }, update: { value: v }, create: { key: GROWTH_SETTING, value: v } });
}

before(async () => {
  const users = await db.user.findMany({ where: { email: { endsWith: "@shivacha.test" } }, select: { id: true, role: true } });
  SUPER = users.find((u) => u.role === "SUPER_ADMIN")!.id;
  OTHER = users.find((u) => u.role === "ADMIN")!.id;
  assert.ok(SUPER && OTHER, "QA users exist");
  await setGrowth({});
  await db.adCampaign.deleteMany({ where: { name: { startsWith: "Test ad " } } });
});

after(async () => {
  globalThis.fetch = realFetch;
  for (const k of ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET", "META_AD_ACCOUNT_ID", "META_ADS_ACCESS_TOKEN", "APOLLO_API_KEY", "NEVERBOUNCE_API_KEY", "ANTHROPIC_API_KEY"]) delete process.env[k];
  await removeSecrets(["LINKEDIN_ACCESS_TOKEN", "LINKEDIN_REFRESH_TOKEN"]);
  await db.integration.deleteMany({ where: { key: "oauth:linkedin" } });
  await db.adCampaign.deleteMany({ where: { name: { startsWith: "Test ad " } } });
  await db.setting.deleteMany({ where: { key: { in: ["adsPolicy", "integrationCaps"] } } });
  await setGrowth({});
  if (PREV_KEY === undefined) delete process.env.APP_ENCRYPTION_KEY;
  else process.env.APP_ENCRYPTION_KEY = PREV_KEY;
});

/* ───────────────────────── Integration Center 2.0 ───────────────────────── */

test("OAuth: needs the app credentials; state is single-use, bound to the user and short-lived; tokens are stored encrypted only after the provider issues them", async () => {
  delete process.env.LINKEDIN_CLIENT_ID;
  await removeSecrets(["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET", "LINKEDIN_ACCESS_TOKEN", "LINKEDIN_REFRESH_TOKEN"]);
  await assert.rejects(startOAuth("linkedin", SUPER), OAuthError, "no client credentials → no sign-in");
  process.env.LINKEDIN_CLIENT_ID = "li-client";
  process.env.LINKEDIN_CLIENT_SECRET = "li-secret";
  const stateOf = (u: string) => new URL(u).searchParams.get("state")!;

  // Another user cannot complete my sign-in, and the attempt consumes the state.
  const s1 = stateOf(await startOAuth("linkedin", SUPER));
  await assert.rejects(completeOAuth(s1, "code", OTHER), /another user/);
  await assert.rejects(completeOAuth(s1, "code", SUPER), /expired or was already used/);

  // Expired state.
  const s2 = stateOf(await startOAuth("linkedin", SUPER));
  await db.oAuthState.update({ where: { state: s2 }, data: { createdAt: new Date(Date.now() - 11 * 60_000) } });
  await assert.rejects(completeOAuth(s2, "code", SUPER), /longer than 10 minutes/);

  // Provider refuses the code → nothing stored, not connected.
  tokenReply = { status: 400, body: { error: "invalid_grant", error_description: "bad code" } };
  const s3 = stateOf(await startOAuth("linkedin", SUPER));
  // Phase 42: an actionable message is shown; the provider's own text is kept (scrubbed) only for the audit log.
  await assert.rejects(completeOAuth(s3, "code", SUPER), (e: OAuthError) => {
    assert.match(e.message, /LinkedIn: the authorization code expired or was already used\. Sign in again\./);
    assert.doesNotMatch(e.message, /bad code/, "raw provider text is not shown");
    assert.equal(e.kind, "EXPIRED");
    assert.equal(e.detail, "bad code");
    return true;
  });
  await hydrateVault(true);
  assert.equal(secretValue("LINKEDIN_ACCESS_TOKEN"), "");
  assert.equal(await db.integration.count({ where: { key: "oauth:linkedin", status: "CONNECTED" } }), 0);

  // Provider issues a token → stored encrypted, connection recorded; the state cannot be replayed.
  tokenReply = { status: 200, body: { access_token: `tok-${RUN}`, refresh_token: `ref-${RUN}`, expires_in: 3600 } };
  const url = await startOAuth("linkedin", SUPER);
  assert.match(url, /^https:\/\/www\.linkedin\.com\/oauth\/v2\/authorization\?/);
  assert.match(decodeURIComponent(url), /redirect_uri=.*\/api\/integrations\/oauth\/callback/);
  const s4 = stateOf(url);
  const r = await completeOAuth(s4, "good-code", SUPER);
  assert.equal(r.provider, "linkedin");
  const exchange = hits.filter((h) => h.url.includes("linkedin.com/oauth")).at(-1)!;
  assert.match(String(exchange.body), /grant_type=authorization_code/);
  assert.match(String(exchange.body), /code=good-code/);
  await hydrateVault(true);
  assert.equal(secretValue("LINKEDIN_ACCESS_TOKEN"), `tok-${RUN}`);
  const row = await db.integrationSecret.findFirstOrThrow({ where: { name: "LINKEDIN_ACCESS_TOKEN" } });
  assert.ok(!JSON.stringify(row).includes(`tok-${RUN}`), "the token is never stored in plain text");
  assert.equal((await db.integration.findUniqueOrThrow({ where: { key: "oauth:linkedin" } })).status, "CONNECTED");
  await assert.rejects(completeOAuth(s4, "good-code", SUPER), /already used/, "replay refused");
});

test("usage limits: a 429 puts the provider in cool-down (no further calls); daily caps stop runaway loops; GET 5xx is retried once, POST never", async () => {
  const day = new Date(`${today}T00:00:00Z`);
  await db.integrationUsage.deleteMany({ where: { date: day, provider: { in: ["x", "gemini", "openai"] } } });

  queued["https://api.x.com/2/users/me"] = [{ status: 429, headers: { "retry-after": "120" } }];
  const first = await trackedFetch("https://api.x.com/2/users/me");
  assert.equal(first.status, 429);
  const before = hits.length;
  const second = await trackedFetch("https://api.x.com/2/users/me");
  assert.equal(second.status, 429);
  assert.equal(second.headers.get("x-shivacha-local"), "rate-limit", "answered locally during the cool-down");
  assert.equal(hits.length, before, "no request was sent");
  const x = await db.integrationUsage.findUniqueOrThrow({ where: { date_provider: { date: day, provider: "x" } } });
  assert.ok(x.coolUntil && x.coolUntil.getTime() > Date.now() + 60_000);
  assert.equal(x.errors, 1);

  await db.setting.upsert({ where: { key: "integrationCaps" }, update: { value: { gemini: 2 } }, create: { key: "integrationCaps", value: { gemini: 2 } } });
  queued["https://generativelanguage.googleapis.com/"] = [{ status: 200 }, { status: 200 }, { status: 200 }];
  assert.equal((await trackedFetch("https://generativelanguage.googleapis.com/v1beta/models")).status, 200);
  assert.equal((await trackedFetch("https://generativelanguage.googleapis.com/v1beta/models")).status, 200);
  const capped = await trackedFetch("https://generativelanguage.googleapis.com/v1beta/models");
  assert.equal(capped.headers.get("x-shivacha-local"), "rate-limit", "third call over the cap of 2 is not sent");
  assert.match(await capped.text(), /daily API limit reached \(2 calls\)/);
  queued["https://generativelanguage.googleapis.com/"] = [];

  queued["https://api.openai.com/v1/models"] = [{ status: 503 }, { status: 200 }];
  assert.equal((await trackedFetch("https://api.openai.com/v1/models")).status, 200, "GET retried once after 503");
  queued["https://api.openai.com/v1/chat"] = [{ status: 503 }, { status: 200 }];
  assert.equal((await trackedFetch("https://api.openai.com/v1/chat", { method: "POST", body: "{}" })).status, 503, "POST is never retried");
  queued["https://api.openai.com/v1/chat"] = [];
  const o = await db.integrationUsage.findUniqueOrThrow({ where: { date_provider: { date: day, provider: "openai" } } });
  assert.equal(o.calls, 2, "counted per logical call");
  await db.integrationUsage.deleteMany({ where: { date: day, provider: { in: ["x", "gemini", "openai"] } } });
  await db.setting.deleteMany({ where: { key: "integrationCaps" } });
});

/* ───────────────────────── Advertising OS ───────────────────────── */

test("ads: NOT CONNECTED creates nothing; campaigns are created PAUSED; no launch without a daily limit; no autonomous launch unless the CEO enables it", async () => {
  delete process.env.META_AD_ACCOUNT_ID;
  delete process.env.META_ADS_ACCESS_TOKEN;
  await saveAdsPolicy(DEFAULT_ADS_POLICY, SUPER);
  await assert.rejects(createAdCampaign({ provider: "meta", name: `Test ad nc ${RUN}`, dailyBudget: 20, currency: "USD", countries: ["US"] }, SUPER), /NOT CONNECTED|not connected/i);
  assert.equal(await db.adCampaign.count({ where: { name: `Test ad nc ${RUN}` } }), 0);

  process.env.META_AD_ACCOUNT_ID = "act_123";
  process.env.META_ADS_ACCESS_TOKEN = "meta-token";
  const c = await createAdCampaign({ provider: "meta", name: `Test ad A ${RUN}`, dailyBudget: 20, currency: "USD", countries: ["US", "AE"] }, SUPER);
  assert.equal(c.status, "PAUSED");
  assert.match(c.externalId ?? "", new RegExp(`^cmp-${RUN}-\\d+$`), "the provider's campaign id");
  const create = hits.find((h) => h.url.includes("/act_123/campaigns"))!;
  assert.equal((create.body as { status: string }).status, "PAUSED", "created paused at the provider");
  assert.equal((create.body as { daily_budget: number }).daily_budget, 2000, "budget sent in cents");
  assert.deepEqual((hits.find((h) => h.url.includes("/act_123/adsets"))!.body as { targeting: { geo_locations: { countries: string[] } } }).targeting.geo_locations.countries, ["US", "AE"]);

  await assert.rejects(launchAdCampaign(c.id, { userId: SUPER, via: "HUMAN" }), /No daily ad spend limit/);
  assert.ok(await db.auditLog.findFirst({ where: { action: "ads.campaign.launch_refused", entityId: c.id } }), "refusal audited");

  await saveAdsPolicy({ ...DEFAULT_ADS_POLICY, dailySpendLimit: 50 }, SUPER);
  await assert.rejects(launchAdCampaign(c.id, { userId: null, via: "POLICY" }), /Autonomous advertising is off/);
  await saveAdsPolicy({ ...DEFAULT_ADS_POLICY, dailySpendLimit: 50, autonomous: true, autoApproveUpTo: 10 }, SUPER);
  await assert.rejects(launchAdCampaign(c.id, { userId: null, via: "POLICY" }), /Above the autonomous limit/);
  assert.equal((await db.adCampaign.findUniqueOrThrow({ where: { id: c.id } })).status, "PAUSED");

  const live = await launchAdCampaign(c.id, { userId: SUPER, via: "HUMAN" });
  assert.equal(live.status, "ACTIVE");
  assert.ok(hits.some((h) => h.url.includes(`/${c.externalId}?`) && (h.body as { status?: string })?.status === "ACTIVE"), "provider asked to activate");
  assert.ok(await db.auditLog.findFirst({ where: { action: "ads.campaign.launched", entityId: c.id } }));

  const b = await createAdCampaign({ provider: "meta", name: `Test ad B ${RUN}`, dailyBudget: 40, currency: "USD", countries: ["US"] }, SUPER);
  await assert.rejects(launchAdCampaign(b.id, { userId: SUPER, via: "HUMAN" }), /above the daily spend limit 50/, "20 active + 40 > 50");
  await assert.rejects(setAdBudget(c.id, 60, { userId: SUPER, via: "HUMAN" }), /above the daily spend limit/, "budget increases pass the same checks");
  await setAdBudget(c.id, 15, { userId: SUPER, via: "HUMAN" });
  assert.equal(Number((await db.adCampaign.findUniqueOrThrow({ where: { id: c.id } })).dailyBudget), 15, "decreases always apply");
});

test("ads: provider-reported spend over the daily limit pauses everything; emergency stop and the ads kill switch stop and pause", async () => {
  const c = await db.adCampaign.findFirstOrThrow({ where: { name: `Test ad A ${RUN}` } });
  assert.equal(c.status, "ACTIVE");
  metaSpend = "75.50";
  const r = await syncAdSpend(1);
  assert.equal(r.synced, 2);
  assert.match(r.guard ?? "", /exceeds the daily limit 50/);
  assert.equal((await db.adCampaign.findUniqueOrThrow({ where: { id: c.id } })).status, "PAUSED", "spend guard paused it");
  const log = await db.adSpendLog.findFirstOrThrow({ where: { adCampaignId: c.id } });
  assert.equal(Number(log.spend), 75.5);
  assert.equal(log.conversions, 2, "conversions only from the provider's lead actions");
  metaSpend = "0";

  await db.adSpendLog.deleteMany({ where: { adCampaignId: { in: (await db.adCampaign.findMany({ where: { name: { startsWith: "Test ad " } }, select: { id: true } })).map((x) => x.id) } } });
  await saveAdsPolicy({ ...DEFAULT_ADS_POLICY, dailySpendLimit: 1000 }, SUPER);
  await launchAdCampaign(c.id, { userId: SUPER, via: "HUMAN" });
  await saveAdsPolicy({ ...DEFAULT_ADS_POLICY, dailySpendLimit: 1000, emergencyStop: true }, SUPER);
  assert.equal((await db.adCampaign.findUniqueOrThrow({ where: { id: c.id } })).status, "PAUSED", "emergency stop pauses live campaigns");
  await assert.rejects(launchAdCampaign(c.id, { userId: SUPER, via: "HUMAN" }), /emergency stop/);
  await assert.rejects(createAdCampaign({ provider: "meta", name: `Test ad C ${RUN}`, dailyBudget: 5, currency: "USD", countries: ["US"] }, SUPER), AdsError);

  await saveAdsPolicy({ ...DEFAULT_ADS_POLICY, dailySpendLimit: 1000 }, SUPER);
  await setGrowth({ stops: { ...DEFAULT_GROWTH_SETTINGS.stops, ads: true } });
  await assert.rejects(launchAdCampaign(c.id, { userId: SUPER, via: "HUMAN" }), /Stop paid ads/);
  await assert.rejects(createAdCampaign({ provider: "meta", name: `Test ad D ${RUN}`, dailyBudget: 5, currency: "USD", countries: ["US"] }, SUPER), /Stop paid ads/);
  await setGrowth({});
});

/* ───────────────────────── lead engine: enrich → verify → qualify → enrol ───────────────────────── */

let campaignId = "";

test("lead engine: enrichment fills only provider-returned emails, then verification and ICP scoring; enrolment is OUTBOUND-only and respects the kill switch", async () => {
  const c = await db.campaign.create({ data: { name: `LG ops ${RUN}`, status: "ACTIVE", dailyLeadTarget: 10, leadGen: { sources: ["apollo"], titles: ["CTO"], countries: ["United States"], industries: ["fintech"], mode: "MANUAL", minFit: 60 } } });
  campaignId = c.id;
  process.env.APOLLO_API_KEY = "test-apollo";
  process.env.NEVERBOUNCE_API_KEY = "test-nb";
  await hydrateVault(true);
  const found = await db.prospect.create({ data: { company: "Fin Q", domain: "fin-q.example", contactName: "Quinn Q", title: "CTO", country: "United States", industry: "Fintech", source: "apollo", campaignId: c.id, provenance: { provider: "apollo", externalId: `ap-${RUN}` } } });
  apolloMatchEmail = `quinn.${RUN}@fin-q.example`;
  const run = await runLeadPipeline(c.id, { actor: SUPER });
  assert.equal(run.enriched, 1);
  assert.equal(run.steps.find((s) => s.key === "enrich")?.status, "DONE");
  const p = await db.prospect.findUniqueOrThrow({ where: { id: found.id } });
  assert.equal(p.email, apolloMatchEmail, "the provider's email, nothing guessed");
  assert.equal(p.verification, "VALID");
  assert.equal(p.status, "RESEARCHED", "qualified after verification and ICP fit");
  apolloMatchEmail = null;
  const again = await runLeadPipeline(c.id, { actor: SUPER });
  assert.equal(again.enriched ?? 0, 0, "enrichment is not retried for the same prospect");
  assert.equal(hits.filter((h) => h.url.includes("people/match")).length, 1, "one paid lookup per prospect");

  const nurture = await db.emailSequence.create({ data: { name: `Nurture ${RUN}`, purpose: "NURTURE", steps: [{ day: 0, subject: "Hi", body: "Hello" }] } });
  const outbound = await db.emailSequence.create({ data: { name: `Outbound ${RUN}`, purpose: "OUTBOUND", steps: [{ day: 0, subject: "Hi", body: "Hello" }] } });
  await assert.rejects(enrollQualified(c.id, nurture.id, { actor: SUPER }), /Only an OUTBOUND sequence/);
  await setGrowth({ stops: { ...DEFAULT_GROWTH_SETTINGS.stops, outbound: true } });
  await assert.rejects(enrollQualified(c.id, outbound.id, { actor: SUPER }), /Outreach is stopped/);
  await setGrowth({});
  const e1 = await enrollQualified(c.id, outbound.id, { actor: SUPER });
  assert.equal(e1.enrolled, 1);
  const e2 = await enrollQualified(c.id, outbound.id, { actor: SUPER });
  assert.equal(e2.enrolled, 0, "idempotent: never enrolled twice");
  assert.equal(await db.sequenceEnrollment.count({ where: { sequenceId: outbound.id } }), 1);
  assert.equal(await db.growthEmailSend.count({ where: { email: p.email! } }).catch(() => 0), 0, "enrolment itself sends nothing");
});

/* ───────────────────────── control loop ───────────────────────── */

test("control loop: measures from records, tells the owner once a day, creates bounded optimisation tasks only with an AI provider, never beyond the cap", async () => {
  const o = await db.aIObjective.create({ data: { title: `Loop ${RUN}`, statement: `Get 5 qualified leads per day ${RUN}`, status: "ACTIVE", playbook: "LEAD_GENERATION", targetMetric: "qualified_leads_per_day", targetValue: 5, campaignId, createdById: SUPER } });
  const t0 = new Date();
  const s1 = await controlObjective(o.id, t0);
  assert.equal(s1.measured, true);
  const m = parseMeasurement((await db.aIObjective.findUniqueOrThrow({ where: { id: o.id } })).metrics)!;
  assert.equal(m.nature, "REAL");
  assert.equal(m.actual, 1, "one qualified prospect sourced today");
  assert.equal(m.target, 5);
  assert.equal(m.funnel?.qualified, 1);
  assert.equal(s1.messaged, true);
  assert.equal(s1.task, null, "no AI provider → no task, only the message");
  assert.equal(await db.aIWorkMessage.count({ where: { objectiveId: o.id, kind: "ESCALATION" } }), 1);

  const s2 = await controlObjective(o.id, t0);
  assert.equal(s2.measured, false, "at most one measurement per hour");
  const s3 = await controlObjective(o.id, new Date(t0.getTime() + 3600_000));
  assert.equal(s3.messaged, false, "the owner is told at most once a day");

  process.env.ANTHROPIC_API_KEY = "test-key-not-called";
  try {
    const s4 = await controlObjective(o.id, new Date(t0.getTime() + 2 * 3600_000));
    assert.ok(s4.task, "with a provider, one optimisation task");
    const task = await db.aITask.findUniqueOrThrow({ where: { id: s4.task! } });
    assert.equal(task.source, "company-loop");
    assert.equal(task.status, "QUEUED", "queued for the task engine at the loop's time, not run here");
    assert.equal(task.requestedById, SUPER, "runs under the objective creator's authority");
    const s5 = await controlObjective(o.id, new Date(t0.getTime() + 3 * 3600_000));
    assert.equal(s5.task, null, "no second task while one is open");
    await db.aITask.update({ where: { id: task.id }, data: { status: "DONE" } });
    for (let i = 0; i < MAX_LOOP_TASKS; i++) await db.aITask.create({ data: { agentSlug: "leadgen-director", title: `old ${i}`, request: "x", status: "DONE", source: "company-loop", objectiveId: o.id } });
    const s6 = await controlObjective(o.id, new Date(t0.getTime() + 26 * 3600_000));
    assert.equal(s6.measured, true);
    assert.equal(s6.task, null, "never beyond MAX_LOOP_TASKS");
    await db.aIObjective.update({ where: { id: o.id }, data: { status: "BLOCKED", blockedReason: "AI provider NOT CONNECTED" } });
    const s7 = await controlObjective(o.id, new Date(t0.getTime() + 27 * 3600_000));
    assert.equal(s7.task, null, "a blocked objective gets no new work");
    assert.match((await db.aIObjective.findUniqueOrThrow({ where: { id: o.id } })).nextAction ?? "", /^Unblock first/);
  } finally {
    delete process.env.ANTHROPIC_API_KEY;
  }
  assert.equal(hits.filter((h) => h.url.startsWith("https://api.anthropic.com/")).length, 0, "the control loop never called the model itself");

  const g = await db.aIObjective.create({ data: { title: `No target ${RUN}`, statement: `Improve morale ${RUN}`, status: "ACTIVE", createdById: SUPER } });
  const gm = await measureObjective(g.id);
  assert.equal(gm?.measurement.nature, "UNAVAILABLE", "no invented number when nothing is measurable");
  assert.equal(gm?.measurement.actual, null);
});

/* ───────────────────────── sales, delivery, workforce intelligence ───────────────────────── */

test("sales, delivery and workforce intelligence are computed from records and keep currencies apart", async () => {
  const [prio, nba, risks, fc, ph, ch, cq, trend, stuck] = await Promise.all([leadPriorities(50), nextBestActions(50), dealRisks(50), salesForecast(), projectHealth(), clientHealth(), collectionsQueue(50), workforceTrend(14), stuckTasks(50)]);
  for (let i = 1; i < prio.length; i++) assert.ok(prio[i - 1].score >= prio[i].score, "ranked");
  assert.ok(prio.every((p) => p.reasons.length > 0 || p.score === 0), "every rank explains itself");
  assert.ok(nba.every((a) => a.why && a.href.startsWith("/admin/")));
  assert.ok(risks.every((r) => r.risk > 0 && r.risk <= 100 && r.signals.length));
  const keys = fc.rows.map((r) => `${r.month}|${r.currency}`);
  assert.equal(new Set(keys).size, keys.length, "one row per month and currency — never summed across currencies");
  assert.ok(fc.rows.every((r) => r.weighted <= r.pipeline + 0.01));
  assert.ok(ph.every((p) => ["GREEN", "AMBER", "RED"].includes(p.computed) && (p.computed === "GREEN" || p.signals.length > 0)), "non-green health names its signals");
  assert.ok(ch.every((c) => c.score >= 0 && c.score <= 100));
  assert.ok(cq.every((c) => c.daysOverdue >= 0 && c.balance > 0));
  assert.equal(trend.length, 14);
  assert.equal(trend.at(-1)!.day, today);
  assert.ok(stuck.every((s) => s.hours >= 0 && s.reason));
});
