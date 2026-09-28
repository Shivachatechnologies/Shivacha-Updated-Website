/**
 * Growth production-safety regression tests (TEST database only; nothing leaves the machine).
 * An in-process SMTP sink stands in for the mail server and a counting fetch stub stands in for the social APIs, so
 * every "provider call" below is counted exactly.
 *
 *   DATABASE_URL=postgresql://…/shivacha_test npm run test:growth:safety
 */
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import type { AddressInfo } from "node:net";
import { db } from "../../lib/db/client";
import { DEFAULT_GROWTH_SETTINGS, type GrowthSettings } from "../../lib/growth/policy";
import { GROWTH_SETTING } from "../../lib/growth/settings";
import { releaseBudget, reserveBudget, usageOf } from "../../lib/growth/engine";
import { enroll, processDueEmails } from "../../lib/growth/email";
import { publishPost } from "../../lib/growth/social";
import { aiTaskMaxCostUsd, runGrowthLoop, GROWTH_TASK_SOURCE } from "../../lib/growth/loop";
import { DEFAULT_STEPS } from "../../lib/growth/email-rules";
import { classifyRequest } from "../../lib/ai/router/policy";
import { executeRequest } from "../../lib/ai/router";
import { runAgent } from "../../lib/ai/runner";
import { can } from "../../lib/auth/permissions";
import type { AIProvider, AIRunInput } from "../../lib/ai/provider";
import type { SessionUser } from "../../lib/auth/session";

if (!/shivacha_test/.test(process.env.DATABASE_URL ?? "")) throw new Error("Safety tests only run against the shivacha_test database.");
if (process.env.ANTHROPIC_API_KEY) throw new Error("Unset ANTHROPIC_API_KEY for these tests.");

const TAG = `s${Date.now().toString(36)}`;
const addr = (n: string) => `${n}.${TAG}@safety-${TAG}.org`;
const LI = ["LINKEDIN_ACCESS_TOKEN", "LINKEDIN_ORGANIZATION_URN"];

/* ───── in-process SMTP sink: counts every message the email provider actually hands over ───── */
const mails: { to: string[]; body: string }[] = [];
const sink = net.createServer((s) => {
  let data = false;
  let buf = "";
  let rcpt: string[] = [];
  let body = "";
  let login = 0;
  const w = (l: string) => s.write(`${l}\r\n`);
  w("220 sink");
  s.on("data", (c) => {
    buf += c.toString("utf8");
    let i: number;
    while ((i = buf.indexOf("\r\n")) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 2);
      if (data) {
        if (line === ".") {
          data = false;
          mails.push({ to: rcpt, body });
          rcpt = [];
          body = "";
          w("250 queued");
        } else body += `${line}\n`;
        continue;
      }
      if (login) {
        w(login === 1 ? "334 UGFzc3dvcmQ6" : "235 ok");
        login = login === 1 ? 2 : 0;
        continue;
      }
      const u = line.toUpperCase();
      if (u.startsWith("EHLO")) s.write("250-sink\r\n250-AUTH PLAIN LOGIN\r\n250 ok\r\n");
      else if (u.startsWith("AUTH PLAIN")) w("235 ok");
      else if (u.startsWith("AUTH LOGIN")) {
        login = 1;
        w("334 VXNlcm5hbWU6");
      } else if (u.startsWith("RCPT TO") && /reject/i.test(line)) w("550 mailbox unavailable");
      else if (u.startsWith("RCPT TO")) {
        rcpt.push(line.slice(8).replace(/[<>\s]/g, ""));
        w("250 ok");
      } else if (u === "DATA") {
        data = true;
        w("354 go");
      } else if (u === "QUIT") {
        w("221 bye");
        s.end();
      } else w("250 ok");
    }
  });
  s.on("error", () => {});
});
const mine = () => mails.filter((m) => m.to.some((t) => t.includes(TAG)));

