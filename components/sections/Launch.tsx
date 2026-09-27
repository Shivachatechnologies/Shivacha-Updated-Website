import Link from "next/link";
import { ArrowRight, Check, Clock3, Info, Minus, SlidersHorizontal } from "lucide-react";
import type { Product } from "@/data/types";
import { LAUNCH_DISCLAIMER, LAUNCH_TIERS, type LaunchInfo } from "@/data/launch";
import { DashboardPreview } from "@/components/visuals/DashboardPreview";
import { BookCallButton } from "@/components/leads/BookCall";
import { LinkButton, Section, SectionHeader } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";

/* ───────────── badges ───────────── */

export function LaunchBadges({ launch, className, compact }: { launch: LaunchInfo; className?: string; compact?: boolean }) {
  const badges = [
    "White-label",
    launch.tier === "Fast configuration" || launch.tier === "White-label implementation" ? "Ready to launch" : "Production-ready",
    ...(compact ? [] : ["Production-ready", launch.customization === "Configurable" ? "Configurable" : "Customizable", ...(launch.apiReady ? ["API-ready"] : [])]),
  ].filter((b, i, a) => a.indexOf(b) === i);
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)} aria-label="Product attributes">
      {badges.map((b) => (
        <li key={b} className="rounded-full border border-brand-blue/25 bg-brand-blue/[0.07] px-2 py-0.5 text-[10.5px] font-semibold tracking-wide text-brand-blue uppercase">
          {b}
        </li>
      ))}
    </ul>
  );
}

/* ───────────── product / service launch panel ───────────── */

export function LaunchPanel({ launch, productName, productHref, source }: { launch: LaunchInfo; productName: string; productHref?: string; source: string }) {
  return (
    <div className="card overflow-hidden">
      <div className="grid gap-px bg-line sm:grid-cols-3">
        <div className="bg-ink-900 p-5">
          <p className="flex items-center gap-1.5 text-xs text-dim"><Clock3 className="size-3.5" aria-hidden /> Typical implementation</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-fg">{launch.timeline}</p>
          <p className="text-xs text-muted">{launch.tier}</p>
        </div>
        <div className="bg-ink-900 p-5">
          <p className="flex items-center gap-1.5 text-xs text-dim"><SlidersHorizontal className="size-3.5" aria-hidden /> Customization</p>
          <p className="mt-1 text-lg font-semibold text-fg">{launch.customization}</p>
          <p className="text-xs text-muted">{launch.advanced ? `Advanced builds: ${launch.advanced}` : "Brand, workflows and integrations"}</p>
        </div>
        <div className="flex flex-col justify-center gap-2 bg-ink-900 p-5">
          <LinkButton href={`/request-demo?product=${encodeURIComponent(productName)}`} track={`cta:demo-${source}`} className="justify-center">
            Request Product Demo
          </LinkButton>
          <BookCallButton label="Get Implementation Timeline" variant="secondary" source={`timeline:${source}`} className="justify-center" />
        </div>
      </div>
      <div className="flex flex-col gap-3 border-t border-line p-5 sm:flex-row sm:items-start sm:justify-between">
        <LaunchBadges launch={launch} />
        {productHref && (
          <Link href={productHref} className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-brand-blue hover:underline">
            View {productName} <ArrowRight className="size-4" aria-hidden />
          </Link>
        )}
      </div>
      <p className="flex gap-2 border-t border-line bg-ink-850/40 px-5 py-3 text-xs leading-relaxed text-dim">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {LAUNCH_DISCLAIMER}
      </p>
    </div>
  );
}

/* ───────────── platform card (homepage / products) ───────────── */

/** `feature`: full-width horizontal card (first in a grid). */
export function PlatformCard({ product, launch, feature, className }: { product: Product; launch: LaunchInfo; feature?: boolean; className?: string }) {
  return (
    <article className={cn("card card-hover flex flex-col overflow-hidden", feature && "md:col-span-2 lg:col-span-3 lg:grid lg:grid-cols-[1.35fr_1fr]", className)}>
      <div className={cn("band-muted border-line p-4 sm:p-5", feature ? "border-b lg:flex lg:items-center lg:border-r lg:border-b-0 lg:p-8" : "border-b")}>
        <DashboardPreview kind={product.preview} name={launch.cardName} className="w-full" />
      </div>
      <div className={cn("flex flex-1 flex-col p-5 sm:p-6", feature && "lg:justify-center lg:p-8")}>
        <LaunchBadges launch={launch} compact />
        <h3 className={cn("mt-3 font-semibold text-fg", feature ? "text-xl lg:text-2xl" : "text-lg")}>
          <Link href={`/products/${product.slug}`} className="hover:text-brand-blue">
            {launch.cardName}
          </Link>
        </h3>
        <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted">{product.tagline}</p>
        <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Key modules">
          {launch.keyModules.map((m) => (
            <li key={m} className="rounded-md border border-line px-2 py-0.5 text-[11.5px] text-muted">
              {m}
            </li>
          ))}
        </ul>
        <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm">
          <div>
            <dt className="text-xs text-dim">Typical implementation</dt>
            <dd className="font-semibold text-fg">{launch.timeline}</dd>
          </div>
          <div>
            <dt className="text-xs text-dim">Customization</dt>
            <dd className="font-semibold text-fg">{launch.customization}</dd>
          </div>
        </dl>
        <div className={cn("flex flex-wrap items-center gap-x-5 gap-y-2 pt-5 text-sm font-semibold", !feature && "mt-auto")}>
          <Link href={`/products/${product.slug}`} className="inline-flex items-center gap-1 text-brand-blue hover:underline" data-track={`cta:explore-${product.slug}`}>
            Explore {launch.cardName.replace(/^White-Label /, "")} <ArrowRight className="size-4" aria-hidden />
          </Link>
          <Link href={`/request-demo?product=${encodeURIComponent(product.name)}`} className="inline-flex items-center gap-1 text-muted hover:text-fg" data-track={`cta:demo-${product.slug}`}>
            Request Demo <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </div>
    </article>
  );
}

