import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { divisions } from "@/data/capabilities";
import { services } from "@/data/services";
import { products } from "@/data/products";
import { technologies } from "@/data/technologies";
import { industries } from "@/data/industries";
import { teams, engagementModels } from "@/data/teams";
import { caseStudies } from "@/data/caseStudies";
import { markets } from "@/data/markets";
import { resources } from "@/data/resources";
import { insights } from "@/data/insights";
import { engagementWays } from "@/data/company";
import { siteConfig } from "@/data/siteConfig";
import { buildMetadata } from "@/lib/seo";
import { servicesForDivision } from "@/lib/relations";
import { Section, SectionHeader, LinkButton, DivisionBadge } from "@/components/ui/primitives";
import { Icon, industryIcon } from "@/components/ui/Icon";
import { divisionTone } from "@/components/ui/division";
import { EcosystemMap, type EcosystemNode } from "@/components/visuals/EcosystemMap";
import { LayeredArchitecture, type ArchLayer } from "@/components/visuals/LayeredArchitecture";
import { HybridFintechDiagram } from "@/components/visuals/HybridFintechDiagram";
import { DashboardPreview } from "@/components/visuals/DashboardPreview";
import { CTABand } from "@/components/sections/CTABand";
import { cn } from "@/lib/cn";

export const metadata = buildMetadata({
  title: "Shivacha Technologies — Technology for companies building what comes next",
  description:
    "Shivacha builds AI systems, digital products, financial technology, Web3 infrastructure and cloud platforms for ambitious companies worldwide.",
  path: "/",
});

const satellites: Record<string, { label: string; href: string }[]> = {
  ai: [
    { label: "Agents", href: "/services/ai-agents" },
    { label: "RAG", href: "/services/rag-development" },
    { label: "LLMs", href: "/services/llm-development" },
    { label: "Vision", href: "/services/computer-vision" },
  ],
  digital: [
    { label: "SaaS", href: "/services/saas-development" },
    { label: "Mobile", href: "/services/mobile-app-development" },
    { label: "APIs", href: "/services/api-development" },
    { label: "Modernize", href: "/services/legacy-modernization" },
  ],
  fintech: [
    { label: "Banking", href: "/services/digital-banking-development" },
    { label: "Payments", href: "/services/payment-orchestration" },
    { label: "Cards", href: "/services/card-management-system" },
    { label: "Hybrid", href: "/solutions/web2-web3-fintech" },
  ],
  web3: [
    { label: "RWA", href: "/services/rwa-tokenization" },
    { label: "DeFi", href: "/services/defi-development" },
    { label: "Custody", href: "/services/digital-asset-custody-integration" },
    { label: "Protocols", href: "/services/protocol-development" },
  ],
  cloud: [
    { label: "Kubernetes", href: "/services/kubernetes" },
    { label: "DevOps", href: "/services/devops" },
    { label: "Security", href: "/services/cybersecurity" },
    { label: "SRE", href: "/services/site-reliability-engineering" },
  ],
};

