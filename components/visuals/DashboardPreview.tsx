import type { PreviewKind } from "@/data/types";
import { cn } from "@/lib/cn";

interface PreviewConfig {
  title: string;
  nav: string[];
  stats: [string, string, string?][];
  chart: "area" | "bars" | "candles" | "line";
  table: { cols: string[]; rows: string[][] };
  accent: string;
  chat?: boolean;
}

const cfg: Record<PreviewKind, PreviewConfig> = {
  banking: { title: "Accounts", nav: ["Overview", "Accounts", "Payments", "Cards", "Customers", "Reconciliation"], stats: [["Available", "24,180.40"], ["Pending", "1,204.00"], ["Pots", "3 active"]], chart: "area", table: { cols: ["Transaction", "Status", "Amount"], rows: [["Card · Grocery store", "Settled", "−42.18"], ["Transfer from A. Rivera", "Completed", "+500.00"], ["Direct debit · Utility", "Scheduled", "−86.00"]] }, accent: "#1fc38e" },
  payments: { title: "Payments", nav: ["Overview", "Transactions", "Routing", "Payouts", "Disputes", "Reports"], stats: [["Volume (sample)", "1.28M"], ["Approval", "Provider A · B · C"], ["Settlement", "T+1"]], chart: "bars", table: { cols: ["Payment", "Route", "State"], rows: [["pay_8F2k · Card", "Provider A", "Captured"], ["pay_91Qe · A2A", "Bank rail", "Pending"], ["pay_77Lm · Stablecoin", "Network B", "Settled"]] }, accent: "#4c82ff" },
  wallet: { title: "Wallet", nav: ["Home", "Balances", "Send", "Swap", "Cards", "Activity"], stats: [["USD", "1,240.00"], ["USDC", "860.50"], ["EUR", "310.20"]], chart: "line", table: { cols: ["Activity", "Rail", "Amount"], rows: [["Sent to @maya", "P2P", "−25.00"], ["Swap USD → USDC", "Conversion", "200.00"], ["Top-up", "Card", "+300.00"]] }, accent: "#2fd6ee" },
  cards: { title: "Cards", nav: ["Programs", "Cards", "Controls", "Authorisations", "Disputes"], stats: [["Active cards", "Program A"], ["Controls", "MCC · Geo · Limits"], ["Auth latency", "Within limits"]], chart: "bars", table: { cols: ["Card", "Control", "Status"], rows: [["•••• 4821 · Virtual", "Travel only", "Active"], ["•••• 1934 · Physical", "Daily limit", "Frozen"], ["•••• 7710 · Virtual", "Single-use", "Expired"]] }, accent: "#1fc38e" },
  lending: { title: "Loan pipeline", nav: ["Applications", "Decisions", "Loans", "Collections", "Reports"], stats: [["Applications", "Queue"], ["Auto-decisioned", "Policy v12"], ["Referrals", "Underwriter"]], chart: "area", table: { cols: ["Applicant", "Product", "Decision"], rows: [["APP-2031", "Personal loan", "Approved"], ["APP-2032", "SME line", "Referred"], ["APP-2033", "BNPL", "Approved"]] }, accent: "#1fc38e" },
  exchange: { title: "BTC-USD", nav: ["Markets", "Trade", "Orders", "Wallets", "Admin"], stats: [["Last", "Sample"], ["24h range", "Sample"], ["Book depth", "Live"]], chart: "candles", table: { cols: ["Price", "Size", "Side"], rows: [["Ask", "0.420", "Sell"], ["Ask", "1.105", "Sell"], ["Bid", "0.880", "Buy"]] }, accent: "#2fd6ee" },
  tokenization: { title: "Fund A · Tokenized units", nav: ["Assets", "Investors", "Distributions", "Transfers", "Compliance"], stats: [["Holders", "Eligible only"], ["Rules", "ERC-3643"], ["Next distribution", "Scheduled"]], chart: "line", table: { cols: ["Investor", "Eligibility", "Units"], rows: [["INV-0182", "Verified · EU", "1,000"], ["INV-0183", "Verified · SG", "2,500"], ["INV-0184", "Pending KYC", "—"]] }, accent: "#2fd6ee" },
  "ai-agent": { title: "Agent runs", nav: ["Agents", "Runs", "Tools", "Approvals", "Evaluations"], stats: [["Run", "Claims intake"], ["Steps", "Classify → Extract → Check"], ["Approval", "Required"]], chart: "bars", table: { cols: ["Step", "Tool", "Result"], rows: [["1 · Classify", "doc.classify", "Claim form"], ["2 · Extract", "doc.extract", "12 fields"], ["3 · Policy check", "policy.lookup", "Needs review"]] }, accent: "#8e6bff" },
  "ai-chat": { title: "Assistant", nav: ["Conversations", "Knowledge", "Evaluations", "Settings"], stats: [["Sources", "Help centre · Policies"], ["Grounding", "Citations on"], ["Handoff", "Enabled"]], chart: "line", table: { cols: [], rows: [] }, accent: "#8e6bff", chat: true },
  analytics: { title: "Overview", nav: ["Dashboards", "Metrics", "Alerts", "Reports", "Settings"], stats: [["Metric A", "Trend"], ["Metric B", "Trend"], ["Anomalies", "None"]], chart: "area", table: { cols: ["Signal", "Window", "Status"], rows: [["Daily volume", "7d", "Normal"], ["Latency p95", "24h", "Normal"], ["Error rate", "1h", "Watch"]] }, accent: "#48b8fa" },
  crm: { title: "Pipeline", nav: ["Accounts", "Contacts", "Pipeline", "Activities", "Reports"], stats: [["Open deals", "Stage view"], ["AI summary", "On"], ["Next actions", "Suggested"]], chart: "bars", table: { cols: ["Account", "Stage", "Owner"], rows: [["Northwind", "Proposal", "J. Lee"], ["Contoso", "Discovery", "A. Khan"], ["Fabrikam", "Negotiation", "M. Diaz"]] }, accent: "#4c82ff" },
  commerce: { title: "Storefront", nav: ["Orders", "Catalogue", "Customers", "Payments", "Settings"], stats: [["Orders", "Today"], ["Catalogue", "Variants"], ["Checkout", "Cards · A2A · Stablecoins"]], chart: "area", table: { cols: ["Order", "Payment", "Status"], rows: [["#10482", "Card", "Paid"], ["#10483", "Stablecoin", "Paid"], ["#10484", "A2A", "Pending"]] }, accent: "#4c82ff" },
  booking: { title: "Schedule", nav: ["Calendar", "Bookings", "Resources", "Customers", "Payments"], stats: [["Today", "Bookings"], ["Resources", "Rooms · Staff"], ["Reminders", "Automated"]], chart: "bars", table: { cols: ["Time", "Booking", "Status"], rows: [["09:00", "Consultation", "Confirmed"], ["10:30", "Session", "Deposit paid"], ["13:00", "Tour", "Waitlist"]] }, accent: "#4c82ff" },
  learning: { title: "Course", nav: ["Courses", "Cohorts", "Assessments", "Certificates", "Tutor"], stats: [["Modules", "Structured"], ["Cohort", "Live"], ["Certificate", "Verifiable"]], chart: "line", table: { cols: ["Module", "Type", "Progress"], rows: [["1 · Foundations", "Video", "Complete"], ["2 · Practice", "Quiz", "In progress"], ["3 · Project", "Assignment", "Locked"]] }, accent: "#4c82ff" },
  logistics: { title: "Dispatch", nav: ["Orders", "Dispatch", "Drivers", "Tracking", "Analytics"], stats: [["Routes", "Optimised"], ["Drivers", "Online"], ["ETAs", "Live"]], chart: "line", table: { cols: ["Shipment", "Driver", "Status"], rows: [["SHP-5520", "Route 4", "Out for delivery"], ["SHP-5521", "Route 2", "Picked up"], ["SHP-5522", "Route 7", "Delivered"]] }, accent: "#4c82ff" },
  explorer: { title: "Explorer", nav: ["Blocks", "Transactions", "Tokens", "Contracts", "Stats"], stats: [["Latest block", "Live"], ["Tx/s", "Live"], ["Verified contracts", "Indexed"]], chart: "bars", table: { cols: ["Tx hash", "Method", "Status"], rows: [["0x8f2…a91", "transfer", "Success"], ["0x1c7…4de", "swap", "Success"], ["0x9b0…77f", "mint", "Pending"]] }, accent: "#2fd6ee" },
  defi: { title: "Pools", nav: ["Swap", "Pools", "Lend", "Vaults", "Stake"], stats: [["Pools", "Active"], ["Oracles", "Healthy"], ["Caps", "Guarded launch"]], chart: "area", table: { cols: ["Market", "Utilisation", "Health"], rows: [["USDC", "Moderate", "Healthy"], ["ETH", "Low", "Healthy"], ["RWA-A", "Capped", "Healthy"]] }, accent: "#2fd6ee" },
  dao: { title: "Governance", nav: ["Proposals", "Delegates", "Treasury", "Streams"], stats: [["Active proposals", "Voting"], ["Quorum", "Configured"], ["Timelock", "48h"]], chart: "bars", table: { cols: ["Proposal", "State", "Votes"], rows: [["SIP-21 · Grants", "Active", "For leading"], ["SIP-20 · Fee change", "Queued", "Passed"], ["SIP-19 · Upgrade", "Executed", "Passed"]] }, accent: "#2fd6ee" },
  portal: { title: "Portal", nav: ["Dashboard", "Requests", "Documents", "Billing", "Settings"], stats: [["Open requests", "Tracked"], ["Documents", "Secure vault"], ["SSO", "Enabled"]], chart: "line", table: { cols: ["Request", "Owner", "Status"], rows: [["REQ-301", "Support", "In progress"], ["REQ-302", "Finance", "Resolved"], ["REQ-303", "Onboarding", "New"]] }, accent: "#4c82ff" },
};

