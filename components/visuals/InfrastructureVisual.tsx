/**
 * Homepage hero visual: an architectural view of the Shivacha platform — a core orchestration layer
 * connected to Web3, FinTech, Digital Assets, AI and Cloud systems, with slow data packets moving
 * along the connections. Pure SVG (no images, no JS). Motion is SMIL on elements with the `packet`
 * / `orbit` classes, which globals.css hides under prefers-reduced-motion.
 */

type Node = { id: string; title: string; sub: string; x: number; y: number; color: string };

const W = 640;
const H = 470;
const CORE = { x: 320, y: 235, w: 196, h: 76 };
const NODES: Node[] = [
  { id: "web3", title: "Web3", sub: "Contracts · L2 · Index", x: 116, y: 92, color: "#22d3ee" },
  { id: "fintech", title: "FinTech", sub: "Ledger · Cards · Rails", x: 524, y: 92, color: "#14c8b0" },
  { id: "assets", title: "Digital Assets", sub: "Matching · Custody", x: 536, y: 352, color: "#f5a524" },
  { id: "ai", title: "AI", sub: "Agents · Tools · Approval", x: 104, y: 352, color: "#8b93ff" },
  { id: "cloud", title: "Cloud", sub: "K8s · Multi-region", x: 320, y: 418, color: "#5cc8ff" },
];
const NW = 184;
const NH = 54;

/** Orthogonal connector from the core edge to a node, with a rounded elbow. */
function path(n: Node) {
  const sx = n.x < CORE.x - 20 ? CORE.x - CORE.w / 2 : n.x > CORE.x + 20 ? CORE.x + CORE.w / 2 : CORE.x;
  const sy = n.x === CORE.x ? CORE.y + CORE.h / 2 : CORE.y + (n.y < CORE.y ? -14 : 14);
  if (n.x === CORE.x) return `M${sx},${sy} L${n.x},${n.y - NH / 2}`;
  const ex = n.x;
  const ey = n.y + (n.y < CORE.y ? NH / 2 : -NH / 2);
  const r = 14;
  const dir = ex < sx ? -1 : 1;
  const vdir = ey < sy ? -1 : 1;
  return `M${sx},${sy} L${ex - dir * r},${sy} Q${ex},${sy} ${ex},${sy + vdir * r} L${ex},${ey}`;
}

export function InfrastructureVisual({ className }: { className?: string }) {
  return (
    <figure data-theme="dark" aria-label="Shivacha platform architecture: a core orchestration layer connecting Web3, FinTech, Digital Assets, AI and Cloud systems" className={`@container relative overflow-hidden rounded-2xl border border-white/10 bg-[#050d19] text-white ${className ?? ""}`}>
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5 @md:px-5">
        <span className="font-mono text-[10.5px] tracking-[0.1em] text-white/55 uppercase">Platform architecture</span>
        <span className="flex items-center gap-1.5 font-mono text-[10.5px] text-white/55">
          <span className="size-1.5 rounded-full bg-emerald-400" aria-hidden /> Illustrative
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-hidden>
        <defs>
          <pattern id="iv-grid" width="32" height="32" patternUnits="userSpaceOnUse">
            <path d="M32 0H0V32" fill="none" stroke="rgb(255 255 255 / 0.045)" strokeWidth="1" />
          </pattern>
          <radialGradient id="iv-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#0195ff" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#0195ff" stopOpacity="0" />
          </radialGradient>
          {NODES.map((n) => (
            <path key={n.id} id={`iv-p-${n.id}`} d={path(n)} />
          ))}
        </defs>

        <rect width={W} height={H} fill="url(#iv-grid)" />
        <circle cx={CORE.x} cy={CORE.y} r="190" fill="url(#iv-glow)" />

        {/* slow orbit ring around the core */}
        <g className="orbit" opacity="0.5">
          <circle cx={CORE.x} cy={CORE.y} r="132" fill="none" stroke="rgb(255 255 255 / 0.12)" strokeDasharray="2 7">
            <animateTransform attributeName="transform" type="rotate" from={`0 ${CORE.x} ${CORE.y}`} to={`360 ${CORE.x} ${CORE.y}`} dur="90s" repeatCount="indefinite" />
          </circle>
        </g>

        {/* connectors */}
        {NODES.map((n) => (
          <use key={n.id} href={`#iv-p-${n.id}`} fill="none" stroke="rgb(255 255 255 / 0.18)" strokeWidth="1.2" />
        ))}

        {/* data packets */}
        {NODES.map((n, i) => (
          <g key={n.id} className="packet">
            {[0, 1].map((k) => (
              <circle key={k} r="3.2" fill={n.color}>
                <animateMotion dur={`${6 + i * 0.7}s`} begin={`${k * 3 + i * 0.4}s`} repeatCount="indefinite" keyPoints={k ? "1;0" : "0;1"} keyTimes="0;1" calcMode="linear">
                  <mpath href={`#iv-p-${n.id}`} />
                </animateMotion>
              </circle>
            ))}
          </g>
        ))}

        {/* division nodes */}
        {NODES.map((n) => (
          <g key={n.id} transform={`translate(${n.x - NW / 2} ${n.y - NH / 2})`}>
            <rect width={NW} height={NH} rx="10" fill="#0a1627" stroke="rgb(255 255 255 / 0.14)" />
            <rect x="0" y="14" width="2.5" height={NH - 28} rx="1.25" fill={n.color} />
            <text x="16" y="23" fill="#ffffff" fontSize="15" fontWeight="600" letterSpacing="-0.01em">
              {n.title}
            </text>
            <text x="16" y="41" fill="rgb(255 255 255 / 0.55)" fontSize="10.5" fontFamily="var(--font-geist-mono), monospace" className="hidden @md:inline">
              {n.sub}
            </text>
          </g>
        ))}

        {/* core */}
        <g transform={`translate(${CORE.x - CORE.w / 2} ${CORE.y - CORE.h / 2})`}>
          <rect width={CORE.w} height={CORE.h} rx="12" fill="#0b1c33" stroke="rgb(1 149 255 / 0.55)" />
          <text x={CORE.w / 2} y="30" textAnchor="middle" fill="rgb(255 255 255 / 0.55)" fontSize="10" letterSpacing="0.12em" fontFamily="var(--font-geist-mono), monospace">
            SHIVACHA CORE
          </text>
          <text x={CORE.w / 2} y="52" textAnchor="middle" fill="#ffffff" fontSize="15" fontWeight="600">
            API · Identity · Orchestration
          </text>
        </g>
      </svg>
      <div className="grid grid-cols-1 gap-px border-t border-white/10 bg-white/10 font-mono text-[10.5px] text-white/60 @md:grid-cols-3">
        <p className="truncate bg-[#050d19] px-4 py-2.5"><span className="text-emerald-400">●</span> settlement.confirmed</p>
        <p className="hidden truncate bg-[#050d19] px-4 py-2.5 @md:block"><span className="text-[#8b93ff]">●</span> agent.action.approved</p>
        <p className="hidden truncate bg-[#050d19] px-4 py-2.5 @md:block"><span className="text-[#22d3ee]">●</span> block.indexed · reorg-safe</p>
      </div>
    </figure>
  );
}
