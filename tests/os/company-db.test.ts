/**
 * AI company integration tests against the TEST database (refuses any other database). A scripted provider stands in
 * for the model and a counting fetch stub stands in for Apollo / Hunter, so delegation, review, dependencies,
 * escalation, objectives, the lead pipeline, research sourcing, memory scopes, the vault and governance are exercised
 * deterministically and nothing leaves the machine.
 *
 *   DATABASE_URL=postgresql://…/shivacha_test npm run test:company:db
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../../lib/db/client";
import type { SessionUser } from "../../lib/auth/session";
import type { RoleName } from "../../lib/auth/permissions";
import type { AIProvider, AIRunInput } from "../../lib/ai/provider";
import { ALL_AGENTS, AGENTS } from "../../lib/ai/catalog";
import { createEmployeeTask, executeTask, processDueTasks } from "../../lib/ai/workforce/engine";
import { memoryPrompt, saveMemory } from "../../lib/ai/workforce/memory";
import { runAgent } from "../../lib/ai/runner";
import { ensureOrganisation, orgChart, orgManagers } from "../../lib/company/organisation";
import { saveCompanyProfile } from "../../lib/company/profile";
import { DEFAULT_PROFILE, hasCycle } from "../../lib/company/org";
import { cancelObjective, createObjective } from "../../lib/company/objectives";
import { refreshObjective } from "../../lib/company/objective-status";
import { leadGenFunnel, runLeadPipeline } from "../../lib/company/leadgen";
import { addFinding, completeResearch } from "../../lib/company/research";
import { requestMarketResearch } from "../../lib/company/research-request";
import { hydrateVault, removeSecrets, secretValue, storeSecret } from "../../lib/integrations/vault";
import { regionalPerformance, workforcePerformance } from "../../lib/company/analytics";
import { pumpCompany } from "../../lib/company/loop";
import { GROWTH_SETTING } from "../../lib/growth/settings";
import { DEFAULT_GROWTH_SETTINGS } from "../../lib/growth/policy";

if (!/shivacha_test/.test(process.env.DATABASE_URL ?? "")) throw new Error("AI company integration tests only run against the shivacha_test database.");
if (process.env.ANTHROPIC_API_KEY) throw new Error("Unset ANTHROPIC_API_KEY for these tests.");

const RUN = Date.now().toString(36);
const users: Record<string, SessionUser> = {};

type Step = (prev: unknown[]) => [string, unknown];
/** Stand-in model: runs a fixed list of tool calls (each may depend on earlier results), then answers. */
function scripted(steps: Step[], answer = "Report: done."): AIProvider {
  return {
    name: "scripted-test",
    async run(i: AIRunInput) {
      const results: unknown[] = [];
      for (const step of steps) {
        await i.beforeCall();
        await i.onUsage({ model: "claude-opus-5", inputTokens: 100, outputTokens: 50, costUsd: 0.001 });
        const [name, input] = step(results);
        const out = await i.executeTool(name, input);
        results.push(out.isError ? { error: out.content } : out.content);
      }
      return { text: answer, stop: "completed" as const, model: "claude-opus-5", iterations: steps.length + 1 };
    },
  };
}
const failing = (message: string): AIProvider => ({ name: "failing-test", async run() { throw new Error(message); } });

/* ───── counting fetch stub for provider APIs ───── */
const realFetch = globalThis.fetch;
const calls: string[] = [];
let apolloPeople: { name: string; title: string; country: string; email: string | null; organization: { name: string; primary_domain: string; industry: string } }[] = [];
const verification: Record<string, string> = {};
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith("https://api.apollo.io/")) {
    calls.push("apollo");
    return new Response(JSON.stringify({ people: apolloPeople }), { status: 200 });
  }
  if (url.startsWith("https://api.hunter.io/v2/email-verifier")) {
    calls.push("hunter-verify");
    const email = new URL(url).searchParams.get("email") ?? "";
    return new Response(JSON.stringify({ data: { status: verification[email] ?? "valid" } }), { status: 200 });
  }
  if (url.startsWith("https://api.hunter.io/")) {
    calls.push("hunter-search");
    return new Response(JSON.stringify({ data: { organization: "Hunter Co", emails: [] } }), { status: 200 });
  }
  return realFetch(input as RequestInfo, init);
}) as typeof fetch;

async function setGrowth(patch: Record<string, unknown>) {
  const v = JSON.parse(JSON.stringify({ ...DEFAULT_GROWTH_SETTINGS, ...patch }));
  await db.setting.upsert({ where: { key: GROWTH_SETTING }, update: { value: v }, create: { key: GROWTH_SETTING, value: v } });
}

/** An objective shell for tests that drive tasks directly (objective tasks never run without a provider). */
async function objectiveShell(title: string) {
  return db.aIObjective.create({ data: { title: `${title} ${RUN}`, statement: `${title} ${RUN}`, status: "ACTIVE", createdById: users.SUPER_ADMIN.id } });
}

before(async () => {
  for (const u of await db.user.findMany({ where: { email: { endsWith: "@shivacha.test" } }, select: { id: true, email: true, name: true, role: true } })) users[u.role] = { ...u, role: u.role as RoleName };
  assert.ok(users.SUPER_ADMIN && users.SALES_MANAGER, "QA users exist");
  await ensureOrganisation();
  await db.aIAgent.updateMany({ data: { mode: "ASSIST", enabled: true, available: true } });
  // Repeated runs on the shared test database would otherwise exhaust the real daily delegation limit (200/day).
  await saveCompanyProfile({ ...DEFAULT_PROFILE, dailyDelegationLimit: 5000 });
  await setGrowth({});
});

