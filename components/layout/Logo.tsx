import { cn } from "@/lib/cn";

/** Shivacha mark: a core node connected to five division nodes. */
export function LogoMark({ className }: { className?: string }) {
  const pts = [0, 1, 2, 3, 4].map((i) => {
    const a = (-90 + i * 72) * (Math.PI / 180);
    return { x: 16 + Math.cos(a) * 11, y: 16 + Math.sin(a) * 11 };
  });
  const colors = ["#8e6bff", "#4c82ff", "#1fc38e", "#2fd6ee", "#48b8fa"];
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7", className)} aria-hidden="true">
      {pts.map((p, i) => (
        <line key={i} x1="16" y1="16" x2={p.x} y2={p.y} stroke="white" strokeOpacity="0.35" strokeWidth="1.2" />
      ))}
      <circle cx="16" cy="16" r="11" fill="none" stroke="white" strokeOpacity="0.12" />
      {pts.map((p, i) => (
        <circle key={`c${i}`} cx={p.x} cy={p.y} r="2.6" fill={colors[i]} />
      ))}
      <circle cx="16" cy="16" r="4" fill="white" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="text-[15px] font-semibold tracking-[0.22em] text-fg">SHIVACHA</span>
    </span>
  );
}
