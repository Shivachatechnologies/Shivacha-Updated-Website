import { cn } from "@/lib/cn";

export interface Story {
  id: string;
  title: string;
  intro: string;
  color: string;
  steps: { name: string; detail: string }[];
  note?: string;
}

export const STORIES: Record<string, Story> = {
  exchange: {
    id: "exchange",
    title: "How a crypto exchange works",
    intro: "Every trade crosses identity, wallets, the matching engine, liquidity, the ledger and custody — each a system that must be correct under load.",
    color: "#f5a524",
    steps: [
      { name: "User", detail: "Web, mobile or API client places an order." },
      { name: "Authentication", detail: "KYC tier, 2FA and device checks gate the account." },
      { name: "Wallet", detail: "Balances reserved; deposits detected and swept." },
      { name: "Matching engine", detail: "Price-time priority against the live order book." },
      { name: "Liquidity", detail: "Market makers and external venues deepen the book." },
      { name: "Settlement", detail: "Fills posted to a double-entry ledger." },
      { name: "Custody", detail: "Hot/cold tiers, MPC and withdrawal approvals." },
    ],
  },
  card: {
    id: "card",
    title: "How a crypto card system works",
    intro: "A card payment funded from digital assets is decided in milliseconds — then converted, settled and reconciled across partners.",
    color: "#14c8b0",
    steps: [
      { name: "User", detail: "Taps a virtual or physical card at checkout." },
      { name: "Wallet", detail: "Crypto or stablecoin balance checked and reserved." },
      { name: "Card processor", detail: "Authorisation request decided against controls." },
      { name: "Issuer", detail: "Licensed issuing partner approves on the network." },
      { name: "Merchant", detail: "Payment accepted through the card network." },
      { name: "Settlement", detail: "Conversion, ledger posting and reconciliation." },
    ],
    note: "Card issuance and regulated services are provided by licensed issuing and compliance partners.",
  },
  agents: {
    id: "agents",
    title: "How AI agents work",
    intro: "Production agents are governed systems: they plan, use typed tools and permissioned data, and escalate to people before consequential actions.",
    color: "#8b93ff",
    steps: [
      { name: "Input", detail: "A request, document or event arrives." },
      { name: "Agent", detail: "Plans the task and retrieves relevant policy." },
      { name: "Tools", detail: "Typed APIs with scoped permissions." },
      { name: "Data", detail: "Permission-aware retrieval from your systems." },
      { name: "Decision", detail: "Evaluated; human approval above set thresholds." },
      { name: "Action", detail: "Executed in business systems and fully logged." },
    ],
  },
};

/** A numbered, connected flow: horizontal on large screens, vertical on small ones. */
export function ArchitectureFlow({ story, className }: { story: Story; className?: string }) {
  const n = story.steps.length;
  return (
    <div className={cn("min-w-0", className)}>
      <div className="relative" style={{ ["--cols" as string]: n }}>
        {/* connector: vertical on mobile, horizontal on desktop */}
        <span aria-hidden className="absolute top-3 bottom-3 left-[11px] w-px bg-line-strong lg:top-[11px] lg:right-[calc(100%/var(--cols)/2)] lg:bottom-auto lg:left-[calc(100%/var(--cols)/2)] lg:h-px lg:w-auto" />
        <span aria-hidden className="absolute top-[9px] hidden h-[5px] overflow-hidden lg:block" style={{ left: `calc(100% / ${n} / 2)`, right: `calc(100% / ${n} / 2)` }}>
          <span className="absolute inset-0 animate-flow-x" style={{ animationDuration: "7s" }}>
            <span className="absolute top-0 left-0 size-[5px] rounded-full" style={{ background: story.color, boxShadow: `0 0 8px ${story.color}` }} />
          </span>
        </span>
        <ol className="relative lg:grid lg:grid-cols-[repeat(var(--cols),minmax(0,1fr))] lg:gap-3">
          {story.steps.map((s, i) => (
            <li key={s.name} className="relative flex gap-4 pb-6 last:pb-0 lg:flex-col lg:gap-0 lg:pb-0">
              <span className="relative z-[1] flex size-[23px] shrink-0 items-center justify-center rounded-full border bg-ink-950 font-mono text-[10.5px] font-medium text-fg" style={{ borderColor: story.color }}>
                {i + 1}
              </span>
              <span className="min-w-0 lg:mt-4 lg:pr-2">
                <span className="block text-[15px] font-semibold text-fg">{s.name}</span>
                <span className="mt-1 block text-[13.5px] leading-snug text-muted">{s.detail}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
      {story.note && <p className="mt-6 text-xs text-dim">{story.note}</p>}
    </div>
  );
}
