/**
 * Phase 42 production-activation certification against the TEST database (refuses any other database).
 * No real provider credential exists here, so every provider path is driven by a fetch stub that answers exactly
 * like the provider would (401, 403, 429, 402, 5xx, timeout, malformed body …). What is asserted is what Shivacha
 * OS does with those answers: honest states, no fake success, kill switches and limits enforced server-side.
 *
 *   DATABASE_URL=postgresql://…/shivacha_test npm run test:activation
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../../lib/db/client";
import type { SessionUser } from "../../lib/auth/session";
import type { RoleName } from "../../lib/auth/permissions";
import type { AIProvider, AIRunInput } from "../../lib/ai/provider";
import { integrationStatuses, testIntegration } from "../../lib/integrations/health";
import { OAUTH_TOKENS, googleAccessToken, oauthStatus, revokeOAuth } from "../../lib/integrations/oauth";
import { hydrateVault, removeSecrets, storeSecret } from "../../lib/integrations/vault";
import { certifyProvider } from "../../lib/integrations/certify";
import { assertBudget, BudgetError } from "../../lib/ai/cost";
import { runAgent } from "../../lib/ai/runner";
import { getTool } from "../../lib/ai/tools";
import { createAdCampaign, saveAdsPolicy } from "../../lib/ads/engine";
import { DEFAULT_ADS_POLICY } from "../../lib/ads/policy";
import { processDueEmails } from "../../lib/growth/email";
import { publishPost } from "../../lib/growth/social";
import { cancelObjective, createObjective } from "../../lib/company/objectives";
import { enrollQualified, runLeadPipeline } from "../../lib/company/leadgen";
import { controlObjective, MAX_LOOP_FAILURES, parseMeasurement } from "../../lib/company/measure";
import { objectiveBlockers } from "../../lib/company/blockers";
import { companyDay } from "../../lib/company/today";
import { buildBriefing } from "../../lib/company/briefing";
import { GROWTH_SETTING } from "../../lib/growth/settings";
import { DEFAULT_GROWTH_SETTINGS, KILL_KEYS, type KillSwitch } from "../../lib/growth/policy";

if (!/shivacha_test/.test(process.env.DATABASE_URL ?? "")) throw new Error("Activation tests only run against the shivacha_test database.");
if (process.env.ANTHROPIC_API_KEY) throw new Error("Unset ANTHROPIC_API_KEY for these tests.");

const RUN = Date.now().toString(36);
const PREV_KEY = process.env.APP_ENCRYPTION_KEY;
process.env.APP_ENCRYPTION_KEY = "k".repeat(40);
const users: Record<string, SessionUser> = {};
const day = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
const CEO_OBJECTIVE = "Generate 100 qualified international B2B leads per day for Shivacha Technologies.";

/* ───── fetch stub: one scenario answers for every provider host ───── */
type Scenario = "ok" | "401" | "403" | "429" | "402" | "500" | "timeout" | "malformed";
let scenario: Scenario = "ok";
const realFetch = globalThis.fetch;
const hits: { url: string; method: string }[] = [];
const PROVIDER_HOSTS = /api\.anthropic\.com|api\.openai\.com|api\.apollo\.io|api\.hunter\.io|api\.neverbounce\.com|generativelanguage\.googleapis\.com|api\.x\.com|graph\.facebook\.com|www\.googleapis\.com|oauth2\.googleapis\.com|www\.linkedin\.com/;
const OK_BODY = (url: string): unknown => {
  if (url.includes("anthropic.com") || url.includes("openai.com")) return { data: [{ id: "m" }] };
  if (url.includes("auth/health")) return { is_logged_in: true };
  if (url.includes("apollo.io")) return { people: [{ name: "A B", title: "CEO", organization: { name: "Org", primary_domain: "org.example" } }] };
  if (url.includes("hunter.io")) return { data: { plan_name: "Starter", status: "valid" } };
  if (url.includes("neverbounce.com")) return { status: "success", result: "valid" };
  if (url.includes("generativelanguage")) return { models: [] };
  if (url.includes("api.x.com/2/users/me")) return { data: { id: "1", username: "shivacha" } };
  if (url.includes("act_42")) return { name: "Shivacha Ads", currency: "USD", id: `cmp-${RUN}` };
  if (url.includes("youtube/v3/channels")) return { items: [{ statistics: { subscriberCount: "120" } }] };
  if (url.includes("oauth2.googleapis.com/revoke")) return {};
  return {};
};
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!PROVIDER_HOSTS.test(url)) return realFetch(input as RequestInfo, init);
  hits.push({ url, method: (init?.method ?? "GET").toUpperCase() });
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  if (url.includes("oauth2.googleapis.com/token")) return json(400, { error: "invalid_grant", error_description: "Token has been expired or revoked." });
  switch (scenario) {
    case "401": return json(401, { error: { message: "Invalid authentication credentials" } });
    case "403": return json(403, { error: { message: "The caller does not have permission" } });
    case "429": return json(429, { error: { message: "Too many requests" } });
    case "402": return json(402, { error: { message: "Payment required: out of credits" } });
    case "500": return json(503, { error: { message: "Service unavailable" } });
    case "timeout": throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    case "malformed": return new Response("<html>gateway</html>", { status: 200, headers: { "content-type": "text/html" } });
    default: return json(200, OK_BODY(url));
  }
}) as typeof fetch;

