import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { secretValue } from "@/lib/integrations/vault";

/**
 * Provider abstraction for the AI Workforce. The rest of the platform only talks to `AIProvider`; the Anthropic
 * adapter is the only implementation today. When no API key is configured `getProvider()` returns null and every
 * AI surface shows "AI provider not connected" — nothing is ever simulated.
 */
export interface AIToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface AIToolOutcome {
  /** JSON-serialisable result (or error message) returned to the model. */
  content: string;
  isError?: boolean;
}

export interface AIUsageDelta {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface AIRunInput {
  system: string;
  /** Prior turns (plain text) for conversational context. */
  history: { role: "user" | "assistant"; content: string }[];
  prompt: string;
  tools: AIToolDef[];
  model: string;
  maxTokens: number;
  maxIterations: number;
  webSearch: boolean;
  executeTool: (name: string, input: unknown) => Promise<AIToolOutcome>;
  /** Called before every model call; throw to stop (budget exceeded etc.). */
  beforeCall: () => Promise<void>;
  /** Called after every model call with its metered usage. */
  onUsage: (u: AIUsageDelta) => Promise<void>;
}

export type AIRunStop = "completed" | "refused" | "max_tokens" | "max_iterations" | "context_exceeded";

export interface AIRunResult {
  text: string;
  stop: AIRunStop;
  model: string;
  iterations: number;
}

export interface AIProvider {
  name: string;
  run(input: AIRunInput): Promise<AIRunResult>;
}

/** USD per million tokens (input, output). Unknown models are priced at the most expensive tier so limits stay safe. */
const PRICING: Record<string, [number, number]> = {
  "claude-opus-5": [5, 25],
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5": [2, 10],
  "claude-haiku-4-5": [1, 5],
  "claude-opus-4-8": [5, 25],
  "claude-fable-5-1": [10, 50],
};
export const DEFAULT_MODEL = "claude-opus-5";
export const MODEL_OPTIONS = Object.keys(PRICING);

export function priceFor(model: string): [number, number] {
  const key = Object.keys(PRICING).find((k) => model === k || model.startsWith(`${k}-`));
  return key ? PRICING[key] : [10, 50];
}

export function costOf(model: string, u: { input: number; output: number; cacheWrite?: number; cacheRead?: number }) {
  const [i, o] = priceFor(model);
  return ((u.input + (u.cacheWrite ?? 0) * 1.25 + (u.cacheRead ?? 0) * 0.1) * i + u.output * o) / 1_000_000;
}

export const providerStatus = () => ({ name: "Anthropic Claude", connected: !!secretValue("ANTHROPIC_API_KEY"), env: ["ANTHROPIC_API_KEY", "AI_MODEL", "MAX_DAILY_AI_COST", "MAX_MONTHLY_AI_COST", "MAX_REQUEST_TOKENS", "AI_WEB_SEARCH"] });
export const webSearchEnabled = () => providerStatus().connected && process.env.AI_WEB_SEARCH === "true";

let client: Anthropic | null = null;
let clientKey = "";

class AnthropicProvider implements AIProvider {
  name = "anthropic";

  async run(input: AIRunInput): Promise<AIRunResult> {
    const apiKey = secretValue("ANTHROPIC_API_KEY");
    if (!client || clientKey !== apiKey) {
      client = new Anthropic({ apiKey, maxRetries: 2, timeout: 120_000 });
      clientKey = apiKey;
    }
    const tools: Anthropic.Beta.Messages.BetaToolUnion[] = input.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema as Anthropic.Beta.Messages.BetaTool.InputSchema }));
    if (input.webSearch) tools.push({ type: "web_search_20260209", name: "web_search", max_uses: 5 });
    const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [...input.history.map((h) => ({ role: h.role, content: h.content })), { role: "user", content: input.prompt }];
    let model = input.model;
    const texts: string[] = [];

    for (let i = 1; i <= input.maxIterations; i++) {
      await input.beforeCall();
      const res = await client.beta.messages.create({
        model: input.model,
        max_tokens: input.maxTokens,
        system: input.system,
        tools,
        messages,
        // A declined request is re-run server-side on Anthropic's recommended fallback model instead of failing.
        fallbacks: "default",
        betas: ["server-side-fallback-2026-07-01"],
      });
      model = res.model;
      await input.onUsage({
        model: res.model,
        inputTokens: res.usage.input_tokens + (res.usage.cache_creation_input_tokens ?? 0) + (res.usage.cache_read_input_tokens ?? 0),
        outputTokens: res.usage.output_tokens,
        costUsd: costOf(res.model, { input: res.usage.input_tokens, output: res.usage.output_tokens, cacheWrite: res.usage.cache_creation_input_tokens ?? 0, cacheRead: res.usage.cache_read_input_tokens ?? 0 }),
      });

      // Branch on stop_reason before trusting content.
      if (res.stop_reason === "refusal") return { text: "The AI model declined this request.", stop: "refused", model, iterations: i };
      const text = res.content.filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
      if (res.stop_reason === "model_context_window_exceeded") return { text: [...texts, text].filter(Boolean).join("\n\n"), stop: "context_exceeded", model, iterations: i };
      if (res.stop_reason === "max_tokens") return { text: [...texts, text].filter(Boolean).join("\n\n"), stop: "max_tokens", model, iterations: i };
      if (res.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: res.content });
        continue;
      }
      if (res.stop_reason !== "tool_use") return { text: [...texts, text].filter(Boolean).join("\n\n") || text, stop: "completed", model, iterations: i };

      if (text) texts.push(text);
      messages.push({ role: "assistant", content: res.content });
      const calls = res.content.filter((b): b is Anthropic.Beta.Messages.BetaToolUseBlock => b.type === "tool_use");
      // Every tool_use gets a tool_result, all in one user message.
      const results: Anthropic.Beta.Messages.BetaToolResultBlockParam[] = [];
      for (const c of calls) {
        const out = await input.executeTool(c.name, c.input).catch((e: unknown) => ({ content: `Tool failed: ${(e as Error).message}`.slice(0, 500), isError: true }));
        results.push({ type: "tool_result", tool_use_id: c.id, content: out.content, is_error: out.isError || undefined });
      }
      messages.push({ role: "user", content: results });
    }
    return { text: texts.join("\n\n"), stop: "max_iterations", model, iterations: input.maxIterations };
  }
}

export function getProvider(): AIProvider | null {
  return secretValue("ANTHROPIC_API_KEY") ? new AnthropicProvider() : null;
}

/** Maps SDK errors to safe, human-readable messages (no request details or keys). */
export function providerError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "AI provider rejected the API key.";
  if (e instanceof Anthropic.PermissionDeniedError) return "AI provider denied access for this key.";
  if (e instanceof Anthropic.RateLimitError) return "AI provider rate limit reached. Try again shortly.";
  if (e instanceof Anthropic.BadRequestError) return "AI provider rejected the request.";
  if (e instanceof Anthropic.APIConnectionError) return "Could not reach the AI provider.";
  if (e instanceof Anthropic.InternalServerError) return "AI provider is temporarily unavailable.";
  if (e instanceof Anthropic.APIError) return `AI provider error (${e.status ?? "unknown"}).`;
  return (e as Error)?.message?.slice(0, 300) || "AI request failed.";
}
