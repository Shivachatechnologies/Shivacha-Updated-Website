import type { ReactNode } from "react";
import {
  AppWindow, Bot, Boxes, Building2, CheckCircle2, CircleDashed, Cloud, Cpu, CreditCard, Database, Eye, Fingerprint, Gauge, Globe2, HardDrive,
  KeyRound, Landmark, Layers, Link2, Lock, Network, Radar, ScrollText, Server, ShieldCheck, Smartphone, Split, Users, Wallet, Webhook, Workflow,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * System visuals: code-drawn product and architecture views that explain how a system works
 * (not decoration). All sample identifiers and values are illustrative and labelled as such.
 * Layout is normal flow + CSS grid with container queries, so each visual adapts to its column.
 * Only the small data-flow pulses are absolutely positioned (aria-hidden, transform-only animation).
 */

/* ───────────────────────── shared chrome ───────────────────────── */

function Frame({ title, status, tone = "light", children, className, label }: { title: string; status?: ReactNode; tone?: "light" | "dark"; children: ReactNode; className?: string; label: string }) {
  return (
    <figure
      data-theme={tone === "dark" ? "dark" : undefined}
      aria-label={label}
      className={cn(
        "@container relative w-full overflow-hidden rounded-[24px] border text-fg",
        tone === "dark" ? "border-white/10 bg-[#07111f] shadow-[0_40px_100px_-40px_rgb(1_40_90/0.65)]" : "border-line bg-ink-900 shadow-[0_30px_80px_-40px_rgb(11_20_36/0.35)]",
        className,
      )}
    >
      <div className={cn("flex items-center justify-between gap-3 border-b px-4 py-3 @md:px-5", tone === "dark" ? "border-white/10" : "border-line")}>
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex gap-1.5" aria-hidden>
            <span className="size-2.5 rounded-full bg-[#ff5f57]/80" />
            <span className="size-2.5 rounded-full bg-[#febc2e]/80" />
            <span className="size-2.5 rounded-full bg-[#28c840]/80" />
          </span>
          <span className="truncate text-[12.5px] font-semibold">{title}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {status}
          <span className="rounded-full border border-line px-2 py-0.5 text-[10px] font-medium text-dim">Illustrative</span>
        </div>
      </div>
      <div className="p-4 @md:p-5">{children}</div>
    </figure>
  );
}

function StatusPill({ tone, children }: { tone: "ok" | "wait" | "info"; children: ReactNode }) {
  const c = tone === "ok" ? "bg-emerald-500/12 text-emerald-600 light:text-emerald-700" : tone === "wait" ? "bg-amber-500/15 text-amber-600 light:text-amber-700" : "bg-brand-blue/12 text-brand-blue";
  return <span className={cn("hidden rounded-full px-2 py-0.5 text-[10.5px] font-semibold @sm:inline-flex", c)}>{children}</span>;
}

/** Vertical rail with moving pulses; sits beside a stack of steps. */
function Rail({ color = "#0195ff", delays = [0, 1.6] }: { color?: string; delays?: number[] }) {
  return (
    <div aria-hidden className="relative w-px shrink-0 self-stretch" style={{ background: `linear-gradient(${color}00, ${color}66 12%, ${color}66 88%, ${color}00)` }}>
      {delays.map((d) => (
        <span key={d} className="absolute inset-0 animate-flow-y" style={{ animationDelay: `${d}s` }}>
          <span className="absolute -left-[3px] top-0 size-[7px] rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />
        </span>
      ))}
    </div>
  );
}

function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center rounded-md border border-line bg-ink-850/60 px-1.5 py-0.5 text-[10.5px] leading-tight whitespace-nowrap text-muted", className)}>{children}</span>;
}

/* ───────────────────────── 1. Platform ecosystem (hero) ───────────────────────── */

