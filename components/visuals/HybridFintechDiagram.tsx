import { cn } from "@/lib/cn";

const traditional = ["Bank", "Payment Network", "Processor", "Bank Account", "Fiat"];
const integration = ["API", "Identity", "Compliance", "Risk", "Ledger", "Settlement", "Analytics"];
const digital = ["Wallet", "Blockchain", "Stablecoin", "Tokenized Asset", "Smart Contract"];

function Column({ title, items, color, sub, center }: { title: string; items: string[]; color: string; sub: string; center?: boolean }) {
  return (
    <div className={cn("relative rounded-2xl border p-4 sm:p-5", center ? "border-white/20 bg-white/[0.04]" : "border-line bg-ink-900/60")}>
      {center && <div className="pointer-events-none absolute inset-0 rounded-2xl opacity-20 blur-2xl" style={{ background: `radial-gradient(closest-side, ${color}, transparent)` }} aria-hidden />}
      <div className="relative mb-4">
        <p className="font-mono text-[10.5px] tracking-[0.16em] uppercase" style={{ color }}>
          {sub}
        </p>
        <p className="mt-1 text-sm font-semibold text-fg">{title}</p>
      </div>
      <ol className="relative space-y-0">
        {items.map((it, i) => (
          <li key={it} className="relative">
            <div className="flex items-center gap-3 rounded-lg border border-line bg-ink-950/80 px-3 py-2.5">
              <span className="size-1.5 shrink-0 rounded-full" style={{ background: color }} />
              <span className="text-[13px] text-fg">{it}</span>
            </div>
            {i < items.length - 1 && (
              <div className="relative ml-[17px] h-3.5 w-px overflow-hidden bg-white/10" aria-hidden>
                <span className="absolute inset-x-0 h-2 animate-[flow_1.8s_linear_infinite]" style={{ background: color, animationDelay: `${i * 0.2}s` }} />
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Web2 + Web3 FinTech: traditional rails and digital asset rails joined by the Shivacha integration layer. */
export function HybridFintechDiagram() {
  return (
    <figure aria-label="Hybrid fintech architecture: traditional finance and digital assets connected through the Shivacha integration layer">
      <style>{`@keyframes flow{from{transform:translateY(-8px)}to{transform:translateY(16px)}}`}</style>
      <div className="grid items-center gap-4 lg:grid-cols-[1fr_auto_1.15fr_auto_1fr]">
        <Column title="Traditional Finance" sub="Web2 rails" items={traditional} color="#14c8b0" />
        <Connector />
        <Column title="Shivacha Integration Layer" sub="Hybrid core" items={integration} color="#e9edf5" center />
        <Connector />
        <Column title="Digital Assets" sub="Web3 rails" items={digital} color="#22d3ee" />
      </div>
      <figcaption className="mt-5 text-center text-xs text-dim">
        One API, one identity and risk profile, one ledger — across bank rails and programmable digital assets. Regulated services on each rail are provided by licensed partners.
      </figcaption>
    </figure>
  );
}

function Connector() {
  return (
    <div className="flex items-center justify-center py-1 lg:py-0" aria-hidden>
      <div className="relative h-8 w-px overflow-hidden bg-white/15 lg:h-px lg:w-10">
        <span className="absolute inset-0 animate-pulse-soft bg-gradient-to-r from-brand-teal via-white to-brand-cyan" />
      </div>
    </div>
  );
}
