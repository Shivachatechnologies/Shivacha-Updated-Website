/**
 * AI Workforce Control Center and Emergency Kill Switch tests against the TEST database (refuses any other database).
 * They prove the switches are enforced on the server: the router, runner, provider calls, tools, autonomous actions,
 * background tasks, approvals and voice all consult the stored state, whatever the browser shows.
 *
 *   DATABASE_URL=postgresql://…/shivacha_test npm run test:control
 */
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../../lib/db/client";
import type { SessionUser } from "../../lib/auth/session";
import type { RoleName } from "../../lib/auth/permissions";
import type { AIProvider, AIRunInput } from "../../lib/ai/provider";
import { runAgent } from "../../lib/ai/runner";
import { executeRequest } from "../../lib/ai/router";
import { decideApproval } from "../../lib/ai/approvals";
import { ensureAgents } from "../../lib/ai/agents";
import { ensureEmployees } from "../../lib/ai/workforce/employees";
import { createEmployeeTask, executeTask, processDueTasks } from "../../lib/ai/workforce/engine";
import { startVoiceSession } from "../../lib/voice/session";
import { CONTROL_ID, checkAIWorkforcePermission, workforceHalted } from "../../lib/ai/control";

if (!/shivacha_test/.test(process.env.DATABASE_URL ?? "")) throw new Error("Control Center tests only run against the shivacha_test database.");

/** Stand-in model that counts how often it is actually invoked, so "blocked before the provider call" is provable. */
function counting(steps: [string, unknown][] = [], answer = "Done.", between?: (i: number) => Promise<void>) {
  const calls = { run: 0, model: 0 };
  const provider: AIProvider = {
    name: "scripted-test",
    async run(i: AIRunInput) {
      calls.run++;
      for (let n = 0; n < steps.length; n++) {
        await i.beforeCall();
        calls.model++;
        await i.onUsage({ model: "test", inputTokens: 100, outputTokens: 20, costUsd: 0.01 });
        await i.executeTool(steps[n][0], steps[n][1]);
        await between?.(n);
      }
      await i.beforeCall();
      calls.model++;
      return { text: answer, stop: "completed" as const, model: "test", iterations: steps.length + 1 };
    },
  };
  return { provider, calls };
}

const users: Record<string, SessionUser> = {};
const RUN = Date.now().toString(36);
let leadId = "";

const setConfig = (data: Record<string, unknown>) => db.aIWorkforceConfig.upsert({ where: { id: CONTROL_ID }, update: data, create: { id: CONTROL_ID, ...data } });
const RESET = { enabled: true, paused: false, emergencyStop: false, emergencyReason: null, emergencyById: null, emergencyAt: null, autonomousEnabled: true, backgroundTasksEnabled: true, voiceEnabled: true, externalActionsEnabled: true, dailyBudget: null };
const AGENT_RESET = { enabled: true, mode: "ASSIST" as const, autonomousAllowed: true, backgroundTasksAllowed: true, voiceAllowed: true, dailyCostLimit: null };

before(async () => {
  for (const u of await db.user.findMany({ where: { email: { endsWith: "@shivacha.test" } }, select: { id: true, email: true, name: true, role: true } })) users[u.role] = { ...u, role: u.role as RoleName };
  assert.ok(users.SUPER_ADMIN && users.SALES_MANAGER, "QA users exist");
  await ensureAgents();
  await ensureEmployees();
  const lead = await db.lead.create({ data: { ref: `CC-${RUN}`, name: `Control Lead ${RUN}`, email: `cc-${RUN}@example.com`, priority: "LOW", status: "NEW" } });
  leadId = lead.id;
});

beforeEach(async () => {
  await setConfig(RESET);
  await db.aIAgent.updateMany({ data: AGENT_RESET });
});

after(async () => {
  await setConfig(RESET);
  await db.aIAgent.updateMany({ data: AGENT_RESET });
  await db.aIAgentTool.updateMany({ data: { autonomousAllowed: false } });
});

