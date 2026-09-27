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
  // The rest of the spec: critical lead example, instant actions, approvals, genuine background work, voice phrasing
  ["total leads batao", "INSTANT_READ"],
  ["total number of leads kitni hai abhi", "INSTANT_READ"],
  ["active deals kitne hain?", "INSTANT_READ"],
  ["unpaid invoices kitne hain?", "INSTANT_READ"],
  ["open support tickets kitne hain?", "INSTANT_READ"],
  ["How many hot leads?", "INSTANT_READ"],
  ["How many contacts?", "INSTANT_READ"],
  ["How many leads came from the website today?", "INSTANT_READ"],
  ["How many active clients?", "INSTANT_READ"],
  ["Show existing research on company X.", "INSTANT_READ"],
  ["What is our refund policy?", "INSTANT_READ"],
  ["How many leads came in over the last 12 months?", "INSTANT_READ"],
  ["Show me 500 leads", "INSTANT_READ"],
  ["How many are from US?", "INSTANT_READ"],
  ["Show them.", "INSTANT_READ"],
  ["Sarah, total leads kitni hain?", "INSTANT_READ"],
  ["Sarah, Acme ka proposal status kya hai?", "INSTANT_READ"],
  ["Mark this task complete.", "INSTANT_ACTION", { hasContext: true }],
  ["Update the project status to on hold", "INSTANT_ACTION"],
  ["Add this contact.", "INSTANT_ACTION"],
  ["Create a CRM reminder.", "INSTANT_ACTION"],
  ["Assign them to Sarah.", "INSTANT_ACTION"],
  ["Send proposal to client.", "APPROVAL_REQUIRED"],
  ["Send external email to the prospect", "APPROVAL_REQUIRED"],
  ["Issue refund.", "APPROVAL_REQUIRED"],
  ["Make payment to the vendor", "APPROVAL_REQUIRED"],
  ["Research 500 US fintech companies.", "BACKGROUND_TASK"],
  ["Find 1,000 qualified prospects and enrich them.", "BACKGROUND_TASK"],
  ["Analyze all customer conversations from the last 12 months.", "BACKGROUND_TASK"],
  ["Prepare 100 personalized proposals.", "BACKGROUND_TASK"],
  ["Research competitors across 20 countries.", "BACKGROUND_TASK"],
  ["Run this every morning.", "BACKGROUND_TASK"],
  ["Monitor high-intent visitors.", "BACKGROUND_TASK"],
  ["Process this large dataset.", "BACKGROUND_TASK"],
  ["research 500 US fintech companies and create qualified leads", "BACKGROUND_TASK"],
  ["Sarah, 500 US fintech companies research karo.", "BACKGROUND_TASK"],
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
      assert.match(r.text, new RegExp(`Abhi total ${expected} leads hain`));
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
    // The Customer Success employee has the ticket tool, but a Sales Manager lacks support:view: user ∩ employee.
    const r = await executeRequest({ user: users.SALES_MANAGER, text: "Open tickets kitne hain?", channel: "chat", agentSlug: "customer-success", provider: null });
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

  test("test matrix: every AI employee answers a simple read immediately and AI Tasks do not increase", async () => {
    const before = await db.aITask.count();
    const MATRIX: [string, string, RegExp][] = [
      ["ceo", "How many active deals?", /active deals? in the pipeline/],
      ["sales", "How many leads?", /leads? in total/],
      ["sdr", "How many hot leads?", /hot leads? open/],
      ["crm", "How many contacts?", /client contacts? on record/],
      ["proposal", "How many proposals are pending?", /proposals? pending/],
      ["marketing", "How many leads came from the website today?", /came from the website today/],
      ["project", "How many active projects?", /active projects?/],
      ["customer-success", "How many active clients?", /active clients?/],
      ["support", "How many open tickets?", /support tickets? open/],
      ["finance", "How many unpaid invoices?", /invoices? unpaid/],
      ["research", "Show existing research on company X.", /./],
      ["knowledge", "What is our refund policy?", /./],
    ];
    for (const [agentSlug, text, re] of MATRIX) {
      const t0 = Date.now();
      const r = await executeRequest({ user: users.SUPER_ADMIN, text, channel: "chat", agentSlug, provider: null });
      assert.equal(r.cls, "INSTANT_READ", `${agentSlug}: ${text}`);
      assert.notEqual(r.status, "QUEUED", `${agentSlug}: ${text}`);
      assert.equal(r.taskId, undefined);
      assert.match(r.text, re, `${agentSlug}: ${r.text}`);
      assert.ok(Date.now() - t0 < 5000, `${agentSlug} answered in ${Date.now() - t0}ms`);
    }
    const v = await executeRequest({ user: users.SUPER_ADMIN, text: "How many leads do we have?", channel: "voice", agentSlug: "sales", language: "en", provider: null });
    assert.equal(v.status, "SUCCEEDED");
    assert.match(v.spoken, /leads? in total/);
    assert.equal(await db.aITask.count(), before, "AI Tasks count did not increase");
  });

  test("follow-ups use the conversation: how many are from US, show them", async () => {
    const tag = Date.now().toString(36);
    await db.lead.createMany({ data: [0, 1].map((n) => ({ ref: `US-${tag}-${n}`, name: `US Lead ${tag} ${n}`, email: `us-${tag}-${n}@example.com`, country: "US", status: "NEW" as const })) });
    const us = await db.lead.count({ where: { archivedAt: null, country: { in: ["US", "USA", "United States"], mode: "insensitive" } } });
    const a = await executeRequest({ user: users.SUPER_ADMIN, text: "How many leads?", channel: "chat", agentSlug: "sales", provider: null });
    const b = await executeRequest({ user: users.SUPER_ADMIN, text: "How many are from US?", channel: "chat", agentSlug: "sales", conversationId: a.conversationId, provider: null });
    assert.equal(b.cls, "INSTANT_READ");
    assert.match(b.text, new RegExp(`^${us} leads from US`));
    const c = await executeRequest({ user: users.SUPER_ADMIN, text: "Show them.", channel: "chat", agentSlug: "sales", conversationId: a.conversationId, provider: null });
    assert.match(c.text, new RegExp(`US-${tag}-`));
  });

  test("an employee only answers from its own tools; auto-routing hands the question to the right colleague", async () => {
    const r = await executeRequest({ user: users.SUPER_ADMIN, text: "How many leads?", channel: "chat", agentSlug: "support", provider: null });
    assert.match(r.text, /outside what the Support Agent can see/);
    const auto = await executeRequest({ user: users.SUPER_ADMIN, text: "How many contacts?", channel: "chat", agentSlug: null, provider: null });
    assert.equal(auto.agent, "crm");
    assert.match(auto.text, /client contacts?/);
  });

  test("genuine long work still creates an AI Task", async () => {
    const before = await db.aITask.count();
    const r = await executeRequest({ user: users.SUPER_ADMIN, text: "research 500 US fintech companies and create qualified leads", channel: "chat", agentSlug: "sdr", provider: null });
    assert.equal(r.cls, "BACKGROUND_TASK");
    assert.ok(r.taskId);
    assert.equal(await db.aITask.count(), before + 1);
    const v = await executeRequest({ user: users.SUPER_ADMIN, text: "Sarah, 500 US fintech companies research karo.", channel: "voice", agentSlug: "sdr", language: "hinglish", provider: null });
    assert.equal(v.cls, "BACKGROUND_TASK");
    assert.ok(v.taskId);
  });

  test("an instant action moves a deal stage now; customer email still goes to the Approval Center", async () => {
    const deal = await db.deal.create({ data: { number: `RT-D-${Date.now().toString(36)}`, name: "Router Deal", stage: "PROPOSAL", value: 1000, currency: "USD" } });
    const script = (tool: string, input: unknown) => ({
      name: "scripted-test",
      async run(i: import("../../lib/ai/provider").AIRunInput) {
        await i.beforeCall();
        const out = await i.executeTool(tool, input);
        return { text: out.content, stop: "completed" as const, model: "test", iterations: 1 };
      },
    });
    const r = await executeRequest({ user: users.SUPER_ADMIN, text: "Move this deal to negotiation", channel: "chat", agentSlug: "sales", context: { entity: "Deal", id: deal.id }, provider: script("updateDealStage", { dealId: deal.id, stage: "NEGOTIATION" }) });
    assert.equal(r.cls, "INSTANT_ACTION");
    assert.equal(r.actions[0]?.status, "EXECUTED", r.text);
    assert.equal((await db.deal.findUniqueOrThrow({ where: { id: deal.id } })).stage, "NEGOTIATION");

    const lead = await db.lead.findFirstOrThrow({ where: { archivedAt: null } });
    const e = await executeRequest({ user: users.SUPER_ADMIN, text: "Send a follow-up email to this lead", channel: "chat", agentSlug: "sales", context: { entity: "Lead", id: lead.id }, provider: script("sendEmail", { to: lead.email, subject: "Following up", body: "Hello", leadId: lead.id }) });
    assert.equal(e.cls, "APPROVAL_REQUIRED");
    assert.equal(e.actions[0]?.status, "PENDING_APPROVAL", e.text);
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
