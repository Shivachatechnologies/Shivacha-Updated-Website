/**
 * AI Workforce integration tests against the TEST database (refuses any other database).
 * A scripted provider stands in for the model so the real policy engine, tools, approvals, cost metering and audit
 * trail are exercised deterministically:
 *
 *   DATABASE_URL=postgresql://…/shivacha_test npx tsx --conditions=react-server --test tests/os/ai.test.ts
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../../lib/db/client";
import type { SessionUser } from "../../lib/auth/session";
import type { RoleName } from "../../lib/auth/permissions";
import type { AIProvider, AIRunInput } from "../../lib/ai/provider";
import { routeRequest, runAgent, SYSTEM_USER } from "../../lib/ai/runner";
import { canDecide, decideApproval } from "../../lib/ai/approvals";
import { ensureAgents } from "../../lib/ai/agents";
import { generateInsights } from "../../lib/ai/insights";
import { generateBriefing } from "../../lib/ai/briefing";
import { AGENTS } from "../../lib/ai/catalog";
import { getTool, toolSchema } from "../../lib/ai/tools";

if (!/shivacha_test/.test(process.env.DATABASE_URL ?? "")) throw new Error("AI integration tests only run against the shivacha_test database.");

/** Stand-in model: runs a fixed list of tool calls (each may depend on earlier results), then answers. */
function scripted(steps: ((prev: unknown[]) => [string, unknown])[], answer = "Done."): AIProvider {
  return {
    name: "scripted-test",
    async run(i: AIRunInput) {
      const results: unknown[] = [];
      for (const step of steps) {
        await i.beforeCall();
        await i.onUsage({ model: "claude-opus-5", inputTokens: 1000, outputTokens: 200, costUsd: 0.01 });
        const [name, input] = step(results);
        const out = await i.executeTool(name, input);
        results.push(out.isError ? { error: out.content } : JSON.parse(out.content.startsWith("{") || out.content.startsWith("[") ? out.content : JSON.stringify(out.content)));
      }
      return { text: answer, stop: "completed" as const, model: "claude-opus-5", iterations: steps.length + 1 };
    },
  };
}

const users: Record<string, SessionUser> = {};
let leadId = "";
const RUN = Date.now().toString(36);

before(async () => {
  for (const u of await db.user.findMany({ where: { email: { endsWith: "@shivacha.test" } }, select: { id: true, email: true, name: true, role: true } })) users[u.role] = { ...u, role: u.role as RoleName };
  assert.ok(users.SUPER_ADMIN && users.SALES_MANAGER && users.CONTENT_MANAGER && users.FINANCE_MANAGER, "QA users exist");
  await ensureAgents();
  await db.aIAgent.updateMany({ data: { mode: "ASSIST", enabled: true } });
  const lead = await db.lead.create({ data: { ref: `AI-${RUN}`, name: `AI Test Lead ${RUN}`, email: `ai-${RUN}@example.com`, company: "AI Test Co", priority: "LOW", status: "NEW" } });
  leadId = lead.id;
});

after(async () => {
  await db.aIAgent.updateMany({ data: { mode: "ASSIST" } });
  await db.aIAgentTool.updateMany({ data: { autonomousAllowed: false } });
  delete process.env.MAX_DAILY_AI_COST;
});

test("every catalogue tool exists and produces a valid JSON schema", () => {
  for (const a of AGENTS)
    for (const t of a.tools) {
      const tool = getTool(t);
      assert.ok(tool, `${a.slug}: ${t} exists`);
      assert.equal(toolSchema(tool!).type, "object", `${t} schema is an object`);
    }
});

