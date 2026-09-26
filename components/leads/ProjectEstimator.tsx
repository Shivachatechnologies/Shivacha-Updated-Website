"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, Clock3, Info, Layers, Users } from "lucide-react";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/cn";

/**
 * Indicative project estimator. Produces a rough phase plan, timeline range and team shape from a few
 * answers — never a price. The result is handed to the existing inquiry form as a prefilled brief.
 */

type TypeId = "blockchain" | "exchange" | "wallet" | "fintech" | "ai" | "saas" | "mobile" | "web" | "mvp";

const TYPES: { id: TypeId; label: string; service: string; base: [number, number]; team: string[] }[] = [
  { id: "blockchain", label: "Blockchain / Web3 platform", service: "Blockchain Development", base: [10, 16], team: ["Tech lead / architect", "Smart contract engineer", "Full-stack engineer", "QA engineer"] },
  { id: "exchange", label: "Crypto exchange", service: "Crypto Exchange Development", base: [20, 32], team: ["Solution architect", "Matching-engine engineer", "Backend engineers", "Frontend engineer", "Security / DevOps engineer", "QA engineer"] },
  { id: "wallet", label: "Crypto wallet", service: "Crypto Wallet Development", base: [12, 20], team: ["Tech lead", "Mobile engineer", "Blockchain engineer", "Backend engineer", "QA engineer"] },
  { id: "fintech", label: "FinTech / payments / neobank", service: "FinTech Development", base: [16, 28], team: ["Solution architect", "Backend engineers", "Mobile / web engineer", "QA engineer", "DevOps engineer"] },
  { id: "ai", label: "AI product or AI agent", service: "AI Development", base: [8, 16], team: ["AI engineer", "Backend engineer", "Frontend engineer", "QA / evaluation engineer"] },
  { id: "saas", label: "SaaS platform", service: "SaaS Development", base: [12, 20], team: ["Tech lead", "Full-stack engineers", "Product designer", "QA engineer"] },
  { id: "mobile", label: "Mobile app", service: "Mobile App Development", base: [10, 18], team: ["Mobile engineers", "Backend engineer", "Product designer", "QA engineer"] },
  { id: "web", label: "Web application / portal", service: "Web Development", base: [8, 14], team: ["Full-stack engineers", "Product designer", "QA engineer"] },
  { id: "mvp", label: "MVP (any category)", service: "SaaS Development", base: [8, 12], team: ["Full-stack engineers", "Product designer", "Part-time tech lead"] },
];

const STAGES = [
  { id: "idea", label: "Idea / requirements", add: 2, note: "includes a discovery phase" },
  { id: "design", label: "Designs ready", add: 0, note: "" },
  { id: "live", label: "Existing product to extend", add: -2, note: "assumes a codebase review first" },
];

const FEATURES: { id: string; label: string; add: number; role?: string }[] = [
  { id: "payments", label: "Payments or payouts", add: 3, role: "Payments engineer" },
  { id: "kyc", label: "KYC / identity verification", add: 2 },
  { id: "contracts", label: "Smart contracts", add: 3, role: "Smart contract engineer" },
  { id: "ai", label: "AI features", add: 3, role: "AI engineer" },
  { id: "integrations", label: "3+ third-party integrations", add: 3 },
  { id: "admin", label: "Admin / back-office", add: 2 },
  { id: "realtime", label: "Real-time data or chat", add: 2 },
  { id: "multi", label: "Multi-language or multi-region", add: 2 },
];

const PLATFORMS = ["Web", "iOS", "Android", "Admin panel"];

