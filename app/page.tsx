import Link from "next/link";
import { ArrowRight, ArrowUpRight, Hammer, KeyRound, Layers, Rocket, ShieldCheck, Users, Workflow } from "lucide-react";
import { divisions } from "@/data/capabilities";
import { services } from "@/data/services";
import { products, getProduct } from "@/data/products";
import { technologies } from "@/data/technologies";
import { industries } from "@/data/industries";
import { insights } from "@/data/insights";
import { FEATURED_PLATFORMS, launchFor } from "@/data/launch";
import { buildMetadata } from "@/lib/seo";
import { Section, SectionHeader, LinkButton } from "@/components/ui/primitives";
import { divisionTone } from "@/components/ui/division";
import { Icon, industryIcon } from "@/components/ui/Icon";
import { HybridFintechDiagram } from "@/components/visuals/HybridFintechDiagram";
import { FAQ } from "@/components/sections/FAQ";
import { generalFaqs } from "@/data/faqs";
import { CTABand } from "@/components/sections/CTABand";
import { FromZeroComparison, LaunchProcess, PlatformCard, TimelineTiers } from "@/components/sections/Launch";
import { EcosystemVisual, SecurityLayersVisual } from "@/components/visuals/SystemVisuals";
import { TechMarquee } from "@/components/graphics/TechMarquee";
import { Cover } from "@/components/graphics/Cover";
import { BookCallButton } from "@/components/leads/BookCall";

export const metadata = buildMetadata({
  title: "Shivacha Technologies — White-Label Web3, Crypto, FinTech & AI Platforms",
  description:
    "Launch production-ready Web3, digital asset, FinTech and AI products faster with Shivacha: white-label crypto exchanges, wallets, neobanks, crypto cards, tokenization and AI agent platforms, customised by dedicated engineering teams.",
  path: "/",
});

const ways = [
  { icon: Rocket, title: "White-label platforms", text: "Start from a production-ready foundation and customise it to your brand and model.", href: "/products" },
  { icon: Hammer, title: "Custom engineering", text: "Platforms engineered around your business when no foundation fits. You own the code.", href: "/services" },
  { icon: Users, title: "Dedicated teams", text: "Senior engineers who work inside your roadmap, tools and time zone.", href: "/dedicated-teams" },
  { icon: Workflow, title: "Enterprise deployment", text: "Multi-region, compliance-aware deployment and operations for serious scale.", href: "/capabilities/cloud" },
];

const categories = [
  { title: "Digital Assets", division: "digital-assets" as const, items: [["Crypto Exchange", "/products/crypto-exchange"], ["Crypto Wallet", "/products/crypto-wallet"], ["P2P Platform", "/products/p2p-trading-platform"], ["Trading Platform", "/products/digital-asset-platform"]] },
  { title: "FinTech", division: "fintech" as const, items: [["Neobank", "/products/neobank"], ["Payment Platform", "/products/payment-gateway"], ["Multi-Currency Account", "/products/digital-wallet"], ["Crypto Card Platform", "/products/crypto-card"]] },
  { title: "Web3", division: "web3" as const, items: [["DeFi", "/products/defi-platform"], ["DEX", "/services/dex-development"], ["Staking", "/products/staking-platform"], ["Tokenization", "/products/rwa-platform"]] },
  { title: "AI", division: "ai" as const, items: [["AI Agent Platform", "/products/ai-agent-platform"], ["AI Automation", "/products/ai-workflow-automation"], ["Enterprise AI", "/services/enterprise-ai"]] },
];

const principles = [
  { icon: Layers, title: "High-end engineering, one team", text: "Web3, digital asset, FinTech, AI and cloud engineers working together, with no hand-offs between vendors." },
  { icon: ShieldCheck, title: "Security from day one", text: "Threat modelling, least-privilege access and audit-ready engineering on every project." },
  { icon: KeyRound, title: "Your IP, your cloud", text: "Code and infrastructure live in your accounts. No lock-in to us." },
];