/* ───── counting fetch stub for the social APIs ───── */
const realFetch = globalThis.fetch;
let providerCalls: string[] = [];
function stubSocialApis() {
  globalThis.fetch = (async (url: string | URL | Request) => {
    const u = String(url instanceof Request ? url.url : url);
    providerCalls.push(u);
    if (u.includes("/rest/networkSizes/")) return new Response(JSON.stringify({ firstDegreeSize: 4321 }), { status: 200 });
    if (u.endsWith("/rest/posts")) return new Response("", { status: 201, headers: { "x-restli-id": `urn:li:share:${providerCalls.length}` } });
    return new Response(JSON.stringify({ error: { message: "unexpected" } }), { status: 500 });
  }) as typeof fetch;
}
const connectLinkedIn = () => {
  process.env.LINKEDIN_ACCESS_TOKEN = "test-token-not-real";
  process.env.LINKEDIN_ORGANIZATION_URN = "urn:li:organization:1";
};
const disconnectLinkedIn = () => LI.forEach((k) => delete process.env[k]);

/* ───── settings helpers ───── */
let savedGrowth: unknown;
let admin: SessionUser;
const set = async (p: Partial<GrowthSettings>) => {
  const value = JSON.parse(JSON.stringify({ ...DEFAULT_GROWTH_SETTINGS, ...p }));
  await db.setting.upsert({ where: { key: GROWTH_SETTING }, update: { value }, create: { key: GROWTH_SETTING, value } });
};
const stops = (p: Partial<GrowthSettings["stops"]>) => ({ ...DEFAULT_GROWTH_SETTINGS.stops, ...p });
const channels = (p: Partial<GrowthSettings["channels"]>) => ({ ...DEFAULT_GROWTH_SETTINGS.channels, ...p });
const budgets = (p: Partial<GrowthSettings["budgets"]>) => ({ ...DEFAULT_GROWTH_SETTINGS.budgets, ...p });
/** Budget with exactly `n` left today (reservations are cumulative per day). */
const remaining = async (kind: "emailDaily" | "socialDaily" | "aiDaily", n: number) => (await usageOf(kind)) + n;
const seq = (purpose = "NURTURE") => db.emailSequence.create({ data: { name: `Safety ${purpose} ${TAG} ${Math.random()}`, purpose, steps: JSON.parse(JSON.stringify(DEFAULT_STEPS)), active: true } });
/** Only this test's enrollments may be due, so counts are exact (test database only). */
const onlyMine = () => db.sequenceEnrollment.updateMany({ where: { status: "ACTIVE" }, data: { status: "STOPPED", stopReason: "safety-test isolation" } });

function scripted(calls: [string, unknown][]): AIProvider {
  return {
    name: "scripted-test",
    async run(i: AIRunInput) {
      for (const [name, input] of calls) {
        await i.beforeCall();
        await i.onUsage({ model: "claude-opus-5", inputTokens: 100, outputTokens: 20, costUsd: 0.001 });
        await i.executeTool(name, input);
      }
      return { text: "Done.", stop: "completed" as const, model: "claude-opus-5", iterations: calls.length + 1 };
    },
  };
}

before(async () => {
  await new Promise<void>((r) => sink.listen(0, "127.0.0.1", () => r()));
  Object.assign(process.env, { SMTP_HOST: "127.0.0.1", SMTP_PORT: String((sink.address() as AddressInfo).port), SMTP_SECURE: "false", SMTP_USER: "safety", SMTP_PASS: "safety", GROWTH_UNSUBSCRIBE_SECRET: "safety-unsubscribe-secret-0123456789abcdef" });
  disconnectLinkedIn();
  savedGrowth = (await db.setting.findUnique({ where: { key: GROWTH_SETTING } }))?.value;
  const u = await db.user.upsert({ where: { email: `${TAG}@safety.test` }, update: {}, create: { email: `${TAG}@safety.test`, name: `Safety ${TAG}`, role: "SUPER_ADMIN", passwordHash: "x", active: true } });
  admin = { id: u.id, email: u.email, name: u.name, role: "SUPER_ADMIN" };
});
beforeEach(async () => {
  providerCalls = [];
  globalThis.fetch = realFetch;
  disconnectLinkedIn();
  await onlyMine();
});
after(async () => {
  globalThis.fetch = realFetch;
  if (savedGrowth === undefined) await db.setting.deleteMany({ where: { key: GROWTH_SETTING } });
  else await db.setting.update({ where: { key: GROWTH_SETTING }, data: { value: savedGrowth as object } });
  sink.close();
  await db.$disconnect();
});

