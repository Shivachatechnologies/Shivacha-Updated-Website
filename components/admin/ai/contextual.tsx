import Link from "next/link";
import { Bot } from "lucide-react";
import { Panel } from "@/components/admin/ui";

const ACTIONS: Record<string, { label: string; prompt: string; agent?: string }[]> = {
  Lead: [
    { label: "Analyze lead", prompt: "Analyze this lead: qualification, fit, score drivers and risks." },
    { label: "Prepare follow-up", prompt: "Draft a personalised follow-up for this lead." },
    { label: "Meeting brief", prompt: "Prepare a meeting briefing for this lead." },
    { label: "Recommend service", prompt: "Recommend the best-fit Shivacha services and products for this lead." },
    { label: "Next best action", prompt: "What is the next best action for this lead, and why?" },
  ],
  Deal: [
    { label: "Analyze deal", prompt: "Analyze this deal: health, stage fit, risks and next best action." },
    { label: "Prepare proposal", prompt: "Prepare a proposal draft for this deal.", agent: "proposal" },
    { label: "Risk analysis", prompt: "Run a risk analysis on this deal." },
    { label: "Negotiation brief", prompt: "Prepare a negotiation brief for this deal." },
  ],
  Project: [
    { label: "Project health", prompt: "Assess the health of this project." },
    { label: "Identify risks", prompt: "Identify schedule, scope and delivery risks on this project." },
    { label: "Generate status update", prompt: "Draft a client status update for this project." },
  ],
  Invoice: [
    { label: "Payment risk", prompt: "Assess the payment risk of this invoice." },
    { label: "Prepare follow-up", prompt: "Draft a polite payment follow-up for this invoice." },
  ],
  Ticket: [
    { label: "Summarize & classify", prompt: "Summarize and classify this ticket, and check SLA risk." },
    { label: "Draft reply", prompt: "Draft a reply to this ticket using the knowledge base." },
  ],
  Client: [
    { label: "Account summary", prompt: "Summarize this client account." },
    { label: "Meeting brief", prompt: "Prepare a client meeting brief." },
  ],
};

/** Contextual AI actions. Each opens the Command Center with the record attached; results come from real data only. */
export function AiActions({ entity, id }: { entity: keyof typeof ACTIONS; id: string }) {
  return (
    <Panel title="AI actions">
      <div className="flex flex-wrap gap-1.5">
        {ACTIONS[entity].map((a) => (
          <Link key={a.label} href={`/admin/ai?${new URLSearchParams({ q: a.prompt, entity, id, ...(a.agent ? { agent: a.agent } : {}) })}`} className="inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-[12.5px] text-muted hover:border-line-strong hover:text-fg">
            <Bot className="size-3.5" aria-hidden />
            {a.label}
          </Link>
        ))}
      </div>
      <p className="mt-2 text-[11.5px] text-dim">Runs in ASSIST mode: anything that changes data or contacts a customer waits for approval.</p>
    </Panel>
  );
}
