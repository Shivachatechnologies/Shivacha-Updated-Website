import { divisions } from "@/data/capabilities";
import { divisionTone } from "@/components/ui/division";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

/** Brand graphic: the Shivacha mark at the centre with the five divisions around it. */
export function BrandOrbit({ className }: { className?: string }) {
  const pos = divisions.map((_, i) => {
    const a = (-90 + 72 * i) * (Math.PI / 180);
    return { x: 50 + Math.cos(a) * 35, y: 50 + Math.sin(a) * 35 };
  });
  return (
    <div data-theme="dark" role="img" aria-label="Shivacha and its five divisions: AI, Digital, FinTech, Web3 and Cloud" className={cn("scene relative aspect-square w-full max-w-[520px] overflow-hidden rounded-3xl border border-white/10 lg:ml-auto", className)}>
      <svg aria-hidden viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
        <circle cx="50" cy="50" r="35" fill="none" stroke="white" strokeOpacity=".08" strokeWidth=".3" />
        <polygon points={pos.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#33aaff" strokeOpacity=".18" strokeWidth=".3" />
        {pos.map((p, i) => (
          <line key={i} x1="50" y1="50" x2={p.x} y2={p.y} stroke="#33aaff" strokeOpacity=".35" strokeWidth=".3" strokeDasharray="1 1" className="animate-dash" />
        ))}
      </svg>
      <div aria-hidden className="absolute top-1/2 left-1/2 flex size-[28%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-3xl border border-white/15 bg-white/[0.06] shadow-[0_0_90px_-10px_rgb(1_149_255/0.7)] backdrop-blur">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/shivacha-mark.svg" alt="" className="size-[62%]" />
      </div>
      {divisions.map((d, i) => {
        const t = divisionTone[d.id];
        return (
          <div key={d.id} aria-hidden className="float-card absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 px-3 py-2 text-xs font-semibold whitespace-nowrap text-white" style={{ left: `${pos[i].x}%`, top: `${pos[i].y}%` }}>
            <span className={cn("flex size-6 items-center justify-center rounded-md", t.bg, t.text)}>
              <Icon name={d.icon} className="size-3.5" />
            </span>
            {d.short}
          </div>
        );
      })}
    </div>
  );
}