after(async () => {
  globalThis.fetch = realFetch;
  await saveCompanyProfile(DEFAULT_PROFILE);
  await setGrowth({});
  await db.aIDepartment.updateMany({ data: { monthlyCostLimit: null } });
});

test("organisation: 60 employees in the database, unique codes, valid managers, no cycles, core agents moved under their new managers", async () => {
  const org = await orgChart();
  assert.equal(org.length, 60);
  assert.equal(AGENTS.length, 12, "core catalogue unchanged");
  assert.equal(new Set(org.map((n) => n.code)).size, 60, "unique employee codes");
  assert.ok(org.every((n) => n.code && /^AI-\d{4}$/.test(n.code)));
  const managers = await orgManagers();
  assert.ok(!hasCycle(managers));
  for (const [s, m] of managers) if (m) assert.ok(managers.has(m), `${s} → ${m}`);
  assert.equal(managers.get("ceo"), null, "Chief of Staff reports to the human CEO");
  assert.equal(managers.get("sdr"), "sales-director");
  assert.equal(managers.get("research"), "intel-director");
  assert.equal((await db.aIDepartment.count()) >= 13, true);
  assert.equal(await db.aIRegion.count(), 5);
});

test("organisation sync never overwrites an administrator's own reporting line", async () => {
  await db.setting.deleteMany({ where: { key: "company:org-sync" } });
  await db.aIAgent.update({ where: { slug: "crm" }, data: { reportsToSlug: "support" } });
  await db.aIAgent.update({ where: { slug: "proposal" }, data: { reportsToSlug: "sales" } }); // legacy default → migrates
  await ensureOrganisation();
  assert.equal((await db.aIAgent.findUniqueOrThrow({ where: { slug: "crm" } })).reportsToSlug, "support", "custom manager kept");
  assert.equal((await db.aIAgent.findUniqueOrThrow({ where: { slug: "proposal" } })).reportsToSlug, "sales-director");
  await db.aIAgent.update({ where: { slug: "crm" }, data: { reportsToSlug: "sales-ops-manager" } });
});

test("delegation → manager waits → report does the work → manager resumes, requests a revision, accepts, completes", async () => {
  const o = await objectiveShell("Delegation");
  const parent = await createEmployeeTask({ agentSlug: "cro", title: `Pipeline review ${RUN}`, requestedById: users.SUPER_ADMIN.id, objectiveId: o.id, runAfter: new Date(Date.now() + 3600_000) });
  await db.aITask.update({ where: { id: parent.id }, data: { runAfter: new Date() } });
  const r1 = await executeTask(parent.id, {
    provider: scripted([
      () => ["planTask", { subtasks: ["Delegate the deal review", "Review"] }],
      () => ["delegateTask", { assignee: "cfo", title: "Not my report", instructions: "x" }],
      () => ["delegateTask", { assignee: "sales-director", title: `Review open deals ${RUN}`, instructions: "List next actions." }],
      () => ["delegateTask", { assignee: "sales-director", title: `Review open deals ${RUN}`, instructions: "List next actions." }],
    ]),
  });
  assert.equal(r1, "WAITING");
  const p1 = await db.aITask.findUniqueOrThrow({ where: { id: parent.id } });
  assert.equal(p1.status, "WAITING");
  const children = await db.aITask.findMany({ where: { parentTaskId: parent.id } });
  assert.equal(children.length, 1, "CFO refused (not in reporting line); repeated delegation deduplicated");
  const child = children[0];
  assert.equal(child.agentSlug, "sales-director");
  assert.equal(child.requestedById, users.SUPER_ADMIN.id, "delegated work keeps the human requester's identity");
  assert.equal(child.objectiveId, o.id);
  assert.ok(await db.aIWorkMessage.findFirst({ where: { taskId: child.id, kind: "DELEGATION", fromSlug: "cro", toSlug: "sales-director" } }));

  assert.equal(await executeTask(child.id, { provider: scripted([() => ["completeTask", { summary: "3 deals need follow-up." }]]) }), "DONE");
  const resumed = await db.aITask.findUniqueOrThrow({ where: { id: parent.id } });
  assert.equal(resumed.status, "QUEUED", "manager resumes when all delegated work is settled");
  assert.equal((await db.aITask.findUniqueOrThrow({ where: { id: child.id } })).reviewStatus, "PENDING_REVIEW");
  assert.ok(await db.aIWorkMessage.findFirst({ where: { taskId: child.id, kind: "RESULT", toSlug: "cro" } }));

  assert.equal(await executeTask(parent.id, { provider: scripted([() => ["reviewDelegatedWork", { taskId: child.id, decision: "revise", note: "Add deal values." }]]) }), "WAITING");
  const revised = await db.aITask.findUniqueOrThrow({ where: { id: child.id } });
  assert.equal(revised.status, "QUEUED");
  assert.equal(revised.revisions, 1);
  assert.match(revised.instructions ?? "", /REVISION 1 requested by your manager: Add deal values/);

  assert.equal(await executeTask(child.id, { provider: scripted([() => ["completeTask", { summary: "3 deals, values per currency." }]]) }), "DONE");
  assert.equal(await executeTask(parent.id, { provider: scripted([() => ["reviewDelegatedWork", { taskId: child.id, decision: "accept" }], () => ["completeTask", { summary: "Pipeline reviewed." }]]) }), "DONE");
  assert.equal((await db.aITask.findUniqueOrThrow({ where: { id: child.id } })).reviewStatus, "ACCEPTED");
  const types = (await db.aIActivity.findMany({ where: { objectiveId: o.id } })).map((a) => a.type);
  for (const k of ["task.assigned", "task.delegation", "task.waiting", "task.resumed", "review.revision", "review.accepted", "task.completed"]) assert.ok(types.includes(k), `objective timeline has ${k}`);
});