test("orchestrator routes by explicit agent, record context, keywords and permissions", () => {
  assert.equal(routeRequest("@finance overdue invoices", users.SUPER_ADMIN)?.slug, "finance");
  assert.equal(routeRequest("summarise it", users.SUPER_ADMIN, { entity: "Ticket", id: "x" })?.slug, "support");
  assert.equal(routeRequest("which invoices are overdue?", users.SUPER_ADMIN)?.slug, "finance");
  assert.equal(routeRequest("show my pipeline", users.SALES_MANAGER)?.slug, "sales");
  // A sales manager cannot be routed to the finance agent, even explicitly.
  assert.notEqual(routeRequest("@finance overdue invoices", users.SALES_MANAGER)?.slug, "finance");
  // Content managers cannot reach CRM agents.
  assert.notEqual(routeRequest("show my leads", users.CONTENT_MANAGER)?.slug, "sales");
});

test("critical path: ask → agent → authorised tool → real data → approval → human approves → executes → audit", async () => {
  const provider = scripted([
    () => ["searchLeads", { q: `AI Test Lead ${RUN}`, limit: 5 }],
    (prev) => {
      const found = (prev[0] as { leads: { id: string }[] }).leads[0];
      return ["updateLead", { leadId: found.id, priority: "HIGH", reason: "High-fit enterprise requirement" }];
    },
  ]);
  const r = await runAgent({ agentSlug: null, request: "Prioritise the AI test lead", user: users.SALES_MANAGER, provider });
  assert.equal(r.agent, "sales");
  assert.equal(r.status, "AWAITING_APPROVAL");
  assert.deepEqual(r.toolsUsed, ["searchLeads", "updateLead"]);
  const approvalId = r.actions[0]?.approvalId;
  assert.ok(approvalId, "approval created");

  const lead0 = await db.lead.findUniqueOrThrow({ where: { id: leadId } });
  assert.equal(lead0.priority, "LOW", "nothing changes before approval");

  const exec = await db.aIExecution.findUniqueOrThrow({ where: { id: r.executionId! } });
  assert.ok((exec.recordsAccessed as string[]).includes(`Lead:${leadId}`), "records accessed are logged");
  assert.equal(Number(exec.costUsd).toFixed(2), "0.02", "cost metered");
  assert.equal(await db.aIUsage.count({ where: { executionId: exec.id } }), 2);

  const approval = await db.aIApproval.findUniqueOrThrow({ where: { id: approvalId! } });
  assert.equal(approval.status, "PENDING");
  assert.equal(approval.requiredPermission, "leads:edit");
  assert.ok(!canDecide(users.CONTENT_MANAGER, approval.requiredPermission), "content manager cannot decide");
  await assert.rejects(decideApproval(approvalId!, users.CONTENT_MANAGER, { decision: "APPROVE" }), /permission/);

  const d = await decideApproval(approvalId!, users.SALES_MANAGER, { decision: "APPROVE", note: "ok" });
  assert.equal(d.status, "EXECUTED");
  const lead1 = await db.lead.findUniqueOrThrow({ where: { id: leadId } });
  assert.equal(lead1.priority, "HIGH", "action executed after approval");
  assert.equal((await db.aIApproval.findUniqueOrThrow({ where: { id: approvalId! } })).status, "EXECUTED");
  assert.equal((await db.aIExecution.findUniqueOrThrow({ where: { id: exec.id } })).status, "SUCCEEDED", "execution settles once nothing is pending");
  assert.ok(await db.auditLog.findFirst({ where: { action: "ai.execute", entityId: exec.id } }), "execution audited");
  assert.ok(await db.auditLog.findFirst({ where: { action: "ai.approval.executed", entityId: approvalId!, userId: users.SALES_MANAGER.id } }), "approval audited with the approver");
  assert.ok(await db.leadActivity.findFirst({ where: { leadId, type: "UPDATED" } }), "lead timeline records the change");

  await assert.rejects(decideApproval(approvalId!, users.SUPER_ADMIN, { decision: "APPROVE" }), /already executed/, "cannot run twice");
});

