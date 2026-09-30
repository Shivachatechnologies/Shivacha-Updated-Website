/**
 * Growth department integration tests against the TEST database only (refuses any other database). No external
 * provider is contacted: social, email and data-provider credentials are unset, so every provider must report
 * NOT_CONNECTED and nothing may be marked as sent or published.
 *
 *   DATABASE_URL=postgresql://…/shivacha_test npm run test:growth:db
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../../lib/db/client";
import { DEFAULT_GROWTH_SETTINGS, type GrowthSettings } from "../../lib/growth/policy";
import { GROWTH_SETTING } from "../../lib/growth/settings";
import { qualifyLeadById, releaseBudget, reserveBudget, upsertGrowthLead, usageOf } from "../../lib/growth/engine";
import { enroll, handleReply, isSuppressed, processDueEmails, suppress } from "../../lib/growth/email";
import { publishPost } from "../../lib/growth/social";
import { runGrowthLoop, GROWTH_TASK_SOURCE } from "../../lib/growth/loop";
import { growthSnapshot } from "../../lib/growth/snapshot";
import { providerStatuses, SOCIAL_PROVIDERS, leadProviders } from "../../lib/growth/providers";
import { unsubscribeToken } from "../../lib/growth/email-rules";
import { DEFAULT_STEPS } from "../../lib/growth/email-rules";
import { runAgent, SYSTEM_USER } from "../../lib/ai/runner";
import { getTool } from "../../lib/ai/tools";

if (!/shivacha_test/.test(process.env.DATABASE_URL ?? "")) throw new Error("Integration tests only run against the shivacha_test database.");
for (const k of ["ANTHROPIC_API_KEY", "SMTP_USER", "SMTP_PASS", "GMAIL_OAUTH_REFRESH_TOKEN", "LINKEDIN_ACCESS_TOKEN", "META_PAGE_ACCESS_TOKEN", "X_ACCESS_TOKEN", "YOUTUBE_API_KEY", "HUNTER_API_KEY", "APOLLO_API_KEY"]) {
  if (process.env[k]) throw new Error(`Unset ${k} for these tests (no external calls are made).`);
}
process.env.GROWTH_UNSUBSCRIBE_SECRET = "test-unsubscribe-secret-0123456789abcdef";

const TAG = `g${Date.now().toString(36)}`;
const mail = (n: string) => `${n}.${TAG}@acme-${TAG}.com`;
let saved: unknown = undefined;
let humanId = "";

async function setGrowth(patch: Partial<GrowthSettings>) {
  const value = JSON.parse(JSON.stringify({ ...DEFAULT_GROWTH_SETTINGS, ...patch }));
  await db.setting.upsert({ where: { key: GROWTH_SETTING }, update: { value }, create: { key: GROWTH_SETTING, value } });
}
const stops = (p: Partial<GrowthSettings["stops"]>) => ({ ...DEFAULT_GROWTH_SETTINGS.stops, ...p });
const channels = (p: Partial<GrowthSettings["channels"]>) => ({ ...DEFAULT_GROWTH_SETTINGS.channels, ...p });

before(async () => {
  saved = (await db.setting.findUnique({ where: { key: GROWTH_SETTING } }))?.value;
  humanId = (await db.user.create({ data: { email: `${TAG}@growth.test`, name: `Growth ${TAG}`, role: "MARKETING_MANAGER", passwordHash: "x", active: true } })).id;
  await setGrowth({});
});

after(async () => {
  if (saved === undefined) await db.setting.deleteMany({ where: { key: GROWTH_SETTING } });
  else await db.setting.update({ where: { key: GROWTH_SETTING }, data: { value: saved as object } });
  await db.$disconnect();
});

test("CRM dedupe: the same person never becomes two leads (case-insensitive), empty fields are filled", async () => {
  const a = await upsertGrowthLead({ email: mail("Priya"), name: "Priya", source: "linkedin" });
  const b = await upsertGrowthLead({ email: mail("priya").toUpperCase(), company: "Acme", source: "email" });
  assert.equal(a.created, true);
  assert.equal(b.created, false);
  assert.equal(a.id, b.id);
  const rows = await db.lead.findMany({ where: { email: { equals: mail("priya"), mode: "insensitive" } } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].company, "Acme", "fills an empty company");
  const again = await upsertGrowthLead({ email: mail("priya"), company: "Other Co", source: "x" });
  assert.equal((await db.lead.findUnique({ where: { id: again.id } }))!.company, "Acme", "never overwrites existing data");
});

test("qualification: stored with signals and reason; sales-ready advances lifecycle and priority", async () => {
  const { id } = await upsertGrowthLead({ email: mail("cto"), name: "Ravi", company: "Acme Bank", website: "https://acmebank.com", phone: "+9715", country: "AE", service: "Crypto Exchange Development", message: "Urgent: we need to launch a white-label exchange by March. Please send a proposal and pricing for the build and integration. ".repeat(2), source: "website", formType: "demo" });
  await db.lead.update({ where: { id }, data: { budget: "$50K+", status: "MEETING" } });
  const q = await qualifyLeadById(id);
  assert.ok(q);
  assert.equal(q!.tier, "SALES_READY");
  const lead = await db.lead.findUnique({ where: { id } });
  assert.equal(lead!.growthTier, "SALES_READY");
  assert.equal(lead!.lifecycleStage, "SQL");
  assert.equal(lead!.priority, "HIGH");
  assert.ok(lead!.qualifiedAt);
  const hist = await db.leadQualification.findMany({ where: { leadId: id } });
  assert.equal(hist.length, 1);
  assert.ok(Array.isArray(hist[0].signals) && (hist[0].signals as string[]).length > 0);
  assert.match(hist[0].reason, /Sales-ready/);
});

test("email: suppression stops sequences and blocks re-enrollment; replies stop automation", async () => {
  const seq = await db.emailSequence.create({ data: { name: `Nurture ${TAG}`, steps: JSON.parse(JSON.stringify(DEFAULT_STEPS)), active: true } });
  const e1 = await enroll(seq.id, { email: mail("anil"), name: "Anil" });
  assert.ok(e1.ok);
  assert.equal((await enroll(seq.id, { email: mail("ANIL") })).reason, "Already enrolled.", "no duplicate enrollment");
  const n = await suppress(mail("anil"), "UNSUBSCRIBE");
  assert.equal(n, 1);
  assert.equal((await db.sequenceEnrollment.findUnique({ where: { id: e1.id! } }))!.status, "STOPPED");
  assert.equal((await enroll(seq.id, { email: mail("anil") })).ok, false, "suppressed address cannot be enrolled");

  await enroll(seq.id, { email: mail("meera") });
  const pos = await handleReply(mail("meera"), "Yes, let's schedule a call next week");
  assert.equal(pos.cls, "POSITIVE");
  assert.equal(pos.stopped, 1);
  assert.equal(await isSuppressed(mail("meera")), false, "positive reply is not suppressed");

  await enroll(seq.id, { email: mail("rohit") });
  const neg = await handleReply(mail("rohit"), "Not interested, please stop");
  assert.equal(neg.suppressed, true);
  assert.equal(await isSuppressed(mail("rohit")), true);
  assert.equal((await enroll(seq.id, { email: mail("rohit") })).ok, false);
});

test("email sending: blocked by kill switch, by autonomous mode, and by an unconnected provider — nothing marked sent", async () => {
  const seq = await db.emailSequence.create({ data: { name: `Send ${TAG}`, steps: JSON.parse(JSON.stringify(DEFAULT_STEPS)), active: true } });
  const e = await enroll(seq.id, { email: mail("due") });
  await setGrowth({ autonomousMode: true, channels: channels({ email: true }), stops: stops({ email: true }), budgets: { ...DEFAULT_GROWTH_SETTINGS.budgets, emailDaily: 100 } });
  assert.match((await processDueEmails({ autonomous: true })).blocked!, /email/i);
  await setGrowth({ autonomousMode: false, channels: channels({ email: true }), budgets: { ...DEFAULT_GROWTH_SETTINGS.budgets, emailDaily: 100 } });
  assert.match((await processDueEmails({ autonomous: true })).blocked!, /Autonomous growth mode is off/);
  const r = await processDueEmails({ autonomous: false });
  assert.match(r.blocked!, /not connected/i);
  assert.equal(r.sent, 0);
  const after = await db.sequenceEnrollment.findUnique({ where: { id: e.id! } });
  assert.equal(after!.step, 0, "nothing advanced");
  assert.equal(after!.lastSentAt, null);
  await setGrowth({});
});

test("budgets: unset blocks; reservation counts per day; limit never exceeded; release gives it back", async () => {
  await setGrowth({});
  assert.equal((await reserveBudget("socialDaily", 1)).ok, false, "no budget configured");
  assert.equal((await reserveBudget("adDaily", 1)).ok, false, "a budget no automated action uses can never be reserved");
  const used = await usageOf("socialDaily");
  await setGrowth({ budgets: { ...DEFAULT_GROWTH_SETTINGS.budgets, socialDaily: used + 2 } });
  const a = await reserveBudget("socialDaily", 2);
  assert.equal(a.ok, true);
  assert.equal((await reserveBudget("socialDaily", 1)).ok, false, "limit reached → refused");
  await releaseBudget(a);
  assert.equal(await usageOf("socialDaily"), used, "released reservation is given back");
  await setGrowth({});
});

test("social: publishing needs a human approval, respects kill switches, never fakes success, is idempotent", async () => {
  const p = await db.socialPost.create({ data: { platform: "LINKEDIN", body: `Launch notes ${TAG}`, status: "PENDING_APPROVAL", idempotencyKey: `k-${TAG}-1` } });
  assert.match((await publishPost(p.id, { autonomous: false })).message, /must approve/);
  await db.socialPost.update({ where: { id: p.id }, data: { status: "APPROVED", approvedById: humanId } });
  await setGrowth({ stops: stops({ publishing: true }), budgets: { ...DEFAULT_GROWTH_SETTINGS.budgets, socialDaily: 1000 } });
  assert.match((await publishPost(p.id, { autonomous: false })).message, /publishing/i);
  await setGrowth({ budgets: { ...DEFAULT_GROWTH_SETTINGS.budgets, socialDaily: 1000 } });
  const r = await publishPost(p.id, { autonomous: false });
  assert.equal(r.ok, false);
  assert.match(r.message, /not connected/i);
  const after = await db.socialPost.findUnique({ where: { id: p.id } });
  assert.equal(after!.status, "APPROVED", "returns to approved — not published, not stuck");
  assert.equal(after!.externalId, null);
  await db.socialPost.update({ where: { id: p.id }, data: { status: "PUBLISHED", externalId: "urn:li:share:1" } });
  assert.equal((await publishPost(p.id, { autonomous: false })).message, "Already published.");
  const q = await db.socialPost.create({ data: { platform: "X", body: `Claimed ${TAG}`, status: "PUBLISHING", approvedById: humanId, idempotencyKey: `k-${TAG}-2` } });
  assert.equal((await publishPost(q.id, { autonomous: false })).ok, false, "a post already being published is not published twice");
  await setGrowth({});
});

test("providers: every unconfigured provider reports NOT_CONNECTED", async () => {
  for (const p of Object.values(SOCIAL_PROVIDERS)) {
    const f = await p.followers();
    assert.equal(f.ok, false);
  }
  const h = await leadProviders.hunter.domainSearch("example.com");
  assert.equal(h.ok, false);
  assert.equal((h as { code: string }).code, "NOT_CONNECTED");
  const statuses = providerStatuses();
  for (const kind of ["ads", "social", "email", "lead", "enrichment", "search", "analytics", "image", "video", "tts"]) assert.ok(statuses.some((s) => s.kind === kind), `${kind} provider listed`);
  assert.ok(statuses.every((s) => s.env.every((e) => /^[A-Z0-9_]+$/.test(e))), "only variable names are exposed, never values");
});

test("kill switch: STOP ALL AI blocks every agent run, human or scheduled", async () => {
  await setGrowth({ stops: stops({ ai: true }) });
  const r = await runAgent({ agentSlug: "marketing", request: "summarise growth", user: SYSTEM_USER, trigger: "SCHEDULE", provider: null });
  assert.equal(r.status, "BLOCKED");
  assert.match(r.text, /kill switch/);
  await setGrowth({ stoppedAgents: ["sdr"] });
  assert.equal((await runAgent({ agentSlug: "sdr", request: "list prospects", user: SYSTEM_USER, trigger: "SCHEDULE", provider: null })).status, "BLOCKED");
  await setGrowth({});
  const ok = await runAgent({ agentSlug: "marketing", request: "summarise growth", user: SYSTEM_USER, trigger: "SCHEDULE", provider: null });
  assert.notEqual(ok.status, "BLOCKED", "runs again once the switch is off");
});

test("AI tools: draftSocialPost saves an inert review item with QA; stopped publishing blocks it", async () => {
  const tool = getTool("draftSocialPost")!;
  const r = await tool.run({ user: SYSTEM_USER, agentSlug: "marketing", executionId: null }, tool.input.parse({ platform: "LINKEDIN", body: `Guaranteed returns ${TAG}` }));
  const id = String((r.data as { storedForReview: string }).storedForReview).split(" ")[1];
  const post = await db.socialPost.findUnique({ where: { id } });
  assert.equal(post!.status, "PENDING_APPROVAL");
  assert.equal(post!.approvedById, null, "AI never approves its own post");
  assert.ok((post!.qa as { code: string }[]).some((i) => i.code === "GUARANTEE_CLAIM"));
  await setGrowth({ stops: stops({ publishing: true }) });
  await assert.rejects(tool.run({ user: SYSTEM_USER, agentSlug: "marketing", executionId: null }, tool.input.parse({ platform: "X", body: "hello" })), /publishing/i);
  await setGrowth({});
});

test("daily loop: skipped when off or stopped; when on, qualifies leads and assigns each AI task once per day", async () => {
  await setGrowth({});
  await runGrowthLoop("MANUAL");
  assert.equal((await db.growthRun.findFirst({ orderBy: { startedAt: "desc" } }))!.status, "SKIPPED");
  await setGrowth({ autonomousMode: true, channels: channels({ leadGen: true }), stops: stops({ all: true }) });
  await runGrowthLoop("MANUAL");
  const stopped = await db.growthRun.findFirst({ orderBy: { startedAt: "desc" } });
  assert.equal(stopped!.status, "SKIPPED");
  assert.match(JSON.stringify(stopped!.steps), /STOP ALL/);

  const { id } = await upsertGrowthLead({ email: mail("loop"), company: "Loop Co", source: "website" });
  await setGrowth({ autonomousMode: true, channels: channels({ leadGen: true }) });
  const beforeTasks = await db.aITask.count({ where: { source: GROWTH_TASK_SOURCE } });
  await runGrowthLoop("MANUAL");
  const run = await db.growthRun.findFirst({ orderBy: { startedAt: "desc" } });
  assert.equal(run!.status, "SUCCEEDED");
  assert.ok((await db.lead.findUnique({ where: { id } }))!.growthTier, "pending lead scored");
  const steps = run!.steps as { step: string; status: string }[];
  assert.equal(steps.find((s) => s.step === "email.sequences")!.status, "skipped", "email channel off");
  assert.equal(steps.find((s) => s.step === "ai.marketing")!.status, "skipped", "content channel off → no marketing task");
  const afterTasks = await db.aITask.count({ where: { source: GROWTH_TASK_SOURCE } });
  await runGrowthLoop("MANUAL");
  assert.equal(await db.aITask.count({ where: { source: GROWTH_TASK_SOURCE } }), afterTasks, "no duplicate tasks the same day");
  assert.ok(afterTasks >= beforeTasks);
  await setGrowth({});
});

test("dashboard snapshot: real counts only; unknown metrics are null, never estimated", async () => {
  const g = await growthSnapshot({ from: new Date(Date.now() - 86400_000), to: new Date() }, 100);
  assert.ok(g.leads >= 3);
  assert.ok(g.salesReady >= 1);
  assert.equal(g.target, 100);
  if (!g.spend.length) {
    assert.equal(g.cpl, null);
    assert.equal(g.roas, null);
  }
  for (const p of g.followers.platforms) if (p.followers == null) assert.equal(p.change, null);
});

test("unsubscribe endpoint: signed link suppresses on POST only; forged links are rejected", async () => {
  const { GET, POST } = await import("../../app/api/growth/unsubscribe/route");
  const email = mail("unsub");
  const t = unsubscribeToken(email, process.env.GROWTH_UNSUBSCRIBE_SECRET!);
  const g = await GET(new Request(`https://x.test/api/growth/unsubscribe?t=${encodeURIComponent(t)}`));
  assert.equal(g.status, 200);
  assert.equal(await isSuppressed(email), false, "GET (link scanners) never unsubscribes");
  const p = await POST(new Request(`https://x.test/api/growth/unsubscribe?t=${encodeURIComponent(t)}`, { method: "POST" }));
  assert.equal(p.status, 200);
  assert.equal(await isSuppressed(email), true);
  const bad = await POST(new Request(`https://x.test/api/growth/unsubscribe?t=${encodeURIComponent(t.replace(/.$/, "A"))}`, { method: "POST" }));
  assert.equal(bad.status, 400);
});