function Chart({ kind, color }: { kind: PreviewConfig["chart"]; color: string }) {
  const pts = [18, 26, 22, 34, 30, 42, 38, 50, 46, 58, 54, 66];
  if (kind === "bars")
    return (
      <svg viewBox="0 0 240 80" className="h-full w-full" preserveAspectRatio="none" aria-hidden>
        {pts.map((v, i) => (
          <rect key={i} x={i * 20 + 4} y={80 - v} width={12} height={v} rx={2} fill={color} opacity={0.25 + (i / pts.length) * 0.6} />
        ))}
      </svg>
    );
  if (kind === "candles")
    return (
      <svg viewBox="0 0 240 80" className="h-full w-full" preserveAspectRatio="none" aria-hidden>
        {pts.map((v, i) => {
          const up = i % 3 !== 1;
          return (
            <g key={i}>
              <line x1={i * 20 + 10} x2={i * 20 + 10} y1={80 - v - 10} y2={80 - v + 14} stroke={up ? "#1fc38e" : "#f06a6a"} strokeWidth={1} />
              <rect x={i * 20 + 5} y={80 - v - 4} width={10} height={12} fill={up ? "#1fc38e" : "#f06a6a"} opacity={0.85} />
            </g>
          );
        })}
      </svg>
    );
  const d = pts.map((v, i) => `${i === 0 ? "M" : "L"}${(i * 240) / (pts.length - 1)},${80 - v}`).join(" ");
  return (
    <svg viewBox="0 0 240 80" className="h-full w-full" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={`fill-${color.slice(1)}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {kind === "area" && <path d={`${d} L240,80 L0,80 Z`} fill={`url(#fill-${color.slice(1)})`} />}
      <path d={d} fill="none" stroke={color} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Illustrative product UI rendered in code (no stock imagery). Replace with real screenshots via data/demoLinks.ts. */
export function DashboardPreview({ kind, name, className }: { kind: PreviewKind; name?: string; className?: string }) {
  const c = cfg[kind];
  return (
    <figure className={cn("relative", className)}>
      <div className="overflow-hidden rounded-2xl border border-line-strong bg-ink-900 shadow-[0_40px_120px_-40px_rgba(0,0,0,0.8)]">
        <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="ml-3 truncate font-mono text-[10.5px] text-dim">{name ?? "app"} · {c.title}</span>
        </div>
        <div className="grid grid-cols-[88px_1fr] sm:grid-cols-[120px_1fr]">
          <aside className="border-r border-line p-2.5">
            {c.nav.map((n, i) => (
              <div key={n} className={cn("mb-1 truncate rounded-md px-2 py-1.5 text-[10.5px]", i === 0 ? "bg-white/[0.06] text-fg" : "text-dim")}>
                {n}
              </div>
            ))}
          </aside>
          <div className="min-w-0 p-3 sm:p-4">
            <div className="grid grid-cols-3 gap-2">
              {c.stats.map(([label, value]) => (
                <div key={label} className="rounded-lg border border-line bg-ink-950/60 p-2">
                  <p className="truncate text-[9.5px] text-dim">{label}</p>
                  <p className="mt-0.5 truncate text-[11.5px] font-medium text-fg">{value}</p>
                </div>
              ))}
            </div>
            {c.chat ? (
              <div className="mt-3 space-y-2">
                <div className="ml-auto w-3/4 rounded-xl rounded-br-sm bg-white/[0.06] px-3 py-2 text-[10.5px] text-fg">How do I change my card limit?</div>
                <div className="w-5/6 rounded-xl rounded-bl-sm border border-line px-3 py-2 text-[10.5px] text-muted">
                  Open <span className="text-fg">Cards → Controls</span> and set a new daily limit. Changes apply immediately.
                  <span className="mt-1.5 block font-mono text-[9px]" style={{ color: c.accent }}>
                    Source: Cards help · Section 3
                  </span>
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-[10px] text-dim">Ask a question…</div>
              </div>
            ) : (
              <>
                <div className="mt-3 h-20 rounded-lg border border-line bg-ink-950/60 p-2 sm:h-24">
                  <Chart kind={c.chart} color={c.accent} />
                </div>
                <div className="mt-3 overflow-hidden rounded-lg border border-line">
                  <div className="grid grid-cols-3 border-b border-line bg-white/[0.02] px-2 py-1.5">
                    {c.table.cols.map((h) => (
                      <span key={h} className="truncate text-[9.5px] text-dim">
                        {h}
                      </span>
                    ))}
                  </div>
                  {c.table.rows.map((r) => (
                    <div key={r[0]} className="grid grid-cols-3 border-b border-line px-2 py-1.5 last:border-0">
                      {r.map((cell, i) => (
                        <span key={i} className={cn("truncate text-[10px]", i === 0 ? "text-fg" : "text-muted")}>
                          {cell}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      <figcaption className="mt-2 text-right font-mono text-[10px] text-dim">Illustrative interface · sample data</figcaption>
    </figure>
  );
}