test("with no stored row everything is allowed (defaults)", async () => {
  await db.aIWorkforceConfig.deleteMany({ where: { id: CONTROL_ID } });
  assert.deepEqual(await checkAIWorkforcePermission({ kind: "execute", agentSlug: "sales" }), { ok: true });
  assert.equal(await workforceHalted(), false);
});

test("emergency stop blocks runAgent before any execution row or provider call", async () => {
  await setConfig({ emergencyStop: true, emergencyReason: "test", emergencyById: users.SUPER_ADMIN.id, emergencyAt: new Date() });
  const execs = await db.aIExecution.count();
  const { provider, calls } = counting();
  const r = await runAgent({ agentSlug: "sales", request: "Summarise my pipeline", user: users.SALES_MANAGER, provider });
  assert.equal(r.status, "BLOCKED");
  assert.equal(r.control, "EMERGENCY_STOP");
  assert.equal(calls.run, 0, "provider never invoked");
  assert.equal(await db.aIExecution.count(), execs, "no execution row");
  assert.ok(await db.auditLog.findFirst({ where: { action: "ai.control.blocked", entityId: "sales", createdAt: { gte: new Date(Date.now() - 60_000) } } }), "block is audited");
});

test("emergency stop blocks the router, including instant database reads", async () => {
  await setConfig({ emergencyStop: true });
  const tasks = await db.aITask.count();
  for (const [text, channel] of [["Total leads kitni hain?", "chat"], ["Research 500 US fintech companies.", "instruction"], ["How many leads do we have?", "voice"]] as const) {
    const r = await executeRequest({ user: users.SUPER_ADMIN, text, channel, agentSlug: "sales", provider: null });
    assert.equal(r.status, "BLOCKED", text);
    assert.equal(r.control, "EMERGENCY_STOP", text);
    assert.equal(r.taskId, undefined);
  }
  assert.equal(await db.aITask.count(), tasks, "nothing queued");
});

test("emergency stop blocks background task creation and the task queue", async () => {
  await setConfig({ emergencyStop: true });
  await assert.rejects(createEmployeeTask({ agentSlug: "sales", title: `blocked ${RUN}`, requestedById: users.SUPER_ADMIN.id }), /emergency stop/i);
  assert.equal(await workforceHalted(), true);
  assert.equal(await processDueTasks(), 0);
});

test("emergency stop blocks voice sessions", async () => {
  await setConfig({ emergencyStop: true });
  await assert.rejects(startVoiceSession(users.SUPER_ADMIN, { agentSlug: "sales", language: "en-IN", provider: "browser", context: null }), /emergency stop/i);
});

test("emergency stop blocks executing an already-pending approval; the request stays pending", async () => {
  const a = await db.aIApproval.create({ data: { agentSlug: "sales", action: "CREATE_NOTE", tool: "createLeadActivity", input: { leadId, note: `approved ${RUN}` }, risk: "LOW", requiredPermission: "leads:edit" } });
  await setConfig({ emergencyStop: true });
  await assert.rejects(decideApproval(a.id, users.SUPER_ADMIN, { decision: "APPROVE" }), /still pending/);
  assert.equal((await db.aIApproval.findUniqueOrThrow({ where: { id: a.id } })).status, "PENDING");
  // Rejecting is always allowed: it runs nothing.
  await decideApproval(a.id, users.SUPER_ADMIN, { decision: "REJECT" });
});

test("emergency stop activated mid-run stops the next model call", async () => {
  const { provider, calls } = counting([["createLeadActivity", { leadId, note: `mid-run ${RUN}` }], ["createLeadActivity", { leadId, note: `never ${RUN}` }]], "Done.", async (n) => {
    if (n === 0) await setConfig({ emergencyStop: true });
  });
  const r = await runAgent({ agentSlug: "sales", request: "log two notes", user: users.SALES_MANAGER, provider });
  assert.equal(r.status, "BLOCKED");
  assert.equal(r.control, "EMERGENCY_STOP");
  assert.equal(calls.model, 1, "only the call before the stop happened");
  assert.equal(await db.leadNote.count({ where: { leadId, body: { contains: `never ${RUN}` } } }), 0);
});