test("dependencies: a task waits for its prerequisite and fails with the reason when the prerequisite fails", async () => {
  const o = await objectiveShell("Dependencies");
  const a = await createEmployeeTask({ agentSlug: "intel-director", title: `Research ${RUN}`, requestedById: users.SUPER_ADMIN.id, objectiveId: o.id });
  const b = await createEmployeeTask({ agentSlug: "cmo", title: `Offer ${RUN}`, requestedById: users.SUPER_ADMIN.id, objectiveId: o.id, dependsOn: [a.id] });
  assert.equal(await executeTask(b.id, { provider: scripted([]) }), "SKIPPED", "prerequisite not done");
  assert.equal((await db.aITask.findUniqueOrThrow({ where: { id: b.id } })).status, "QUEUED");
  assert.equal(await executeTask(a.id, { provider: failing("Invalid request: bad input") }), "FAILED");
  assert.equal((await db.aITask.findUniqueOrThrow({ where: { id: a.id } })).status, "FAILED", "non-transient errors are not retried");
  const bb = await db.aITask.findUniqueOrThrow({ where: { id: b.id } });
  assert.equal(bb.status, "FAILED");
  assert.match(bb.error ?? "", /Dependency "Research/);
});

test("failure recovery: a transient provider error is retried with backoff, a bounded number of times", async () => {
  const o = await objectiveShell("Retry");
  const t = await createEmployeeTask({ agentSlug: "cmo", title: `Retry ${RUN}`, requestedById: users.SUPER_ADMIN.id, objectiveId: o.id });
  assert.equal(await executeTask(t.id, { provider: failing("529 overloaded") }), "FAILED");
  let row = await db.aITask.findUniqueOrThrow({ where: { id: t.id } });
  assert.equal(row.status, "QUEUED", "requeued");
  assert.ok(row.runAfter > new Date(Date.now() + 60_000), "with a delay");
  for (let i = 0; i < 3; i++) {
    await db.aITask.update({ where: { id: t.id }, data: { runAfter: new Date() } });
    await executeTask(t.id, { provider: failing("429 rate limit") });
  }
  row = await db.aITask.findUniqueOrThrow({ where: { id: t.id } });
  assert.equal(row.status, "FAILED", "stops retrying");
  assert.ok(row.attempts <= 3);
});

test("escalation and blockers reach the manager and the responsible person; nothing is marked done", async () => {
  const o = await objectiveShell("Escalation");
  const t = await createEmployeeTask({ agentSlug: "leadgen-director", title: `Find prospects ${RUN}`, requestedById: users.SUPER_ADMIN.id, objectiveId: o.id });
  await executeTask(t.id, { provider: scripted([() => ["reportBlocker", { reason: "Apollo NOT CONNECTED" }], () => ["escalate", { reason: "Need budget approval", toCeo: true }]]) });
  const msgs = await db.aIWorkMessage.findMany({ where: { taskId: t.id } });
  assert.ok(msgs.some((m) => m.kind === "BLOCKER" && m.toSlug === "cro"));
  assert.ok(msgs.some((m) => m.kind === "ESCALATION" && m.toUserId === users.SUPER_ADMIN.id));
  assert.equal((await db.aITask.findUniqueOrThrow({ where: { id: t.id } })).blockedReason, "Apollo NOT CONNECTED");
  assert.ok(await db.notification.findFirst({ where: { userId: users.SUPER_ADMIN.id, type: "ai.escalation" } }));
});

test("runaway protection: per-task delegation limit and kill switch", async () => {
  const o = await objectiveShell("Runaway");
  const t = await createEmployeeTask({ agentSlug: "cmo", title: `Many ${RUN}`, requestedById: users.SUPER_ADMIN.id, objectiveId: o.id });
  const steps: Step[] = Array.from({ length: 14 }, (_, i) => () => ["delegateTask", { assignee: i % 2 ? "content-manager" : "social-manager", title: `Piece ${i} ${RUN}`, instructions: "x" }]);
  await executeTask(t.id, { provider: scripted(steps) });
  assert.equal(await db.aITask.count({ where: { parentTaskId: t.id } }), 12, "capped at 12 children");

  await setGrowth({ stops: { ...DEFAULT_GROWTH_SETTINGS.stops, all: true } });
  await assert.rejects(createObjective({ statement: `Get 10 leads per day ${RUN}`, userId: users.SUPER_ADMIN.id }), /stopped/);
  const t2 = await createEmployeeTask({ agentSlug: "cmo", title: `Stopped ${RUN}`, requestedById: users.SUPER_ADMIN.id, objectiveId: o.id });
  const r = await executeTask(t2.id, { provider: scripted([() => ["delegateTask", { assignee: "content-manager", title: `After stop ${RUN}`, instructions: "x" }]]) });
  assert.equal(r, "FAILED", "the run itself is blocked by the kill switch");
  assert.equal(await db.aITask.count({ where: { title: `After stop ${RUN}` } }), 0);
  await setGrowth({});
});

test("CEO objective (lead generation): real plan, campaign, research and tasks; BLOCKED honestly without an AI provider", async () => {
  const statement = `Build a plan to generate 100 qualified international leads per day ${RUN}`;
  const r = await createObjective({ statement, userId: users.SUPER_ADMIN.id });
  const again = await createObjective({ statement, userId: users.SUPER_ADMIN.id });
  assert.equal(again.id, r.id, "double submit returns the same objective");
  const o = await db.aIObjective.findUniqueOrThrow({ where: { id: r.id } });
  assert.equal(o.playbook, "LEAD_GENERATION");
  assert.equal(o.targetMetric, "qualified_leads_per_day");
  assert.equal(o.targetValue, 100);
  assert.equal(o.status, "BLOCKED");
  assert.match(o.blockedReason ?? "", /AI provider NOT CONNECTED/);
  const tasks = await db.aITask.findMany({ where: { objectiveId: o.id } });
  assert.equal(tasks.length, 10, "Chief of Staff + 9 stages");
  const root = tasks.find((t) => t.id === o.rootTaskId)!;
  assert.equal(root.agentSlug, "ceo");
  assert.equal(root.status, "WAITING");
  const owners = tasks.filter((t) => t.parentTaskId === root.id).map((t) => t.agentSlug).sort();
  assert.deepEqual(owners, ["campaign-manager", "cmo", "content-manager", "growth-director", "intel-director", "leadgen-director", "revenue-analyst", "sdr", "social-manager"]);
  const offer = tasks.find((t) => t.agentSlug === "cmo")!;
  const research = tasks.find((t) => t.agentSlug === "intel-director")!;
  assert.deepEqual(offer.dependsOn, [research.id]);
  assert.ok(tasks.every((t) => t.requestedById === users.SUPER_ADMIN.id));
  const campaign = await db.campaign.findUniqueOrThrow({ where: { id: o.campaignId! } });
  assert.equal(campaign.dailyLeadTarget, 100);
  assert.ok(await db.marketResearch.findFirst({ where: { objectiveId: o.id, taskId: research.id } }));
  // Without a provider nothing runs and nothing is claimed.
  assert.equal(await executeTask(research.id), "SKIPPED");
  assert.equal((await db.aITask.findUniqueOrThrow({ where: { id: research.id } })).status, "QUEUED");
  await cancelObjective(o.id, users.SUPER_ADMIN.id, "QA");
  assert.equal((await db.aIObjective.findUniqueOrThrow({ where: { id: o.id } })).status, "CANCELLED");
  assert.equal(await db.aITask.count({ where: { objectiveId: o.id, status: { notIn: ["CANCELLED", "DONE", "FAILED"] } } }), 0);
});

test("general objective goes to the Chief of Staff, who plans with delegation; objective completes from the root task", async () => {
  const r = await createObjective({ statement: `Improve how we answer partner enquiries ${RUN}`, userId: users.SUPER_ADMIN.id });
  const o = await db.aIObjective.findUniqueOrThrow({ where: { id: r.id } });
  assert.equal(o.playbook, "GENERAL");
  const root = await db.aITask.findUniqueOrThrow({ where: { id: o.rootTaskId! } });
  assert.equal(root.status, "QUEUED");
  assert.equal(await executeTask(root.id, { provider: scripted([() => ["delegateTask", { assignee: "coo", title: `Partner enquiry process ${RUN}`, instructions: "Map the current process." }]]) }), "WAITING");
  const child = await db.aITask.findFirstOrThrow({ where: { parentTaskId: root.id } });
  assert.equal(await executeTask(child.id, { provider: scripted([() => ["completeTask", { summary: "Process mapped." }]]) }), "DONE");
  assert.equal(await executeTask(root.id, { provider: scripted([() => ["completeTask", { summary: "Done." }]], "CEO report: process mapped.") }), "DONE");
  assert.equal(await refreshObjective(o.id), "COMPLETED");
  assert.match((await db.aIObjective.findUniqueOrThrow({ where: { id: o.id } })).result ?? "", /CEO report/);
});

test("lead pipeline: NOT CONNECTED without providers; with providers discovers, dedupes, suppresses, verifies, qualifies — never exceeding the daily target", async () => {
  const c = await db.campaign.create({ data: { name: `LG ${RUN}`, status: "ACTIVE", dailyLeadTarget: 3, leadGen: { sources: ["apollo"], titles: ["CTO", "Head of Engineering"], countries: ["United States"], industries: ["fintech"], mode: "MANUAL", minFit: 60 } } });
  delete process.env.APOLLO_API_KEY;
  delete process.env.HUNTER_API_KEY;
  await hydrateVault(true);
  const none = await runLeadPipeline(c.id, { actor: users.SUPER_ADMIN.id });
  assert.equal(none.steps.find((s) => s.key === "discover")?.status, "NOT_CONNECTED");
  assert.equal(none.steps.find((s) => s.key === "verify")?.status, "NOT_CONNECTED");
  assert.equal(calls.length, 0, "no provider was called");

  process.env.APOLLO_API_KEY = "test-apollo";
  process.env.HUNTER_API_KEY = "test-hunter";
  const sup = `suppressed.${RUN}@example.com`;
  await db.emailSuppression.create({ data: { email: sup, reason: "UNSUBSCRIBE" } });
  apolloPeople = [
    { name: "Sup Four", title: "CTO", country: "United States", email: sup, organization: { name: "Fin D", primary_domain: "fin-d.example", industry: "Fintech" } },
    { name: "Ana One", title: "CTO", country: "United States", email: `ana.${RUN}@fin.example`, organization: { name: "Fin A", primary_domain: "fin-a.example", industry: "Fintech" } },
    { name: "Ben Two", title: "Head of Engineering", country: "United States", email: `ben.${RUN}@fin.example`, organization: { name: "Fin B", primary_domain: "fin-b.example", industry: "Fintech" } },
    { name: "Cy Three", title: "Intern", country: "Germany", email: `cy.${RUN}@fin.example`, organization: { name: "Fin C", primary_domain: "fin-c.example", industry: "Retail" } },
    { name: "Dee Five", title: "CTO", country: "United States", email: `dee.${RUN}@fin.example`, organization: { name: "Fin E", primary_domain: "fin-e.example", industry: "Fintech" } },
  ];
  verification[`ben.${RUN}@fin.example`] = "invalid";
  const run = await runLeadPipeline(c.id, { actor: users.SUPER_ADMIN.id });
  assert.equal(run.discovered, 3, "daily target 3 caps discovery");
  assert.equal(run.suppressed, 1);
  assert.equal(run.verified, 3);
  assert.equal(run.qualified, 1, "only the verified, on-ICP CTO qualifies");
  assert.equal(run.disqualified, 1, "invalid email disqualified");
  const again = await runLeadPipeline(c.id, { actor: users.SUPER_ADMIN.id });
  assert.equal(again.discovered, 0);
  assert.equal(again.steps.find((s) => s.key === "discover")?.status, "SKIPPED", "daily target reached");
  await db.campaign.update({ where: { id: c.id }, data: { dailyLeadTarget: 50 } });
  const third = await runLeadPipeline(c.id, { actor: users.SUPER_ADMIN.id });
  assert.equal(third.discovered, 1, "only the one not yet seen");
  assert.equal(third.duplicates, 3, "duplicates never re-created");
  assert.equal(await db.prospect.count({ where: { campaignId: c.id } }), 4);
  assert.equal(await db.lead.count({ where: { email: { contains: RUN } } }), 0, "prospects are not written into the CRM as leads");
  const f = await leadGenFunnel(c.id);
  assert.equal(f.discovered, 4);
  assert.equal(f.invalid, 1);
  assert.ok(f.duplicatesAvoided >= 3);
  assert.equal(f.sources[0].source, "apollo");
  delete process.env.APOLLO_API_KEY;
  delete process.env.HUNTER_API_KEY;
});

test("market research: unsourced statistics are rejected; completion saves a Knowledge Base draft and company memory", async () => {
  const r = await requestMarketResearch({ params: { country: "UAE", industry: "Fintech" }, userId: users.SUPER_ADMIN.id });
  assert.equal((await db.marketResearch.findUniqueOrThrow({ where: { id: r.id } })).status, "BLOCKED", "no AI provider → BLOCKED, not faked");
  assert.equal((await addFinding(r.id, { section: "opportunity", statement: "The UAE fintech market grows 25% a year.", label: "INFERENCE" })).ok, false);
  assert.equal((await addFinding(r.id, { section: "opportunity", statement: "The UAE fintech market grows 25% a year.", label: "SOURCE", sourceUrl: "http://insecure.example" })).ok, false);
  assert.equal((await addFinding(r.id, { section: "opportunity", statement: "The UAE fintech market grows 25% a year.", label: "SOURCE", sourceUrl: "https://example.com/report" })).ok, true);
  assert.equal((await addFinding(r.id, { section: "positioning", statement: "Lead with compliance-ready custody integrations.", label: "RECOMMENDATION" })).ok, true);
  const done = await completeResearch(r.id, "Compliance-led positioning is recommended for UAE fintech buyers.", users.SUPER_ADMIN.id);
  assert.ok(done.ok);
  const kb = await db.knowledgeArticle.findUniqueOrThrow({ where: { id: done.articleId! } });
  assert.equal(kb.status, "DRAFT");
  assert.match(kb.body, /https:\/\/example.com\/report/);
  assert.ok(await db.aIEmployeeMemory.findFirst({ where: { scope: "COMPANY", title: { contains: "Market research" } } }));
});

test("memory scopes: department and region memory reach only that department/region; secrets are redacted", async () => {
  await saveMemory({ agentSlug: "cmo", kind: "PREFERENCE", scope: "DEPARTMENT", scopeKey: "marketing", title: `Brand voice ${RUN}`, content: "Plain, confident English." });
  await saveMemory({ agentSlug: "cro", kind: "PREFERENCE", scope: "DEPARTMENT", scopeKey: "sales", title: `Discount rule ${RUN}`, content: "Max 10% without CFO." });
  await saveMemory({ agentSlug: "region-mena", kind: "KNOWLEDGE", scope: "REGION", scopeKey: "mena", title: `Ramadan hours ${RUN}`, content: "Shorter working hours." });
  await saveMemory({ agentSlug: "sdr", kind: "PREFERENCE", title: `Private ${RUN}`, content: "api_key=sk-live-abcdefghijklmnopqrstuvwxyz0123 and password: hunter2" });
  const social = await memoryPrompt("social-manager");
  assert.match(social, new RegExp(`Brand voice ${RUN}`));
  assert.doesNotMatch(social, new RegExp(`Discount rule ${RUN}`));
  assert.doesNotMatch(social, new RegExp(`Ramadan hours ${RUN}`));
  assert.doesNotMatch(social, new RegExp(`Private ${RUN}`));
  assert.match(await memoryPrompt("region-mena"), new RegExp(`Ramadan hours ${RUN}`));
  const priv = await db.aIEmployeeMemory.findFirstOrThrow({ where: { title: `Private ${RUN}` } });
  assert.doesNotMatch(priv.content, /sk-live|hunter2/);
});

test("vault: encrypted at rest, whitelisted names only, environment wins, removal works", async () => {
  const prev = process.env.APP_ENCRYPTION_KEY;
  process.env.APP_ENCRYPTION_KEY = "k".repeat(40);
  delete process.env.HUNTER_API_KEY;
  await storeSecret("HUNTER_API_KEY", "hunter", "vault-hunter-key-1234", users.SUPER_ADMIN.id);
  const row = await db.integrationSecret.findUniqueOrThrow({ where: { name: "HUNTER_API_KEY" } });
  assert.doesNotMatch(row.valueEncrypted, /vault-hunter-key/);
  assert.equal(row.hint, "••••1234");
  assert.equal(secretValue("HUNTER_API_KEY"), "vault-hunter-key-1234");
  process.env.HUNTER_API_KEY = "env-wins";
  assert.equal(secretValue("HUNTER_API_KEY"), "env-wins");
  delete process.env.HUNTER_API_KEY;
  await assert.rejects(storeSecret("DATABASE_URL", "x", "postgres://evil", users.SUPER_ADMIN.id), /cannot be stored/);
  await removeSecrets(["HUNTER_API_KEY"]);
  assert.equal(secretValue("HUNTER_API_KEY"), "");
  if (prev === undefined) delete process.env.APP_ENCRYPTION_KEY;
  else process.env.APP_ENCRYPTION_KEY = prev;
  await hydrateVault(true);
});

test("governance: strict approval mode turns an AUTONOMOUS employee's change into an approval request", async () => {
  const lead = await db.lead.create({ data: { ref: `CO-${RUN}`, name: `Company Lead ${RUN}`, email: `co-${RUN}@example.com`, priority: "LOW", status: "NEW" } });
  await db.aIAgent.update({ where: { slug: "sales" }, data: { mode: "AUTONOMOUS" } });
  const agent = await db.aIAgent.findUniqueOrThrow({ where: { slug: "sales" }, select: { id: true } });
  await db.aIAgentTool.updateMany({ where: { agentId: agent.id, tool: "createLeadActivity" }, data: { autonomousAllowed: true } });
  await saveCompanyProfile({ ...DEFAULT_PROFILE, dailyDelegationLimit: 5000, strictApprovals: true });
  const r = await runAgent({ agentSlug: "sales", request: "Add a note", user: users.SUPER_ADMIN, provider: scripted([() => ["createLeadActivity", { leadId: lead.id, note: "Strict mode note" }]]) });
  assert.equal(r.status, "AWAITING_APPROVAL");
  assert.equal(await db.leadNote.count({ where: { leadId: lead.id } }) + (await db.leadActivity.count({ where: { leadId: lead.id, type: "NOTE" } })), 0, "nothing executed");
  await saveCompanyProfile({ ...DEFAULT_PROFILE, dailyDelegationLimit: 5000 });
  await db.aIAgent.update({ where: { slug: "sales" }, data: { mode: "ASSIST" } });
});

test("budget governance: a department's monthly AI limit blocks further runs of its employees", async () => {
  await db.aIDepartment.update({ where: { key: "finance" }, data: { monthlyCostLimit: "0.0001" } });
  await db.aIUsage.create({ data: { agentSlug: "cfo", provider: "test", model: "claude-opus-5", inputTokens: 1, outputTokens: 1, costUsd: "0.01" } });
  const r = await runAgent({ agentSlug: "billing-specialist", request: "Invoices?", user: users.SUPER_ADMIN, provider: scripted([]) });
  assert.equal(r.status, "BLOCKED");
  assert.match(r.error ?? "", /Finance department's monthly AI budget/);
  await db.aIDepartment.update({ where: { key: "finance" }, data: { monthlyCostLimit: null } });
});

test("company pump: escalates high-severity insights to the responsible executive exactly once", async () => {
  await db.aIRecommendation.create({ data: { agentSlug: "finance", type: "overdue_invoice", title: `Invoice overdue ${RUN}`, severity: "HIGH", dedupeKey: `test-${RUN}`, permission: "finance:view" } });
  await pumpCompany();
  await pumpCompany();
  const msgs = await db.aIWorkMessage.findMany({ where: { subject: `Invoice overdue ${RUN}` } });
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].toSlug, "cfo");
});

