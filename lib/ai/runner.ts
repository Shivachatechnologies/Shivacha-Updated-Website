import "server-only";
import { db } from "@/lib/db/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { can, ROLE_LABELS, type Permission } from "@/lib/auth/permissions";
import type { SessionUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { isEnabled } from "@/lib/os/flags";
import { notify } from "@/lib/os/notify";
import { AGENTS, agentBySlug } from "./catalog";
import { canRunAgent, getAgentConfig, type AgentConfig, type AIModeName } from "./agents";
import { aiLimits, assertBudget, BudgetError } from "./cost";
import { DEFAULT_MODEL, getProvider, providerError, webSearchEnabled, type AIProvider, type AIToolOutcome } from "./provider";
import { getTool, toolPermissions, toolSchema, type ToolCtx, type ToolDef } from "./tools";

/**
 * The AI Workforce runtime: routes a request to an agent, runs its tool loop under the requesting user's permissions,
 * applies the OBSERVE / ASSIST / AUTONOMOUS policy to every mutation, meters cost and logs everything on AIExecution.
 */

export type Trigger = "USER" | "AUTOMATION" | "SCHEDULE" | "TASK";
export type EntityRef = { entity: "Lead" | "Deal" | "Project" | "Invoice" | "Ticket" | "Client"; id: string };

/** Identity for automation/scheduled work with no human requester: reads only, every change needs human approval. */
export const SYSTEM_USER: SessionUser = { id: "system", email: "system@shivacha.local", name: "Automation", role: "SUPER_ADMIN" };
const isSystem = (u: SessionUser) => u.id === SYSTEM_USER.id;

export interface RunInput {
  agentSlug?: string | null;
  request: string;
  user: SessionUser;
  trigger?: Trigger;
  context?: EntityRef | null;
  conversationId?: string | null;
  parentId?: string | null;
  /** Dependency injection for tests only; production always uses the configured provider. */
  provider?: AIProvider | null;
  /** AI employee task execution: links approvals to the task, adds task tools and reports every tool call. */
  task?: TaskHooks;
}

/** A tool that only touches the running task (plan, progress, memory). No data permissions are involved. */
export interface VirtualTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run: (input: unknown) => Promise<AIToolOutcome>;
}

export interface TaskHooks {
  taskId: string;
  /** Extra system instructions (task brief, procedure, scoped employee memory). */
  system: string;
  tools: VirtualTool[];
  /** Called after every real tool call. */
  onTool: (e: { tool: string; ok: boolean; ms: number; error?: string; action?: ProposedAction; records?: string[] }) => Promise<void>;
  /** Checked before every model call; a returned reason stops the run (task paused or cancelled). */
  shouldStop: () => Promise<string | null>;
  /** Tasks run longer tool loops than chat requests. */
  maxIterations?: number;
  requestTokens?: number;
}

class StopRequested extends Error {}

export interface ProposedAction {
  approvalId?: string;
  tool: string;
  summary: string;
  status: "PENDING_APPROVAL" | "BLOCKED" | "EXECUTED";
}

export interface RunOutput {
  executionId: string | null;
  agent: string;
  status: "SUCCEEDED" | "FAILED" | "AWAITING_APPROVAL" | "BLOCKED" | "CANCELLED";
  text: string;
  provider: string;
  drafts: { tool: string; draft: unknown }[];
  actions: ProposedAction[];
  toolsUsed: string[];
  conversationId: string | null;
  error?: string;
}

/* ───────────────────────── orchestrator (routing) ───────────────────────── */