test("1. concurrent email runs: each step reaches the provider exactly once", async () => {
  await set({ budgets: budgets({ emailDaily: await remaining("emailDaily", 100) }) });
  const s = await seq();
  const e = await enroll(s.id, { email: addr("race") });
  assert.ok(e.ok);
  const before = mine().length;
  const runs = await Promise.all([processDueEmails({ autonomous: false }), processDueEmails({ autonomous: false }), processDueEmails({ autonomous: false })]);
  const sent = mine().slice(before).filter((m) => m.to.includes(addr("race")));
  assert.equal(sent.length, 1, `provider sends: ${sent.length} (runs: ${JSON.stringify(runs)})`);
  assert.equal(runs.reduce((n, r) => n + r.sent, 0), 1);
  const rows = await db.growthEmailSend.findMany({ where: { enrollmentId: e.id! } });
  assert.deepEqual(rows.map((r) => [r.step, r.status]), [[0, "SENT"]], "one permanent SENT record");
  assert.equal((await db.sequenceEnrollment.findUnique({ where: { id: e.id! } }))!.step, 1);
});

test("2. concurrent email budget: usage never exceeds the limit", async () => {
  const s = await seq();
  for (let i = 0; i < 8; i++) await enroll(s.id, { email: addr(`b${i}`) });
  const limit = await remaining("emailDaily", 3);
  await set({ budgets: budgets({ emailDaily: limit }) });
  const before = mine().length;
  await Promise.all([processDueEmails({ autonomous: false }), processDueEmails({ autonomous: false })]);
  assert.equal(mine().length - before, 3, "exactly the 3 remaining emails were sent");
  assert.equal(await usageOf("emailDaily"), limit, "usage equals the limit, never above");
});

test("3. concurrent social publishing budget: only the reserved post reaches the platform", async () => {
  connectLinkedIn();
  stubSocialApis();
  await set({ budgets: budgets({ socialDaily: await remaining("socialDaily", 1) }) });
  const mk = (n: number) => db.socialPost.create({ data: { platform: "LINKEDIN", body: `Budget ${n} ${TAG}`, status: "APPROVED", approvedById: admin.id, idempotencyKey: `safety-${TAG}-b${n}` } });
  const [p1, p2] = [await mk(1), await mk(2)];
  const [a, b] = await Promise.all([publishPost(p1.id, { autonomous: false }), publishPost(p2.id, { autonomous: false })]);
  assert.equal([a, b].filter((r) => r.ok).length, 1);
  assert.match([a, b].find((r) => !r.ok)!.message, /Social budget/);
  assert.equal(providerCalls.filter((u) => u.endsWith("/rest/posts")).length, 1, "the over-budget post never reached the API");
  const loser = await db.socialPost.findUnique({ where: { id: a.ok ? p2.id : p1.id } });
  assert.equal(loser!.status, "APPROVED", "the refused post is returned to Approved, not stuck or marked published");
});

test("2/3/4. reservation rule for every enforced budget: limit 3, two concurrent requests of 2 → second blocked", async () => {
  for (const kind of ["emailDaily", "socialDaily", "aiDaily"] as const) {
    await set({ budgets: budgets({ [kind]: await remaining(kind, 3) }) });
    const rs = await Promise.all([reserveBudget(kind, 2), reserveBudget(kind, 2)]);
    assert.equal(rs.filter((r) => r.ok).length, 1, `${kind}: exactly one reservation of 2 fits in 3`);
    for (const r of rs) await releaseBudget(r);
  }
  await set({});
  for (const kind of ["emailDaily", "socialDaily", "aiDaily"] as const) assert.equal((await reserveBudget(kind, 1)).ok, false, `${kind}: blank budget blocks`);
  for (const kind of ["adDaily", "creativeMonthly", "videoMonthly"] as const) assert.equal((await reserveBudget(kind, 1)).ok, false, `${kind}: not used by automated actions, never reservable`);
});

