import type { CSSProperties, ReactNode } from "react";
import {
  ArrowDownLeft, ArrowUpRight, Bot, Box, Check, CheckCircle2, Cloud, Cpu, Loader2, Lock, Server, ShieldCheck, Sparkles, Wifi,
} from "lucide-react";
import type { DivisionId } from "@/data/types";
import { cn } from "@/lib/cn";

/**
 * Illustrated scenes, one per division. Composed from code (no image files) so they stay crisp,
 * theme-independent and light. Always rendered as a dark "stage" so they read the same in both themes.
 */
const palettes: Record<DivisionId | "product", [string, string]> = {
  ai: ["rgb(107 124 255 / 0.55)", "rgb(1 149 255 / 0.25)"],
  digital: ["rgb(1 149 255 / 0.5)", "rgb(92 200 255 / 0.25)"],
  fintech: ["rgb(20 200 176 / 0.45)", "rgb(1 149 255 / 0.3)"],
  web3: ["rgb(34 211 238 / 0.45)", "rgb(107 124 255 / 0.3)"],
  cloud: ["rgb(92 200 255 / 0.5)", "rgb(1 149 255 / 0.25)"],
  product: ["rgb(1 149 255 / 0.45)", "rgb(34 211 238 / 0.2)"],
};

export function DivisionArt({ division, className, label }: { division: DivisionId | "product"; className?: string; label?: string }) {
  const [a, b] = palettes[division];
  const Scene = { ai: AIScene, digital: DigitalScene, fintech: FinTechScene, web3: Web3Scene, cloud: CloudScene, product: DigitalScene }[division];
  return (
    <div
      data-theme="dark"
      role="img"
      aria-label={label ?? "Illustration"}
      className={cn("scene relative isolate aspect-[5/4] w-full overflow-hidden rounded-3xl border border-white/10 text-fg", className)}
      style={{ "--scene-a": a, "--scene-b": b } as CSSProperties}
    >
      <Dots />
      <div aria-hidden className="absolute inset-0">
        <Scene />
      </div>
    </div>
  );
}

function Dots() {
  return (
    <div
      aria-hidden
      className="absolute inset-0 opacity-[0.35]"
      style={{ backgroundImage: "radial-gradient(rgb(255 255 255 / 0.12) 1px, transparent 1px)", backgroundSize: "22px 22px", maskImage: "radial-gradient(ellipse at 60% 40%, black, transparent 75%)" }}
    />
  );
}

function Card({ className, children, style }: { className?: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <div className={cn("float-card absolute p-3.5 text-[11px] leading-snug", className)} style={style}>
      {children}
    </div>
  );
}

function Mark({ className }: { className?: string }) {
  // Cached file instead of an inline path: the mark appears in several scenes per page.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/brand/shivacha-mark.svg" alt="" className={className} />;
}

function Bar({ w, className }: { w: string; className?: string }) {
  return <span className={cn("block h-1.5 rounded-full bg-white/15", className)} style={{ width: w }} />;
}

/* ---------------- AI ---------------- */
function AIScene() {
  return (
    <>
      <Card className="top-[9%] left-[7%] w-[58%] drift">
        <div className="mb-2.5 flex items-center gap-2 text-white/60">
          <span className="flex size-5 items-center justify-center rounded-md bg-white/10 text-[9px]">U</span>
          Summarise the claim and check policy cover.
        </div>
        <div className="rounded-lg border border-[#6b7cff]/30 bg-[#6b7cff]/10 p-2.5">
          <div className="mb-1.5 flex items-center gap-1.5 font-semibold text-[#aab4ff]">
            <Sparkles className="size-3" /> Assistant
          </div>
          <p className="text-white/80">Water damage, kitchen. Covered under section 4.2, excess applies.</p>
          <div className="mt-2 flex gap-1.5">
            {["policy.pdf · p4", "claim-2031"].map((c) => (
              <span key={c} className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[9px] text-white/60">
                {c}
              </span>
            ))}
          </div>
        </div>
      </Card>
      <Card className="right-[6%] bottom-[10%] w-[50%] drift-slow">
        <div className="mb-2.5 flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-semibold text-white">
            <Bot className="size-3.5 text-[#aab4ff]" /> Agent run
          </span>
          <span className="rounded-full bg-emerald-400/15 px-1.5 py-0.5 text-[9px] text-emerald-300">live</span>
        </div>
        {[
          ["Classify document", true],
          ["Extract 12 fields", true],
          ["Check policy rules", false],
        ].map(([t, done]) => (
          <div key={String(t)} className="flex items-center gap-2 border-t border-white/5 py-1.5 text-white/75">
            {done ? <CheckCircle2 className="size-3.5 text-emerald-400" /> : <Loader2 className="size-3.5 animate-spin text-[#aab4ff]" />}
            {t}
          </div>
        ))}
        <div className="mt-1.5 flex items-center gap-1.5 rounded-md bg-amber-400/10 px-2 py-1 text-[9.5px] text-amber-200">
          <ShieldCheck className="size-3" /> Human approval required
        </div>
      </Card>
      <Card className="bottom-[14%] left-[8%] hidden w-[30%] sm:block">
        <p className="text-white/55">Eval score</p>
        <p className="mt-0.5 text-lg font-semibold text-white">0.94</p>
        <div className="mt-2 flex h-8 items-end gap-1">
          {[40, 55, 48, 70, 66, 82, 90].map((h, i) => (
            <span key={i} className="flex-1 rounded-sm bg-[#6b7cff]" style={{ height: `${h}%`, opacity: 0.35 + i * 0.09 }} />
          ))}
        </div>
      </Card>
    </>
  );
}