const ENV: Record<string, string> = {
  ANTHROPIC_API_KEY: "", OPENAI_API_KEY: "sk-openai-test-000000000000", APOLLO_API_KEY: "apollo-test-key", HUNTER_API_KEY: "hunter-test-key", NEVERBOUNCE_API_KEY: "nb-test-key", GEMINI_API_KEY: "gem-test-key",
  X_CLIENT_ID: "x-client", X_ACCESS_TOKEN: "x-access-token-test", META_AD_ACCOUNT_ID: "act_42", META_ADS_ACCESS_TOKEN: "EAAtesttokenvalue0000000000000000000001", YOUTUBE_API_KEY: "yt-test-key", YOUTUBE_CHANNEL_ID: "UC123",
};
const setEnv = (on: boolean) => { for (const [k, v] of Object.entries(ENV)) if (on && v) process.env[k] = v; else delete process.env[k]; };
const clearUsage = () => db.integrationUsage.deleteMany({ where: { date: day } });

async function setGrowth(patch: Record<string, unknown>) {
  const v = JSON.parse(JSON.stringify({ ...DEFAULT_GROWTH_SETTINGS, ...patch }));
  await db.setting.upsert({ where: { key: GROWTH_SETTING }, update: { value: v }, create: { key: GROWTH_SETTING, value: v } });
}
const stopOnly = (k: KillSwitch) => setGrowth({ stops: { ...DEFAULT_GROWTH_SETTINGS.stops, [k]: true } });

before(async () => {
  for (const u of await db.user.findMany({ where: { email: { endsWith: "@shivacha.test" } }, select: { id: true, email: true, name: true, role: true } })) users[u.role] = { ...u, role: u.role as RoleName };
  assert.ok(users.SUPER_ADMIN, "QA users exist");
  await setGrowth({});
  await clearUsage();
  // The exact CEO objective de-duplicates within 10 minutes; earlier runs are moved out of that window.
  await db.aIObjective.updateMany({ where: { statement: CEO_OBJECTIVE }, data: { createdAt: new Date(Date.now() - 3600_000) } });
});

after(async () => {
  globalThis.fetch = realFetch;
  setEnv(false);
  delete process.env.MAX_MONTHLY_AI_COST;
  delete process.env.CERTIFICATION_TEST_EMAIL;
  await setGrowth({});
  await clearUsage();
  await db.adCampaign.deleteMany({ where: { name: { startsWith: "[CERTIFICATION]" } } });
  await db.setting.deleteMany({ where: { key: "adsPolicy" } });
  await removeSecrets(["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"]);
  await db.integration.deleteMany({ where: { key: { in: ["oauth:google", "oauth:meta"] } } });
  if (PREV_KEY === undefined) delete process.env.APP_ENCRYPTION_KEY;
  else process.env.APP_ENCRYPTION_KEY = PREV_KEY;
});