const ROUTES: [string, RegExp][] = [
  ["proposal", /\bproposal|scope of work|sow\b|quotation draft/i],
  ["finance", /\binvoice|payment|revenue|overdue amount|outstanding|cash|refund|expense|collected/i],
  ["support", /\bticket|support|sla\b|complaint|bug report|helpdesk/i],
  ["project", /\bproject|milestone|task|deadline|delivery|blocker|scope creep|sprint/i],
  ["marketing", /\bcampaign|marketing|seo\b|utm|traffic|content|landing page|channel|source/i],
  ["crm", /\bduplicate|missing (info|data)|data gap|clean(up)?|stale lead|follow[- ]?ups? (overdue|due)|merge/i],
  ["sdr", /\boutreach|prospect|cold email|sequence|sdr\b/i],
  ["customer-success", /\bclient account|account (summary|health)|renewal|upsell|expansion|churn|customer success/i],
  ["research", /\bresearch|competitor|market size|industry trend|company background/i],
  ["knowledge", /\bknowledge|policy|how do (we|i)|documentation|playbook|faq\b/i],
  ["sales", /\blead|deal|pipeline|sales|qualif|follow[- ]?up|meeting brief|close/i],
  ["ceo", /\bbriefing|business|company|overview|summary|risks?|kpi|executive|today|this week/i],
];
const ENTITY_AGENT: Record<EntityRef["entity"], string> = { Lead: "sales", Deal: "sales", Project: "project", Invoice: "finance", Ticket: "support", Client: "customer-success" };

/** Picks the agent: explicit "@slug" prefix → entity context → keyword routes → CEO/first permitted agent. */
export function routeRequest(text: string, user: SessionUser, context?: EntityRef | null): { slug: string; request: string } | null {
  const permitted = (slug: string) => {
    const spec = agentBySlug(slug);
    return !!spec && canRunAgent(user.role, spec);
  };
  const m = text.match(/^@([a-z-]+)\s+([\s\S]+)$/i);
  if (m && permitted(m[1].toLowerCase())) return { slug: m[1].toLowerCase(), request: m[2].trim() };
  if (context && permitted(ENTITY_AGENT[context.entity])) return { slug: ENTITY_AGENT[context.entity], request: text };
  for (const [slug, re] of ROUTES) if (re.test(text) && permitted(slug)) return { slug, request: text };
  const fallback = ["ceo", "sales", "knowledge", ...AGENTS.map((a) => a.slug)].find(permitted);
  return fallback ? { slug: fallback, request: text } : null;
}

/* ───────────────────────── runner ───────────────────────── */

const MODE_RULES: Record<AIModeName, string> = {
  OBSERVE: "Mode OBSERVE: analyse and recommend only. Do not call tools that change data; describe the action you recommend instead.",
  ASSIST: "Mode ASSIST: you may call tools that change data or contact customers — each call becomes a request in the Human Approval Center and does NOT run until a person approves it. Tell the user what you queued for approval.",
  AUTONOMOUS: "Mode AUTONOMOUS: low-risk internal actions that an administrator pre-approved run immediately; everything else (including every customer email) goes to the Human Approval Center.",
};

