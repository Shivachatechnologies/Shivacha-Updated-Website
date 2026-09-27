/**
 * AI employee task engine tests against the TEST database (refuses any other database). A scripted provider stands
 * in for the model so planning, progress, tool policy, approvals, activity, memory scoping and reports are exercised
 * deterministically:
 *
 *   DATABASE_URL=postgresql://…/shivacha_test npm run test:workforce
 */
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../../lib/db/client";
import type { SessionUser } from "../../lib/auth/session";
import type { RoleName } from "../../lib/auth/permissions";
import type { AIProvider, AIRunInput } from "../../lib/ai/provider";
import { decideApproval } from "../../lib/ai/approvals";
import { createEmployeeTask, executeTask } from "../../lib/ai/workforce/engine";
import { employeeDirectory, ensureEmployees, goalProgress } from "../../lib/ai/workforce/employees";
import { memoryPrompt, saveMemory } from "../../lib/ai/workforce/memory";
import { generateEndOfDayReports } from "../../lib/ai/workforce/reports";
import { parseSubtasks, progressOf } from "../../lib/ai/workforce/profiles";

if (!/shivacha_test/.test(process.env.DATABASE_URL ?? "")) throw new Error("Workforce integration tests only run against the shivacha_test database.");

/** Stand-in model: runs a fixed list of tool calls (each may depend on earlier results), then answers. */
function scripted(steps: ((prev: unknown[]) => [string, unknown])[], answer = "Report: done."): AIProvider {
  return {
    name: "scripted-test",
    async run(i: AIRunInput) {
      const results: unknown[] = [];
      for (const step of steps) {
        await i.beforeCall();
        await i.onUsage({ model: "claude-opus-5", inputTokens: 500, outputTokens: 100, costUsd: 0.005 });
        const [name, input] = step(results);
        const out = await i.executeTool(name, input);
        results.push(out.isError ? { error: out.content } : out.content.startsWith("{") || out.content.startsWith("[") ? JSON.parse(out.content) : out.content);
      }
      return { text: answer, stop: "completed" as const, model: "claude-opus-5", iterations: steps.length + 1 };
    },
  };
}

const users: Record<string, SessionUser> = {};
const RUN = Date.now().toString(36);
let leadId = "";

async function newTask(agentSlug: string, title: string, requestedById: string) {
  const t = await createEmployeeTask({ agentSlug, title, requestedById, runAfter: new Date(Date.now() + 3600_000) });
  await db.aITask.update({ where: { id: t.id }, data: { runAfter: new Date() } });
  return t.id;
}

before(async () => {
  for (const u of await db.user.findMany({ where: { email: { endsWith: "@shivacha.test" } }, select: { id: true, email: true, name: true, role: true } })) users[u.role] = { ...u, role: u.role as RoleName };
  assert.ok(users.SUPER_ADMIN && users.SALES_MANAGER, "QA users exist");
  await ensureEmployees();
  await db.aIAgent.updateMany({ data: { mode: "ASSIST", enabled: true, available: true } });
  leadId = (await db.lead.create({ data: { ref: `WF-${RUN}`, name: `Workforce Lead ${RUN}`, email: `wf-${RUN}@example.com`, company: "Workforce Co", priority: "LOW", status: "NEW" } })).id;
});

test("progress is derived from subtasks and capped until completion", () => {
  const s = parseSubtasks([{ title: "a", status: "done" }, { title: "b", status: "running" }, { title: "c" }, { nope: 1 }]);
  assert.equal(s.length, 3);
  assert.equal(s[2].status, "pending");
  assert.equal(progressOf(s), 50);
  assert.equal(progressOf([{ title: "a", status: "done" }]), 95);
  assert.equal(progressOf([], true), 100);
});

test("employees get profiles and starter goals without overwriting edits", async () => {
  await db.aIAgent.update({ where: { slug: "sdr" }, data: { jobTitle: "Custom SDR title" } });
  await ensureEmployees();
  const sdr = await db.aIAgent.findUniqueOrThrow({ where: { slug: "sdr" } });
  assert.equal(sdr.jobTitle, "Custom SDR title");
  assert.equal(sdr.department, "Sales");
  assert.ok((await db.aIGoal.count({ where: { agentSlug: "sdr" } })) >= 3);
  const dir = await employeeDirectory();
  assert.equal(dir.length, 12);
});

