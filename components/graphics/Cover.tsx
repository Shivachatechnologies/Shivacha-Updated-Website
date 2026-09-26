import Image from "next/image";
import { BookOpen, Bot, Cloud, Code2, Coins, Blocks, Landmark, ShieldCheck, Sparkles, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

const map: Record<string, { icon: LucideIcon; from: string; to: string; render: string }> = {
  ai: { icon: Bot, from: "#1b2566", to: "#3b4fd8", render: "api" },
  digital: { icon: Code2, from: "#e7f1ff", to: "#d6ecff", render: "digital" },
  "software-engineering": { icon: Code2, from: "#e7f1ff", to: "#d6ecff", render: "digital" },
  product: { icon: Code2, from: "#e7f1ff", to: "#d6ecff", render: "digital" },
  startups: { icon: Code2, from: "#e7f1ff", to: "#d6ecff", render: "digital" },
  fintech: { icon: Landmark, from: "#e3faf5", to: "#d9ecff", render: "fintech" },
  web3: { icon: Blocks, from: "#e5f6ff", to: "#e3e6ff", render: "blockchain" },
  blockchain: { icon: Coins, from: "#e5f6ff", to: "#e3e6ff", render: "tokens" },
  cloud: { icon: Cloud, from: "#e8f4ff", to: "#dfe9ff", render: "cloud" },
  cybersecurity: { icon: ShieldCheck, from: "#e6edff", to: "#dcecff", render: "security" },
  security: { icon: ShieldCheck, from: "#e6edff", to: "#dcecff", render: "security" },
  "digital-transformation": { icon: Sparkles, from: "#e9f0ff", to: "#dff4fb", render: "api" },
  enterprise: { icon: Sparkles, from: "#e9f0ff", to: "#dff4fb", render: "api" },
  guide: { icon: BookOpen, from: "#e8f6f3", to: "#dcebff", render: "exchange" },
};

/** Cover art for articles, resources and case studies: a 3D render on a soft gradient (no stock imagery). */
export function Cover({ kind, label, className }: { kind: string; label?: string; className?: string }) {
  const m = map[kind] ?? { icon: Sparkles, from: "#e9f0ff", to: "#dff4fb", render: "api" };
  const I = m.icon;
  const dark = m.from.startsWith("#1");
  return (
    <div className={cn("relative isolate flex aspect-[16/9] items-end overflow-hidden rounded-xl p-4", className)} style={{ background: `linear-gradient(135deg, ${m.from}, ${m.to})` }} aria-hidden>
      <div className="absolute inset-0 opacity-50" style={{ backgroundImage: `radial-gradient(${dark ? "rgb(255 255 255 / 0.25)" : "rgb(1 115 204 / 0.14)"} 1px, transparent 1px)`, backgroundSize: "16px 16px", maskImage: "linear-gradient(120deg, transparent 20%, black)" }} />
      <Image src={`/graphics/3d-${m.render}.png`} alt="" fill sizes="(min-width: 768px) 380px, 90vw" className="object-contain object-right p-[6%] pl-[30%] drop-shadow-[0_18px_24px_rgb(11_20_36/0.15)]" />
      <span className={cn("relative flex size-10 items-center justify-center rounded-xl backdrop-blur", dark ? "bg-white/15 text-white" : "bg-white/80 text-brand-600 shadow-sm")}>
        <I className="size-5" strokeWidth={1.8} />
      </span>
      {label && <span className={cn("relative ml-3 rounded-full px-2.5 py-1 text-xs font-semibold", dark ? "text-white/90" : "bg-white/70 text-[#0b1424]")}>{label}</span>}
    </div>
  );
}