const archLayers: ArchLayer[] = [
  { id: "user", name: "User", items: ["Customers", "Employees", "Partners"], description: "Every system starts with the people who use it. We design experiences around real users and real workflows — customers, operations teams and partners.", links: [{ label: "Product engineering", href: "/solutions/product-engineering" }], color: "#e9edf5" },
  { id: "channels", name: "Web / Mobile", items: ["Next.js", "iOS", "Android", "Portals"], description: "Fast, accessible web applications and native or cross-platform mobile apps, built on design systems and performance budgets.", links: [{ label: "Web development", href: "/services/web-development" }, { label: "Mobile apps", href: "/services/mobile-app-development" }], color: "#4c82ff" },
  { id: "application", name: "Application", items: ["SaaS", "Enterprise", "FinTech", "Web3"], description: "Domain platforms — SaaS products, enterprise systems, financial products and digital asset applications — engineered with clear boundaries.", links: [{ label: "SaaS", href: "/services/saas-development" }, { label: "FinTech", href: "/capabilities/fintech" }, { label: "Web3", href: "/capabilities/web3" }], color: "#1fc38e" },
  { id: "intelligence", name: "Intelligence", items: ["AI agents", "RAG", "ML", "Automation"], description: "AI woven into applications: copilots, agents, retrieval, machine learning and automation with evaluation and governance built in.", links: [{ label: "AI capabilities", href: "/capabilities/ai" }, { label: "AI agents", href: "/services/ai-agents" }], color: "#8e6bff" },
  { id: "infrastructure", name: "Infrastructure", items: ["Cloud", "Kubernetes", "DevOps", "Security"], description: "Secure, observable cloud foundations with platform engineering, SRE and cybersecurity — so applications stay up and stay safe.", links: [{ label: "Cloud", href: "/capabilities/cloud" }, { label: "Platform engineering", href: "/services/platform-engineering" }], color: "#48b8fa" },
  { id: "data", name: "Data", items: ["PostgreSQL", "MongoDB", "Redis", "Warehouses"], description: "Transactional, analytical and real-time data stores designed for correctness, performance and governance.", links: [{ label: "PostgreSQL", href: "/technologies/postgresql" }, { label: "Data solutions", href: "/services/ai-data-solutions" }], color: "#9aa5b8" },
  { id: "integration", name: "Integration", items: ["APIs", "Payments", "Banking", "Blockchain"], description: "APIs, events and adapters connecting products to partners, payment networks, banks and blockchains.", links: [{ label: "API & integration", href: "/services/microservices-development" }, { label: "Hybrid fintech", href: "/solutions/web2-web3-fintech" }], color: "#2fd6ee" },
];

const story = [
  { n: "01", t: "Technology is changing how businesses operate." },
  { n: "02", t: "Shivacha brings multiple technology disciplines together." },
  { n: "03", t: "AI · Digital · FinTech · Web3 · Cloud." },
];