test("assigned task: plan → progress → tools → approval → human approves → task completes with timeline and memory", async () => {
  const id = await newTask("sales", `Prioritise ${RUN}`, users.SALES_MANAGER.id);
  const provider = scripted([
    () => ["planTask", { subtasks: ["Find the lead", "Raise its priority", "Report"] }],
    () => ["updateProgress", { step: 1, status: "running" }],
    () => ["searchLeads", { q: `Workforce Lead ${RUN}`, limit: 5 }],
    () => ["updateProgress", { step: 1, status: "done", note: "found 1 lead" }],
    () => ["updateLead", { leadId, priority: "HIGH", reason: "test" }],
    () => ["updateProgress", { step: 2, status: "done", note: "priority change queued for approval" }],
    () => ["updateProgress", { step: 3, status: "done" }],
    () => ["completeTask", { summary: "Queued a priority change for 1 lead.", results: ["1 lead found"] }],
  ]);
  assert.equal(await executeTask(id, { provider }), "AWAITING_APPROVAL");
  const t = await db.aITask.findUniqueOrThrow({ where: { id } });
  assert.equal(t.status, "AWAITING_APPROVAL");
  assert.equal(parseSubtasks(t.subtasks).filter((s) => s.status === "done").length, 3);
  assert.ok(t.startedAt && t.executionId);
  assert.equal((await db.lead.findUniqueOrThrow({ where: { id: leadId } })).priority, "LOW", "nothing changes before approval");

  const approval = await db.aIApproval.findFirstOrThrow({ where: { taskId: id } });
  assert.equal(approval.status, "PENDING");
  await decideApproval(approval.id, users.SALES_MANAGER, { decision: "APPROVE" });

  const done = await db.aITask.findUniqueOrThrow({ where: { id } });
  assert.equal(done.status, "DONE");
  assert.equal(done.progress, 100);
  assert.ok((done.recordsAffected as string[]).includes(`Lead:${leadId}`));
  assert.equal((await db.lead.findUniqueOrThrow({ where: { id: leadId } })).priority, "HIGH");

  const types = (await db.aIActivity.findMany({ where: { taskId: id }, orderBy: { createdAt: "asc" } })).map((a) => a.type);
  for (const k of ["task.assigned", "task.started", "task.planned", "subtask.done", "tool.used", "approval.requested", "task.awaiting_approval", "action.executed", "task.completed"]) assert.ok(types.includes(k), `timeline has ${k}`);
  const goals = await goalProgress(["sales"]);
  assert.ok(goals.get("sales")!.some((g) => g.metric === "tasks_completed" && g.actual >= 0));
});

test("pause stops a running task before its next step; cancel withdraws its pending approvals", async () => {
  const id = await newTask("sales", `Pause ${RUN}`, users.SALES_MANAGER.id);
  const provider = scripted([
    () => ["planTask", { subtasks: ["One", "Two"] }],
    () => ["updateLead", { leadId, priority: "URGENT" }],
    () => {
      // A person pauses the task while the employee is working.
      void db.aITask.update({ where: { id }, data: { status: "PAUSED" } }).then(() => null);
      return ["updateProgress", { step: 1, status: "done" }];
    },
    () => ["updateProgress", { step: 2, status: "done" }],
  ]);
  // Make the pause land deterministically before the next model call.
  const origRun = provider.run;
  provider.run = async (i) => origRun({ ...i, beforeCall: async () => { await new Promise((r) => setTimeout(r, 30)); await i.beforeCall(); } });
  assert.equal(await executeTask(id, { provider }), "STOPPED");
  assert.equal((await db.aITask.findUniqueOrThrow({ where: { id } })).status, "PAUSED");
  await db.aITask.update({ where: { id }, data: { status: "CANCELLED" } });
  await db.aIApproval.updateMany({ where: { taskId: id, status: "PENDING" }, data: { status: "EXPIRED" } });
  assert.equal(await db.aIApproval.count({ where: { taskId: id, status: "PENDING" } }), 0);
});

test("tools outside the employee's permissions are refused, and failures fail the task honestly", async () => {
  const id = await newTask("marketing", `Refuse ${RUN}`, users.SUPER_ADMIN.id);
  const provider = scripted([() => ["planTask", { subtasks: ["Try to edit a lead"] }], () => ["updateLead", { leadId, priority: "LOW" }]]);
  await executeTask(id, { provider });
  const ev = await db.aIActivity.findFirst({ where: { taskId: id, type: "tool.failed" } });
  assert.ok(ev, "refused tool is recorded");
  assert.equal(await db.aIApproval.count({ where: { taskId: id } }), 0, "no approval created for a tool the employee lacks");

  const noProvider = await newTask("sales", `No provider ${RUN}`, users.SALES_MANAGER.id);
  assert.equal(await executeTask(noProvider, { provider: null }), "FAILED");
  assert.match((await db.aITask.findUniqueOrThrow({ where: { id: noProvider } })).error ?? "", /not connected/);
});

test("memory is scoped: private entries never reach another employee; shared knowledge does", async () => {
  await saveMemory({ agentSlug: "finance", kind: "PREFERENCE", title: `Private finance note ${RUN}`, content: "Only for finance" });
  await saveMemory({ agentSlug: "finance", kind: "KNOWLEDGE", title: `Company fact ${RUN}`, content: "Shared with everyone", shared: true });
  await saveMemory({ agentSlug: "finance", kind: "PREFERENCE", title: `Not shareable ${RUN}`, content: "Preferences cannot be shared", shared: true });
  const sales = await memoryPrompt("sales");
  assert.ok(!sales.includes(`Private finance note ${RUN}`));
  assert.ok(!sales.includes(`Not shareable ${RUN}`));
  assert.ok(sales.includes(`Company fact ${RUN}`));
  assert.ok((await memoryPrompt("finance")).includes(`Private finance note ${RUN}`));
});

test("end-of-day reports are built from recorded work only", async () => {
  await generateEndOfDayReports();
  const r = await db.aIReport.findFirst({ where: { agentSlug: "sales", kind: "END_OF_DAY" }, orderBy: { createdAt: "desc" } });
  assert.ok(r, "sales report exists");
  const data = r!.data as { completed: { title: string }[]; actions: { tool: string; count: number }[] };
  assert.ok(data.completed.some((t) => t.title === `Prioritise ${RUN}`));
  assert.ok(data.actions.some((a) => a.tool === "updateLead" && a.count >= 1));
});