test("analytics are computed from real rows only", async () => {
  await db.lead.create({ data: { ref: `RG-${RUN}`, name: "Region Lead", email: `rg-${RUN}@example.com`, country: "UAE", priority: "LOW", status: "NEW" } });
  const r = await regionalPerformance(1, { deals: false });
  assert.ok(r.rows.find((x) => x.key === "mena")!.leads >= 1);
  const perf = await workforcePerformance(1);
  assert.equal(perf.length, ALL_AGENTS.length);
  assert.ok(perf.find((p) => p.slug === "sales-director")!.done >= 1, "the delegated review counts");
  assert.ok(await processDueTasks(1) >= 0);
});

test("Phase 29 scenario: “100 qualified international leads per day” runs end to end through the AI company to a CEO report", async () => {
  const statement = `Build a plan to generate 100 qualified international leads per day ${RUN}-s29`;
  const { id } = await createObjective({ statement, userId: users.SUPER_ADMIN.id });
  const o = await db.aIObjective.findUniqueOrThrow({ where: { id } });
  const tasks = await db.aITask.findMany({ where: { objectiveId: id } });
  const by = (slug: string) => tasks.find((t) => t.agentSlug === slug)!;
  const research = await db.marketResearch.findFirstOrThrow({ where: { objectiveId: id } });
  await db.campaign.update({ where: { id: o.campaignId! }, data: { leadGen: { sources: ["apollo"], titles: ["CTO"], countries: ["United States", "India"], industries: ["fintech"], mode: "MANUAL", minFit: 60 } } });

  // 1–7: market research and ICP (sourced findings, Knowledge Base draft).
  assert.equal(await executeTask(by("intel-director").id, { provider: scripted([
    () => ["recordMarketFinding", { researchId: research.id, section: "icp", statement: "Fintech CTOs in the US and India are the target buyers.", label: "RECOMMENDATION" }],
    () => ["recordMarketFinding", { researchId: research.id, section: "opportunity", statement: "Existing fintech clients are the strongest segment in our CRM.", label: "FACT", sourceUrl: "/admin/reports/deals" }],
    () => ["completeMarketResearch", { researchId: research.id, summary: "Target fintech CTOs in the US and India with a compliance-led offer." }],
    () => ["completeTask", { summary: "ICP defined: fintech CTOs, US and India." }],
  ]) }), "DONE");
  assert.equal((await db.marketResearch.findUniqueOrThrow({ where: { id: research.id } })).status, "COMPLETED");
  // 8: offer strategy.
  assert.equal(await executeTask(by("cmo").id, { provider: scripted([() => ["completeTask", { summary: "Offer: compliance-ready payments integration sprint." }]]) }), "DONE");
  // 9–15: campaign, provider selection, discovery, enrichment, verification, dedupe, qualification — via the approval policy.
  process.env.APOLLO_API_KEY = "test-apollo";
  process.env.HUNTER_API_KEY = "test-hunter";
  apolloPeople = [
    { name: "Priya S", title: "CTO", country: "India", email: `priya.${RUN}@pay.example`, organization: { name: "Pay In", primary_domain: "pay-in.example", industry: "Fintech" } },
    { name: "Sam T", title: "CTO", country: "United States", email: `sam.${RUN}@pay.example`, organization: { name: "Pay US", primary_domain: "pay-us.example", industry: "Fintech" } },
  ];
  const lg = by("leadgen-director");
  assert.equal(await executeTask(lg.id, { provider: scripted([() => ["runLeadPipeline", { campaignId: o.campaignId, maxDiscover: 25 }], () => ["completeTask", { summary: "Pipeline run requested (approval)." }]]) }), "AWAITING_APPROVAL");
  assert.equal(await db.prospect.count({ where: { campaignId: o.campaignId! } }), 0, "nothing runs before a person approves");
  const approval = await db.aIApproval.findFirstOrThrow({ where: { taskId: lg.id, tool: "runLeadPipeline" } });
  const { decideApproval } = await import("../../lib/ai/approvals");
  await decideApproval(approval.id, users.SUPER_ADMIN, { decision: "APPROVE" });
  assert.equal((await db.aITask.findUniqueOrThrow({ where: { id: lg.id } })).status, "DONE");
  assert.equal(await db.prospect.count({ where: { campaignId: o.campaignId!, status: "RESEARCHED" } }), 2, "two verified, on-ICP prospects qualified");
  // 16–17: SDR outreach preparation (drafts only; sending needs approval), supporting content.
  assert.equal(await executeTask(by("sdr").id, { provider: scripted([() => ["draftEmail", { subject: "Compliance-ready payments", body: "Hi Priya, …" }], () => ["completeTask", { summary: "2 outreach drafts prepared." }]]) }), "DONE");
  assert.equal(await executeTask(by("content-manager").id, { provider: scripted([() => ["draftContentAsset", { kind: "ARTICLE", title: `Compliance-ready payments ${RUN}`, body: "Draft article." }], () => ["completeTask", { summary: "Article drafted for review." }]]) }), "DONE");
  assert.ok(await db.contentAsset.findFirst({ where: { title: `Compliance-ready payments ${RUN}`, status: "IN_REVIEW" } }), "content waits for review, not published");
  // Social: platform drafts into the approval queue (never published here).
  assert.equal(await executeTask(by("social-manager").id, { provider: scripted([() => ["getSocialPerformance", {}], () => ["draftSocialPost", { platform: "LINKEDIN", body: `Compliance-ready payments for fintech teams ${RUN}` }], () => ["completeTask", { summary: "1 LinkedIn draft queued for approval." }]]) }), "DONE");
  assert.ok(await db.socialPost.findFirst({ where: { body: { contains: `Compliance-ready payments for fintech teams ${RUN}` }, status: { not: "PUBLISHED" } } }), "social post is a draft awaiting approval");
  // Paid media: no ad account CONNECTED → the blocker is reported and nothing is created or spent.
  const adsBefore = await db.adCampaign.count();
  assert.equal(await executeTask(by("campaign-manager").id, { provider: scripted([
    () => ["getAdCampaigns", {}],
    (prev) => {
      const text = typeof prev[0] === "string" ? prev[0] : JSON.stringify(prev[0]);
      assert.equal((text.match(/"status":"NOT_CONNECTED"/g) ?? []).length, 3, `ad accounts reported honestly: ${text.slice(0, 300)}`);
      assert.doesNotMatch(text, /"CONNECTED"/);
      return ["reportBlocker", { reason: "No ad account CONNECTED (Meta Ads, Google Ads, LinkedIn Ads) — no paid media planned." }];
    },
    () => ["completeTask", { summary: "Blocked: no ad account connected; no spend planned." }],
  ]) }), "DONE");
  assert.equal(await db.adCampaign.count(), adsBefore, "no ad campaign created");
  assert.ok(await db.aIWorkMessage.findFirst({ where: { objectiveId: id, kind: "BLOCKER", body: { contains: "No ad account CONNECTED" } } }), "blocker reached the manager");
  // 22–23: analytics and optimisation from real funnel data.
  assert.equal(await executeTask(by("revenue-analyst").id, { provider: scripted([() => ["getLeadGenFunnel", { campaignId: o.campaignId }], () => ["completeTask", { summary: "2 discovered, 2 qualified; bottleneck: replies not yet tracked." }]]) }), "DONE");
  assert.equal(await executeTask(by("growth-director").id, { provider: scripted([() => ["getLeadGenFunnel", { campaignId: o.campaignId }], () => ["getSocialPerformance", {}], () => ["getAdCampaigns", {}], () => ["completeTask", { summary: "Next: raise daily discovery; connect an ad account before any paid test." }]]) }), "DONE");
  // 24: the Chief of Staff reviews every result and reports to the CEO.
  const root = await db.aITask.findUniqueOrThrow({ where: { id: o.rootTaskId! } });
  assert.equal(root.status, "QUEUED", "Chief of Staff resumes once all delegated work is back");
  const children = await db.aITask.findMany({ where: { parentTaskId: root.id } });
  assert.equal(await executeTask(root.id, { provider: scripted([...children.map((c) => (() => ["reviewDelegatedWork", { taskId: c.id, decision: "accept" }]) as Step), () => ["getObjectiveStatus", { objectiveId: id }], () => ["completeTask", { summary: "Plan executed; 2 qualified prospects so far against a 100/day target." }]], "CEO report: 2 qualified prospects (target 100/day — not met yet). Outreach drafts await approval.") }), "DONE");
  const done = await db.aIObjective.findUniqueOrThrow({ where: { id } });
  assert.equal(done.status, "COMPLETED");
  assert.match(done.result ?? "", /target 100\/day — not met yet/, "the report states actuals against the target");
  const timeline = await db.aIActivity.count({ where: { objectiveId: id } });
  assert.ok(timeline >= 20, `a traceable execution timeline (${timeline} events)`);
  delete process.env.APOLLO_API_KEY;
  delete process.env.HUNTER_API_KEY;
});

