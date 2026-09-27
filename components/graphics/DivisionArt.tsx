import Image from "next/image";
import type { DivisionId } from "@/data/types";
import { cn } from "@/lib/cn";
import { SystemVisual, pickSystemVisual } from "@/components/visuals/SystemVisuals";
import { DashboardPreview } from "@/components/visuals/DashboardPreview";

/**
 * Division hero visuals (code-drawn system views, see components/visuals/SystemVisuals) and the office
 * globe (offline 3D render in public/graphics, source in scripts/graphics). No stock imagery.
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

/**
 * Hero visual for a division / topic: a system view that explains the kind of platform being built
 * (agent workflow, payment flow, contract pipeline, cloud topology, security controls, product release).
 */
export function DivisionArt({ division, topic, className }: { division: DivisionId | "product"; topic?: string; className?: string; label?: string; priority?: boolean }) {
  // Digital asset pages show the product itself: a trading or wallet interface.
  if (division === "digital-assets" && !/custody|policy|compliance|screening|travel rule|monitoring|analytics/i.test(topic ?? "")) {
    const wallet = /wallet/i.test(topic ?? "");
    return <DashboardPreview kind={wallet ? "wallet" : "exchange"} name={wallet ? "White-Label Crypto Wallet" : "White-Label Crypto Exchange"} className={className} />;
  }
  return <SystemVisual kind={pickSystemVisual(division, topic)} className={className} />;
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
