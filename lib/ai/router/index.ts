import "server-only";
import { db } from "@/lib/db/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { can } from "@/lib/auth/permissions";
import type { SessionUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { isEnabled } from "@/lib/os/flags";
import { growthStop } from "@/lib/growth/settings";
import { agentBySlug } from "../catalog";
import { canRunAgent, getAgentConfig } from "../agents";
import { routeRequest, runAgent, type EntityRef, type ProposedAction, type RunOutput } from "../runner";
import { createEmployeeTask } from "../workforce/engine";
import { ensureEmployees } from "../workforce/employees";
import { instantAnswer, ownerOf, type Call } from "./instant";
import { classifyRequest, type Classification, type ExecutionClass, type ReplyLanguage } from "./policy";

export { classifyRequest, EXECUTION_CLASS_LABELS, EXECUTION_CLASSES, type ExecutionClass } from "./policy";

/**
 * GLOBAL AI EXECUTION ROUTER. Every human request to any AI employee (chat, voice, Assign Instruction, future
 * channels and custom agents) enters here, is classified once by the shared policy, and is then handed to the
 * existing system: instant reads answer from live data, actions run through the controlled tools, risky actions go
 * to the Human Approval Center, and only genuinely long work becomes an AI Task.
 */

export type RequestChannel = "chat" | "voice" | "instruction" | "api";

export interface RouteInput {
  user: SessionUser;
  text: string;
  channel: RequestChannel;
  /** Omit (or null) to let the orchestrator pick the employee. */
  agentSlug?: string | null;
  context?: EntityRef | null;
  conversationId?: string | null;
  channelHint?: string;
  /** A UI toggle asking for background work. A plain read is still answered instantly. */
  explicitBackground?: boolean;
  /** Forces the reply language (voice sessions know it); otherwise it is detected from the text. */
  language?: ReplyLanguage;
  priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  /** Tests only. */
  provider?: Parameters<typeof runAgent>[0]["provider"];
}

export interface RouteOutput {
  cls: ExecutionClass;
  reason: string;
  language: ReplyLanguage;
  agent: string;
  status: RunOutput["status"] | "QUEUED" | "NEEDS_CLARIFICATION";
  text: string;
  /** Short spoken form for voice. */
  spoken: string;
  executionId: string | null;
  conversationId: string | null;
  taskId?: string;
  provider: string;
  drafts: { tool: string; draft: unknown }[];
  actions: ProposedAction[];
  toolsUsed: string[];
  error?: string;
}

const json = (v: unknown) => JSON.parse(JSON.stringify(v ?? null)) as Prisma.InputJsonValue;

const QUEUED: Record<ReplyLanguage, (who: string) => string> = {
  en: (who) => `${who} is working on this as a background task. You can follow it in AI Tasks, and anything that needs approval will come to you.`,
  hinglish: (who) => `${who} is kaam par background task ke roop mein lag gaya hai. Progress AI Tasks mein dikhega, aur approval wale kaam aapke paas aayenge.`,
  hi: (who) => `${who} इस काम को बैकग्राउंड टास्क के रूप में कर रहा है। प्रगति AI टास्क में दिखेगी, और जिन कामों के लिए मंज़ूरी चाहिए वे आपके पास आएँगे।`,
};

const blocked = (c: Classification, agent: string, error: string, conversationId: string | null): RouteOutput => ({ cls: c.cls, reason: c.reason, language: c.language, agent, status: "BLOCKED", text: error, spoken: error, executionId: null, conversationId, provider: "none", drafts: [], actions: [], toolsUsed: [], error });

/** Records an answer the router produced itself (instant data or a clarifying question) like any other execution. */
async function recordDirect(i: RouteInput, agent: string, c: Classification, text: string, tools: string[], records: string[], started: number, instant: Call | null = null) {
  const cfg = await getAgentConfig(agent);
  let conversationId = i.conversationId ?? null;
  if (conversationId) conversationId = (await db.aIConversation.findFirst({ where: { id: conversationId, userId: i.user.id }, select: { id: true } }))?.id ?? null;
  if (!conversationId) conversationId = (await db.aIConversation.create({ data: { userId: i.user.id, title: i.text.slice(0, 120), expiresAt: new Date(Date.now() + 30 * 86400_000) } })).id;
  const exec = await db.aIExecution.create({
    data: {
      agentSlug: agent,
      userId: i.user.id,
      conversationId,
      trigger: "USER",
      mode: cfg?.mode ?? "ASSIST",
      request: i.text.slice(0, 20_000),
      status: "SUCCEEDED",
      provider: "router",
      toolsUsed: json(tools.map((tool) => ({ tool, ok: true, ms: Date.now() - started }))),
      recordsAccessed: json(records.slice(0, 500)),
      actionsProposed: json([]),
      actionsExecuted: json([]),
      result: json({ text, drafts: [], route: { cls: c.cls, reason: c.reason } }),
      durationMs: Date.now() - started,
      finishedAt: new Date(),
    },
  });
  if (conversationId) {
    await db.aIMessage.createMany({ data: [{ conversationId, role: "user", content: i.text.slice(0, 20_000) }, { conversationId, role: "assistant", content: text, executionId: exec.id, data: json({ agent, drafts: [], actions: [], route: c.cls, instant }) }] });
    await db.aIConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
  }
  await db.aIAgent.updateMany({ where: { slug: agent }, data: { lastActivityAt: new Date() } }).catch(() => null);
  return { executionId: exec.id, conversationId };
}

/** The controlled read behind the previous instant answer in this conversation, for follow-ups like "show them". */
async function lastInstantCall(userId: string, conversationId: string | null): Promise<Call | null> {
  if (!conversationId) return null;
  const m = await db.aIMessage.findFirst({ where: { conversationId, role: "assistant", conversation: { userId } }, orderBy: { createdAt: "desc" }, select: { data: true } });
  const call = (m?.data as { instant?: Call | null } | null)?.instant;
  return call && typeof call.tool === "string" ? call : null;
}

export async function executeRequest(i: RouteInput): Promise<RouteOutput> {
  const started = Date.now();
  const detected = classifyRequest(i.text, { hasContext: !!i.context, explicitBackground: i.explicitBackground });
  const c: Classification = i.language ? { ...detected, language: i.language } : detected;
  const convId = i.conversationId ?? null;

  if (!(await isEnabled("AI_WORKFORCE"))) return blocked(c, i.agentSlug ?? "-", "The AI workforce module is switched off.", convId);
  if (!can(i.user.role, "ai:execute")) return blocked(c, i.agentSlug ?? "-", "You do not have permission to run AI agents.", convId);
  const routed = i.agentSlug ? { slug: i.agentSlug, request: i.text } : routeRequest(i.text, i.user, i.context);
  if (!routed) return blocked(c, "-", "No AI agent is available for your role.", convId);
  const spec = agentBySlug(routed.slug);
  if (!spec) return blocked(c, routed.slug, `Unknown agent "${routed.slug}".`, convId);
  if (!canRunAgent(i.user.role, spec)) return blocked(c, spec.slug, `You do not have permission to use the ${spec.name}.`, convId);
  const halted = await growthStop({ kind: "ai", agent: spec.slug });
  if (halted) return blocked(c, spec.slug, `AI is stopped by a kill switch: ${halted}`, convId);
  const request = routed.request;

  await audit({ userId: i.user.id, action: "ai.route", entity: "AIAgent", entityId: spec.slug, metadata: { cls: c.cls, reason: c.reason, channel: i.channel, language: c.language } });

  const base = { cls: c.cls, reason: c.reason, language: c.language, agent: spec.slug };

  if (c.cls === "CLARIFICATION_REQUIRED") {
    const q = c.question ?? "Could you tell me a bit more?";
    const r = await recordDirect({ ...i, text: request }, spec.slug, c, q, [], [], started);
    return { ...base, status: "NEEDS_CLARIFICATION", text: q, spoken: q, executionId: r.executionId, conversationId: r.conversationId, provider: "router", drafts: [], actions: [], toolsUsed: [] };
  }

  if (c.cls === "INSTANT_READ" && !i.context) {
    const previous = await lastInstantCall(i.user.id, i.conversationId ?? null);
    let agent = spec.slug;
    let a = await instantAnswer(i.user, agent, request, c.language, previous);
    // Nobody picked an employee: hand the question to the colleague whose tools cover it.
    if (a?.outOfScope && !i.agentSlug) {
      const owner = await ownerOf(i.user, a.outOfScope, agent);
      if (owner) {
        agent = owner.spec.slug;
        a = await instantAnswer(i.user, agent, request, c.language, previous);
      }
    }
    if (a) {
      const r = await recordDirect({ ...i, text: request }, agent, c, a.text, a.tools, a.records, started, a.followUp);
      return { ...base, agent, status: "SUCCEEDED", text: a.text, spoken: a.spoken, executionId: r.executionId, conversationId: r.conversationId, provider: "router", drafts: [], actions: [], toolsUsed: a.tools };
    }
  }

  if (c.cls === "BACKGROUND_TASK") {
    await ensureEmployees();
    const firstLine = request.split(/\n|(?<=[.!?])\s/)[0].slice(0, 160);
    const task = await createEmployeeTask({
      agentSlug: spec.slug,
      title: firstLine.length < request.length ? `${firstLine}…` : firstLine,
      instructions: [i.channel === "voice" ? "Requested by voice." : null, i.context ? `Context: ${i.context.entity} ${i.context.id}.` : null, request].filter(Boolean).join("\n\n"),
      priority: i.priority,
      kind: i.channel === "instruction" ? "INSTRUCTION" : "TASK",
      requestedById: i.user.id,
      source: i.channel,
      entity: i.context?.entity ?? null,
      entityId: i.context?.id ?? null,
    });
    const who = (await db.aIAgent.findUnique({ where: { slug: spec.slug }, select: { personaName: true } }))?.personaName ?? spec.name.replace(/^AI\s+/, "");
    const text = QUEUED[c.language](who);
    return { ...base, status: "QUEUED", text, spoken: text, executionId: null, conversationId: convId, taskId: task.id, provider: "router", drafts: [], actions: [], toolsUsed: [] };
  }

  const r = await runAgent({ agentSlug: spec.slug, request, user: i.user, context: i.context ?? null, conversationId: i.conversationId ?? null, channelHint: i.channelHint, route: { cls: c.cls, reason: c.reason }, provider: i.provider });
  return { ...base, status: r.status, text: r.text, spoken: r.text, executionId: r.executionId, conversationId: r.conversationId, provider: r.provider, drafts: r.drafts, actions: r.actions, toolsUsed: r.toolsUsed, error: r.error };
}