/* ───────────────────────── Step 14: provider failure matrix ───────────────────────── */

const API_KEY_PROVIDERS = ["openai", "apollo", "hunter", "neverbounce", "gemini"];
const OAUTH_PROVIDERS = ["x-app", "meta-ads"];
const ADAPTER_PROVIDERS = ["youtube"];

test("failure matrix: disconnected → NOT_CONNECTED, and every provider failure is classified — never CONNECTED, never a leaked secret", async () => {
  setEnv(false);
  for (const k of [...API_KEY_PROVIDERS, ...OAUTH_PROVIDERS, ...ADAPTER_PROVIDERS]) assert.equal((await testIntegration(k)).state, "NOT_CONNECTED", `${k}: no credentials`);
  assert.equal(hits.length, 0, "no provider was called without credentials");

  setEnv(true);
  const expect: Record<Scenario, (k: string) => [string, string | null]> = {
    ok: () => ["CONNECTED", null],
    "401": (k) => (OAUTH_PROVIDERS.includes(k) ? ["EXPIRED", "EXPIRED"] : ["ERROR", "INVALID_CREDENTIALS"]),
    "403": () => ["ERROR", "PERMISSION_DENIED"],
    "429": () => ["RATE_LIMITED", "RATE_LIMITED"],
    "402": () => ["ERROR", "QUOTA_EXHAUSTED"],
    "500": () => ["ERROR", "UNAVAILABLE"],
    timeout: () => ["ERROR", "TIMEOUT"],
    malformed: () => ["ERROR", "MALFORMED"],
  };
  for (const sc of Object.keys(expect) as Scenario[]) {
    scenario = sc;
    for (const k of [...API_KEY_PROVIDERS, ...OAUTH_PROVIDERS, ...ADAPTER_PROVIDERS]) {
      await clearUsage();
      const r = await testIntegration(k);
      const [state, kind] = expect[sc](k);
      assert.equal(r.state, state, `${k} / ${sc}: ${r.message}`);
      for (const secret of Object.values(ENV).filter(Boolean)) assert.ok(!r.message.includes(secret), `${k} / ${sc}: no secret in the message`);
      const row = await db.integration.findUniqueOrThrow({ where: { key: `center:${k}` } });
      const rec = row.config as { failureKind?: string; lastSuccessAt?: string; lastFailureAt?: string };
      if (kind) {
        assert.equal(rec.failureKind, kind, `${k} / ${sc}: failure kind`);
        assert.ok(rec.lastFailureAt, "failure time recorded");
        assert.notEqual(row.status, "CONNECTED");
      } else assert.ok(rec.lastSuccessAt, "success time recorded");
      for (const secret of Object.values(ENV).filter(Boolean)) assert.ok(!JSON.stringify(row).includes(secret), `${k} / ${sc}: no secret stored`);
    }
  }
  scenario = "ok";
  await clearUsage();
});

test("health view: EXPIRED and RATE_LIMITED reach the Integration Center; account ids are non-secret", async () => {
  setEnv(true);
  scenario = "401";
  await testIntegration("x-app");
  scenario = "ok";
  await clearUsage();
  await testIntegration("apollo");
  await db.integrationUsage.upsert({ where: { date_provider: { date: day, provider: "apollo" } }, update: { coolUntil: new Date(Date.now() + 600_000) }, create: { id: `t-${RUN}`, date: day, provider: "apollo", calls: 1, errors: 1, coolUntil: new Date(Date.now() + 600_000) } });
  const rows = await integrationStatuses();
  const by = (k: string) => rows.find((r) => r.def.key === k)!;
  assert.equal(by("x-app").state, "EXPIRED");
  assert.match(by("x-app").lastError ?? "", /sign-in expired or was revoked/i);
  assert.equal(by("apollo").state, "RATE_LIMITED", "live cool-down shown as RATE_LIMITED");
  assert.equal(by("meta-ads").account, "Ad account ID: act_42", "non-secret id shown");
  assert.ok(rows.every((r) => !JSON.stringify(r).includes(ENV.META_ADS_ACCESS_TOKEN)), "no token in any status row");
  assert.equal(by("anthropic").state, "NOT_CONNECTED");
  await clearUsage();
  setEnv(false);
});