function systemPrompt(cfg: AgentConfig, user: SessionUser, mode: AIModeName, context: EntityRef | null, memory: string | null) {
  return [
    `You are ${cfg.name} inside Shivacha OS, the operating system of Shivacha Technologies (enterprise Web3, fintech, digital-asset and AI software).`,
    cfg.spec.description,
    `Capabilities: ${cfg.spec.capabilities.join("; ")}.`,
    `Today is ${new Date().toISOString().slice(0, 10)} (UTC). You are working for ${isSystem(user) ? "an automated workflow" : `${user.name} (${ROLE_LABELS[user.role]})`}.`,
    "Ground every statement in tool results from the live database. Never invent numbers, names, records, prices, analytics or outcomes. If data is missing, say so plainly and suggest how to capture it.",
    "Label content clearly: FACT (from a record — cite the record link), AI INFERENCE (your reasoning), RECOMMENDATION (suggested action). Money is per currency; never convert or add different currencies together.",
    "If a tool reports a permission error, tell the user they lack access rather than working around it.",
    MODE_RULES[mode],
    "Keep answers concise and scannable: short headings or bullets, most important items first, include /admin links from tool results.",
    context ? `The user opened this from ${context.entity} ${context.id}. Load it with the matching get tool first.` : "",
    memory ? `Earlier AI note on this record (may be outdated — verify against live data):\n${memory}` : "",
    cfg.systemPrompt ? `Additional instructions from the administrator:\n${cfg.systemPrompt}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Read-only plan used when no AI provider is connected: shows real data, never simulated analysis. */
const FALLBACK: Record<string, [string, Record<string, unknown>][]> = {
  ceo: [["getBusinessSummary", {}], ["getInsights", { limit: 10 }]],
  sales: [["getPipelineSummary", {}], ["searchLeads", { staleDays: 7, limit: 10 }], ["searchDeals", { stalledDays: 21, limit: 10 }]],
  sdr: [["searchLeads", { status: "NEW", limit: 15 }]],
  crm: [["findDuplicates", { limit: 10 }], ["findDataGaps", { limit: 5 }], ["getOverdueFollowUps", { limit: 10 }]],
  proposal: [["searchDeals", { stage: "PROPOSAL", limit: 10 }]],
  marketing: [["getMarketingSummary", {}], ["searchCampaigns", { limit: 10 }]],
  project: [["searchProjects", { delayed: true, limit: 10 }]],
  "customer-success": [["searchClients", { status: "ACTIVE", limit: 10 }]],
  support: [["searchTickets", { slaBreached: true, limit: 10 }], ["searchTickets", { open: true, priority: "URGENT", limit: 10 }]],
  finance: [["getFinanceSummary", {}], ["searchInvoices", { overdue: true, limit: 10 }]],
  research: [],
  knowledge: [],
};
const ENTITY_TOOL: Record<EntityRef["entity"], string> = { Lead: "getLead", Deal: "getDeal", Project: "getProject", Invoice: "getInvoice", Ticket: "getTicket", Client: "getClient" };

const clip = (v: unknown, max = 14_000) => {
  const s = JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? Number(x) : x));
  return s.length > max ? `${s.slice(0, max)}…(truncated)` : s;
};
const json = (v: unknown) => JSON.parse(JSON.stringify(v ?? null)) as Prisma.InputJsonValue;

export async function runAgent(input: RunInput): Promise<RunOutput> {
  const user = input.user;
  const trigger = input.trigger ?? "USER";
  const context = input.context ?? null;
  const base = (agent: string, error: string, status: RunOutput["status"] = "BLOCKED"): RunOutput => ({ executionId: null, agent, status, text: error, provider: "none", drafts: [], actions: [], toolsUsed: [], conversationId: input.conversationId ?? null, error });

  if (!(await isEnabled("AI_WORKFORCE"))) return base(input.agentSlug ?? "-", "The AI workforce module is switched off.");
  if (!isSystem(user) && !can(user.role, "ai:execute")) return base(input.agentSlug ?? "-", "You do not have permission to run AI agents.");

  const routed = input.agentSlug ? { slug: input.agentSlug, request: input.request } : routeRequest(input.request, user, context);
  if (!routed) return base("-", "No AI agent is available for your role.");
  const cfg = await getAgentConfig(routed.slug);
  if (!cfg) return base(routed.slug, `Unknown agent "${routed.slug}".`);
  if (!isSystem(user) && !canRunAgent(user.role, cfg.spec)) return base(cfg.spec.slug, `You do not have permission to use the ${cfg.name}.`);
  if (!cfg.enabled) return base(cfg.spec.slug, `${cfg.name} is disabled by an administrator.`);

  // System (automation/scheduled) runs never act autonomously.
  const mode: AIModeName = isSystem(user) && cfg.mode === "AUTONOMOUS" ? "ASSIST" : cfg.mode;
  const provider = input.provider !== undefined ? input.provider : getProvider();
  const limits = aiLimits();
  const model = cfg.model || process.env.AI_MODEL || DEFAULT_MODEL;
  const started = Date.now();

  let conversationId = input.conversationId ?? null;
  if (!isSystem(user) && trigger === "USER") {
    const conv = conversationId ? await db.aIConversation.findFirst({ where: { id: conversationId, userId: user.id } }) : null;
    conversationId = conv?.id ?? (await db.aIConversation.create({ data: { userId: user.id, title: routed.request.slice(0, 120), expiresAt: new Date(Date.now() + 30 * 86400_000) } })).id;
  }

  const exec = await db.aIExecution.create({
    data: { agentSlug: cfg.spec.slug, userId: isSystem(user) ? null : user.id, parentId: input.parentId ?? null, conversationId, trigger, mode, request: routed.request.slice(0, 20_000), status: "RUNNING", provider: provider ? provider.name : "none", model: provider ? model : null },
  });

  const toolsUsed: { tool: string; ok: boolean; ms: number; error?: string }[] = [];
  const records = new Set<string>();
  const actions: ProposedAction[] = [];
  const drafts: { tool: string; draft: unknown }[] = [];
  let tokens = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let cost = 0;

  const ctx: ToolCtx = { user, agentSlug: cfg.spec.slug, executionId: exec.id };

  /** Policy gate for every tool call (model-driven or fallback). */
  const callTool = async (name: string, raw: unknown): Promise<AIToolOutcome> => {
    const t0 = Date.now();
    const virtual = input.task?.tools.find((v) => v.name === name);
    if (virtual) return virtual.run(raw ?? {});
    let lastAction: ProposedAction | undefined;
    let lastRecords: string[] | undefined;
    const done = async (ok: boolean, out: AIToolOutcome, error?: string) => {
      toolsUsed.push({ tool: name, ok, ms: Date.now() - t0, error });
      if (input.task) await input.task.onTool({ tool: name, ok, ms: Date.now() - t0, error, action: lastAction, records: lastRecords }).catch(() => null);
      return out;
    };
    const tool = getTool(name);
    if (!tool || !cfg.tools.has(name)) return done(false, { content: `Tool "${name}" is not available to this agent.`, isError: true }, "not allowed");
    const parsed = tool.input.safeParse(raw ?? {});
    if (!parsed.success) return done(false, { content: `Invalid input: ${parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ")}`.slice(0, 800), isError: true }, "invalid input");
    const needed = toolPermissions(tool, parsed.data);
    if (!isSystem(user) && !needed.every((p) => can(user.role, p))) {
      await audit({ userId: user.id, action: "ai.tool.denied", entity: "AIExecution", entityId: exec.id, metadata: { tool: name, needed } });
      return done(false, { content: `Permission denied: ${user.name} lacks ${needed.filter((p) => !can(user.role, p)).join(", ")}.`, isError: true }, "permission denied");
    }
    try {
      if (tool.kind === "read") {
        const r = await tool.run(ctx, parsed.data);
        r.records?.forEach((x) => records.add(x));
        lastRecords = r.records;
        return done(true, { content: clip(r.data) });
      }
      if (tool.kind === "draft") {
        const r = await tool.run(ctx, parsed.data);
        r.records?.forEach((x) => records.add(x));
        drafts.push({ tool: name, draft: parsed.data });
        return done(true, { content: "Draft recorded and shown to the user for review. It has not been sent or saved anywhere." });
      }
      // write
      const preview = tool.preview ? await tool.preview(parsed.data) : { summary: name, affected: [] };
      if (mode === "OBSERVE") {
        actions.push((lastAction = { tool: name, summary: preview.summary, status: "BLOCKED" }));
        return done(true, { content: "Not executed: this agent is in OBSERVE mode. Present it to the user as a recommendation." });
      }
      const autonomous = mode === "AUTONOMOUS" && !isSystem(user) && tool.risk === "LOW" && !tool.alwaysApprove && cfg.tools.get(name) === true && !cfg.approvalActions.includes(name);
      if (autonomous) {
        const r = await tool.run(ctx, parsed.data);
        r.records?.forEach((x) => records.add(x));
        lastRecords = r.records;
        actions.push((lastAction = { tool: name, summary: preview.summary, status: "EXECUTED" }));
        await audit({ userId: user.id, action: "ai.action.autonomous", entity: "AIExecution", entityId: exec.id, metadata: { tool: name, summary: preview.summary } });
        return done(true, { content: clip({ executed: true, result: r.data }) });
      }
      const approval = await createApproval({ executionId: exec.id, agentSlug: cfg.spec.slug, tool, input: parsed.data, preview, requestedById: isSystem(user) ? null : user.id, reason: `${cfg.name}: ${routed.request.slice(0, 400)}`, taskId: input.task?.taskId });
      actions.push((lastAction = { approvalId: approval.id, tool: name, summary: preview.summary, status: "PENDING_APPROVAL" }));
      return done(true, { content: `Queued for human approval (request ${approval.id}): ${preview.summary}. It will not run until approved.` });
    } catch (e) {
      return done(false, { content: `Tool error: ${(e as Error).message}`.slice(0, 500), isError: true }, (e as Error).message.slice(0, 200));
    }
  };

  let text = "";
  let status: RunOutput["status"] = "SUCCEEDED";
  let error: string | undefined;

  try {
    if (!provider) {
      const plan: [string, Record<string, unknown>][] = [...(context && cfg.tools.has(ENTITY_TOOL[context.entity]) ? [[ENTITY_TOOL[context.entity], { id: context.id }] as [string, Record<string, unknown>]] : []), ...(FALLBACK[cfg.spec.slug] ?? [])];
      if (cfg.spec.slug === "knowledge" || cfg.spec.slug === "research") plan.push(["searchKnowledge", { q: routed.request.slice(0, 120) }]);
      const sections: string[] = [];
      for (const [name, args] of plan.slice(0, 4)) {
        const out = await callTool(name, args);
        sections.push(`### ${name}\n${out.isError ? out.content : "```json\n" + JSON.stringify(JSON.parse(out.content.replace(/…\(truncated\)$/, "") || "null"), null, 2).slice(0, 6000) + "\n```"}`);
      }
      text = [`**AI provider not connected.** No AI analysis was generated. Below is the live data the ${cfg.name} would work from. Configure ANTHROPIC_API_KEY to enable AI reasoning.`, ...sections].join("\n\n");
    } else {
      await assertBudget(cfg.spec.slug, cfg.dailyCostLimit);
      const history = conversationId
        ? (await db.aIMessage.findMany({ where: { conversationId }, orderBy: { createdAt: "desc" }, take: 10, select: { role: true, content: true } })).reverse().filter((m) => m.role === "user" || m.role === "assistant").map((m) => ({ role: m.role as "user" | "assistant", content: m.content.slice(0, 4000) }))
        : [];
      const memory = context ? (await db.aIMemory.findFirst({ where: { scope: "entity", entity: context.entity, entityId: context.id, key: "last-summary", OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } }))?.value ?? null : null;
      const allowed: ToolDef[] = [...cfg.tools.keys()].map((n) => getTool(n)!).filter((t: ToolDef) => !(t.name === "webResearch" && webSearchEnabled())).filter((t) => isSystem(user) || t.permissions.every((p: Permission) => can(user.role, p)));
      const r = await provider.run({
        system: [systemPrompt(cfg, user, mode, context, memory), input.task?.system].filter(Boolean).join("\n\n"),
        history: history.filter((h, i, a) => i === 0 || h.role !== a[i - 1].role).filter((h, i) => !(i === 0 && h.role === "assistant")),
        prompt: routed.request,
        tools: [...allowed.map((t) => ({ name: t.name, description: t.description, inputSchema: toolSchema(t) })), ...(input.task?.tools ?? []).map((v) => ({ name: v.name, description: v.description, inputSchema: v.inputSchema }))],
        model,
        maxTokens: limits.callMaxTokens,
        maxIterations: input.task?.maxIterations ?? limits.maxIterations,
        webSearch: cfg.tools.has("webResearch") && webSearchEnabled(),
        executeTool: callTool,
        beforeCall: async () => {
          const stop = input.task ? await input.task.shouldStop() : null;
          if (stop) throw new StopRequested(stop);
          const tokenLimit = input.task?.requestTokens ?? limits.requestTokens;
          if (tokens >= tokenLimit) throw new BudgetError(`Request token limit reached (${tokenLimit.toLocaleString()} tokens).`);
          await assertBudget(cfg.spec.slug, cfg.dailyCostLimit);
        },
        onUsage: async (u) => {
          tokens += u.inputTokens + u.outputTokens;
          inputTokens += u.inputTokens;
          outputTokens += u.outputTokens;
          cost += u.costUsd;
          await db.aIUsage.create({ data: { executionId: exec.id, agentSlug: cfg.spec.slug, userId: isSystem(user) ? null : user.id, provider: provider.name, model: u.model, inputTokens: u.inputTokens, outputTokens: u.outputTokens, costUsd: u.costUsd.toFixed(6) } });
        },
      });
      text = r.text || "(No answer returned.)";
      if (r.stop === "refused") status = "FAILED";
      if (r.stop === "max_tokens" || r.stop === "max_iterations" || r.stop === "context_exceeded") text += `\n\n_Stopped early (${r.stop.replace("_", " ")}). Ask a narrower question for a complete answer._`;
      if (context && r.stop === "completed") {
        const where = { scope_userId_entity_entityId_key: { scope: "entity", userId: "", entity: context.entity, entityId: context.id, key: "last-summary" } };
        await db.aIMemory.upsert({ where, update: { value: text.slice(0, 2000), expiresAt: new Date(Date.now() + 30 * 86400_000) }, create: { ...where.scope_userId_entity_entityId_key, value: text.slice(0, 2000), expiresAt: new Date(Date.now() + 30 * 86400_000) } }).catch(() => null);
      }
    }
    if (status === "SUCCEEDED" && actions.some((a) => a.status === "PENDING_APPROVAL")) status = "AWAITING_APPROVAL";
  } catch (e) {
    status = e instanceof StopRequested ? "CANCELLED" : e instanceof BudgetError ? "BLOCKED" : "FAILED";
    error = e instanceof StopRequested || e instanceof BudgetError ? e.message : providerError(e);
    text = [text, error].filter(Boolean).join("\n\n");
    if (!(e instanceof BudgetError) && !(e instanceof StopRequested)) console.error("[ai] execution failed", exec.id, (e as Error)?.message);
  }

  await db.aIExecution.update({
    where: { id: exec.id },
    data: { status, toolsUsed: json(toolsUsed), recordsAccessed: json([...records].slice(0, 500)), actionsProposed: json(actions), actionsExecuted: json(actions.filter((a) => a.status === "EXECUTED")), result: json({ text: text.slice(0, 50_000), drafts }), error: error?.slice(0, 1000), inputTokens, outputTokens, costUsd: cost.toFixed(6), durationMs: Date.now() - started, finishedAt: new Date() },
  });
  if (conversationId) {
    await db.aIMessage.createMany({ data: [{ conversationId, role: "user", content: routed.request.slice(0, 20_000) }, { conversationId, role: "assistant", content: text.slice(0, 50_000), executionId: exec.id, data: json({ agent: cfg.spec.slug, drafts, actions }) }] });
    await db.aIConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
  }
  await audit({ userId: isSystem(user) ? null : user.id, action: "ai.execute", entity: "AIExecution", entityId: exec.id, metadata: { agent: cfg.spec.slug, trigger, mode, status, tools: toolsUsed.map((t) => t.tool), approvals: actions.filter((a) => a.approvalId).length } });

  return { executionId: exec.id, agent: cfg.spec.slug, status, text, provider: provider ? provider.name : "none", drafts, actions, toolsUsed: toolsUsed.map((t) => t.tool), conversationId, error };
}

/* ───────────────────────── approvals ───────────────────────── */

export async function createApproval(a: { executionId: string | null; agentSlug: string; tool: ToolDef; input: unknown; preview: { summary: string; affected: { entity: string; id: string }[]; content?: string; changes?: Record<string, unknown> }; requestedById: string | null; reason: string; taskId?: string | null }) {
  const perms = toolPermissions(a.tool, a.input);
  const approval = await db.aIApproval.create({
    data: {
      executionId: a.executionId,
      agentSlug: a.agentSlug,
      action: a.preview.summary.slice(0, 300),
      tool: a.tool.name,
      input: json(a.input),
      reason: a.reason,
      affectedRecords: json(a.preview.affected),
      proposedChanges: a.preview.changes ? json(a.preview.changes) : undefined,
      generatedContent: a.preview.content?.slice(0, 20_000),
      risk: a.tool.risk,
      requiredPermission: (perms.length ? perms : ["ai:approve"]).join(","),
      requestedById: a.requestedById,
      taskId: a.taskId ?? null,
      expiresAt: new Date(Date.now() + 7 * 86400_000),
    },
  });
  await notify({ type: "ai.approval", title: `Approval needed: ${a.preview.summary}`.slice(0, 200), body: `Requested by the ${agentBySlug(a.agentSlug)?.name ?? a.agentSlug}`, href: `/admin/ai/approvals/${approval.id}`, permission: "ai:approve" });
  return approval;
}
