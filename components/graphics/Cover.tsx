import { BookOpen, Bot, Cloud, Code2, Coins, Blocks, Landmark, ShieldCheck, Sparkles, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

const map: Record<string, { icon: LucideIcon; from: string; to: string }> = {
  ai: { icon: Bot, from: "#4a56d6", to: "#0195ff" },
  digital: { icon: Code2, from: "#0068b3", to: "#22d3ee" },
  "software-engineering": { icon: Code2, from: "#0068b3", to: "#22d3ee" },
  fintech: { icon: Landmark, from: "#0a7568", to: "#0195ff" },
  web3: { icon: Blocks, from: "#08708a", to: "#6b7cff" },
  blockchain: { icon: Coins, from: "#08708a", to: "#6b7cff" },
  cloud: { icon: Cloud, from: "#0b6fae", to: "#5cc8ff" },
  security: { icon: ShieldCheck, from: "#1e2f4f", to: "#0195ff" },
  guide: { icon: BookOpen, from: "#0068b3", to: "#14c8b0" },
};

/** Generated cover art for articles, resources and case studies (no stock imagery). */
export function Cover({ kind, label, className }: { kind: string; label?: string; className?: string }) {
  const m = map[kind] ?? { icon: Sparkles, from: "#0068b3", to: "#22d3ee" };
  const I = m.icon;
  return (
    <div className={cn("relative isolate flex aspect-[16/9] items-end overflow-hidden rounded-xl p-4", className)} style={{ background: `linear-gradient(135deg, ${m.from}, ${m.to})` }} aria-hidden>
      <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "radial-gradient(rgb(255 255 255 / 0.35) 1px, transparent 1px)", backgroundSize: "16px 16px", maskImage: "linear-gradient(120deg, transparent 20%, black)" }} />
      <I className="absolute -top-4 -right-4 size-36 text-white/15" strokeWidth={1.2} />
      <span className="relative flex size-10 items-center justify-center rounded-xl bg-white/15 text-white backdrop-blur">
        <I className="size-5" strokeWidth={1.8} />
      </span>
      {label && <span className="relative ml-3 text-xs font-semibold tracking-wide text-white/90">{label}</span>}
    </div>
  );
}