export default function HomePage() {
  const featured = FEATURED_PLATFORMS.map((slug) => ({ product: getProduct(slug)!, launch: launchFor(slug)! }));
  const primary = divisions.filter((d) => d.primary);
  const latest = [...insights].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);

  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden pt-28 pb-14 sm:pt-32 lg:pt-36 lg:pb-20">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[520px]" style={{ background: "radial-gradient(60% 70% at 70% 0%, rgb(1 149 255 / 0.14), transparent 70%)" }} />
        <div className="container-x relative grid items-center gap-12 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
          <div>
            <p className="eyebrow mb-6">Web3 · Digital Assets · FinTech · AI</p>
            <h1 className="h-display text-fg">
              Build. Customize. <span className="accent-word">Launch. Scale.</span>
            </h1>
            <p className="lede mt-6 max-w-xl">Production-ready Web3, digital asset, FinTech and AI infrastructure engineered for faster deployment.</p>
            <p className="mt-4 max-w-xl text-[15px] font-medium text-fg">White-label platforms. Ready-to-launch infrastructure. Dedicated engineering. Rapid implementation.</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <LinkButton href="/products" track="cta:hero-white-label">
                Explore White-Label Products
              </LinkButton>
              <BookCallButton label="Talk to a Solution Architect" variant="secondary" source="hero" />
            </div>
            <dl className="mt-12 grid max-w-md grid-cols-3 divide-x divide-line">
              {[
                [products.length, "Ready-to-launch products"],
                [primary.length, "Specialist divisions"],
                ["1–6 wks", "Typical implementation"],
              ].map(([v, l], i) => (
                <div key={String(l)} className={`flex flex-col-reverse ${i ? "pl-5" : "pr-2"}`}>
                  <dt className="mt-1 text-sm leading-snug text-muted">{l}</dt>
                  <dd className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <EcosystemVisual />
        </div>
      </section>

      {/* TECHNOLOGIES */}
      <section className="border-y border-line py-8">
        <div className="container-x mb-5 flex items-center justify-between gap-4">
          <p className="text-sm font-medium text-muted">Technologies we build with</p>
          <Link href="/technologies" className="text-sm font-medium text-brand-blue hover:underline">
            All {technologies.length} →
          </Link>
        </div>
        <TechMarquee />
      </section>

      {/* READY-TO-LAUNCH PLATFORMS */}
      <Section id="platforms">
        <SectionHeader eyebrow="Ready-to-launch platforms" title="Launch on a production-ready foundation." lede="White-label platforms customised to your brand, workflows and partners by a dedicated engineering team." action={{ label: `All ${products.length} products`, href: "/products" }} />
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {featured.map(({ product, launch }, i) => (
            <PlatformCard key={product.slug} product={product} launch={launch} feature={i === 0} className={i === featured.length - 1 && featured.length % 2 === 0 ? "md:col-span-2 lg:col-span-1" : undefined} />
          ))}
        </div>
      </Section>

      {/* WHITE-LABEL CATEGORIES */}
      <Section id="white-label">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.6fr] lg:items-start">
          <div>
            <p className="eyebrow mb-4">White-label products</p>
            <h2 className="h-section text-fg">Launch your product without starting from zero.</h2>
            <p className="lede mt-4">Choose a proven foundation, customize your brand and workflows, integrate your required infrastructure, and accelerate your path to launch.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton href="/products" track="cta:white-label-explore">
                Explore White-Label Solutions
              </LinkButton>
              <LinkButton href="/request-demo" variant="secondary" track="cta:white-label-demo">
                Request a Product Demo
              </LinkButton>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {categories.map((c) => {
              const tone = divisionTone[c.division];
              return (
                <div key={c.title} className="card p-5">
                  <p className="flex items-center gap-2 text-sm font-semibold text-fg">
                    <span className={`size-2 rounded-full ${tone.dot}`} aria-hidden /> {c.title}
                  </p>
                  <ul className="mt-4 space-y-1">
                    {c.items.map(([label, href]) => (
                      <li key={label}>
                        <Link href={href} className="group flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-[15px] text-muted hover:bg-ink-850 hover:text-fg">
                          {label}
                          <ArrowRight className="size-4 shrink-0 text-dim transition-transform group-hover:translate-x-0.5 group-hover:text-brand-blue" aria-hidden />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </Section>

      <LaunchProcess />

      {/* DIVISIONS */}
      <Section id="divisions">
        <SectionHeader eyebrow="Five divisions" title="Specialists in the products that are hardest to build." lede="Each division pairs ready-to-launch foundations with custom engineering for what makes your product different." action={{ label: "All capabilities", href: "/capabilities" }} />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {primary.map((d) => {
            const tone = divisionTone[d.id];
            return (
              <article key={d.id} className="card flex flex-col p-6">
                <div className="flex items-center gap-3">
                  <span className={`flex size-10 items-center justify-center rounded-xl ${tone.bg} ${tone.text}`}>
                    <Icon name={d.icon} className="size-5" />
                  </span>
                  <h3 className="text-lg font-semibold text-fg">{d.name}</h3>
                </div>
                <p className="mt-3 text-[15px] leading-relaxed text-muted">{d.tagline}</p>
                <ul className="mt-4 flex flex-wrap gap-1.5" aria-label={`${d.short} flagship offerings`}>
                  {d.flagships.slice(0, 6).map((f) => (
                    <li key={f} className="rounded-md border border-line px-2 py-0.5 text-[11.5px] text-muted">
                      {f}
                    </li>
                  ))}
                </ul>
                <dl className="mt-5 space-y-1.5 border-t border-line pt-4 text-sm">
                  {d.launch.map(([what, range]) => (
                    <div key={what} className="flex items-baseline justify-between gap-4">
                      <dt className="text-muted">{what}</dt>
                      <dd className="shrink-0 font-semibold text-fg tabular-nums">{range}</dd>
                    </div>
                  ))}
                </dl>
                <Link href={`/capabilities/${d.id}`} className="mt-auto inline-flex items-center gap-1 pt-5 text-sm font-semibold text-brand-blue hover:underline">
                  Explore {d.short} <ArrowRight className="size-4" aria-hidden />
                </Link>
              </article>
            );
          })}
          <article className="card flex flex-col justify-between gap-6 border-dashed p-6 md:col-span-2 xl:col-span-1">
            <div>
              <h3 className="text-lg font-semibold text-fg">Something more specific?</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-muted">Custom product engineering for web, mobile, SaaS and enterprise software — and dedicated teams for long-term roadmaps.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <LinkButton href="/start-a-project" track="cta:divisions-discuss-launch">
                Discuss Your Launch
              </LinkButton>
              <LinkButton href="/capabilities/digital" variant="secondary">
                Product engineering
              </LinkButton>
            </div>
          </article>
        </div>
        <p className="mt-5 text-xs text-dim">Ranges are typical software implementation times for a defined configuration and exclude third-party approvals and onboarding.</p>
      </Section>

      <FromZeroComparison />

      <TimelineTiers />

      {/* WAYS TO WORK */}
      <Section>
        <SectionHeader eyebrow="Engagement models" title="Four ways to work with Shivacha." />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ways.map((w) => (
            <Link key={w.title} href={w.href} className="card card-hover group flex gap-4 p-5 sm:flex-col sm:gap-0 sm:p-6">
              <span className="icon-tile">
                <w.icon className="size-5" strokeWidth={1.8} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-semibold text-fg sm:mt-6">{w.title}</span>
                <span className="mt-1.5 block text-[15px] leading-relaxed text-muted sm:mt-2">{w.text}</span>
              </span>
              <ArrowUpRight className="hidden size-5 text-dim transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-brand-blue sm:mt-6 sm:block" />
            </Link>
          ))}
        </div>
      </Section>

      {/* HYBRID FINTECH */}
      <Section tone="brand">
        <div className="mb-12 grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="max-w-2xl">
            <p className="eyebrow mb-4">Our specialism</p>
            <h2 className="h-section text-fg">Bank rails and digital assets, connected.</h2>
            <p className="lede mt-4">One integration layer for accounts, cards, stablecoins and tokenized assets, with one ledger and one risk view.</p>
          </div>
          <LinkButton href="/solutions/web2-web3-fintech" variant="secondary">
            Web2 + Web3 FinTech
          </LinkButton>
        </div>
        <HybridFintechDiagram />
      </Section>

      {/* WHY */}
      <Section>
        <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-center">
          <div>
            <p className="eyebrow mb-4">Why Shivacha</p>
            <h2 className="h-section text-fg">Built by engineers who have to run what they ship.</h2>
            <ul className="mt-8 space-y-6">
              {principles.map((p) => (
                <li key={p.title} className="flex gap-4">
                  <span className="icon-tile">
                    <p.icon className="size-5" strokeWidth={1.8} />
                  </span>
                  <span>
                    <span className="block font-semibold text-fg">{p.title}</span>
                    <span className="mt-1 block text-[15px] text-muted">{p.text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <SecurityLayersVisual />
            <div className="mt-4 grid grid-cols-2 overflow-hidden rounded-2xl border border-line bg-ink-900 shadow-[0_20px_50px_-24px_rgb(11_20_36/0.35)] sm:grid-cols-4">
              {[
                [`${services.length}+`, "services", "/services"],
                [products.length, "products", "/products"],
                [`${technologies.length}+`, "technologies", "/technologies"],
                [industries.length, "industries", "/industries"],
              ].map(([v, l, h]) => (
                <Link key={String(l)} href={String(h)} className="border-line px-3 py-3.5 text-center transition-colors odd:border-r max-sm:[&:nth-child(-n+2)]:border-b sm:not-last:border-r hover:bg-ink-850 sm:py-4">
                  <span className="block text-xl font-semibold tracking-tight text-fg sm:text-2xl">{v}</span>
                  <span className="block text-[11px] text-muted sm:text-xs">{l}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* INDUSTRIES */}
      <Section>
        <SectionHeader eyebrow="Industries" title="Built for regulated, high-stakes industries." action={{ label: "All industries", href: "/industries" }} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {industries.slice(0, 10).map((i) => (
            <Link key={i.slug} href={`/industries/${i.slug}`} className="card card-hover group flex flex-col gap-4 p-5">
              <span className="flex size-10 items-center justify-center rounded-lg bg-brand-blue/10 text-brand-blue transition-colors group-hover:bg-brand-600 group-hover:text-white">
                <Icon name={industryIcon[i.slug] ?? "Building2"} className="size-5" />
              </span>
              <span className="font-medium text-fg">{i.name}</span>
            </Link>
          ))}
        </div>
      </Section>

      {/* INSIGHTS */}
      <Section>
        <SectionHeader eyebrow="Insights" title="Notes from our engineers." action={{ label: "All insights", href: "/insights" }} />
        <div className="grid gap-5 md:grid-cols-3">
          {latest.map((a) => (
            <Link key={a.slug} href={`/insights/${a.slug}`} className="card card-hover group flex flex-col overflow-hidden p-3">
              <Cover kind={a.category} />
              <div className="flex flex-1 flex-col p-3 pt-5">
                <span className="text-xs font-medium text-dim">
                  {new Date(a.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} · {a.readingTime}
                </span>
                <h3 className="mt-2 text-lg leading-snug font-semibold text-fg group-hover:text-brand-blue">{a.title}</h3>
              </div>
            </Link>
          ))}
        </div>
      </Section>

      <FAQ items={generalFaqs} title="Questions about Shivacha" eyebrow="Company FAQ" />
      <CTABand />
    </>
  );
}