export default function HomePage() {
  const nodes: EcosystemNode[] = divisions.map((d) => ({
    id: d.id,
    short: d.short,
    name: d.name,
    tagline: d.tagline,
    color: divisionTone[d.id].hex,
    href: `/capabilities/${d.id}`,
    satellites: satellites[d.id],
  }));
  const featuredProducts = ["neobank", "payment-orchestration", "crypto-exchange", "rwa-platform", "ai-agent-platform", "hybrid-wallet"].map((s) => products.find((p) => p.slug === s)!);
  const regions = markets.filter((m) => m.type === "region");
  const featuredResources = resources.filter((r) => r.featured).slice(0, 4);
  const latest = [...insights].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);

  return (
    <>
      {/* 1 · HERO */}
      <section className="relative overflow-hidden pt-28 pb-16 sm:pt-32 lg:pt-36 lg:pb-24">
        <div className="grid-bg grid-fade pointer-events-none absolute inset-0" aria-hidden />
        <div className="pointer-events-none absolute -top-48 left-1/2 h-[640px] w-[1100px] -translate-x-1/2 rounded-full opacity-[0.18] blur-[140px]" style={{ background: "conic-gradient(from 90deg, #8e6bff, #4c82ff, #2fd6ee, #1fc38e, #8e6bff)" }} aria-hidden />
        <div className="container-x relative grid items-center gap-12 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <Link href="/solutions/web2-web3-fintech" className="chip mb-8">
              <span className="size-1.5 rounded-full bg-brand-emerald" /> New: Web2 + Web3 FinTech architecture <ArrowRight className="size-3" />
            </Link>
            <h1 className="h-display text-gradient">Technology for companies building what comes next.</h1>
            <p className="lede mt-7 max-w-xl">AI, digital engineering, fintech, Web3 and cloud — brought together to help ambitious companies build, transform and scale.</p>
            <div className="mt-10 flex flex-wrap gap-3">
              <LinkButton href="/start-a-project" track="cta:hero-start">
                Start a Project
              </LinkButton>
              <LinkButton href="/capabilities" variant="secondary" track="cta:hero-capabilities">
                Explore Capabilities
              </LinkButton>
            </div>
            <dl className="mt-14 grid max-w-lg grid-cols-3 gap-6 border-t border-line pt-8">
              {[
                [services.length + "+", "Engineering services"],
                [products.length, "Ready-to-launch products"],
                [technologies.length + "+", "Technologies"],
              ].map(([v, l]) => (
                <div key={String(l)}>
                  <dt className="sr-only">{l}</dt>
                  <dd className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">{v}</dd>
                  <dd className="mt-1 text-xs text-dim">{l}</dd>
                </div>
              ))}
            </dl>
          </div>
          <EcosystemMap nodes={nodes} />
        </div>
      </section>

      {/* 2 · STORY + FIVE DIVISIONS */}
      <Section id="divisions">
        <div className="mb-14 grid gap-4 md:grid-cols-3">
          {story.map((s) => (
            <div key={s.n} className="border-l border-line pl-5">
              <span className="font-mono text-xs text-dim">{s.n}</span>
              <p className="mt-2 text-lg leading-snug text-fg">{s.t}</p>
            </div>
          ))}
        </div>
        <SectionHeader eyebrow="Five divisions" title="One partner across the technologies that matter now." lede="Each division is a deep practice on its own. Together they solve problems that cross disciplines — without handoffs between vendors." />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          {divisions.map((d) => {
            const t = divisionTone[d.id];
            const count = servicesForDivision(d.id).length;
            return (
              <Link key={d.id} href={`/capabilities/${d.id}`} className="card card-hover group relative flex flex-col overflow-hidden p-6 lg:min-h-[340px]">
                <div className={cn("absolute -top-20 -right-20 size-44 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-40")} style={{ background: t.hex }} aria-hidden />
                <div className={cn("mb-8 flex size-11 items-center justify-center rounded-xl border", t.border, t.bg)}>
                  <Icon name={d.icon} className={cn("size-5", t.text)} />
                </div>
                <p className={cn("font-mono text-[11px] tracking-[0.16em] uppercase", t.text)}>{d.short}</p>
                <h3 className="mt-2 text-xl font-semibold tracking-tight text-fg">{d.name}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted">{d.description}</p>
                <div className="mt-auto flex items-center justify-between pt-6 text-xs text-dim">
                  <span>{count} services</span>
                  <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-fg" />
                </div>
              </Link>
            );
          })}
        </div>
      </Section>

      {/* 3 · ENTERPRISE CAPABILITY STATEMENT */}
      <Section>
        <div className="grid gap-14 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <p className="eyebrow mb-4">How we work</p>
            <p className="text-3xl leading-tight font-semibold tracking-[-0.025em] text-balance text-fg sm:text-4xl lg:text-5xl">
              Technology engineered around your business — <span className="text-muted">from a first product to enterprise-wide transformation.</span>
            </p>
            <p className="lede mt-6">Engage Shivacha the way your situation requires: build from scratch, start from a platform, extend your team or transform how the organisation runs on technology.</p>
          </div>
          <ol className="divide-y divide-line border-y border-line">
            {engagementWays.map((w) => (
              <li key={w.n}>
                <Link href={w.href} className="group flex items-start gap-6 py-6">
                  <span className="font-mono text-sm text-dim">{w.n}</span>
                  <span className="flex-1">
                    <span className="block text-lg font-semibold text-fg">{w.title}</span>
                    <span className="mt-1 block text-sm text-muted">{w.description}</span>
                  </span>
                  <ArrowRight className="mt-1.5 size-4 text-dim transition-all group-hover:translate-x-1 group-hover:text-fg" />
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </Section>

      {/* 4 · READY-TO-LAUNCH PRODUCTS */}
      <Section>
        <SectionHeader eyebrow="Ready-to-launch products" title="Platforms that accelerate launch." lede="Configurable, extensible platforms across fintech, Web3, AI and digital — deployed in your environment, customised to your model." action={{ label: `All ${products.length} products`, href: "/products" }} />
        <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 scrollbar-none lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0 lg:pb-0">
          {featuredProducts.map((p, i) => (
            <Link key={p.slug} href={`/products/${p.slug}`} className="card card-hover group flex w-[85%] shrink-0 snap-start flex-col overflow-hidden sm:w-[46%] lg:w-auto">
              {i < 3 && (
                <div className="border-b border-line bg-ink-900/60 p-4">
                  <DashboardPreview kind={p.preview} name={p.name} />
                </div>
              )}
              <div className="flex flex-1 flex-col p-6">
                <DivisionBadge division={p.division} className="self-start" />
                <h3 className="mt-4 text-lg font-semibold text-fg">{p.name}</h3>
                <p className="mt-2 text-sm text-muted">{p.tagline}</p>
                <span className="mt-auto flex items-center gap-1.5 pt-5 text-sm text-muted group-hover:text-fg">
                  View product <ArrowRight className="size-3.5" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </Section>

      {/* 5 · SERVICES */}
      <Section>
        <SectionHeader eyebrow="Services" title={`${services.length}+ engineering services, organised by division.`} action={{ label: "Browse all services", href: "/services" }} />
        <div className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-2 lg:grid-cols-5">
          {divisions.map((d) => (
            <div key={d.id} className="bg-ink-950 p-6">
              <p className={cn("mb-4 font-mono text-[11px] tracking-[0.16em] uppercase", divisionTone[d.id].text)}>{d.short}</p>
              <ul className="space-y-2.5">
                {servicesForDivision(d.id)
                  .slice(0, 7)
                  .map((s) => (
                    <li key={s.slug}>
                      <Link href={`/services/${s.slug}`} className="text-sm text-muted transition-colors hover:text-fg">
                        {s.name}
                      </Link>
                    </li>
                  ))}
              </ul>
              <Link href={`/capabilities/${d.id}`} className="mt-5 inline-flex items-center gap-1 text-xs text-dim hover:text-fg">
                All {d.short} services <ArrowRight className="size-3" />
              </Link>
            </div>
          ))}
        </div>
      </Section>

      {/* 6 · INDUSTRY SOLUTIONS */}
      <Section>
        <SectionHeader eyebrow="Industries" title="Solutions shaped by industry realities." action={{ label: "All industries", href: "/industries" }} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {industries.slice(0, 15).map((i) => (
            <Link key={i.slug} href={`/industries/${i.slug}`} className="card card-hover group flex items-center gap-3 p-4">
              <Icon name={industryIcon[i.slug] ?? "Building2"} className="size-4 text-dim group-hover:text-fg" />
              <span className="text-sm text-fg">{i.name}</span>
            </Link>
          ))}
        </div>
      </Section>

      {/* 7 · TECHNOLOGY ARCHITECTURE */}
      <Section>
        <SectionHeader eyebrow="Technology ecosystem" title="The full stack, engineered as one system." lede="From the interface to the integration layer, every layer is a Shivacha competency — so the whole system is designed together." action={{ label: "Technology directory", href: "/technologies" }} />
        <LayeredArchitecture layers={archLayers} />
      </Section>

      {/* 8 · HYBRID FINTECH */}
      <Section>
        <SectionHeader
          eyebrow="Shivacha differentiator"
          title="Connect traditional financial infrastructure with programmable digital assets."
          lede="One integration layer between bank rails and digital asset rails: API, identity, compliance, risk, ledger, settlement and analytics — operating consistently across both."
          action={{ label: "Web2 + Web3 FinTech", href: "/solutions/web2-web3-fintech" }}
        />
        <HybridFintechDiagram />
      </Section>

      {/* 9 · FEATURED WORK */}
      <Section>
        <SectionHeader eyebrow="Work" title="How we approach complex systems." lede="Reference architectures written by our engineers. They describe our approach to a class of system — not specific client engagements." action={{ label: "All work", href: "/work" }} />
        <div className="grid gap-4 md:grid-cols-3">
          {["ledger-first-neobank", "rwa-fund-tokenization", "claims-intake-agent"].map((slug) => {
            const c = caseStudies.find((x) => x.slug === slug)!;
            return (
              <Link key={slug} href={`/work/${slug}`} className="card card-hover group flex flex-col p-6">
                <div className="flex items-center justify-between">
                  <DivisionBadge division={c.division} />
                  <span className="font-mono text-[10px] tracking-wider text-dim uppercase">Reference architecture</span>
                </div>
                <h3 className="mt-6 text-lg font-semibold text-fg">{c.title}</h3>
                <p className="mt-2 text-sm text-muted">{c.summary}</p>
                <span className="mt-auto flex items-center gap-1.5 pt-6 text-sm text-muted group-hover:text-fg">
                  Read <ArrowRight className="size-3.5" />
                </span>
              </Link>
            );
          })}
        </div>
      </Section>

      {/* 10 · DEDICATED TEAMS */}
      <Section>
        <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <SectionHeader eyebrow="Dedicated teams" title="Build your engineering organisation with Shivacha." lede="Specialists, pods and complete teams across AI, software, fintech, Web3, cloud and design — working inside your roadmap." className="mb-8" />
            <div className="flex flex-wrap gap-3">
              <LinkButton href="/dedicated-teams">Explore teams</LinkButton>
              <LinkButton href="/hire-developers" variant="secondary">
                Hire developers
              </LinkButton>
            </div>
          </div>
          <div>
            <div className="mb-6 flex flex-wrap gap-2">
              {teams.slice(0, 16).map((t) => (
                <Link key={t.slug} href={`/dedicated-teams/${t.slug}`} className="chip">
                  {t.name}
                </Link>
              ))}
            </div>
            <div className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3">
              {engagementModels.slice(0, 6).map((m) => (
                <div key={m.name} className="bg-ink-950 p-5">
                  <p className="text-sm font-semibold text-fg">{m.name}</p>
                  <p className="mt-1 font-mono text-[11px] text-dim">{m.size}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* 11 · GLOBAL MARKETS */}
      <Section>
        <SectionHeader eyebrow="Global delivery" title="Serving ambitious companies worldwide." lede={siteConfig.delivery} action={{ label: "Markets", href: "/markets" }} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {regions.map((r) => (
            <Link key={r.slug} href={`/markets/${r.slug}`} className="card card-hover group p-5">
              <p className="text-base font-semibold text-fg">{r.name}</p>
              <p className="mt-2 text-xs text-dim">{r.countries?.length ?? 0} market pages</p>
              <ArrowRight className="mt-6 size-4 text-dim transition-transform group-hover:translate-x-1 group-hover:text-fg" />
            </Link>
          ))}
        </div>
      </Section>

      {/* 12 · RESOURCES */}
      <Section>
        <SectionHeader eyebrow="Resources" title="Technical material from our engineers." action={{ label: "Resource library", href: "/resources" }} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {featuredResources.map((r) => (
            <Link key={r.slug} href={`/resources/${r.category}/${r.slug}`} className="card card-hover group flex flex-col p-6">
              <span className="font-mono text-[10.5px] tracking-[0.16em] text-dim uppercase">
                {r.type.replace("-", " ")} · {r.readingTime}
              </span>
              <h3 className="mt-4 text-base font-semibold text-fg">{r.title}</h3>
              <p className="mt-2 line-clamp-3 text-sm text-muted">{r.summary}</p>
              <span className="mt-auto pt-5 text-sm text-muted group-hover:text-fg">{r.gated ? "Get the guide →" : "Read →"}</span>
            </Link>
          ))}
        </div>
      </Section>

      {/* 13 · INSIGHTS */}
      <Section>
        <SectionHeader eyebrow="Insights" title="Engineering perspectives." action={{ label: "All insights", href: "/insights" }} />
        <div className="grid gap-4 md:grid-cols-3">
          {latest.map((a) => (
            <Link key={a.slug} href={`/insights/${a.slug}`} className="group flex flex-col border-t border-line pt-6">
              <span className="font-mono text-[11px] text-dim">
                {new Date(a.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} · {a.readingTime}
              </span>
              <h3 className="mt-3 text-lg leading-snug font-semibold text-fg group-hover:underline group-hover:decoration-white/30 group-hover:underline-offset-4">{a.title}</h3>
              <p className="mt-2 text-sm text-muted">{a.excerpt}</p>
            </Link>
          ))}
        </div>
      </Section>

      {/* 14 · FINAL CTA */}
      <CTABand />
    </>
  );
}