test("4. AI daily budget: autonomous AI tasks are not created without budget for their maximum cost", async () => {
  const on = { autonomousMode: true, channels: channels({ content: true }) };
  await db.growthClaim.deleteMany({ where: { key: { startsWith: `ai-task:${new Date().toISOString().slice(0, 10)}:marketing:` } } });
  const count = () => db.aITask.count({ where: { source: GROWTH_TASK_SOURCE, agentSlug: "marketing" } });
  const before = await count();
  await set(on);
  await runGrowthLoop("MANUAL");
  assert.equal(await count(), before, "blank AI budget → no task");
  assert.match(JSON.stringify((await db.growthRun.findFirst({ orderBy: { startedAt: "desc" } }))!.steps), /AI budget: No budget is configured/);
  const cost = await aiTaskMaxCostUsd("marketing");
  assert.ok(cost > 0);
  await set({ ...on, budgets: budgets({ aiDaily: await remaining("aiDaily", cost / 2) }) });
  await runGrowthLoop("MANUAL");
  assert.equal(await count(), before, "budget smaller than the task's maximum cost → no task");
  const used = await usageOf("aiDaily");
  await set({ ...on, budgets: budgets({ aiDaily: used + cost }) });
  await runGrowthLoop("MANUAL");
  assert.equal(await count(), before + 1, "enough budget → exactly one task");
  assert.ok(Math.abs((await usageOf("aiDaily")) - (used + cost)) < 0.001, "the task's maximum cost was reserved");
  await runGrowthLoop("MANUAL");
  assert.equal(await count(), before + 1, "never a second task the same day");
});

test("5. autonomous mode OFF: zero growth provider calls, sends, posts or AI tasks", async () => {
  connectLinkedIn();
  stubSocialApis();
  await set({ autonomousMode: false, channels: channels({ social: true, email: true, leadGen: true, content: true }), budgets: budgets({ emailDaily: 1e6, socialDaily: 1e6, aiDaily: 1e6 }) });
  const s = await seq();
  await enroll(s.id, { email: addr("off") });
  const [m, t] = [mine().length, await db.aITask.count({ where: { source: GROWTH_TASK_SOURCE } })];
  await runGrowthLoop("MANUAL");
  assert.equal(providerCalls.length, 0, `provider calls: ${providerCalls.join(", ")}`);
  assert.equal(mine().length, m);
  assert.equal(await db.aITask.count({ where: { source: GROWTH_TASK_SOURCE } }), t);
  assert.equal((await db.growthRun.findFirst({ orderBy: { startedAt: "desc" } }))!.status, "SKIPPED");
});

test("6. autonomous mode ON: provider calls happen only as the controls allow", async () => {
  connectLinkedIn();
  stubSocialApis();
  await set({ autonomousMode: true, channels: channels({ social: false }) });
  await runGrowthLoop("MANUAL");
  assert.equal(providerCalls.length, 0, "social channel off → no social API call");
  await set({ autonomousMode: true, channels: channels({ social: true }), stoppedPlatforms: ["LINKEDIN"] });
  await runGrowthLoop("MANUAL");
  assert.equal(providerCalls.length, 0, "stopped platform → no call");
  await set({ autonomousMode: true, channels: channels({ social: true }) });
  await runGrowthLoop("MANUAL");
  assert.ok(providerCalls.some((u) => u.includes("/rest/networkSizes/")), "follower sync called the official API");
  const metric = await db.socialMetric.findFirst({ where: { platform: "LINKEDIN", source: "API" }, orderBy: { date: "desc" } });
  assert.equal(metric!.followers, 4321, "the API's number is stored as-is");
});

test("7. STOP ALL: zero growth execution even with everything switched on", async () => {
  connectLinkedIn();
  stubSocialApis();
  await set({ autonomousMode: true, channels: channels({ social: true, email: true, leadGen: true, content: true }), stops: stops({ all: true }), budgets: budgets({ emailDaily: 1e6, socialDaily: 1e6, aiDaily: 1e6 }) });
  const s = await seq();
  await enroll(s.id, { email: addr("stopall") });
  const [m, t] = [mine().length, await db.aITask.count({ where: { source: GROWTH_TASK_SOURCE } })];
  await runGrowthLoop("MANUAL");
  assert.equal(providerCalls.length, 0);
  assert.equal(mine().length, m);
  assert.equal(await db.aITask.count({ where: { source: GROWTH_TASK_SOURCE } }), t);
  assert.match(JSON.stringify((await db.growthRun.findFirst({ orderBy: { startedAt: "desc" } }))!.steps), /STOP ALL/);
  assert.equal((await processDueEmails({ autonomous: false })).sent, 0, "a person's manual run is stopped too");
  const r = await runAgent({ agentSlug: "marketing", request: "hi", user: admin, provider: scripted([]) });
  assert.equal(r.status, "BLOCKED", "AI is stopped too");
  await set({});
});