const LAYERS: { icon: LucideIcon; name: string; items: string[]; color: string }[] = [
  { icon: Users, name: "Users", items: ["Customers", "Operators", "Partners"], color: "#9aa5b8" },
  { icon: AppWindow, name: "Applications", items: ["Web", "iOS", "Android", "Admin"], color: "#5cc8ff" },
  { icon: Bot, name: "AI agents", items: ["Assistants", "Agents", "Evals", "Approvals"], color: "#8b93ff" },
  { icon: Webhook, name: "API & orchestration", items: ["REST", "GraphQL", "Events", "Webhooks"], color: "#0195ff" },
  { icon: Landmark, name: "FinTech & payments", items: ["Ledger", "Cards", "Payouts", "KYC"], color: "#14c8b0" },
  { icon: Link2, name: "Blockchain & assets", items: ["Wallets", "Contracts", "Indexer"], color: "#22d3ee" },
  { icon: Cloud, name: "Cloud infrastructure", items: ["Kubernetes", "Databases", "Observability"], color: "#6ea8ff" },
];

export function EcosystemVisual({ className }: { className?: string }) {
  return (
    <Frame tone="dark" title="Platform topology" label="Layered platform: users, applications, AI agents, APIs, payments, blockchain and cloud infrastructure" className={className} status={<StatusPill tone="ok">All layers healthy</StatusPill>}>
      <div className="flex gap-3 @md:gap-4">
        <Rail color="#0195ff" delays={[0, 1.1, 2.2]} />
        <ol className="min-w-0 flex-1 space-y-1.5">
          {LAYERS.map((l) => (
            <li key={l.name} className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg" style={{ background: `${l.color}1f`, color: l.color }}>
                <l.icon className="size-3.5" strokeWidth={2} aria-hidden />
              </span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{l.name}</span>
              <span className="hidden flex-wrap justify-end gap-1 @sm:flex">
                {l.items.map((i) => (
                  <span key={i} className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-white/65">
                    {i}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ol>
      </div>
      <div className="mt-4 grid gap-1 rounded-xl border border-white/[0.07] bg-black/20 p-3 font-mono text-[10.5px] leading-relaxed text-white/60">
        <p><span className="text-emerald-400">●</span> payment.captured → ledger.posted</p>
        <p><span className="text-[#8b93ff]">●</span> agent.run → approval.requested</p>
        <p className="truncate"><span className="text-[#22d3ee]">●</span> tx.confirmed · indexer.synced → api.cache.updated</p>
      </div>
    </Frame>
  );
}

/* ───────────────────────── 2. AI agent workflow ───────────────────────── */

const AGENT_STEPS: { title: string; detail: string; state: "done" | "wait" | "queued"; icon: LucideIcon }[] = [
  { title: "Understand request", detail: "Intent: refund · order #4821", state: "done", icon: Cpu },
  { title: "Retrieve policy", detail: "Refund policy v3 · 2 sources cited", state: "done", icon: ScrollText },
  { title: "Call tools", detail: "orders.lookup · payments.status", state: "done", icon: Workflow },
  { title: "Human approval", detail: "Refund above auto-approve limit", state: "wait", icon: Users },
  { title: "Execute action", detail: "payments.refund", state: "queued", icon: CreditCard },
  { title: "Respond & log", detail: "Customer reply · audit trail", state: "queued", icon: CheckCircle2 },
];

export function AgentWorkflowVisual({ className }: { className?: string }) {
  return (
    <Frame title="Agent run · Support refund" label="AI agent workflow: request, reasoning, tool calls, human approval, action and result" className={className} status={<StatusPill tone="wait">Awaiting approval</StatusPill>}>
      <div className="grid gap-4 @lg:grid-cols-[1.15fr_1fr]">
        <div>
          <div className="mb-3 rounded-xl rounded-tl-sm bg-ink-850 px-3 py-2 text-[12px] text-muted">
            <span className="font-semibold text-fg">Customer:</span> My order arrived damaged — can I get a refund?
          </div>
          <ol className="space-y-1.5">
            {AGENT_STEPS.map((s, i) => (
              <li key={s.title} className={cn("flex items-start gap-2.5 rounded-lg border px-2.5 py-2", s.state === "wait" ? "border-amber-400/50 bg-amber-400/[0.07]" : "border-line")}>
                <span className={cn("mt-px flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold", s.state === "done" ? "bg-emerald-500 text-white" : s.state === "wait" ? "bg-amber-400 text-[#3a2600]" : "border border-line text-dim")}>
                  {s.state === "done" ? <CheckCircle2 className="size-3" aria-hidden /> : i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-[12px] font-semibold leading-tight">{s.title}</span>
                  <span className="block truncate font-mono text-[10.5px] text-dim">{s.detail}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
        <div className="flex flex-col gap-3">
          <div className="rounded-xl border border-line bg-ink-850/50 p-3">
            <p className="mb-2 text-[11px] font-semibold text-dim">Tool call</p>
            <pre className="overflow-hidden font-mono text-[10.5px] leading-relaxed whitespace-pre-wrap text-muted">
{`orders.lookup({
  order_id: "4821"
}) → { status: "delivered",
      amount: 42.00 }`}
            </pre>
          </div>
          <div className="rounded-xl border border-amber-400/50 p-3">
            <p className="flex items-center gap-1.5 text-[12px] font-semibold">
              <ShieldCheck className="size-3.5 text-amber-500" aria-hidden /> Approval required
            </p>
            <p className="mt-1 text-[11px] text-dim">Refund 42.00 to original payment method</p>
            <div className="mt-2.5 flex gap-2" aria-hidden>
              <span className="rounded-md bg-brand-600 px-2.5 py-1 text-[11px] font-semibold text-white">Approve</span>
              <span className="rounded-md border border-line px-2.5 py-1 text-[11px] font-semibold text-muted">Reject</span>
            </div>
          </div>
        </div>
      </div>
    </Frame>
  );
}

/* ───────────────────────── 3. FinTech payment flow ───────────────────────── */

const PAY_STEPS: { icon: LucideIcon; name: string; note: string }[] = [
  { icon: Smartphone, name: "Client", note: "Checkout · wallet" },
  { icon: Webhook, name: "API", note: "Idempotency key" },
  { icon: Fingerprint, name: "Identity & KYC", note: "Verified" },
  { icon: Radar, name: "Risk & compliance", note: "Rules passed" },
  { icon: CreditCard, name: "Payment gateway", note: "Authorised → captured" },
  { icon: ScrollText, name: "Ledger", note: "Double-entry posted" },
  { icon: Landmark, name: "Settlement", note: "Bank rail · T+1" },
];

export function FintechFlowVisual({ className }: { className?: string }) {
  return (
    <Frame title="Payment · pay_8F2k" label="FinTech payment flow: client, API, identity, risk, gateway, ledger and settlement with a balanced ledger entry" className={className} status={<StatusPill tone="ok">Captured</StatusPill>}>
      <div className="grid gap-4 @lg:grid-cols-[1fr_1.05fr]">
        <div className="flex gap-3">
          <Rail color="#14c8b0" />
          <ol className="min-w-0 flex-1 space-y-1.5">
            {PAY_STEPS.map((s) => (
              <li key={s.name} className="flex items-center gap-2.5 rounded-lg border border-line px-2.5 py-1.5">
                <s.icon className="size-3.5 shrink-0 text-brand-teal" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{s.name}</span>
                <span className="hidden truncate text-[10.5px] text-dim @sm:inline">{s.note}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="flex flex-col gap-3">
          <div className="overflow-hidden rounded-xl border border-line">
            <p className="border-b border-line bg-ink-850/60 px-3 py-2 text-[11px] font-semibold text-dim">Journal entry · balanced</p>
            <table className="w-full text-left text-[11px]">
              <thead className="text-dim">
                <tr>
                  <th className="px-3 py-1.5 font-medium">Account</th>
                  <th className="px-3 py-1.5 text-right font-medium">Debit</th>
                  <th className="px-3 py-1.5 text-right font-medium">Credit</th>
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums text-muted">
                <tr className="border-t border-line"><td className="px-3 py-1.5 font-sans">Customer funds</td><td className="px-3 py-1.5 text-right">120.00</td><td className="px-3 py-1.5 text-right">—</td></tr>
                <tr className="border-t border-line"><td className="px-3 py-1.5 font-sans">Merchant payable</td><td className="px-3 py-1.5 text-right">—</td><td className="px-3 py-1.5 text-right">118.20</td></tr>
                <tr className="border-t border-line"><td className="px-3 py-1.5 font-sans">Fee revenue</td><td className="px-3 py-1.5 text-right">—</td><td className="px-3 py-1.5 text-right">1.80</td></tr>
              </tbody>
            </table>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              [Landmark, "Bank rails"],
              [CreditCard, "Cards"],
              [Wallet, "Wallets"],
              [Building2, "Payouts"],
            ].map(([I, t]) => {
              const Ico = I as LucideIcon;
              return (
                <span key={t as string} className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-2 text-[11px] font-medium text-muted">
                  <Ico className="size-3.5 shrink-0 text-brand-teal" aria-hidden /> <span className="truncate">{t as string}</span>
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </Frame>
  );
}

/* ───────────────────────── 4. Web3 pipeline ───────────────────────── */

const W3_STEPS: { icon: LucideIcon; name: string; note: string }[] = [
  { icon: Wallet, name: "Wallet", note: "Signs transaction" },
  { icon: ScrollText, name: "Smart contract", note: "Vault.deposit()" },
  { icon: Boxes, name: "Blockchain", note: "Included in block" },
  { icon: Database, name: "Indexer", note: "Event → Postgres" },
  { icon: Webhook, name: "API", note: "GraphQL · webhooks" },
  { icon: AppWindow, name: "Application", note: "Balance updated" },
];

export function Web3PipelineVisual({ className }: { className?: string }) {
  const blocks = [
    ["#…4812", "12 conf.", true],
    ["#…4813", "11 conf.", false],
    ["#…4814", "10 conf.", false],
    ["#…4815", "pending", false],
  ] as const;
  return (
    <Frame title="Contract events · EVM network" label="Web3 pipeline: wallet, smart contract, blockchain, indexer, API and application, with blocks and contract events" className={className} status={<StatusPill tone="ok">Indexer in sync</StatusPill>}>
      <div className="grid gap-4 @lg:grid-cols-[1fr_1.05fr]">
        <div className="flex gap-3">
          <Rail color="#22d3ee" />
          <ol className="min-w-0 flex-1 space-y-1.5">
            {W3_STEPS.map((s) => (
              <li key={s.name} className="flex items-center gap-2.5 rounded-lg border border-line px-2.5 py-1.5">
                <s.icon className="size-3.5 shrink-0 text-brand-cyan" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{s.name}</span>
                <span className="hidden truncate font-mono text-[10.5px] text-dim @sm:inline">{s.note}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <div className="grid grid-cols-4 gap-1.5">
            {blocks.map(([n, c, mine]) => (
              <div key={n} className={cn("rounded-lg border px-1.5 py-2 text-center", mine ? "border-brand-cyan/60 bg-brand-cyan/[0.08]" : "border-line", c === "pending" && "border-dashed")}>
                <Boxes className={cn("mx-auto size-3.5", mine ? "text-brand-cyan" : "text-dim")} aria-hidden />
                <p className="mt-1 truncate font-mono text-[9.5px] text-muted">{n}</p>
                <p className="truncate text-[9.5px] text-dim">{c}</p>
              </div>
            ))}
          </div>
          <div className="overflow-hidden rounded-xl border border-line">
            <p className="border-b border-line bg-ink-850/60 px-3 py-2 text-[11px] font-semibold text-dim">Decoded events</p>
            <ul className="divide-y divide-line font-mono text-[10.5px] text-muted">
              <li className="flex items-center justify-between gap-2 px-3 py-1.5"><span className="truncate">Deposit(0x8f2…a91, 500)</span><span className="shrink-0 text-emerald-600 light:text-emerald-700">confirmed</span></li>
              <li className="flex items-center justify-between gap-2 px-3 py-1.5"><span className="truncate">Transfer(0x1c7…4de → 0x9b0…77f)</span><span className="shrink-0 text-emerald-600 light:text-emerald-700">confirmed</span></li>
              <li className="flex items-center justify-between gap-2 px-3 py-1.5"><span className="truncate">RoleGranted(PAUSER, multisig)</span><span className="shrink-0 text-amber-600 light:text-amber-700">timelock</span></li>
            </ul>
          </div>
          <p className="flex items-center gap-1.5 text-[10.5px] text-dim">
            <Network className="size-3.5" aria-hidden /> RPC failover · 3 providers · reorg-safe indexing
          </p>
        </div>
      </div>
    </Frame>
  );
}

/* ───────────────────────── 5. Cloud topology ───────────────────────── */

function Region({ name, primary }: { name: string; primary?: boolean }) {
  return (
    <div className="rounded-xl border border-line p-3">
      <p className="mb-2 flex items-center justify-between gap-2 text-[11px] font-semibold">
        <span className="flex min-w-0 items-center gap-1.5 truncate"><Globe2 className="size-3.5 shrink-0 text-brand-blue" aria-hidden /> {name}</span>
        <span className={cn("shrink-0 rounded-full px-1.5 py-px text-[9.5px] font-semibold", primary ? "bg-brand-blue/12 text-brand-blue" : "bg-ink-850 text-dim")}>{primary ? "active" : "standby"}</span>
      </p>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 rounded-lg bg-ink-850/60 px-2 py-1.5 text-[11px] text-muted"><Split className="size-3.5 shrink-0 text-brand-blue" aria-hidden /> Load balancer · WAF</div>
        <div className="grid grid-cols-3 gap-1.5">
          {["api", "web", "worker"].map((s) => (
            <span key={s} className="flex flex-col items-center gap-0.5 rounded-lg border border-line py-1.5 text-[10px] text-muted">
              <Boxes className="size-3.5 text-brand-blue" aria-hidden /> {s}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <span className="flex items-center gap-1.5 rounded-lg border border-line px-2 py-1.5 text-[10.5px] text-muted"><Database className="size-3.5 shrink-0 text-brand-blue" aria-hidden /> {primary ? "Postgres primary" : "Postgres replica"}</span>
          <span className="flex items-center gap-1.5 rounded-lg border border-line px-2 py-1.5 text-[10.5px] text-muted"><HardDrive className="size-3.5 shrink-0 text-brand-blue" aria-hidden /> Object storage</span>
        </div>
      </div>
    </div>
  );
}

export function CloudTopologyVisual({ className }: { className?: string }) {
  return (
    <Frame title="Production · multi-region" label="Cloud topology: two regions with load balancing, containers, databases and storage, plus shared observability and security" className={className} status={<StatusPill tone="ok">Deploy healthy</StatusPill>}>
      <div className="grid gap-3 @md:grid-cols-2">
        <Region name="Region A" primary />
        <Region name="Region B" />
      </div>
      <div aria-hidden className="relative my-3 h-px bg-gradient-to-r from-transparent via-brand-blue/50 to-transparent">
        <span className="absolute inset-0 animate-flow-x">
          <span className="absolute -top-[3px] left-0 size-[7px] rounded-full bg-brand-blue shadow-[0_0_10px_#0195ff]" />
        </span>
      </div>
      <p className="mb-2 text-center text-[10.5px] text-dim">Async replication · automated failover · backups tested</p>
      <div className="grid gap-2 @md:grid-cols-2">
        <div className="rounded-xl border border-line px-3 py-2">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold"><Gauge className="size-3.5 text-brand-blue" aria-hidden /> Observability</p>
          <div className="mt-1.5 flex flex-wrap gap-1"><Chip>Metrics</Chip><Chip>Logs</Chip><Chip>Traces</Chip><Chip>SLO alerts</Chip></div>
        </div>
        <div className="rounded-xl border border-line px-3 py-2">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold"><Lock className="size-3.5 text-brand-blue" aria-hidden /> Security</p>
          <div className="mt-1.5 flex flex-wrap gap-1"><Chip>IAM</Chip><Chip>Secrets</Chip><Chip>Private network</Chip><Chip>IaC</Chip></div>
        </div>
      </div>
    </Frame>
  );
}

/* ───────────────────────── 6. Security controls ───────────────────────── */

const SEC_LAYERS: { icon: LucideIcon; name: string; items: string[] }[] = [
  { icon: Fingerprint, name: "Identity", items: ["SSO", "MFA", "Passkeys"] },
  { icon: KeyRound, name: "Access control", items: ["RBAC", "Least privilege", "Just-in-time"] },
  { icon: Lock, name: "Secrets", items: ["Vault", "Rotation", "No secrets in code"] },
  { icon: ShieldCheck, name: "Encryption", items: ["TLS in transit", "Encrypted at rest"] },
  { icon: Eye, name: "Monitoring", items: ["Audit log", "Alerts", "Threat detection"] },
];

export function SecurityLayersVisual({ className }: { className?: string }) {
  return (
    <Frame title="Security controls · production" label="Layered security controls: identity, access control, secrets, encryption and monitoring, with an audit event log" className={className} status={<StatusPill tone="ok">Controls enforced</StatusPill>}>
      <div className="grid gap-4 @lg:grid-cols-[1.1fr_1fr]">
        <ol className="space-y-1.5">
          {SEC_LAYERS.map((l, i) => (
            <li key={l.name} className="rounded-lg border border-line px-2.5 py-2" style={{ marginLeft: `${i * 6}px` }}>
              <p className="flex items-center gap-2 text-[12px] font-semibold">
                <l.icon className="size-3.5 shrink-0 text-brand-blue" aria-hidden /> {l.name}
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                {l.items.map((x) => (
                  <Chip key={x}>{x}</Chip>
                ))}
              </div>
            </li>
          ))}
        </ol>
        <div className="overflow-hidden rounded-xl border border-line">
          <p className="border-b border-line bg-ink-850/60 px-3 py-2 text-[11px] font-semibold text-dim">Audit events</p>
          <ul className="divide-y divide-line text-[11px]">
            {[
              ["login.mfa.success", "ok", "user · passkey"],
              ["role.granted", "ok", "approved by 2nd admin"],
              ["secret.rotated", "ok", "db-credentials"],
              ["anomaly.flagged", "wait", "unusual geo → ticket"],
            ].map(([e, s, d]) => (
              <li key={e} className="px-3 py-1.5">
                <p className="flex items-center justify-between gap-2 font-mono text-muted">
                  <span className="truncate">{e}</span>
                  {s === "ok" ? <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" aria-hidden /> : <CircleDashed className="size-3.5 shrink-0 text-amber-500" aria-hidden />}
                </p>
                <p className="truncate text-[10.5px] text-dim">{d}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Frame>
  );
}

/* ───────────────────────── 7. Digital product (web + mobile) ───────────────────────── */

export function ProductBuildVisual({ className }: { className?: string }) {
  return (
    <Frame title="Release 2.4 · web + mobile" label="Digital product delivery: a web dashboard and mobile app sharing one API, with release checks" className={className} status={<StatusPill tone="ok">Checks passed</StatusPill>}>
      <div className="grid gap-4 @md:grid-cols-[1.5fr_1fr]">
        <div className="rounded-xl border border-line">
          <div className="flex items-center gap-2 border-b border-line px-3 py-1.5">
            <Layers className="size-3.5 text-brand-blue" aria-hidden />
            <span className="text-[11px] font-semibold">Operations dashboard</span>
          </div>
          <div className="grid grid-cols-3 gap-2 p-3">
            {[["Orders", "Today"], ["Tickets", "Open"], ["Uptime", "SLO"]].map(([a, b]) => (
              <div key={a} className="rounded-lg bg-ink-850/60 p-2">
                <p className="text-[10px] text-dim">{b}</p>
                <p className="text-[12px] font-semibold">{a}</p>
              </div>
            ))}
          </div>
          <svg viewBox="0 0 240 60" className="h-16 w-full px-3 pb-3" preserveAspectRatio="none" aria-hidden>
            <path d="M0 48 L20 44 L40 46 L60 36 L80 38 L100 28 L120 30 L140 22 L160 26 L180 16 L200 18 L220 10 L240 12" fill="none" stroke="#0195ff" strokeWidth="2" vectorEffect="non-scaling-stroke" />
            <path d="M0 48 L20 44 L40 46 L60 36 L80 38 L100 28 L120 30 L140 22 L160 26 L180 16 L200 18 L220 10 L240 12 L240 60 L0 60 Z" fill="#0195ff" opacity="0.08" />
          </svg>
        </div>
        <div className="mx-auto w-full max-w-[150px] rounded-[20px] border-4 border-ink-700 bg-ink-900 p-2">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-ink-700" />
          <p className="text-[10px] text-dim">Good morning</p>
          <p className="text-[12px] font-semibold">Your orders</p>
          {["Out for delivery", "Preparing", "Delivered"].map((s, i) => (
            <div key={s} className="mt-1.5 flex items-center justify-between rounded-md bg-ink-850/70 px-1.5 py-1 text-[9.5px] text-muted">
              <span>#10{48 + i}</span>
              <span className="truncate">{s}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {[
          [CheckCircle2, "Tests"],
          [CheckCircle2, "Accessibility"],
          [CheckCircle2, "Core Web Vitals"],
          [Server, "Deployed"],
        ].map(([I, t]) => {
          const Ico = I as LucideIcon;
          return (
            <span key={t as string} className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[10.5px] text-muted">
              <Ico className="size-3 text-emerald-500" aria-hidden /> {t as string}
            </span>
          );
        })}
      </div>
    </Frame>
  );
}

/* ───────────────────────── picker ───────────────────────── */

export type SystemVisualKind = "ecosystem" | "ai" | "fintech" | "web3" | "cloud" | "security" | "digital";

const byDivision: Record<string, SystemVisualKind> = { ai: "ai", digital: "digital", fintech: "fintech", web3: "web3", "digital-assets": "web3", cloud: "cloud", product: "digital" };

/** Chooses the visual that explains a topic: the topic text first, then the division. */
export function pickSystemVisual(division: string, topic = ""): SystemVisualKind {
  const t = topic.toLowerCase();
  if (/security|audit|threat|zero trust|penetration|secrets|identity|iam|compliance|encryption/.test(t)) return "security";
  if (/blockchain|smart contract|solidity|defi|web3|token|nft|dao|wallet|exchange|stablecoin|rwa|crypto|chain|indexer|subgraph/.test(t) && !/payment gateway|card/.test(t)) return "web3";
  if (/payment|bank|card|lending|loan|fintech|ledger|remittance|neobank|wealth|invest|insurance|finance/.test(t)) return "fintech";
  if (/\bai\b|agent|llm|machine learning|rag|vision|nlp|copilot|chatbot|automation/.test(t)) return "ai";
  if (/cloud|devops|kubernetes|docker|sre|infrastructure|migration|monitoring|terraform|aws|azure|gcp|platform engineering/.test(t)) return "cloud";
  if (/api|integration|microservice|middleware|webhook|event-driven|graphql|grpc/.test(t)) return "ecosystem";
  return byDivision[division] ?? "digital";
}

export function SystemVisual({ kind, className }: { kind: SystemVisualKind; className?: string }) {
  switch (kind) {
    case "ecosystem":
      return <EcosystemVisual className={className} />;
    case "ai":
      return <AgentWorkflowVisual className={className} />;
    case "fintech":
      return <FintechFlowVisual className={className} />;
    case "web3":
      return <Web3PipelineVisual className={className} />;
    case "cloud":
      return <CloudTopologyVisual className={className} />;
    case "security":
      return <SecurityLayersVisual className={className} />;
    default:
      return <ProductBuildVisual className={className} />;
  }
}