test("edit & approve re-validates input and rejects invalid edits", async () => {
  const provider = scripted([() => ["createFollowUp", { leadId, dueAt: new Date(Date.now() + 86400_000).toISOString(), note: "Call about scope" }]]);
  const r = await runAgent({ agentSlug: "crm", request: "schedule a follow-up", user: users.SALES_MANAGER, provider });
  const id = r.actions[0].approvalId!;
  await assert.rejects(decideApproval(id, users.SALES_MANAGER, { decision: "APPROVE", editedInput: { leadId, dueAt: "not a date" } }), /invalid/i);
  assert.equal((await db.aIApproval.findUniqueOrThrow({ where: { id } })).status, "PENDING", "invalid edit leaves it pending");
  const due = new Date(Date.now() + 2 * 86400_000).toISOString();
  await decideApproval(id, users.SALES_MANAGER, { decision: "APPROVE", editedInput: { leadId, dueAt: due, note: "Edited note" } });
  const f = await db.followUp.findFirst({ where: { leadId, note: "Edited note" } });
  assert.ok(f, "edited input was executed");
  assert.ok(await db.auditLog.findFirst({ where: { action: "ai.approval.edited_and_executed", entityId: id } }));
});

test("reject leaves data unchanged", async () => {
  const provider = scripted([() => ["updateLead", { leadId, status: "LOST" }]]);
  const r = await runAgent({ agentSlug: "sales", request: "close it", user: users.SALES_MANAGER, provider });
  await decideApproval(r.actions[0].approvalId!, users.SALES_MANAGER, { decision: "REJECT", note: "Not lost" });
  assert.notEqual((await db.lead.findUniqueOrThrow({ where: { id: leadId } })).status, "LOST");
});

test("unauthorised users cannot use restricted agents or tools", async () => {
  const blocked = await runAgent({ agentSlug: "sales", request: "list leads", user: users.CONTENT_MANAGER, provider: scripted([]) });
  assert.equal(blocked.status, "BLOCKED");
  assert.equal(blocked.executionId, null);
  const ceo = await runAgent({ agentSlug: "ceo", request: "brief me", user: users.FINANCE_MANAGER, provider: scripted([]) });
  assert.equal(ceo.status, "BLOCKED", "finance manager lacks executive:view");

  // Sales manager may use the customer-success agent, but its invoice tool needs finance:view.
  const r = await runAgent({ agentSlug: "customer-success", request: "invoices?", user: users.SALES_MANAGER, provider: scripted([() => ["searchInvoices", { overdue: true }]]) });
  const exec = await db.aIExecution.findUniqueOrThrow({ where: { id: r.executionId! } });
  const used = exec.toolsUsed as { tool: string; ok: boolean; error?: string }[];
  assert.equal(used[0].ok, false);
  assert.equal(used[0].error, "permission denied");
  assert.ok(await db.auditLog.findFirst({ where: { action: "ai.tool.denied", entityId: exec.id } }));

  // Tools outside the agent's list are refused even for a Super Admin.
  const r2 = await runAgent({ agentSlug: "knowledge", request: "x", user: users.SUPER_ADMIN, provider: scripted([() => ["updateLead", { leadId, status: "LOST" }]]) });
  assert.equal(r2.actions.length, 0);
  assert.equal(await db.aIApproval.count({ where: { executionId: r2.executionId! } }), 0);
});

test("OBSERVE mode never proposes or executes changes", async () => {
  await db.aIAgent.update({ where: { slug: "crm" }, data: { mode: "OBSERVE" } });
  const r = await runAgent({ agentSlug: "crm", request: "note", user: users.SUPER_ADMIN, provider: scripted([() => ["createLeadActivity", { leadId, note: "observe" }]]) });
  assert.equal(r.actions[0].status, "BLOCKED");
  assert.equal(await db.aIApproval.count({ where: { executionId: r.executionId! } }), 0);
  assert.equal(await db.leadNote.count({ where: { leadId, body: { contains: "observe" } } }), 0);
  await db.aIAgent.update({ where: { slug: "crm" }, data: { mode: "ASSIST" } });
});

