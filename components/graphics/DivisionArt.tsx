import Image from "next/image";
import type { ReactNode } from "react";
import { Activity, Bot, CheckCircle2, Gauge, Lock, ShieldCheck, TrendingUp, Webhook } from "lucide-react";
import type { DivisionId } from "@/data/types";
import { cn } from "@/lib/cn";

/**
 * Illustrations built from offline 3D renders (public/graphics, source in scripts/graphics) plus small
 * code-drawn UI cards. No stock imagery. Sample figures on the cards are illustrative only.
 */

type RenderKey = "blockchain" | "fintech" | "ai" | "cloud" | "digital" | "tokens" | "security" | "exchange" | "api" | "globe";

export const RENDERS: Record<RenderKey, { src: string; w: number; h: number; dark?: boolean }> = {
  blockchain: { src: "/graphics/3d-blockchain.png", w: 1142, h: 752 },
  fintech: { src: "/graphics/3d-fintech.png", w: 1192, h: 734 },
  cloud: { src: "/graphics/3d-cloud.png", w: 959, h: 1087 },
  digital: { src: "/graphics/3d-digital.png", w: 966, h: 751 },
  tokens: { src: "/graphics/3d-tokens.png", w: 738, h: 865 },
  security: { src: "/graphics/3d-security.png", w: 915, h: 563 },
  exchange: { src: "/graphics/3d-exchange.png", w: 1214, h: 792 },
  api: { src: "/graphics/3d-api.png", w: 1195, h: 693 },
  ai: { src: "/graphics/3d-ai.jpg", w: 1600, h: 1200, dark: true },
  globe: { src: "/graphics/3d-globe.jpg", w: 1600, h: 1200, dark: true },
};

const byDivision: Record<DivisionId | "product", RenderKey> = { ai: "ai", digital: "digital", fintech: "fintech", web3: "blockchain", cloud: "cloud", product: "digital" };

/** Picks a render from the topic (service / group name) first, then the division. */
export function pickRender(division: DivisionId | "product", topic = ""): RenderKey {
  const t = topic.toLowerCase();
  if (/exchange|trading|brokerage|order book|market making/.test(t)) return "exchange";
  if (/security|audit|threat|zero trust|penetration|secrets|identity|compliance/.test(t)) return "security";
  if (/token|rwa|securit(y|ies) token|stablecoin|nft/.test(t)) return "tokens";
  if (/api|integration|microservice|middleware|webhook|interoperab/.test(t)) return "api";
  if (/payment|bank|card|lending|wallet|fintech|ledger|remittance|neobank/.test(t)) return "fintech";
  if (/blockchain|smart contract|defi|web3|protocol|dao|chain/.test(t)) return "blockchain";
  if (/\bai\b|agent|llm|machine learning|rag|vision|nlp|copilot/.test(t)) return "ai";
  if (/cloud|devops|kubernetes|sre|infrastructure|migration|monitoring/.test(t)) return "cloud";
  if (/mobile|web|saas|mvp|product|app/.test(t)) return "digital";
  return byDivision[division];
}

const tint: Record<RenderKey, string> = {
  blockchain: "from-[#e7f3ff] via-[#f3f8ff] to-[#e9fbff]",
  fintech: "from-[#e6fbf7] via-[#f2f9ff] to-[#e7f1ff]",
  cloud: "from-[#e9f5ff] via-[#f5f9ff] to-[#eaf0ff]",
  digital: "from-[#eaf2ff] via-[#f7f9fc] to-[#e7f7ff]",
  tokens: "from-[#e8f8ff] via-[#f5f9ff] to-[#eeeeff]",
  security: "from-[#e8efff] via-[#f5f8ff] to-[#e7f6ff]",
  exchange: "from-[#e8faf6] via-[#f5f9ff] to-[#fdf0f0]",
  api: "from-[#eaf1ff] via-[#f6f9ff] to-[#e7f9fb]",
  ai: "",
  globe: "",
};