test("8. read-only request: zero mutations even if the model tries to save drafts", async () => {
  await set({});
  const counts = () => Promise.all([db.socialPost.count(), db.contentAsset.count(), db.aITask.count(), db.lead.count(), db.campaign.count(), db.aIApproval.count()]);
  const before = await counts();
  const r = await runAgent({
    agentSlug: "marketing",
    request: "What content do we have?",
    user: admin,
    route: { cls: "INSTANT_READ", reason: "test" },
    provider: scripted([["draftSocialPost", { platform: "LINKEDIN", body: `sneaky ${TAG}` }], ["draftContentAsset", { kind: "ARTICLE", title: `sneaky ${TAG}`, body: "x" }]]),
  });
  assert.notEqual(r.status, "FAILED");
  assert.deepEqual(await counts(), before, "no post, content, task, lead, campaign or approval created");
  const ex = await db.aIExecution.findUnique({ where: { id: r.executionId! } });
  assert.match(JSON.stringify(ex!.toolsUsed), /read-only request/);
  const q = await executeRequest({ user: admin, text: "How many qualified leads do we have?", channel: "chat", agentSlug: "sales" });
  assert.equal(q.cls, "INSTANT_READ");
  assert.deepEqual((await counts()).slice(0, 5), before.slice(0, 5), "a routed read changes nothing");
});

test("9. growth intents are classified by what the person wants", () => {
  const cases: [string, string][] = [
    ["What is my lead count?", "INSTANT_READ"],
    ["How many qualified leads do we have?", "INSTANT_READ"],
    ["Create a campaign draft for fintech in UAE", "INSTANT_ACTION"],
    ["Draft a LinkedIn post about our exchange", "INSTANT_ACTION"],
    ["Send this campaign to all leads", "APPROVAL_REQUIRED"],
    ["Publish today's posts", "APPROVAL_REQUIRED"],
    ["Run today's marketing", "BACKGROUND_TASK"],
    ["aaj ki marketing chalao", "BACKGROUND_TASK"],
    ["Which campaigns are active?", "INSTANT_READ"],
    ["Show me today's social posts", "INSTANT_READ"],
  ];
  for (const [text, want] of cases) assert.equal(classifyRequest(text).cls, want, text);
});

test("9b. an action request may save a draft for approval (never publish)", async () => {
  await set({});
  const r = await runAgent({ agentSlug: "marketing", request: "Create a LinkedIn post draft", user: admin, route: { cls: "INSTANT_ACTION", reason: "test" }, provider: scripted([["draftSocialPost", { platform: "LINKEDIN", body: `Action draft ${TAG}` }]]) });
  assert.equal(r.status, "SUCCEEDED");
  const p = await db.socialPost.findFirst({ where: { body: `Action draft ${TAG}` } });
  assert.equal(p!.status, "PENDING_APPROVAL");
  assert.equal(p!.approvedById, null);
});

test("10–13. lead counts respect the requested qualification tier", async () => {
  const base = { archivedAt: null };
  const expected = {
    total: await db.lead.count({ where: base }),
    qualified: await db.lead.count({ where: { ...base, mergedIntoId: null, growthTier: { in: ["QUALIFIED", "SALES_READY"] } } }),
    salesReady: await db.lead.count({ where: { ...base, mergedIntoId: null, growthTier: "SALES_READY" } }),
    lowFit: await db.lead.count({ where: { ...base, mergedIntoId: null, growthTier: "LOW_FIT" } }),
  };
  assert.ok(expected.salesReady >= 0 && expected.qualified >= expected.salesReady);
  const ask = async (text: string) => {
    const r = await executeRequest({ user: admin, text, channel: "chat", agentSlug: "sales" });
    assert.equal(r.cls, "INSTANT_READ", text);
    return r.text;
  };
  assert.match(await ask("How many leads do we have?"), new RegExp(`\\b${expected.total} leads? in total`));
  const q = await ask("How many qualified leads do we have?");
  assert.match(q, new RegExp(`^${expected.qualified} qualified leads?\\b`));
  assert.doesNotMatch(q, /in total/, "not the total-leads answer");
  assert.match(await ask("How many sales-ready leads?"), new RegExp(`^${expected.salesReady} sales-ready leads?\\b`));
  assert.match(await ask("How many low-fit leads do we have?"), new RegExp(`^${expected.lowFit} low-fit leads?\\b`));
  if (expected.qualified !== expected.total) assert.notEqual(expected.qualified, expected.total);
});