test("AUTONOMOUS runs only pre-approved low-risk tools; customer email always needs approval", async () => {
  const agent = await db.aIAgent.update({ where: { slug: "sales" }, data: { mode: "AUTONOMOUS" } });
  await db.aIAgentTool.update({ where: { agentId_tool: { agentId: agent.id, tool: "createLeadActivity" } }, data: { autonomousAllowed: true } });
  await db.aIAgentTool.update({ where: { agentId_tool: { agentId: agent.id, tool: "sendEmail" } }, data: { autonomousAllowed: true } });
  const r = await runAgent({
    agentSlug: "sales",
    request: "log and email",
    user: users.SALES_MANAGER,
    provider: scripted([() => ["createLeadActivity", { leadId, note: `autonomous ${RUN}` }], () => ["sendEmail", { to: `ai-${RUN}@example.com`, subject: "Hello", body: "Hi", leadId }], () => ["updateLead", { leadId, priority: "URGENT" }]]),
  });
  assert.deepEqual(r.actions.map((a) => a.status), ["EXECUTED", "PENDING_APPROVAL", "PENDING_APPROVAL"]);
  assert.equal(await db.leadNote.count({ where: { leadId, body: { contains: `autonomous ${RUN}` } } }), 1);

  // System (automation) runs never act autonomously.
  const s = await runAgent({ agentSlug: "sales", request: "log", user: SYSTEM_USER, trigger: "AUTOMATION", provider: scripted([() => ["createLeadActivity", { leadId, note: "system run" }]]) });
  assert.equal(s.actions[0].status, "PENDING_APPROVAL");
  assert.equal((await db.aIApproval.findUniqueOrThrow({ where: { id: s.actions[0].approvalId! } })).requestedById, null);
  await db.aIAgent.update({ where: { slug: "sales" }, data: { mode: "ASSIST" } });
});

test("automation-created email approval executes honestly when email is not connected", async () => {
  const a = await db.aIApproval.create({ data: { agentSlug: "automation", action: "SEND_EMAIL", tool: "sendEmail", input: { to: `ai-${RUN}@example.com`, subject: "Welcome", body: "Hello", leadId, clientId: null }, risk: "MEDIUM", requiredPermission: "communication:send" } });
  const mailConfigured = !!(process.env.SMTP_USER || process.env.GMAIL_OAUTH_REFRESH_TOKEN);
  if (mailConfigured) return;
  await assert.rejects(decideApproval(a.id, users.SALES_MANAGER, { decision: "APPROVE" }), /not (connected|configured)/i);
  assert.equal((await db.aIApproval.findUniqueOrThrow({ where: { id: a.id } })).status, "FAILED");
  const c = await db.communication.findFirst({ where: { leadId, subject: "Welcome" }, orderBy: { createdAt: "desc" } });
  assert.equal(c?.status, "FAILED", "failed send is recorded, never reported as sent");
});

test("no provider: agents return live data only, clearly labelled", async () => {
  const r = await runAgent({ agentSlug: "crm", request: "data quality", user: users.SUPER_ADMIN, provider: null });
  assert.equal(r.provider, "none");
  assert.match(r.text, /AI provider not connected/);
  assert.ok(r.toolsUsed.includes("findDuplicates"));
});

test("daily budget blocks further model calls", async () => {
  process.env.MAX_DAILY_AI_COST = "0";
  const r = await runAgent({ agentSlug: "sales", request: "anything", user: users.SALES_MANAGER, provider: scripted([() => ["searchLeads", {}]]) });
  assert.equal(r.status, "BLOCKED");
  assert.match(r.text, /budget/i);
  delete process.env.MAX_DAILY_AI_COST;
});

test("insights are idempotent and briefing is generated from live data", async () => {
  const a = await generateInsights();
  const b = await generateInsights();
  assert.equal(a, b);
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  assert.equal(await generateBriefing({ force: true }), 1);
  const latest = await db.aIExecution.findFirst({ where: { agentSlug: "ceo", trigger: "SCHEDULE" }, orderBy: { startedAt: "desc" } });
  assert.match((latest!.result as { text: string }).text, /Daily CEO briefing/);
  assert.match((latest!.result as { text: string }).text, /AI provider not connected/);
  if (saved) process.env.ANTHROPIC_API_KEY = saved;
});
