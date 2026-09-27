/**
 * Global AI execution router tests.
 *
 * The classification cases are pure and always run. The routing cases need the TEST database (they refuse any other):
 *
 *   DATABASE_URL=postgresql://…/shivacha_test npm run test:router
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { classifyRequest, detectLanguage, type ExecutionClass } from "../../lib/ai/router/policy";

const CASES: [string, ExecutionClass, { hasContext?: boolean; explicitBackground?: boolean }?][] = [
  // INSTANT_READ: the reported bug and the spec's examples
  ["Total leads kitni hain?", "INSTANT_READ"],
  ["How many leads do we have?", "INSTANT_READ"],
  ["How many deals are active?", "INSTANT_READ"],
  ["Revenue kitna hai?", "INSTANT_READ"],
  ["How many invoices are unpaid?", "INSTANT_READ"],
  ["How many support tickets are open?", "INSTANT_READ"],
  ["How many website visitors are online?", "INSTANT_READ"],
  ["How many employees are present today?", "INSTANT_READ"],
  ["How many projects are active?", "INSTANT_READ"],
  ["How many tasks are overdue?", "INSTANT_READ"],
  ["How many proposals are pending?", "INSTANT_READ"],
  ["What's the status of Acme?", "INSTANT_READ"],
  ["Show today's leads.", "INSTANT_READ"],
  ["Show my pending tasks.", "INSTANT_READ"],
  ["कुल कितने लीड हैं?", "INSTANT_READ"],
  ["aaj kitne log present hain", "INSTANT_READ"],
  // A background toggle left on never turns a plain question into a task.
  ["Total leads kitni hain?", "INSTANT_READ", { explicitBackground: true }],
  // INSTANT_ACTION
  ["Add a note to this lead: client asked for a call on Monday", "INSTANT_ACTION", { hasContext: true }],
  ["Create a follow-up for tomorrow", "INSTANT_ACTION"],
  ["Assign this lead to John", "INSTANT_ACTION", { hasContext: true }],
  ["Move this deal to negotiation", "INSTANT_ACTION", { hasContext: true }],
  ["is lead ko Rahul ko assign kar do", "INSTANT_ACTION", { hasContext: true }],
  // CLARIFICATION_REQUIRED: "this lead" with nothing open
  ["Assign this lead to John", "CLARIFICATION_REQUIRED"],
  ["Move this deal to negotiation", "CLARIFICATION_REQUIRED"],
  ["hmm", "CLARIFICATION_REQUIRED"],
  // APPROVAL_REQUIRED
  ["Send the proposal email to the client", "APPROVAL_REQUIRED", { hasContext: true }],
  ["Delete lead LD-0042", "APPROVAL_REQUIRED"],
  ["Refund invoice INV-1001", "APPROVAL_REQUIRED"],
  // BACKGROUND_TASK
  ["Research all fintech leads from this week and score them", "BACKGROUND_TASK"],
  ["Prepare a report on our competitor landscape in Dubai", "BACKGROUND_TASK"],
  ["Follow up with every stale lead in the background", "BACKGROUND_TASK"],
  ["Create follow-ups for my leads", "BACKGROUND_TASK", { explicitBackground: true }],
];

describe("execution classification", () => {
  for (const [text, cls, opts] of CASES)
    test(`${cls}: ${text}${opts?.hasContext ? " (record open)" : ""}${opts?.explicitBackground ? " (background toggle on)" : ""}`, () => {
      assert.equal(classifyRequest(text, opts).cls, cls);
    });

  test("reply language follows the question", () => {
    assert.equal(detectLanguage("Total leads kitni hain?"), "hinglish");
    assert.equal(detectLanguage("कुल कितने लीड हैं?"), "hi");
    assert.equal(detectLanguage("How many leads do we have?"), "en");
  });
});

const DB = /shivacha_test/.test(process.env.DATABASE_URL ?? "");

describe("routing against the test database", { skip: !DB && "set DATABASE_URL to the shivacha_test database" }, () => {
  // Loaded lazily so the pure tests above run without a database.
  let executeRequest: typeof import("../../lib/ai/router").executeRequest;
  let db: typeof import("../../lib/db/client").db;
  type User = import("../../lib/auth/session").SessionUser;
  const users: Record<string, User> = {};

  before(async () => {
    ({ executeRequest } = await import("../../lib/ai/router"));
    ({ db } = await import("../../lib/db/client"));
    for (const u of await db.user.findMany({ where: { email: { endsWith: "@shivacha.test" } }, select: { id: true, email: true, name: true, role: true } })) users[u.role] = u as User;
    assert.ok(users.SUPER_ADMIN && users.SALES_MANAGER, "QA users exist");
    const { ensureEmployees } = await import("../../lib/ai/workforce/employees");
    await ensureEmployees();
    await db.aIAgent.updateMany({ data: { enabled: true, mode: "ASSIST" } });
  });

  test("'Total leads kitni hain?' answers instantly from the database and creates no task or approval", async () => {
    const tasks = await db.aITask.count();
    const approvals = await db.aIApproval.count();
    const expected = await db.lead.count({ where: { archivedAt: null } });
    for (const agentSlug of ["sales", "ceo", "crm", null]) {
      const r = await executeRequest({ user: users.SUPER_ADMIN, text: "Total leads kitni hain?", channel: "chat", agentSlug, provider: null });
      assert.equal(r.cls, "INSTANT_READ");
      assert.equal(r.status, "SUCCEEDED");
      assert.equal(r.taskId, undefined);
      assert.match(r.text, new RegExp(`Total ${expected} leads`));
      assert.ok(r.executionId, "the answer is recorded as an execution");
    }
    assert.equal(await db.aITask.count(), tasks, "no AI task created");
    assert.equal(await db.aIApproval.count(), approvals, "no approval created");
  });

  test("voice with the background toggle on still answers a plain question instantly", async () => {
    const tasks = await db.aITask.count();
    const r = await executeRequest({ user: users.SUPER_ADMIN, text: "How many support tickets are open?", channel: "voice", agentSlug: "support", explicitBackground: true, language: "en", provider: null });
    assert.equal(r.cls, "INSTANT_READ");
    assert.match(r.spoken, /support tickets? open/);
    assert.equal(await db.aITask.count(), tasks);
  });

  test("instant reads respect the asker's permissions", async () => {
    const r = await executeRequest({ user: users.SALES_MANAGER, text: "Revenue kitna hai?", channel: "chat", agentSlug: "sales", provider: null });
    assert.equal(r.cls, "INSTANT_READ");
    assert.match(r.text, /access nahi hai/);
  });

  test("a request about 'this lead' with nothing open asks which one", async () => {
    const r = await executeRequest({ user: users.SALES_MANAGER, text: "Assign this lead to John", channel: "chat", agentSlug: "sales", provider: null });
    assert.equal(r.cls, "CLARIFICATION_REQUIRED");
    assert.equal(r.status, "NEEDS_CLARIFICATION");
    assert.match(r.text, /Which lead/);
  });

  test("only long work becomes a background task", async () => {
    const r = await executeRequest({ user: users.SALES_MANAGER, text: "Research all fintech leads from this week and score them", channel: "instruction", agentSlug: "sales", provider: null });
    assert.equal(r.cls, "BACKGROUND_TASK");
    assert.ok(r.taskId);
    const t = await db.aITask.findUniqueOrThrow({ where: { id: r.taskId! } });
    assert.equal(t.kind, "INSTRUCTION");
  });

  test("an instant action runs a low-risk tool now instead of queuing it", async () => {
    const lead = await db.lead.create({ data: { ref: `RT-${Date.now().toString(36)}`, name: "Router Lead", email: `router-${Date.now()}@example.com`, priority: "LOW", status: "NEW" } });
    const provider = {
      name: "scripted-test",
      async run(i: import("../../lib/ai/provider").AIRunInput) {
        await i.beforeCall();
        const out = await i.executeTool("createLeadActivity", { leadId: lead.id, note: "Client asked for a call on Monday" });
        return { text: out.isError ? out.content : "Note added.", stop: "completed" as const, model: "test", iterations: 1 };
      },
    };
    const r = await executeRequest({ user: users.SALES_MANAGER, text: "Add a note to this lead: client asked for a call on Monday", channel: "chat", agentSlug: "sales", context: { entity: "Lead", id: lead.id }, provider });
    assert.equal(r.cls, "INSTANT_ACTION");
    assert.equal(r.status, "SUCCEEDED", r.text);
    assert.equal(r.actions[0]?.status, "EXECUTED");
    assert.equal(await db.aIApproval.count({ where: { executionId: r.executionId! } }), 0);
  });
});