function FloatCard({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("absolute rounded-2xl border border-black/5 bg-white/90 p-3 text-[11px] leading-snug text-[#0b1424] shadow-[0_18px_40px_-18px_rgb(11_20_36/0.35)] backdrop-blur-sm", className)}>{children}</div>;
}

function Overlay({ k }: { k: RenderKey }) {
  switch (k) {
    case "fintech":
      return (
        <>
          <FloatCard className="top-[7%] left-[6%]">
            <p className="flex items-center gap-1.5 font-semibold text-emerald-600"><CheckCircle2 className="size-3.5" /> Settled · +500.00</p>
            <p className="text-[#5b6678]">Transfer from A. Rivera</p>
          </FloatCard>
          <FloatCard className="right-[6%] bottom-[8%]">
            <p className="text-[#5b6678]">Success rate</p>
            <p className="text-base font-semibold">98.4%</p>
          </FloatCard>
        </>
      );
    case "blockchain":
    case "tokens":
      return (
        <FloatCard className="right-[6%] bottom-[8%]">
          <p className="flex items-center gap-1.5 font-semibold text-emerald-600"><CheckCircle2 className="size-3.5" /> Transfer confirmed</p>
          <p className="font-mono text-[10px] text-[#5b6678]">0x8f2…a91 · 12 confirmations</p>
        </FloatCard>
      );
    case "cloud":
      return (
        <FloatCard className="right-[6%] bottom-[8%]">
          <p className="flex items-center gap-1.5 text-[#5b6678]"><Activity className="size-3.5 text-[#0195ff]" /> Uptime · 30 days</p>
          <p className="text-base font-semibold">99.98%</p>
        </FloatCard>
      );
    case "digital":
      return (
        <FloatCard className="top-[7%] left-[6%]">
          <p className="flex items-center gap-1.5 font-semibold"><Gauge className="size-3.5 text-[#0195ff]" /> Core Web Vitals</p>
          <p className="text-[#5b6678]">LCP 1.2s · INP 90ms · CLS 0.01</p>
        </FloatCard>
      );
    case "security":
      return (
        <FloatCard className="top-[8%] left-[6%]">
          <p className="flex items-center gap-1.5 font-semibold"><ShieldCheck className="size-3.5 text-[#0195ff]" /> Threat model reviewed</p>
          <p className="flex items-center gap-1.5 text-[#5b6678]"><Lock className="size-3" /> Secrets in vault</p>
        </FloatCard>
      );
    case "exchange":
      return (
        <FloatCard className="top-[7%] left-[6%]">
          <p className="flex items-center gap-1.5 font-semibold"><TrendingUp className="size-3.5 text-emerald-600" /> BTC-USD · live depth</p>
          <p className="text-[#5b6678]">Matching engine · p99 &lt; 5 ms</p>
        </FloatCard>
      );
    case "api":
      return (
        <FloatCard className="right-[6%] bottom-[8%]">
          <p className="flex items-center gap-1.5 font-semibold"><Webhook className="size-3.5 text-[#0195ff]" /> webhook.delivered</p>
          <p className="font-mono text-[10px] text-emerald-600">200 OK · 84 ms</p>
        </FloatCard>
      );
    case "ai":
      return (
        <div className="absolute right-[5%] bottom-[7%] rounded-2xl border border-white/10 bg-[#0d1b2e]/85 p-3 text-[11px] text-white shadow-2xl backdrop-blur">
          <p className="flex items-center gap-1.5 font-semibold"><Bot className="size-3.5 text-[#aab4ff]" /> Agent run · 3 of 3 checks</p>
          <p className="text-white/60">Human approval before payout</p>
        </div>
      );
    default:
      return null;
  }
}

/** A 3D illustration on a soft stage, chosen by division and (optionally) topic. */
export function DivisionArt({ division, topic, className, label, priority }: { division: DivisionId | "product"; topic?: string; className?: string; label?: string; priority?: boolean }) {
  const k = pickRender(division, topic);
  return <RenderStage k={k} className={className} label={label} priority={priority} />;
}