export function ProjectEstimator() {
  const [type, setType] = useState<TypeId | "">("");
  const [stage, setStage] = useState("idea");
  const [platforms, setPlatforms] = useState<string[]>(["Web"]);
  const [features, setFeatures] = useState<string[]>([]);
  const started = useRef(false);
  const completed = useRef(false);

  const touch = () => {
    if (!started.current) {
      started.current = true;
      track("estimator_start");
    }
  };

  const toggle = (list: string[], set: (v: string[]) => void, id: string) => {
    touch();
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  const t = TYPES.find((x) => x.id === type);
  const result = useMemo(() => {
    if (!t) return null;
    const st = STAGES.find((s) => s.id === stage)!;
    const feats = FEATURES.filter((f) => features.includes(f.id));
    const featWeeks = feats.reduce((n, f) => n + f.add, 0);
    const platWeeks = Math.max(0, platforms.filter((p) => p !== "Admin panel").length - 1) * 3 + (platforms.includes("Admin panel") ? 2 : 0);
    // Parallel work absorbs some of the added scope, so extra weeks are damped.
    const extra = Math.round((featWeeks + platWeeks) * 0.6);
    const lo = Math.max(4, t.base[0] + st.add + Math.round(extra * 0.7));
    const hi = Math.max(lo + 3, t.base[1] + st.add + extra);
    const team = [...t.team, ...feats.map((f) => f.role).filter((r): r is string => !!r && !t.team.some((x) => x.toLowerCase().includes(r.split(" ")[0].toLowerCase())))];
    if (platforms.includes("iOS") || platforms.includes("Android")) {
      if (!team.some((r) => /mobile/i.test(r))) team.push("Mobile engineer");
    }
    const phases = [st.id === "idea" ? "Discovery & architecture (2–3 weeks)" : st.id === "live" ? "Codebase & infrastructure review (1–2 weeks)" : "Technical planning (1 week)", "Design & build in 2-week sprints", ...(features.includes("contracts") ? ["Independent smart contract audit (external, scheduled separately)"] : []), "Hardening, security testing & launch", "Post-launch support & iteration"];
    const complexity = featWeeks + platWeeks > 12 ? "High" : featWeeks + platWeeks > 5 ? "Medium" : "Focused";
    return { lo, hi, team, phases, complexity, st, feats };
  }, [t, stage, platforms, features]);

  useEffect(() => {
    if (result && !completed.current) {
      completed.current = true;
      track("estimator_complete", { type });
    }
  }, [result, type]);

  const brief = result && t
    ? [
        `Project estimator summary`,
        `Type: ${t.label}`,
        `Stage: ${result.st.label}`,
        `Platforms: ${platforms.join(", ") || "—"}`,
        `Features: ${result.feats.map((f) => f.label).join(", ") || "—"}`,
        `Indicative timeline: ${result.lo}–${result.hi} weeks (${result.complexity} complexity)`,
      ].join("\n")
    : "";
  const href = t ? `/start-a-project?service=${encodeURIComponent(t.service)}&brief=${encodeURIComponent(brief)}` : "/start-a-project";

  return (
    <div className="grid gap-8 lg:grid-cols-[1.15fr_1fr] lg:gap-12">
      <div className="space-y-8">
        <fieldset>
          <legend className="mb-3 text-sm font-semibold text-fg">1. What are you building?</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {TYPES.map((x) => (
              <button
                key={x.id}
                type="button"
                aria-pressed={type === x.id}
                onClick={() => {
                  touch();
                  setType(x.id);
                }}
                className={cn("rounded-xl border px-4 py-3 text-left text-sm transition-colors", type === x.id ? "border-brand-blue bg-brand-blue/10 font-semibold text-fg" : "border-line bg-ink-900 text-muted hover:border-line-strong")}
              >
                {x.label}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-3 text-sm font-semibold text-fg">2. Where are you today?</legend>
          <div className="flex flex-wrap gap-2">
            {STAGES.map((s) => (
              <button key={s.id} type="button" aria-pressed={stage === s.id} onClick={() => {
                  touch();
                  setStage(s.id);
                }} className={cn("chip", stage === s.id && "border-brand-blue bg-brand-blue/10 text-fg")}>
                {s.label}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-3 text-sm font-semibold text-fg">3. Platforms</legend>
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map((p) => (
              <button key={p} type="button" aria-pressed={platforms.includes(p)} onClick={() => toggle(platforms, setPlatforms, p)} className={cn("chip", platforms.includes(p) && "border-brand-blue bg-brand-blue/10 text-fg")}>
                {platforms.includes(p) && <Check className="size-3.5" aria-hidden />} {p}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-3 text-sm font-semibold text-fg">4. Key features</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <label key={f.id} className={cn("flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-colors", features.includes(f.id) ? "border-brand-blue bg-brand-blue/10 text-fg" : "border-line bg-ink-900 text-muted hover:border-line-strong")}>
                <input type="checkbox" className="size-4 accent-[#0195ff]" checked={features.includes(f.id)} onChange={() => toggle(features, setFeatures, f.id)} />
                {f.label}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="lg:sticky lg:top-24 lg:self-start">
        <div className="card overflow-hidden" aria-live="polite">
          <div className="border-b border-line bg-gradient-to-br from-brand-blue/10 to-transparent p-6">
            <p className="eyebrow">Indicative estimate</p>
            {result ? (
              <>
                <p className="mt-3 flex items-baseline gap-2 text-4xl font-semibold tracking-tight text-fg">
                  {result.lo}–{result.hi}
                  <span className="text-base font-medium text-muted">weeks</span>
                </p>
                <p className="mt-1 text-sm text-muted">to a first production release · {result.complexity} complexity</p>
              </>
            ) : (
              <p className="mt-3 text-sm text-muted">Choose a project type to see an indicative timeline and team.</p>
            )}
          </div>
          {result && (
            <div className="space-y-6 p-6">
              <div>
                <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-fg">
                  <Users className="size-4 text-brand-blue" aria-hidden /> Typical team
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {result.team.map((r) => (
                    <span key={r} className="rounded-full border border-line px-2.5 py-1 text-xs text-muted">
                      {r}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-fg">
                  <Layers className="size-4 text-brand-blue" aria-hidden /> Phases
                </p>
                <ol className="space-y-1.5 text-sm text-muted">
                  {result.phases.map((p, i) => (
                    <li key={p} className="flex gap-2">
                      <span className="font-mono text-xs text-dim">{i + 1}.</span> {p}
                    </li>
                  ))}
                </ol>
              </div>
              <a href={href} onClick={() => track("estimator_cta", { type })} className="btn-primary w-full justify-center" data-track="cta:estimator">
                Get Detailed Estimate <ArrowRight className="size-4" aria-hidden />
              </a>
              <p className="flex gap-2 text-xs leading-relaxed text-dim">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                Indicative only, based on typical projects of this shape. Not a quote. A detailed estimate follows a short discovery call.
              </p>
            </div>
          )}
          {!result && (
            <div className="flex items-center gap-2 p-6 text-xs text-dim">
              <Clock3 className="size-3.5" aria-hidden /> Takes about 30 seconds. No email needed to see the result.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