test("delegation never exceeds the human requester's authority", async () => {
  assert.ok(users.FINANCE_MANAGER, "QA finance user exists");
  const o = await db.aIObjective.create({ data: { title: `Authority ${RUN}`, statement: `Authority ${RUN}`, status: "ACTIVE", createdById: users.FINANCE_MANAGER.id } });
  // Finance Manager may direct the Chief Customer Officer (clients:view) but not the Support employee (support:view).
  const t = await createEmployeeTask({ agentSlug: "cco", title: `Authority ${RUN}`, requestedById: users.FINANCE_MANAGER.id, objectiveId: o.id });
  await executeTask(t.id, { provider: scripted([
    () => ["delegateTask", { assignee: "support", title: `Tickets ${RUN}`, instructions: "x" }],
    () => ["delegateTask", { assignee: "account-manager", title: `Accounts ${RUN}`, instructions: "x" }],
  ]) });
  assert.equal(await db.aITask.count({ where: { title: `Tickets ${RUN}` } }), 0, "outside the requester's permissions: refused");
  assert.equal(await db.aITask.count({ where: { title: `Accounts ${RUN}` } }), 1, "within the requester's permissions: delegated");
});

test("runaway protection: the company-wide daily delegation limit is enforced", async () => {
  const o = await objectiveShell("Daily limit");
  const today = await db.aITask.count({ where: { delegatedBySlug: { not: null }, createdAt: { gte: new Date(new Date().toISOString().slice(0, 10)) } } });
  await saveCompanyProfile({ ...DEFAULT_PROFILE, dailyDelegationLimit: Math.max(1, today) });
  const t = await createEmployeeTask({ agentSlug: "cmo", title: `Limit ${RUN}`, requestedById: users.SUPER_ADMIN.id, objectiveId: o.id });
  await executeTask(t.id, { provider: scripted([() => ["delegateTask", { assignee: "content-manager", title: `Over limit ${RUN}`, instructions: "x" }]]) });
  assert.equal(await db.aITask.count({ where: { title: `Over limit ${RUN}` } }), 0);
  await saveCompanyProfile({ ...DEFAULT_PROFILE, dailyDelegationLimit: 5000 });
});