/* ───────────────────────── Step 2: OAuth expiry, refresh failure, revoke ───────────────────────── */

test("OAuth: stored expiry → EXPIRED; refused refresh → EXPIRED + audit; disconnect revokes at the provider and says so honestly", async () => {
  await db.integration.upsert({ where: { key: "oauth:meta" }, update: { status: "CONNECTED", config: { expiresAt: new Date(Date.now() - 60_000).toISOString(), refresh: false } }, create: { key: "oauth:meta", status: "CONNECTED", config: { expiresAt: new Date(Date.now() - 60_000).toISOString(), refresh: false } } });
  assert.equal((await oauthStatus()).find((o) => o.provider === "meta")!.state, "EXPIRED", "Meta token past its expiry, no refresh possible");

  await storeSecret("GOOGLE_OAUTH_CLIENT_ID", "google-app", "g-client", users.SUPER_ADMIN.id);
  await storeSecret("GOOGLE_OAUTH_CLIENT_SECRET", "google-app", "g-secret-value", users.SUPER_ADMIN.id);
  await storeSecret("GOOGLE_REFRESH_TOKEN", "google", "1//g-refresh-token-value", users.SUPER_ADMIN.id);
  await db.integration.upsert({ where: { key: "oauth:google" }, update: { status: "CONNECTED", config: {} }, create: { key: "oauth:google", status: "CONNECTED", config: {} } });
  await hydrateVault(true);
  assert.equal(await googleAccessToken(), null, "Google refused the refresh token");
  const g = (await oauthStatus()).find((o) => o.provider === "google")!;
  assert.equal(g.state, "EXPIRED");
  assert.ok(await db.auditLog.findFirst({ where: { action: "integration.oauth.refresh_failed", entityId: "google" } }), "refresh failure audited");
  const stored = await db.integration.findUniqueOrThrow({ where: { key: "oauth:google" } });
  assert.ok(!JSON.stringify(stored).includes("g-refresh-token-value") && !JSON.stringify(stored).includes("g-secret-value"), "no token or secret in the status row");

  scenario = "ok";
  const ok = await revokeOAuth("google");
  assert.equal(ok.revoked, true);
  assert.ok(hits.some((h) => h.url === "https://oauth2.googleapis.com/revoke" && h.method === "POST"), "revocation sent to Google");
  scenario = "500";
  const bad = await revokeOAuth("google");
  assert.equal(bad.revoked, false, "a failed revocation is never reported as done");
  assert.match(bad.message, /remove the app's access/);
  scenario = "ok";
  await removeSecrets(OAUTH_TOKENS.google);
  assert.deepEqual(await revokeOAuth("google"), { revoked: false, message: "No stored token to revoke." });
});

/* ───────────────────────── Step 3: AI budgets ───────────────────────── */

test("AI: the company-wide monthly cap blocks further model calls; every call path uses the central runtime", async () => {
  process.env.MAX_MONTHLY_AI_COST = "0.000001";
  await db.aIUsage.create({ data: { agentSlug: "ceo", provider: "test", model: "claude-opus-5", inputTokens: 1, outputTokens: 1, costUsd: "0.000100" } });
  await assert.rejects(assertBudget("ceo", null), (e: Error) => e instanceof BudgetError && /Monthly AI budget reached/.test(e.message));
  delete process.env.MAX_MONTHLY_AI_COST;
  await assertBudget("ceo", null);
  const tool = getTool("getProviderBlockers")!;
  assert.equal(tool.kind, "read");
  const r = await tool.run({ user: users.SUPER_ADMIN, agentSlug: "ceo", executionId: null }, {});
  const data = r.data as { providers: { capability: string; status: string }[] };
  assert.equal(data.providers.find((p) => p.capability === "ai")?.status, "NOT_CONNECTED", "the workforce sees provider blockers");
});

/* ───────────────────────── Step 11: emergency controls ───────────────────────── */

test("kill switches: all eight are enforced server-side on the real code paths", async () => {
  const c = await db.campaign.create({ data: { name: `KS ${RUN}`, status: "ACTIVE", dailyLeadTarget: 5, leadGen: { sources: ["apollo"], titles: ["CTO"], mode: "MANUAL", minFit: 60 } } });
  const outbound = await db.emailSequence.create({ data: { name: `KS outbound ${RUN}`, purpose: "OUTBOUND", steps: [{ day: 0, subject: "Hi", body: "Hello" }] } });
  const post = await db.socialPost.create({ data: { platform: "LINKEDIN", body: `Kill switch test ${RUN}`, status: "APPROVED", approvedById: users.SUPER_ADMIN.id, idempotencyKey: `ks-${RUN}` } });
  // Stop reasons read "<switch> is on." — anything else (e.g. "Email provider is not connected.") is not a kill switch.
  const notStopped = (reason: string | null) => assert.doesNotMatch(reason ?? "", / is on\.|STOP ALL/);
  const blockedAi = async () => (await runAgent({ agentSlug: "sales", user: users.SUPER_ADMIN, request: "status", provider: null })).text;
  const expectations: Record<KillSwitch, () => Promise<void>> = {
    all: async () => {
      assert.match(await blockedAi(), /stopped by a kill switch: STOP ALL/);
      assert.match((await processDueEmails({ autonomous: false })).blocked ?? "", /STOP ALL/);
      assert.match((await publishPost(post.id, { autonomous: false })).message, /STOP ALL/);
      await assert.rejects(runLeadPipeline(c.id, { actor: users.SUPER_ADMIN.id }), /stopped: STOP ALL/);
      await assert.rejects(createAdCampaign({ provider: "meta", name: "x", dailyBudget: 1, currency: "USD", countries: ["US"] }, users.SUPER_ADMIN.id), /STOP ALL/);
      await assert.rejects(createObjective({ statement: `Stopped objective ${RUN}`, userId: users.SUPER_ADMIN.id }), /stopped/);
    },
    ai: async () => {
      assert.match(await blockedAi(), /Stop all AI/);
      await assert.rejects(createObjective({ statement: `Stopped objective ${RUN}`, userId: users.SUPER_ADMIN.id }), /stopped/);
      notStopped((await processDueEmails({ autonomous: false })).blocked);
    },
    marketing: async () => {
      assert.match((await processDueEmails({ autonomous: false })).blocked ?? "", / is on\./);
      assert.equal((await publishPost(post.id, { autonomous: false })).ok, false);
      await assert.rejects(runLeadPipeline(c.id, { actor: users.SUPER_ADMIN.id }), /stopped/);
      await assert.rejects(createAdCampaign({ provider: "meta", name: "x", dailyBudget: 1, currency: "USD", countries: ["US"] }, users.SUPER_ADMIN.id), /stopped/);
      assert.doesNotMatch(await blockedAi(), /kill switch/, "AI is not a marketing switch");
    },
    social: async () => {
      assert.match((await publishPost(post.id, { autonomous: false })).message, /social/i);
      notStopped((await processDueEmails({ autonomous: false })).blocked);
    },
    outbound: async () => {
      await assert.rejects(enrollQualified(c.id, outbound.id, { actor: users.SUPER_ADMIN.id }), /Outreach is stopped/);
      notStopped((await processDueEmails({ autonomous: false })).blocked);
    },
    email: async () => {
      assert.match((await processDueEmails({ autonomous: false })).blocked ?? "", / is on\./);
      assert.equal((await publishPost(post.id, { autonomous: false })).message.includes("email"), false);
    },
    publishing: async () => {
      assert.equal((await publishPost(post.id, { autonomous: false })).ok, false);
      assert.match((await publishPost(post.id, { autonomous: false })).message, /publishing/i);
    },
    ads: async () => {
      await assert.rejects(createAdCampaign({ provider: "meta", name: "x", dailyBudget: 1, currency: "USD", countries: ["US"] }, users.SUPER_ADMIN.id), /Stop paid ads/);
      notStopped((await processDueEmails({ autonomous: false })).blocked);
    },
  };
  assert.deepEqual(Object.keys(expectations).sort(), [...KILL_KEYS].sort(), "every kill switch is covered");
  for (const k of KILL_KEYS) {
    await stopOnly(k);
    await expectations[k]();
  }
  await setGrowth({});
  assert.equal((await db.socialPost.findUniqueOrThrow({ where: { id: post.id } })).status, "APPROVED", "a stopped post is never marked published");
});

test("kill switch mid-run: a running AI employee stops before its next model call", async () => {
  await setGrowth({});
  let calls = 0;
  const provider: AIProvider = {
    name: "scripted-test",
    async run(i: AIRunInput) {
      for (let n = 0; n < 5; n++) {
        await i.beforeCall();
        calls++;
        await i.onUsage({ model: "claude-opus-5", inputTokens: 10, outputTokens: 5, costUsd: 0.0001 });
        if (n === 0) await setGrowth({ stops: { ...DEFAULT_GROWTH_SETTINGS.stops, ai: true } });
      }
      return { text: "done", stop: "completed" as const, model: "claude-opus-5", iterations: 5 };
    },
  };
  const r = await runAgent({ agentSlug: "sales", user: users.SUPER_ADMIN, request: `long job ${RUN}`, provider });
  assert.equal(r.status, "CANCELLED");
  assert.match(r.text, /stopped by a kill switch/);
  assert.equal(calls, 1, "no model call after the switch was turned on");
  await setGrowth({});
});

/* ───────────────────────── Step 10: the CEO objective ───────────────────────── */

test("CEO objective: the exact statement is planned for real and every missing provider is reported as BLOCKED BY <provider>", async () => {
  const { id } = await createObjective({ statement: CEO_OBJECTIVE, userId: users.SUPER_ADMIN.id });
  assert.equal((await createObjective({ statement: CEO_OBJECTIVE, userId: users.SUPER_ADMIN.id })).id, id, "double submit is the same objective");
  const o = await db.aIObjective.findUniqueOrThrow({ where: { id } });
  assert.equal(o.playbook, "LEAD_GENERATION");
  assert.equal(o.targetMetric, "qualified_leads_per_day");
  assert.equal(o.targetValue, 100);
  assert.equal(o.regionKey, null, "international = no single region");
  assert.equal(o.status, "BLOCKED");
  assert.match(o.blockedReason ?? "", /AI provider NOT CONNECTED/);
  const tasks = await db.aITask.findMany({ where: { objectiveId: id } });
  assert.equal(tasks.length, 10, "Chief of Staff + 9 stages");
  const owners = new Set(tasks.map((t) => t.agentSlug));
  for (const exec of ["ceo", "intel-director", "cmo", "leadgen-director", "sdr", "content-manager", "social-manager", "campaign-manager", "revenue-analyst", "growth-director"]) assert.ok(owners.has(exec), `${exec} assigned`);
  const campaign = await db.campaign.findUniqueOrThrow({ where: { id: o.campaignId! } });
  assert.equal(campaign.dailyLeadTarget, 100);
  const root = tasks.find((t) => t.id === o.rootTaskId)!;
  for (const p of ["Anthropic (AI provider)", "Apollo or Hunter (lead discovery)", "NeverBounce or Hunter (email verification)", "an ad account (Meta Ads, Google Ads or LinkedIn Ads)"]) assert.ok(root.instructions?.includes(`BLOCKED BY ${p}`), `CEO brief names ${p}`);
  assert.match(root.instructions ?? "", /A blocked stage is never reported as done/);
  const b = await objectiveBlockers(id);
  assert.ok(b.stages.some((s) => s.message === "Paid media proposal (only where an ad account is connected): BLOCKED BY an ad account (Meta Ads, Google Ads or LinkedIn Ads)"));
  assert.ok(b.actions.some((a) => a.kind === "CONNECT" && a.text === "Connect Anthropic (AI provider)"), "tells the CEO what requires human action");
  await controlObjective(id, new Date(Date.now() + 5 * 3600_000));
  const m = parseMeasurement((await db.aIObjective.findUniqueOrThrow({ where: { id } })).metrics)!;
  assert.equal(m.nature, "REAL");
  assert.equal(m.actual, 0, "actual qualified today, from records");
  assert.equal(m.target, 100);
  assert.match((await db.aIObjective.findUniqueOrThrow({ where: { id } })).nextAction ?? "", /^Unblock first: AI provider NOT CONNECTED/);
  assert.equal(await db.prospect.count({ where: { campaignId: o.campaignId! } }), 0, "no prospect was fabricated");
  await cancelObjective(id, users.SUPER_ADMIN.id, users.SUPER_ADMIN.name ?? "QA");
  const s = await controlObjective(id, new Date(Date.now() + 7 * 3600_000));
  assert.equal(s.measured, false, "a cancelled objective is no longer in the loop");
  assert.equal(s.skipped, "objective is cancelled");
});

/* ───────────────────────── Step 9: control-loop guards ───────────────────────── */

test("control loop: no AI task when a person must connect a provider; stops after repeated failures; respects the AI budget", async () => {
  const c = await db.campaign.create({ data: { name: `Loop guard ${RUN}`, status: "ACTIVE", dailyLeadTarget: 10, leadGen: { sources: ["apollo"], titles: ["CTO"], mode: "MANUAL", minFit: 60 } } });
  const o = await db.aIObjective.create({ data: { title: `Guard ${RUN}`, statement: `Get 10 qualified leads per day ${RUN}`, status: "ACTIVE", playbook: "LEAD_GENERATION", targetMetric: "qualified_leads_per_day", targetValue: 10, campaignId: c.id, createdById: users.SUPER_ADMIN.id } });
  process.env.ANTHROPIC_API_KEY = "test-key-never-called";
  try {
    const t0 = Date.now() + 10 * 3600_000;
    const s1 = await controlObjective(o.id, new Date(t0));
    assert.equal(s1.task, null);
    assert.match(s1.skipped ?? "", /needs a person/);
    assert.match((await db.aIObjective.findUniqueOrThrow({ where: { id: o.id } })).nextAction ?? "", /BLOCKED BY Apollo or Hunter/);

    process.env.APOLLO_API_KEY = "apollo-test-key";
    await hydrateVault(true);
    for (let i = 0; i < MAX_LOOP_FAILURES; i++) await db.aITask.create({ data: { agentSlug: "leadgen-director", title: `failed loop ${i} ${RUN}`, request: "x", status: "FAILED", source: "company-loop", objectiveId: o.id } });
    const s2 = await controlObjective(o.id, new Date(t0 + 3600_000));
    assert.equal(s2.task, null);
    assert.match(s2.skipped ?? "", /paused after 3 failed optimisation tasks/);
    assert.ok(await db.aIWorkMessage.findFirst({ where: { objectiveId: o.id, subject: { startsWith: "Optimisation paused" } } }), "the owner is told once");

    await db.aITask.updateMany({ where: { objectiveId: o.id, source: "company-loop" }, data: { status: "DONE" } });
    process.env.MAX_MONTHLY_AI_COST = "0.000001";
    const s3 = await controlObjective(o.id, new Date(t0 + 2 * 3600_000));
    assert.equal(s3.task, null);
    assert.match(s3.skipped ?? "", /Monthly AI budget reached/);
    delete process.env.MAX_MONTHLY_AI_COST;
    const s4 = await controlObjective(o.id, new Date(t0 + 3 * 3600_000));
    assert.ok(s4.task, "with a provider, budget and no blocker, one bounded optimisation task");
    assert.equal(hits.filter((h) => h.url.includes("api.anthropic.com")).length, 0, "the loop never calls the model itself");
  } finally {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.APOLLO_API_KEY;
    delete process.env.MAX_MONTHLY_AI_COST;
    await hydrateVault(true);
  }
});

/* ───────────────────────── Steps 4–6: certification mode ───────────────────────── */

test("certification: NOT_CONNECTED without credentials; live checks with them; email only to the server's certification address; ads only PAUSED", async () => {
  setEnv(false);
  scenario = "ok";
  const before = hits.length;
  const nc = await certifyProvider("apollo", users.SUPER_ADMIN);
  assert.equal(nc.verdict, "NOT_CONNECTED");
  assert.equal(hits.length, before, "nothing is called without credentials");

  setEnv(true);
  await clearUsage();
  const ap = await certifyProvider("apollo", users.SUPER_ADMIN);
  assert.equal(ap.verdict, "LIVE_CERTIFIED", JSON.stringify(ap.steps));
  assert.equal(await db.prospect.count({ where: { source: "apollo", company: "Org" } }), 0, "certification imports nothing");

  scenario = "401";
  await clearUsage();
  const failed = await certifyProvider("hunter", users.SUPER_ADMIN);
  assert.equal(failed.verdict, "FAILED");
  scenario = "ok";

  delete process.env.CERTIFICATION_TEST_EMAIL;
  const nb = await certifyProvider("neverbounce", users.SUPER_ADMIN);
  assert.equal(nb.steps.find((s) => s.name.startsWith("Verify"))?.result, "SKIPPED", "no controlled address → no verification call");
  const mail = await certifyProvider("email", users.SUPER_ADMIN, { sendTestEmail: true });
  assert.equal(mail.verdict, "NOT_CONNECTED", "no mail provider here");

  await saveAdsPolicy({ ...DEFAULT_ADS_POLICY }, users.SUPER_ADMIN.id);
  const ads = await certifyProvider("meta-ads", users.SUPER_ADMIN, { createPausedCampaign: true });
  const created = ads.steps.find((s) => s.name === "Create a PAUSED campaign")!;
  assert.equal(created.result, "PASS", created.detail);
  const row = await db.adCampaign.findFirstOrThrow({ where: { name: { startsWith: "[CERTIFICATION]" } }, orderBy: { createdAt: "desc" } });
  assert.equal(row.status, "PAUSED");
  assert.ok(!hits.some((h) => h.method === "POST" && /graph\.facebook\.com\/v[\d.]+\/cmp-/.test(h.url)), "certification never activates a campaign");
  assert.equal(ads.steps.find((s) => s.name === "Live spend")?.result, "REQUIRES_HUMAN");
  assert.equal(ads.verdict, "PARTIALLY_CERTIFIED", "live spend stays a human certification step");

  const social = await certifyProvider("youtube", users.SUPER_ADMIN);
  assert.equal(social.steps.find((s) => s.name === "Publishing")?.result, "REQUIRES_HUMAN", "draft-only: nothing is published");
  assert.ok(await db.auditLog.findFirst({ where: { action: "integration.certification.run", entityId: "meta-ads" } }), "every run audited");
  setEnv(false);
});

/* ───────────────────────── Steps 7 & 15: analytics honesty and observability ───────────────────────── */

test("briefing: ad results and website analytics are NOT_CONNECTED, never zero; the day timeline is built from records", async () => {
  setEnv(false);
  await hydrateVault(true);
  const b = await buildBriefing("today", "SUPER_ADMIN");
  const marketing = b.sections.find((s) => s.key === "marketing")!;
  const metric = (label: string) => marketing.metrics.find((m) => m.label.startsWith(label));
  assert.equal(metric("Website sessions (GA4)")?.nature, "NOT_CONNECTED");
  assert.equal(metric("Search clicks")?.nature, "NOT_CONNECTED");
  assert.equal(metric("Website sessions (GA4)")?.value, "—", "missing data is not shown as 0");
  assert.ok(["NOT_CONNECTED", "UNAVAILABLE", "REAL", "STALE"].includes(metric("Ad")!.nature));
  assert.ok(!marketing.metrics.some((m) => /not implemented/i.test(m.note ?? "")), "no stale claim that ads are not implemented");

  const d = await companyDay(new Date());
  assert.ok(d.events.some((e) => e.action === "integration.certification.run"), "today's certification runs are on the timeline");
  assert.ok(d.events.some((e) => e.source === "AI"), "employee activity is on the timeline");
  assert.ok(d.confirmed.adCampaignsCreated >= 1, "the paused certification campaign counts as created, not launched");
  assert.ok(d.providerCalls.every((c) => c.calls >= 0));
  for (const e of d.events.slice(0, 50)) for (const secret of Object.values(ENV).filter(Boolean)) assert.ok(!JSON.stringify(e).includes(secret), "no secret in the timeline");
});
