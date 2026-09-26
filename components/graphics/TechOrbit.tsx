import { TechLogo } from "./TechLogo";

/** Hero graphic for a technology: its logo at the centre, related technologies orbiting it. */
export function TechOrbit({ tech, pairs }: { tech: { slug: string; name: string }; pairs: { slug: string; name: string }[] }) {
  const around = pairs.slice(0, 6);
  const pos = around.map((_, i) => {
    const a = (-90 + (360 / Math.max(around.length, 1)) * i) * (Math.PI / 180);
    return { x: 50 + Math.cos(a) * 36, y: 50 + Math.sin(a) * 36 };
  });
  return (
    <div data-theme="dark" role="img" aria-label={`${tech.name} and related technologies`} className="scene relative aspect-square w-full max-w-[520px] overflow-hidden rounded-3xl border border-white/10 lg:ml-auto">
      <svg aria-hidden viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
        <circle cx="50" cy="50" r="36" fill="none" stroke="white" strokeOpacity=".08" strokeWidth=".3" />
        <circle cx="50" cy="50" r="22" fill="none" stroke="white" strokeOpacity=".06" strokeWidth=".3" strokeDasharray="1 1.5" />
        {pos.map((p, i) => (
          <line key={i} x1="50" y1="50" x2={p.x} y2={p.y} stroke="#33aaff" strokeOpacity=".35" strokeWidth=".3" strokeDasharray="1 1" className="animate-dash" />
        ))}
      </svg>
      <div aria-hidden className="absolute top-1/2 left-1/2 flex size-[30%] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-2 rounded-3xl border border-white/15 bg-white/[0.06] text-white shadow-[0_0_80px_-10px_rgb(1_149_255/0.6)] backdrop-blur">
        <TechLogo slug={tech.slug} name={tech.name} className="size-[45%] text-white" />
      </div>
      {around.map((p, i) => (
        <div
          key={p.slug}
          aria-hidden
          className="float-card absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 px-3 py-2 text-[11px] font-medium whitespace-nowrap text-white/85"
          style={{ left: `${pos[i].x}%`, top: `${pos[i].y}%` }}
        >
          <TechLogo slug={p.slug} name={p.name} className="size-4 text-white" />
          {p.name}
        </div>
      ))}
    </div>
  );
}
