"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/cn";

export interface EcosystemNode {
  id: string;
  short: string;
  name: string;
  tagline: string;
  color: string;
  href: string;
  satellites: { label: string; href: string }[];
}

const SIZE = 640;
const C = SIZE / 2;
const R = 190;
const SAT_R = 88;

/** Interactive infrastructure map: Shivacha core connected to five divisions and their capability satellites. */
export function EcosystemMap({ nodes }: { nodes: EcosystemNode[] }) {
  const [active, setActive] = useState<string | null>(null);
  const placed = nodes.map((n, i) => {
    const a = ((-90 + i * (360 / nodes.length)) * Math.PI) / 180;
    return { ...n, a, x: C + Math.cos(a) * R, y: C + Math.sin(a) * R };
  });
  const current = placed.find((p) => p.id === active);

  return (
    <div className="relative mx-auto w-full max-w-[640px]">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full" role="img" aria-label="Shivacha technology ecosystem: AI, Digital, FinTech, Web3 and Cloud connected to the Shivacha core">
        <defs>
          <radialGradient id="core-glow">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
          {placed.map((p) => (
            <radialGradient key={p.id} id={`g-${p.id}`}>
              <stop offset="0%" stopColor={p.color} stopOpacity="0.5" />
              <stop offset="100%" stopColor={p.color} stopOpacity="0" />
            </radialGradient>
          ))}
        </defs>

        {/* orbit rings */}
        {[R + 110, R, 110].map((r, i) => (
          <circle key={r} cx={C} cy={C} r={r} fill="none" stroke="white" strokeOpacity={0.05 + i * 0.02} strokeDasharray={i === 0 ? "2 6" : undefined} />
        ))}

        {/* inter-division mesh */}
        {placed.map((p, i) => {
          const q = placed[(i + 1) % placed.length];
          return <line key={`m${p.id}`} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="white" strokeOpacity={0.06} />;
        })}

        {/* satellites */}
        {placed.map((p) =>
          p.satellites.map((s, j) => {
            const spread = 0.62;
            const sa = p.a + (j - (p.satellites.length - 1) / 2) * spread;
            const sx = p.x + Math.cos(sa) * SAT_R;
            const sy = p.y + Math.sin(sa) * SAT_R;
            const on = active === p.id;
            return (
              <g key={`${p.id}-${s.label}`} opacity={active && !on ? 0.25 : 1} className="transition-opacity duration-300">
                <line x1={p.x} y1={p.y} x2={sx} y2={sy} stroke={p.color} strokeOpacity={on ? 0.7 : 0.25} />
                <circle cx={sx} cy={sy} r={on ? 4 : 3} fill={p.color} opacity={on ? 1 : 0.7} />
                <text
                  x={sx + Math.cos(sa) * 10}
                  y={sy + Math.sin(sa) * 10 + 3}
                  textAnchor={Math.cos(sa) > 0.2 ? "start" : Math.cos(sa) < -0.2 ? "end" : "middle"}
                  className="fill-current font-mono text-[10px]"
                  style={{ color: on ? "#e9edf5" : "#6b778c" }}
                >
                  {s.label}
                </text>
              </g>
            );
          }),
        )}

        {/* spokes with flowing dashes */}
        {placed.map((p) => (
          <g key={`s${p.id}`}>
            <line x1={C} y1={C} x2={p.x} y2={p.y} stroke="white" strokeOpacity={0.12} />
            <line
              x1={C}
              y1={C}
              x2={p.x}
              y2={p.y}
              stroke={p.color}
              strokeWidth={active === p.id ? 2 : 1.2}
              strokeDasharray="4 16"
              className="animate-dash"
              opacity={active && active !== p.id ? 0.2 : 0.9}
            />
          </g>
        ))}

        {/* core */}
        <circle cx={C} cy={C} r={90} fill="url(#core-glow)" />
        <circle cx={C} cy={C} r={54} fill="#070b14" stroke="white" strokeOpacity={0.25} />
        <circle cx={C} cy={C} r={62} fill="none" stroke="white" strokeOpacity={0.08} className="animate-pulse-soft" />
        <text x={C} y={C + 5} textAnchor="middle" className="fill-white text-[13px] font-semibold tracking-[0.24em]">
          SHIVACHA
        </text>

        {/* division nodes */}
        {placed.map((p) => {
          const on = active === p.id;
          return (
            <g
              key={p.id}
              tabIndex={0}
              role="button"
              aria-label={`${p.name}: ${p.tagline}`}
              onMouseEnter={() => setActive(p.id)}
              onFocus={() => setActive(p.id)}
              onClick={() => setActive(on ? null : p.id)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setActive(on ? null : p.id)}
              className="cursor-pointer outline-none"
            >
              <circle cx={p.x} cy={p.y} r={56} fill={`url(#g-${p.id})`} opacity={on ? 1 : 0.55} className="transition-opacity" />
              <circle cx={p.x} cy={p.y} r={34} fill="#070b14" stroke={p.color} strokeOpacity={on ? 1 : 0.55} strokeWidth={on ? 2 : 1.2} />
              <text x={p.x} y={p.y + 4.5} textAnchor="middle" className="fill-white text-[12.5px] font-semibold">
                {p.short}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="pointer-events-none absolute inset-x-0 -bottom-2 flex justify-center sm:bottom-2">
        <div
          className={cn(
            "pointer-events-auto w-[min(100%,420px)] rounded-2xl border border-line-strong bg-ink-900/90 p-4 backdrop-blur-xl transition-all duration-300",
            current ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
          )}
          aria-live="polite"
        >
          {current && (
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-fg">{current.name}</p>
                <p className="mt-1 text-xs text-muted">{current.tagline}</p>
              </div>
              <Link href={current.href} className="flex shrink-0 items-center gap-1 text-xs text-fg hover:underline">
                Explore <ArrowRight className="size-3" />
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