test("workforce OFF and PAUSED block execution; resume restores it", async () => {
  for (const [data, code] of [[{ enabled: false }, "WORKFORCE_OFF"], [{ paused: true }, "PAUSED"]] as const) {
    await setConfig({ ...RESET, ...data });
    const { provider, calls } = counting();
    const r = await runAgent({ agentSlug: "sales", request: "hello", user: users.SALES_MANAGER, provider });
    assert.equal(r.control, code);
    assert.equal(calls.run, 0);
  }
  await setConfig(RESET);
  const { provider, calls } = counting();
  const r = await runAgent({ agentSlug: "sales", request: "hello", user: users.SALES_MANAGER, provider });
  assert.equal(r.status, "SUCCEEDED", r.text);
  assert.equal(calls.run, 1);
});

test("pause holds a queued task instead of failing it; it runs after resume", async () => {
  const t = await createEmployeeTask({ agentSlug: "sales", title: `held ${RUN}`, instructions: "Summarise", requestedById: users.SUPER_ADMIN.id, runAfter: new Date(Date.now() + 3600_000) });
  await db.aITask.update({ where: { id: t.id }, data: { runAfter: new Date(Date.now() - 1000) } });
  await setConfig({ paused: true });
  assert.equal(await executeTask(t.id, { provider: counting().provider }), "SKIPPED");
  const held = await db.aITask.findUniqueOrThrow({ where: { id: t.id } });
  assert.equal(held.status, "QUEUED");
  assert.match(held.currentStep ?? "", /^On hold/);
  await setConfig(RESET);
  assert.notEqual(await executeTask(t.id, { provider: counting().provider }), "SKIPPED");
  assert.notEqual((await db.aITask.findUniqueOrThrow({ where: { id: t.id } })).status, "QUEUED");
});

test("a disabled employee is blocked everywhere", async () => {
  await db.aIAgent.update({ where: { slug: "sales" }, data: { enabled: false } });
  assert.equal((await checkAIWorkforcePermission({ kind: "execute", agentSlug: "sales" })).ok, false);
  const r = await executeRequest({ user: users.SUPER_ADMIN, text: "Total leads kitni hain?", channel: "chat", agentSlug: "sales", provider: null });
  assert.equal(r.status, "BLOCKED");
  await assert.rejects(createEmployeeTask({ agentSlug: "sales", title: `disabled ${RUN}` }), /disabled/i);
  await assert.rejects(startVoiceSession(users.SUPER_ADMIN, { agentSlug: "sales", language: "en-IN", provider: "browser", context: null }), /disabled/i);
  // Other employees keep working.
  assert.equal((await checkAIWorkforcePermission({ kind: "execute", agentSlug: "crm" })).ok, true);
});

test("autonomous disabled (globally or per employee) turns an autonomous action into an approval", async () => {
  const agent = await db.aIAgent.update({ where: { slug: "sales" }, data: { mode: "AUTONOMOUS" } });
  await db.aIAgentTool.update({ where: { agentId_tool: { agentId: agent.id, tool: "createLeadActivity" } }, data: { autonomousAllowed: true } });
  const run = async () => (await runAgent({ agentSlug: "sales", request: "log", user: users.SALES_MANAGER, provider: counting([["createLeadActivity", { leadId, note: `auto ${RUN}` }]]).provider })).actions[0]?.status;
  assert.equal(await run(), "EXECUTED", "baseline: autonomous runs");
  await setConfig({ autonomousEnabled: false });
  assert.equal(await run(), "PENDING_APPROVAL");
  await setConfig(RESET);
  await db.aIAgent.update({ where: { slug: "sales" }, data: { autonomousAllowed: false } });
  assert.equal(await run(), "PENDING_APPROVAL");
});