export function RenderStage({ k, className, label, priority, overlay = true }: { k: RenderKey; className?: string; label?: string; priority?: boolean; overlay?: boolean }) {
  const r = RENDERS[k];
  return (
    <figure className={cn("relative isolate aspect-[5/4] w-full overflow-hidden rounded-3xl border", r.dark ? "border-white/10 bg-[#050c18]" : cn("border-line bg-gradient-to-br", tint[k]), className)}>
      {!r.dark && (
        <div aria-hidden className="absolute inset-0 opacity-60" style={{ backgroundImage: "radial-gradient(rgb(1 115 204 / 0.12) 1px, transparent 1px)", backgroundSize: "22px 22px", maskImage: "radial-gradient(ellipse at 50% 45%, black 30%, transparent 75%)" }} />
      )}
      <Image
        src={r.src}
        alt={label ?? ""}
        fill
        priority={priority}
        sizes="(min-width: 1024px) 560px, 92vw"
        className={r.dark ? "object-cover" : "object-contain p-[8%] drop-shadow-[0_30px_40px_rgb(11_20_36/0.12)]"}
      />
      {overlay && (
        <div aria-hidden>
          <Overlay k={k} />
        </div>
      )}
    </figure>
  );
}

/** Home / company hero: the globe with our three offices. Pin positions come from the render script. */
export function GlobeHero({ className, priority }: { className?: string; priority?: boolean }) {
  const pins = [
    { label: "Dallas", sub: "USA", x: 19.2, y: 36.8 },
    { label: "London", sub: "UK", x: 54.9, y: 47.6 },
    { label: "Gurgaon", sub: "India · HQ", x: 80.9, y: 35 },
  ];
  return (
    <figure className={cn("relative isolate aspect-[4/3] w-full overflow-hidden rounded-[28px] border border-white/10 bg-[#050c18] text-white shadow-[0_40px_100px_-40px_rgb(1_40_90/0.6)]", className)}>
      <Image src={RENDERS.globe.src} alt="Globe showing Shivacha offices in Dallas, London and Gurgaon" fill priority={priority} sizes="(min-width: 1024px) 620px, 92vw" className="object-cover" />
      {pins.map((p) => (
        <div key={p.label} aria-hidden className="absolute -translate-x-1/2 -translate-y-[calc(100%+14px)]" style={{ left: `${p.x}%`, top: `${p.y}%` }}>
          <div className="rounded-xl border border-white/15 bg-[#0d1b2e]/85 px-2.5 py-1.5 text-center shadow-xl backdrop-blur">
            <p className="text-[11px] leading-tight font-semibold">{p.label}</p>
            <p className="text-[9.5px] leading-tight text-white/60">{p.sub}</p>
          </div>
        </div>
      ))}
      <div aria-hidden className="absolute bottom-[6%] left-[5%] rounded-2xl border border-white/10 bg-[#0d1b2e]/85 p-3.5 shadow-2xl backdrop-blur">
        <p className="text-[11px] text-white/60">Engineering teams</p>
        <p className="text-sm font-semibold">India · USA · UK</p>
      </div>
      <div aria-hidden className="absolute top-[6%] right-[5%] hidden flex-wrap justify-end gap-1.5 sm:flex">
        {["AI", "Digital", "FinTech", "Web3", "Cloud"].map((d) => (
          <span key={d} className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[10.5px] font-medium backdrop-blur">
            {d}
          </span>
        ))}
      </div>
    </figure>
  );
}

/** 2×2 bento of renders, for index-page heroes. */
export function RenderMosaic({ keys = ["blockchain", "fintech", "ai", "cloud"], className }: { keys?: RenderKey[]; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-3", className)} aria-hidden>
      {keys.map((k, i) => (
        <RenderStage key={k} k={k} overlay={false} className={cn("aspect-square rounded-2xl", i === 0 && "translate-y-4", i === 3 && "-translate-y-4")} />
      ))}
    </div>
  );
}