test("14. provider disconnected: no false success anywhere", async () => {
  await set({ budgets: budgets({ socialDaily: await remaining("socialDaily", 5) }) });
  const used = await usageOf("socialDaily");
  const p = await db.socialPost.create({ data: { platform: "LINKEDIN", body: `Disconnected ${TAG}`, status: "APPROVED", approvedById: admin.id, idempotencyKey: `safety-${TAG}-dc` } });
  const r = await publishPost(p.id, { autonomous: false });
  assert.equal(r.ok, false);
  assert.match(r.message, /not connected/i);
  const row = await db.socialPost.findUnique({ where: { id: p.id } });
  assert.equal(row!.status, "APPROVED");
  assert.equal(row!.externalId, null);
  assert.equal(await usageOf("socialDaily"), used, "a post that was not published uses no budget");
});

test("15. RBAC: only growth:control can change controls; calling the server actions without a session changes nothing", async () => {
  assert.equal(can("MARKETING_MANAGER", "growth:control"), false);
  assert.equal(can("SALES_MANAGER", "growth:manage"), false);
  assert.equal(can("CONTENT_MANAGER", "growth:view"), false);
  assert.equal(can("ADMIN", "growth:control"), true);
  await set({ stops: stops({ all: true }) });
  const { toggleKillSwitchAction, saveGrowthControlAction } = await import("../../lib/growth/actions");
  const r1 = await toggleKillSwitchAction("all", false);
  const form = new FormData();
  form.set("autonomousMode", "on");
  const r2 = await saveGrowthControlAction(undefined, form);
  assert.ok(r1?.error && r2?.error, "both refused");
  const s = (await db.setting.findUnique({ where: { key: GROWTH_SETTING } }))!.value as GrowthSettings;
  assert.equal(s.stops.all, true, "kill switch still on");
  assert.equal(s.autonomousMode, false, "autonomous mode unchanged");
  await set({});
});

test("16. failed provider action releases its budget reservation and its claim", async () => {
  const s = await seq();
  const e = await enroll(s.id, { email: addr("reject") });
  await set({ budgets: budgets({ emailDaily: await remaining("emailDaily", 5) }) });
  const used = await usageOf("emailDaily");
  const r = await processDueEmails({ autonomous: false });
  assert.equal(r.sent, 0);
  assert.equal(r.failed, 1);
  assert.equal(await usageOf("emailDaily"), used, "reservation released");
  assert.equal(await db.growthEmailSend.count({ where: { enrollmentId: e.id! } }), 0, "claim released, so the step can be retried");
  const en = await db.sequenceEnrollment.findUnique({ where: { id: e.id! } });
  assert.equal(en!.step, 0);
  assert.equal(en!.lastSentAt, null, "not marked sent");
  assert.equal(en!.status, "ACTIVE", "still due for a later retry");
});

test("17. a successfully sent step is never sent again, even if the enrollment is rolled back", async () => {
  await set({ budgets: budgets({ emailDaily: await remaining("emailDaily", 10) }) });
  const s = await seq();
  const e = await enroll(s.id, { email: addr("once") });
  await processDueEmails({ autonomous: false });
  const count = () => mine().filter((m) => m.to.includes(addr("once"))).length;
  assert.equal(count(), 1);
  // Simulate a crash between "sent" and "advanced": the enrollment is back on step 0 and due again.
  await db.sequenceEnrollment.update({ where: { id: e.id! }, data: { step: 0, nextAt: new Date(Date.now() - 1000), status: "ACTIVE" } });
  await processDueEmails({ autonomous: false });
  assert.equal(count(), 1, "no second send of step 0");
  assert.equal((await db.sequenceEnrollment.findUnique({ where: { id: e.id! } }))!.step, 1, "enrollment repaired from the SENT record");
  assert.ok(mine().filter((m) => m.to.includes(addr("once"))).every((m) => /api\/growth\/unsubscribe\?t=/.test(m.body.replace(/=\r?\n/g, "").replace(/=3D/g, "="))), "unsubscribe link present");
});