/* ───────────── process ───────────── */

const STEPS = [
  { n: "01", title: "Select", body: "Choose a ready-to-launch foundation." },
  { n: "02", title: "Customize", body: "Brand, UI, workflows and business logic." },
  { n: "03", title: "Integrate", body: "Connect APIs, payment rails, custody, identity, analytics and infrastructure." },
  { n: "04", title: "Test", body: "QA, security testing and deployment preparation." },
  { n: "05", title: "Launch", body: "Deploy your production environment." },
];

export function LaunchProcess() {
  return (
    <Section id="launch-process">
      <SectionHeader eyebrow="Ready to launch" title="From product idea to launch — faster." lede="A proven foundation, customised by a dedicated engineering team and deployed into your environment." />
      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {STEPS.map((s, i) => (
          <li key={s.n} className="card relative flex flex-col p-5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm font-semibold text-brand-blue">{s.n}</span>
              {i < STEPS.length - 1 && <ArrowRight className="hidden size-4 text-dim lg:block" aria-hidden />}
            </div>
            <h3 className="mt-4 text-lg font-semibold text-fg">{s.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.body}</p>
          </li>
        ))}
      </ol>
      <p className="mt-6 flex items-start gap-2 text-sm text-muted">
        <Clock3 className="mt-0.5 size-4 shrink-0 text-brand-blue" aria-hidden />
        <span>
          <strong className="font-semibold text-fg">Typical software implementation: 1–6 weeks</strong> depending on product and customization. Not every project launches in 3–4 weeks — complex enterprise systems take longer.
        </span>
      </p>
    </Section>
  );
}

/* ───────────── timeline tiers ───────────── */

export function TimelineTiers() {
  return (
    <Section id="timelines">
      <SectionHeader eyebrow="Realistic timelines" title="How long implementation takes." lede="Ranges depend on the foundation, the depth of customization and your integrations." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {LAUNCH_TIERS.map((t, i) => (
          <div key={t.tier} className="card flex flex-col p-5">
            <div className="flex items-center gap-1" aria-hidden>
              {LAUNCH_TIERS.map((_, j) => (
                <span key={j} className={cn("h-1.5 flex-1 rounded-full", j <= i ? "bg-brand-blue" : "bg-ink-800")} />
              ))}
            </div>
            <p className="mt-4 text-sm font-medium text-muted">{t.tier}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-fg">{t.range}</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">{t.description}</p>
          </div>
        ))}
      </div>
      <p className="mt-6 flex gap-2 rounded-xl border border-line bg-ink-900 p-4 text-xs leading-relaxed text-dim">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {LAUNCH_DISCLAIMER}
      </p>
    </Section>
  );
}

/* ───────────── build from zero vs white-label ───────────── */

const ZERO = ["Longer discovery", "Architecture from scratch", "Higher initial engineering effort", "Longer QA cycle", "More infrastructure setup"];
const WL = ["Pre-built foundation", "Configurable architecture", "Faster implementation", "Reusable modules", "Dedicated engineering", "Deployment support", "Custom integrations"];

export function FromZeroComparison() {
  return (
    <Section id="white-label-advantage">
      <SectionHeader eyebrow="White-label advantage" title="Why build everything from zero?" align="center" />
      <div className="mx-auto grid max-w-4xl gap-4 md:grid-cols-2">
        <div className="card p-6 sm:p-7">
          <h3 className="text-sm font-semibold tracking-wide text-muted uppercase">From zero</h3>
          <ul className="mt-5 space-y-3">
            {ZERO.map((z) => (
              <li key={z} className="flex items-center gap-3 text-[15px] text-muted">
                <Minus className="size-4 shrink-0 text-dim" aria-hidden /> {z}
              </li>
            ))}
          </ul>
        </div>
        <div className="card border-brand-blue/40 p-6 shadow-[0_24px_60px_-30px_rgb(1_115_204/0.45)] sm:p-7">
          <h3 className="text-sm font-semibold tracking-wide text-brand-blue uppercase">Shivacha white-label</h3>
          <ul className="mt-5 space-y-3">
            {WL.map((z) => (
              <li key={z} className="flex items-center gap-3 text-[15px] text-fg">
                <Check className="size-4 shrink-0 text-brand-teal" aria-hidden /> {z}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  );
}