test("external actions disabled refuses customer email (no approval) and blocks approving one", async () => {
  await setConfig({ externalActionsEnabled: false });
  const approvals = await db.aIApproval.count();
  const r = await runAgent({ agentSlug: "sales", request: "email", user: users.SALES_MANAGER, provider: counting([["sendEmail", { to: `cc-${RUN}@example.com`, subject: "Hi", body: "Hello", leadId }]]).provider });
  assert.equal(r.status, "SUCCEEDED", r.text);
  assert.equal(r.actions.length, 0);
  assert.equal(await db.aIApproval.count(), approvals, "no approval created for a blocked external action");
  // Internal tools still work.
  const note = await runAgent({ agentSlug: "sales", request: "note", user: users.SALES_MANAGER, provider: counting([["createLeadActivity", { leadId, note: `internal ${RUN}` }]]).provider });
  assert.equal(note.actions[0]?.status, "PENDING_APPROVAL");

  const a = await db.aIApproval.create({ data: { agentSlug: "sales", action: "SEND_EMAIL", tool: "sendEmail", input: { to: `cc-${RUN}@example.com`, subject: "Hi", body: "Hello", leadId, clientId: null }, risk: "MEDIUM", requiredPermission: "communication:send" } });
  await assert.rejects(decideApproval(a.id, users.SUPER_ADMIN, { decision: "APPROVE" }), /External actions/);
  assert.equal((await db.aIApproval.findUniqueOrThrow({ where: { id: a.id } })).status, "PENDING");
});

test("background tasks disabled blocks new tasks; chat still works", async () => {
  await setConfig({ backgroundTasksEnabled: false });
  await assert.rejects(createEmployeeTask({ agentSlug: "sales", title: `bg ${RUN}` }), /Background AI tasks/);
  const r = await executeRequest({ user: users.SUPER_ADMIN, text: "Research 500 US fintech companies.", channel: "instruction", agentSlug: "sdr", provider: null });
  assert.equal(r.taskId, undefined);
  assert.match(r.text, /Nothing was queued/);
  const read = await executeRequest({ user: users.SUPER_ADMIN, text: "Total leads kitni hain?", channel: "chat", agentSlug: "sales", provider: null });
  assert.equal(read.status, "SUCCEEDED");
  // Per employee as well.
  await setConfig(RESET);
  await db.aIAgent.update({ where: { slug: "sales" }, data: { backgroundTasksAllowed: false } });
  await assert.rejects(createEmployeeTask({ agentSlug: "sales", title: `bg2 ${RUN}` }), /Background AI tasks/);
});

test("voice disabled blocks voice (globally or per employee) but not chat", async () => {
  await setConfig({ voiceEnabled: false });
  await assert.rejects(startVoiceSession(users.SUPER_ADMIN, { agentSlug: "sales", language: "en-IN", provider: "browser", context: null }), /voice/i);
  const v = await executeRequest({ user: users.SUPER_ADMIN, text: "How many leads do we have?", channel: "voice", agentSlug: "sales", provider: null });
  assert.equal(v.control, "VOICE_DISABLED");
  const c = await executeRequest({ user: users.SUPER_ADMIN, text: "How many leads do we have?", channel: "chat", agentSlug: "sales", provider: null });
  assert.equal(c.status, "SUCCEEDED");
  await setConfig(RESET);
  await db.aIAgent.update({ where: { slug: "sales" }, data: { voiceAllowed: false } });
  assert.equal((await checkAIWorkforcePermission({ kind: "voice", agentSlug: "sales" })).ok, false);
  assert.equal((await checkAIWorkforcePermission({ kind: "voice", agentSlug: "crm" })).ok, true);
});

test("the global daily budget stops provider calls once reached", async () => {
  await runAgent({ agentSlug: "sales", request: "spend", user: users.SALES_MANAGER, provider: counting([["createLeadActivity", { leadId, note: `spend ${RUN}` }]]).provider });
  await setConfig({ dailyBudget: "0.0001" });
  const { provider, calls } = counting();
  const r = await runAgent({ agentSlug: "sales", request: "hello", user: users.SALES_MANAGER, provider });
  assert.equal(r.status, "BLOCKED");
  assert.equal(r.control, "BUDGET_EXCEEDED");
  assert.equal(calls.model, 0, "no model call made");
  await setConfig({ dailyBudget: "100000" });
  assert.equal((await runAgent({ agentSlug: "sales", request: "hello", user: users.SALES_MANAGER, provider: counting().provider })).status, "SUCCEEDED");
});