/* ---------------- FinTech ---------------- */
function FinTechScene() {
  return (
    <>
      <div
        className="drift absolute top-[10%] left-[8%] aspect-[1.6] w-[52%] rounded-2xl p-4 shadow-[0_30px_60px_-20px_rgb(0_0_0/0.8)]"
        style={{ background: "linear-gradient(135deg, #0195ff 0%, #0a6fd1 45%, #14c8b0 130%)", transform: "rotate(-6deg)" }}
      >
        <div className="flex items-start justify-between">
          <Mark className="size-7 brightness-0 invert" />
          <Wifi className="size-4 rotate-90 text-white/80" />
        </div>
        <div className="mt-[14%] h-5 w-7 rounded-md bg-gradient-to-br from-amber-200 to-amber-400 opacity-90" />
        <p className="mt-3 font-mono text-[12px] tracking-[0.2em] text-white/90">•••• 4821</p>
        <p className="mt-1 text-[9px] tracking-wider text-white/70 uppercase">Virtual · Program A</p>
      </div>
      <Card className="top-[8%] right-[6%] w-[38%] drift-slow">
        <p className="text-white/55">Available balance</p>
        <p className="mt-0.5 text-lg font-semibold text-white">24,180.40</p>
        <svg viewBox="0 0 120 36" className="mt-1.5 h-9 w-full">
          <defs>
            <linearGradient id="ft-g" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#14c8b0" stopOpacity=".5" />
              <stop offset="1" stopColor="#14c8b0" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M0 30 L15 26 L30 28 L45 18 L60 21 L75 12 L90 15 L105 6 L120 8 L120 36 L0 36Z" fill="url(#ft-g)" />
          <path d="M0 30 L15 26 L30 28 L45 18 L60 21 L75 12 L90 15 L105 6 L120 8" fill="none" stroke="#14c8b0" strokeWidth="1.6" />
        </svg>
      </Card>
      <Card className="right-[6%] bottom-[8%] left-[20%]">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="font-semibold text-white">Recent activity</span>
          <span className="text-white/40">Today</span>
        </div>
        {[
          ["Card · Grocery store", "−42.18", false, "Settled"],
          ["Transfer from A. Rivera", "+500.00", true, "Completed"],
          ["USDC → USD conversion", "+200.00", true, "Settled"],
        ].map(([t, v, inc, st]) => (
          <div key={String(t)} className="flex items-center gap-2.5 border-t border-white/5 py-1.5">
            <span className={cn("flex size-6 items-center justify-center rounded-full", inc ? "bg-emerald-400/15 text-emerald-300" : "bg-white/10 text-white/70")}>
              {inc ? <ArrowDownLeft className="size-3" /> : <ArrowUpRight className="size-3" />}
            </span>
            <span className="flex-1 text-white/80">{t}</span>
            <span className="hidden text-white/40 sm:inline">{st}</span>
            <span className={cn("w-16 text-right font-medium", inc ? "text-emerald-300" : "text-white")}>{v}</span>
          </div>
        ))}
      </Card>
    </>
  );
}

/* ---------------- Web3 ---------------- */
function Cube({ className, tone = "#22d3ee", label }: { className?: string; tone?: string; label: string }) {
  return (
    <div className={cn("absolute", className)}>
      <svg viewBox="0 0 100 110" className="w-full drop-shadow-[0_20px_30px_rgb(0_0_0/0.6)]">
        <path d="M50 5 L95 30 L50 55 L5 30Z" fill={tone} fillOpacity=".55" />
        <path d="M5 30 L50 55 L50 105 L5 80Z" fill={tone} fillOpacity=".3" />
        <path d="M95 30 L50 55 L50 105 L95 80Z" fill={tone} fillOpacity=".18" />
        <path d="M50 5 L95 30 L95 80 L50 105 L5 80 L5 30Z M5 30 L50 55 L95 30 M50 55 L50 105" fill="none" stroke="white" strokeOpacity=".35" strokeWidth="1" />
      </svg>
      <span className="absolute inset-x-0 -bottom-5 text-center font-mono text-[9px] text-white/60">{label}</span>
    </div>
  );
}

function Web3Scene() {
  return (
    <>
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 500 400" preserveAspectRatio="none" aria-hidden>
        <path d="M95 150 C 150 150, 170 120, 225 120 S 310 150, 365 150" fill="none" stroke="#22d3ee" strokeOpacity=".5" strokeWidth="1.5" strokeDasharray="4 5" className="animate-dash" />
      </svg>
      <Cube className="top-[22%] left-[7%] w-[18%]" label="#18,204,551" />
      <Cube className="top-[15%] left-[41%] w-[18%] drift" tone="#6b7cff" label="#18,204,552" />
      <Cube className="top-[22%] right-[7%] w-[18%]" label="#18,204,553" />
      <Card className="bottom-[8%] left-[7%] w-[48%] drift-slow">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-[#22d3ee]/15 text-[#67e8f9]">
            <Box className="size-4" />
          </span>
          <div>
            <p className="font-semibold text-white">Fund A · Tokenized units</p>
            <p className="text-white/50">ERC-3643 · eligible holders only</p>
          </div>
        </div>
        <div className="mt-2.5 grid grid-cols-3 gap-2 border-t border-white/5 pt-2.5">
          {[
            ["Holders", "128"],
            ["Units", "40,000"],
            ["NAV", "1.024"],
          ].map(([k, v]) => (
            <div key={k}>
              <p className="text-[9px] text-white/45">{k}</p>
              <p className="font-semibold text-white">{v}</p>
            </div>
          ))}
        </div>
      </Card>
      <Card className="right-[6%] bottom-[12%] w-[38%]">
        <div className="flex items-center gap-1.5 font-semibold text-emerald-300">
          <CheckCircle2 className="size-3.5" /> Transfer confirmed
        </div>
        <p className="mt-1.5 font-mono text-[10px] text-white/60">0x8f2…a91 → 0x1c7…4de</p>
        <div className="mt-2 flex items-center justify-between rounded-md bg-white/5 px-2 py-1">
          <span className="text-white/55">Compliance check</span>
          <Check className="size-3 text-emerald-300" />
        </div>
      </Card>
    </>
  );
}

/* ---------------- Cloud ---------------- */
function CloudScene() {
  const pods = Array.from({ length: 12 }, (_, i) => i);
  return (
    <>
      <Card className="top-[9%] left-[7%] w-[54%] drift">
        <div className="mb-2 flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-semibold text-white">
            <Server className="size-3.5 text-[#7dd3fc]" /> prod-cluster · eu-west
          </span>
          <span className="text-white/45">k8s 1.31</span>
        </div>
        <div className="grid grid-cols-6 gap-1.5">
          {pods.map((i) => (
            <span key={i} className={cn("flex aspect-square items-center justify-center rounded-md border", i === 7 ? "border-amber-300/40 bg-amber-300/15" : "border-[#5cc8ff]/30 bg-[#5cc8ff]/10")}>
              <Cpu className={cn("size-3", i === 7 ? "text-amber-200" : "text-[#7dd3fc]")} />
            </span>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[10px] text-white/50">
          <span>11/12 healthy</span>
          <span className="text-amber-200">1 rolling update</span>
        </div>
      </Card>
      <Card className="top-[14%] right-[6%] w-[31%] drift-slow">
        <p className="text-white/55">Uptime · 30d</p>
        <p className="mt-0.5 text-lg font-semibold text-white">99.98%</p>
        <div className="mt-2 flex gap-[3px]">
          {Array.from({ length: 18 }, (_, i) => (
            <span key={i} className={cn("h-5 flex-1 rounded-[2px]", i === 11 ? "bg-amber-300/70" : "bg-emerald-400/70")} />
          ))}
        </div>
      </Card>
      <Card className="right-[6%] bottom-[9%] left-[16%]">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-semibold text-white">Deploy pipeline</span>
          <span className="font-mono text-white/45">main · 4f2a91c</span>
        </div>
        <div className="flex items-center gap-2">
          {["Build", "Test", "Scan", "Staging", "Prod"].map((s, i) => (
            <div key={s} className="flex flex-1 items-center gap-2">
              <span className={cn("flex w-full items-center justify-center gap-1 rounded-md border py-1.5 text-[10px]", i < 4 ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "border-[#5cc8ff]/40 bg-[#5cc8ff]/10 text-[#bae6fd]")}>
                {i < 4 ? <Check className="size-3" /> : <Loader2 className="size-3 animate-spin" />}
                {s}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-2.5 flex items-center gap-3 text-[10px] text-white/55">
          <span className="flex items-center gap-1">
            <Lock className="size-3" /> Secrets in vault
          </span>
          <span className="flex items-center gap-1">
            <Cloud className="size-3" /> Terraform plan: 3 changes
          </span>
        </div>
      </Card>
    </>
  );
}

/* ---------------- Digital ---------------- */
function DigitalScene() {
  return (
    <>
      <div className="float-card drift absolute top-[9%] left-[6%] w-[66%] overflow-hidden p-0">
        <div className="flex items-center gap-1.5 border-b border-white/10 px-3 py-2">
          {[0, 1, 2].map((i) => (
            <span key={i} className="size-2 rounded-full bg-white/20" />
          ))}
          <span className="ml-2 flex-1 rounded bg-white/5 px-2 py-0.5 font-mono text-[9px] text-white/45">app.yourproduct.com</span>
        </div>
        <div className="grid grid-cols-[56px_1fr] gap-3 p-3">
          <div className="space-y-2">
            <Mark className="mb-3 size-5" />
            {["72%", "55%", "80%", "60%"].map((w, i) => (
              <Bar key={i} w={w} className={i === 0 ? "bg-[#0195ff]/70" : undefined} />
            ))}
          </div>
          <div>
            <Bar w="40%" className="mb-2 h-2.5 bg-white/30" />
            <div className="grid grid-cols-3 gap-2">
              {["#0195ff", "#14c8b0", "#6b7cff"].map((c) => (
                <div key={c} className="rounded-lg border border-white/10 bg-white/[0.04] p-2">
                  <Bar w="50%" />
                  <span className="mt-1.5 block h-2.5 w-3/4 rounded-full" style={{ background: c }} />
                </div>
              ))}
            </div>
            <div className="mt-2 flex h-14 items-end gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] p-2">
              {[30, 50, 42, 65, 58, 80, 72, 92].map((h, i) => (
                <span key={i} className="flex-1 rounded-sm bg-[#0195ff]" style={{ height: `${h}%`, opacity: 0.35 + i * 0.08 }} />
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="drift-slow absolute right-[7%] bottom-[7%] w-[27%] rounded-[22px] border-[5px] border-[#1c2a40] bg-[#0b1626] p-2 shadow-[0_30px_60px_-20px_rgb(0_0_0/0.9)]">
        <div className="mx-auto mb-2 h-1 w-8 rounded-full bg-white/15" />
        <Bar w="55%" className="mb-2 h-2 bg-white/30" />
        <div className="rounded-lg p-2" style={{ background: "linear-gradient(135deg,#0195ff,#14c8b0)" }}>
          <p className="text-[8px] text-white/80">Balance</p>
          <p className="text-[11px] font-semibold text-white">1,240.00</p>
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="mt-1.5 flex items-center gap-1.5">
            <span className="size-4 rounded-full bg-white/10" />
            <Bar w="60%" />
          </div>
        ))}
      </div>
      <Card className="bottom-[10%] left-[8%] w-[34%]">
        <p className="mb-2 font-semibold text-white">Core Web Vitals</p>
        <div className="flex gap-2">
          {[
            ["LCP", "1.2s"],
            ["INP", "90ms"],
            ["CLS", "0.01"],
          ].map(([k, v]) => (
            <div key={k} className="flex-1 rounded-md bg-emerald-400/10 px-1.5 py-1 text-center">
              <p className="text-[8.5px] text-emerald-200/80">{k}</p>
              <p className="text-[10.5px] font-semibold text-emerald-200">{v}</p>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

/** Homepage hero: one product surface with AI, Web3 and cloud signals around it. */
export function HeroScene({ className }: { className?: string }) {
  return (
    <div
      data-theme="dark"
      role="img"
      aria-label="Illustration of a Shivacha-built platform: payments dashboard, AI agent, blockchain transfer and cloud status"
      className={cn("scene relative isolate aspect-[1/1] w-full overflow-hidden rounded-[28px] border border-white/10 text-fg sm:aspect-[6/5]", className)}
    >
      <Dots />
      <div aria-hidden className="absolute inset-0">
        <div className="float-card absolute top-[12%] left-[8%] w-[74%] overflow-hidden p-0">
          <div className="flex items-center gap-1.5 border-b border-white/10 px-3 py-2">
            {[0, 1, 2].map((i) => (
              <span key={i} className="size-2 rounded-full bg-white/20" />
            ))}
            <span className="ml-2 font-mono text-[9.5px] text-white/50">Payments · Overview</span>
          </div>
          <div className="p-3.5">
            <div className="grid grid-cols-3 gap-2 text-[10px]">
              {[
                ["Volume today", "1.28M", "+8.2%"],
                ["Success rate", "98.4%", "+0.6%"],
                ["Settled", "T+1", "on time"],
              ].map(([k, v, d]) => (
                <div key={k} className="rounded-lg border border-white/10 bg-white/[0.04] p-2">
                  <p className="text-white/50">{k}</p>
                  <p className="mt-0.5 text-[13px] font-semibold text-white">{v}</p>
                  <p className="text-emerald-300">{d}</p>
                </div>
              ))}
            </div>
            <svg viewBox="0 0 300 80" className="mt-3 h-20 w-full">
              <defs>
                <linearGradient id="hero-g" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="#0195ff" stopOpacity=".55" />
                  <stop offset="1" stopColor="#0195ff" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d="M0 64 L25 58 L50 60 L75 46 L100 50 L125 36 L150 40 L175 28 L200 32 L225 20 L250 24 L275 12 L300 14 L300 80 L0 80Z" fill="url(#hero-g)" />
              <path d="M0 64 L25 58 L50 60 L75 46 L100 50 L125 36 L150 40 L175 28 L200 32 L225 20 L250 24 L275 12 L300 14" fill="none" stroke="#33aaff" strokeWidth="2" />
            </svg>
            <div className="mt-2 space-y-1 text-[10px]">
              {[
                ["pay_8F2k · Card", "Provider A", "Captured"],
                ["pay_91Qe · A2A", "Bank rail", "Pending"],
              ].map(([a, b, c]) => (
                <div key={a} className="flex justify-between border-t border-white/5 pt-1 text-white/70">
                  <span>{a}</span>
                  <span className="text-white/45">{b}</span>
                  <span className={c === "Captured" ? "text-emerald-300" : "text-amber-200"}>{c}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <Card className="drift top-[5%] right-[5%] hidden w-[40%] sm:block">
          <div className="flex items-center gap-1.5 font-semibold text-white">
            <Bot className="size-3.5 text-[#aab4ff]" /> Fraud agent
          </div>
          <p className="mt-1 text-white/65">Flagged 3 of 1,204 payments for review.</p>
          <div className="mt-2 flex items-center gap-1.5 text-[9.5px] text-[#aab4ff]">
            <Sparkles className="size-3" /> Explainable · human-approved
          </div>
        </Card>
        <Card className="drift-slow bottom-[7%] left-[5%] w-[44%]">
          <div className="flex items-center gap-1.5 font-semibold text-emerald-300">
            <CheckCircle2 className="size-3.5" /> Stablecoin settlement
          </div>
          <p className="mt-1 font-mono text-[10px] text-white/55">0x8f2…a91 · 12 confirmations</p>
        </Card>
        <Card className="right-[6%] bottom-[12%] hidden w-[34%] sm:block">
          <p className="flex items-center gap-1.5 text-white/60">
            <Server className="size-3 text-[#7dd3fc]" /> 3 regions
          </p>
          <p className="mt-0.5 text-[15px] font-semibold text-white">99.98%</p>
          <div className="mt-1.5 flex gap-[3px]">
            {Array.from({ length: 14 }, (_, i) => (
              <span key={i} className="h-3.5 flex-1 rounded-[2px] bg-emerald-400/70" />
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
