"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { Bot, Loader2, Send, ShieldCheck, Wrench } from "lucide-react";
import { askAIAction, type AskState } from "@/lib/ai/actions";
import { inputCls } from "@/components/admin/ui";
import { CopyButton } from "@/components/admin/CopyButton";
import { Markdown } from "./markdown";
import { EXECUTION_CLASS_LABELS } from "@/lib/ai/router/policy";

type Turn = { question: string; result: NonNullable<NonNullable<AskState>["result"]> };

const STATUS_TONE: Record<string, string> = { SUCCEEDED: "text-emerald-700", AWAITING_APPROVAL: "text-amber-700", FAILED: "text-red-700", BLOCKED: "text-red-700" };

export function CommandCenter({ agents, initial, connected }: { agents: { slug: string; name: string }[]; initial: { q: string; agent: string; entity: string; entityId: string }; connected: boolean }) {
  const [state, run, pending] = useActionState<AskState, FormData>(askAIAction, undefined);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [conversationId, setConversationId] = useState<string>("");
  const [context, setContext] = useState(initial.entity && initial.entityId ? { entity: initial.entity, id: initial.entityId } : null);
  const formRef = useRef<HTMLFormElement>(null);
  const seen = useRef<AskState>(undefined);

  useEffect(() => {
    if (!state || state === seen.current) return;
    seen.current = state;
    if (state.result && state.question) {
      const t = { question: state.question, result: state.result };
      startTransition(() => {
        setTurns((xs) => [...xs, t]);
        if (state.conversationId) setConversationId(state.conversationId);
      });
      const q = formRef.current?.elements.namedItem("q") as HTMLTextAreaElement | null;
      if (q) q.value = "";
    }
  }, [state]);

  return (
    <div className="space-y-4">
      {turns.length > 0 && (
        <ol className="space-y-4" aria-live="polite">
          {turns.map((t, i) => (
            <li key={i} className="space-y-2">
              <p className="ml-auto w-fit max-w-[85%] rounded-lg bg-brand-blue/10 px-3 py-2 text-sm text-fg">{t.question}</p>
              <Answer turn={t} />
            </li>
          ))}
        </ol>
      )}
      {state?.error && <p role="alert" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</p>}
      <form
        ref={formRef}
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startTransition(() => run(fd));
        }}
        className="rounded-lg border border-line-strong bg-ink-900 p-3"
      >
        <input type="hidden" name="conversationId" value={conversationId} />
        {context && (
          <>
            <input type="hidden" name="entity" value={context.entity} />
            <input type="hidden" name="entityId" value={context.id} />
          </>
        )}
        <label htmlFor="ai-q" className="sr-only">Ask the AI workforce</label>
        <textarea
          id="ai-q"
          name="q"
          rows={3}
          defaultValue={initial.q}
          maxLength={4000}
          placeholder="Ask anything… e.g. “Which high-value leads have not been contacted this week?” or “@finance overdue invoices over 30 days”"
          className={`${inputCls} h-auto resize-y py-2`}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) formRef.current?.requestSubmit();
          }}
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="text-xs text-dim" htmlFor="ai-agent">Agent</label>
          <select id="ai-agent" name="agent" defaultValue={initial.agent || "auto"} className={`${inputCls} h-8 w-auto text-xs`}>
            <option value="auto">Auto-route (orchestrator)</option>
            {agents.map((a) => <option key={a.slug} value={a.slug}>{a.name}</option>)}
          </select>
          {context && (
            <span className="inline-flex items-center gap-1 rounded bg-ink-850 px-2 py-1 text-xs text-muted">
              Context: {context.entity}
              <button type="button" onClick={() => setContext(null)} className="text-dim hover:text-fg" aria-label="Remove record context">×</button>
            </span>
          )}
          {turns.length > 0 && (
            <button type="button" onClick={() => { setTurns([]); setConversationId(""); }} className="text-xs text-dim hover:text-fg">New conversation</button>
          )}
          <button type="submit" disabled={pending} className="btn-primary ml-auto h-8 px-3 text-xs">
            {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Send className="size-3.5" aria-hidden />}
            {pending ? "Working…" : "Ask"}
          </button>
        </div>
        {!connected && <p className="mt-2 text-xs text-amber-700">AI provider not connected — agents will return live data only, without AI analysis.</p>}
      </form>
    </div>
  );
}

function Answer({ turn }: { turn: Turn }) {
  const r = turn.result;
  return (
    <div className="rounded-lg border border-line bg-ink-900 p-3.5">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1 font-semibold text-fg"><Bot className="size-3.5" aria-hidden />{r.agent}</span>
        <span className={STATUS_TONE[r.status] ?? "text-muted"}>{r.status.replace(/_/g, " ").toLowerCase()}</span>
        {r.route && <span className="rounded-full border border-line px-2 py-0.5 text-dim" title="How the execution router handled this request">{EXECUTION_CLASS_LABELS[r.route]}</span>}
        {r.provider === "none" && <span className="text-amber-700">provider not connected</span>}
        {r.taskId && <Link href={`/admin/ai/tasks/${r.taskId}`} className="text-brand-blue">Follow the task →</Link>}
        {r.executionId && <Link href={`/admin/ai/logs/${r.executionId}`} className="ml-auto text-dim hover:text-fg">Audit log →</Link>}
      </div>
      <Markdown text={r.text} />
      {r.drafts.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-semibold tracking-wide text-dim uppercase">Drafts (not sent)</p>
          {r.drafts.map((d, i) => {
            const o = d.draft as Record<string, string>;
            const text = [o.subject && `Subject: ${o.subject}`, o.body].filter(Boolean).join("\n\n");
            return (
              <div key={i} className="rounded-md border border-line bg-ink-850 p-2.5">
                <div className="mb-1 flex items-center justify-between text-xs text-dim"><span>{d.tool}{o.to ? ` · to ${o.to}` : ""}</span><CopyButton text={text} label="Copy" /></div>
                <pre className="whitespace-pre-wrap font-sans text-[13px] text-fg/90">{text}</pre>
              </div>
            );
          })}
        </div>
      )}
      {r.actions.length > 0 && (
        <ul className="mt-3 space-y-1">
          {r.actions.map((a, i) => (
            <li key={i} className="flex items-center gap-2 text-xs">
              <ShieldCheck className="size-3.5 text-amber-700" aria-hidden />
              <span className="text-fg">{a.summary}</span>
              <span className="text-dim">· {a.status.replace(/_/g, " ").toLowerCase()}</span>
              {a.approvalId && <Link href={`/admin/ai/approvals/${a.approvalId}`} className="ml-auto text-brand-blue hover:underline">Review</Link>}
            </li>
          ))}
        </ul>
      )}
      {r.toolsUsed.length > 0 && <p className="mt-3 flex items-center gap-1 text-[11.5px] text-dim"><Wrench className="size-3" aria-hidden />Tools: {[...new Set(r.toolsUsed)].join(", ")}</p>}
    </div>
  );
}
