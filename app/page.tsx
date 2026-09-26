import Link from "next/link";
import { ArrowRight, ArrowUpRight, Boxes, Compass, Hammer, KeyRound, Layers, LifeBuoy, Rocket, ShieldCheck, Users, Workflow } from "lucide-react";
import { divisions } from "@/data/capabilities";
import { services } from "@/data/services";
import { products } from "@/data/products";
import { technologies } from "@/data/technologies";
import { industries } from "@/data/industries";
import { insights } from "@/data/insights";
import { buildMetadata } from "@/lib/seo";
import { servicesForDivision } from "@/lib/relations";
import { Section, SectionHeader, LinkButton, DivisionBadge } from "@/components/ui/primitives";
import { Icon, industryIcon } from "@/components/ui/Icon";
import { HybridFintechDiagram } from "@/components/visuals/HybridFintechDiagram";
import { DashboardPreview } from "@/components/visuals/DashboardPreview";
import { CTABand } from "@/components/sections/CTABand";
import { DivisionShowcase, type ShowcaseItem } from "@/components/sections/DivisionShowcase";
import { HeroScene } from "@/components/graphics/DivisionArt";
import { TechMarquee } from "@/components/graphics/TechMarquee";
import { Cover } from "@/components/graphics/Cover";

export const metadata = buildMetadata({
  title: "Shivacha Technologies — Technology for companies building what comes next",
  description:
    "Shivacha builds AI systems, digital products, financial technology, Web3 infrastructure and cloud platforms for ambitious companies worldwide.",
  path: "/",
});

const keyServices: Record<string, string[]> = {
  ai: ["ai-agents", "rag-development", "llm-development", "computer-vision"],
  digital: ["saas-development", "mobile-app-development", "api-development", "legacy-modernization"],
  fintech: ["digital-banking-development", "payment-orchestration", "card-management-system", "payment-gateway-development"],
  web3: ["rwa-tokenization", "defi-development", "digital-asset-custody-integration", "smart-contract-development"],
  cloud: ["kubernetes", "devops", "cybersecurity", "site-reliability-engineering"],
};

const ways = [
  { icon: Hammer, title: "Custom engineering", text: "Software designed around your business. You own the code.", href: "/services" },
  { icon: Rocket, title: "Launch from a platform", text: "Start from a ready product and customise it to your model.", href: "/products" },
  { icon: Users, title: "Dedicated teams", text: "Specialists and pods that work inside your roadmap.", href: "/dedicated-teams" },
  { icon: Workflow, title: "Transformation", text: "Modernise architecture, adopt AI and move to the cloud.", href: "/solutions/digital-transformation" },
];

const steps = [
  { icon: Compass, title: "Discover", text: "Goals, users, constraints and risks, mapped in the first weeks." },
  { icon: Layers, title: "Architect", text: "A reference design and a delivery plan you can review." },
  { icon: Boxes, title: "Build", text: "Two-week increments with demos, tests and security built in." },
  { icon: LifeBuoy, title: "Run & scale", text: "Launch, monitor and improve, or hand over to your team." },
];

const principles = [
  { icon: Layers, title: "Five disciplines, one team", text: "AI, product, fintech, Web3 and cloud engineers working together, with no hand-offs between vendors." },
  { icon: ShieldCheck, title: "Security from day one", text: "Threat modelling, least-privilege access and audit-ready engineering on every project." },
  { icon: KeyRound, title: "Your IP, your cloud", text: "Code and infrastructure live in your accounts. No lock-in to us." },
];

export default function HomePage() {
  const showcase: ShowcaseItem[] = divisions.map((d) => ({
    id: d.id,
    short: d.short,
    name: d.name,
    tagline: d.tagline,
    href: `/capabilities/${d.id}`,
    count: servicesForDivision(d.id).length,
    icon: <Icon name={d.icon} className="size-5" />,
    services: keyServices[d.id]
      .map((slug) => services.find((s) => s.slug === slug))
      .filter((s) => !!s)
      .map((s) => ({ name: s.name, href: `/services/${s.slug}` })),
  }));
  const featuredProducts = ["payment-orchestration", "ai-agent-platform", "crypto-exchange"].map((s) => products.find((p) => p.slug === s)!);
  const latest = [...insights].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);

  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden pt-28 pb-14 sm:pt-32 lg:pt-36 lg:pb-20">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[520px]"
          style={{ background: "radial-gradient(60% 70% at 70% 0%, rgb(1 149 255 / 0.14), transparent 70%)" }}
        />
        <div className="container-x relative grid items-center gap-12 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
          <div>
            <p className="eyebrow mb-6">AI · Digital · FinTech · Web3 · Cloud</p>
            <h1 className="h-display text-fg">
              Technology for companies building <span className="accent-word">what comes next.</span>
            </h1>
            <p className="lede mt-6 max-w-xl">We design, build and run the software behind banks, fintechs, AI products and digital platforms.</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <LinkButton href="/start-a-project" track="cta:hero-start">
                Start a Project
              </LinkButton>
              <LinkButton href="/products" variant="secondary" track="cta:hero-products">
                See our products
              </LinkButton>
            </div>
            <dl className="mt-12 grid max-w-md grid-cols-3 divide-x divide-line">
              {[
                [`${services.length}+`, "Services"],
                [products.length, "Products"],
                [`${technologies.length}+`, "Technologies"],
              ].map(([v, l], i) => (
                <div key={String(l)} className={i ? "pl-5" : ""}>
                  <dt className="sr-only">{l}</dt>
                  <dd className="text-3xl font-semibold tracking-tight text-fg">{v}</dd>
                  <dd className="mt-1 text-sm text-muted">{l}</dd>
                </div>
              ))}
            </dl>
          </div>
          <HeroScene />
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

      {/* DIVISIONS */}
      <Section id="divisions">
        <SectionHeader eyebrow="What we do" title="Five practices. One engineering partner." lede="Pick a division to see the kind of systems we build." />
        <DivisionShowcase items={showcase} />
      </Section>

      {/* WAYS TO WORK */}
      <Section>
        <SectionHeader eyebrow="How to work with us" title="Four ways to engage." />
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

      {/* PRODUCTS */}
      <Section>
        <SectionHeader eyebrow="Ready-to-launch products" title="Start from a working platform." lede="Configurable products you deploy in your own cloud and shape to your business." action={{ label: `All ${products.length} products`, href: "/products" }} />
        <div className="grid gap-5 lg:grid-cols-3">
          {featuredProducts.map((p) => (
            <Link key={p.slug} href={`/products/${p.slug}`} className="card card-hover group flex flex-col overflow-hidden">
              <div className="band-muted border-b border-line p-5">
                <DashboardPreview kind={p.preview} name={p.name} />
              </div>
              <div className="flex flex-1 flex-col p-6">
                <DivisionBadge division={p.division} className="self-start" />
                <h3 className="mt-4 text-lg font-semibold text-fg">{p.name}</h3>
                <p className="mt-1.5 text-[15px] text-muted">{p.tagline}</p>
                <span className="mt-auto flex items-center gap-1.5 pt-5 text-sm font-semibold text-brand-blue">
                  View product <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
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

      {/* PROCESS */}
      <Section>
        <SectionHeader eyebrow="Delivery" title="How a project runs." align="center" />
        <ol className="relative grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <span aria-hidden className="absolute top-7 right-[12%] left-[12%] hidden h-px bg-gradient-to-r from-brand-blue/0 via-brand-blue/40 to-brand-blue/0 lg:block" />
          {steps.map((s, i) => (
            <li key={s.title} className="relative text-center">
              <span className="relative mx-auto flex size-14 items-center justify-center rounded-2xl border border-line bg-ink-900 text-brand-blue shadow-[0_10px_30px_-18px_rgb(1_149_255/0.8)]">
                <s.icon className="size-6" strokeWidth={1.7} />
                <span className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full bg-brand-600 text-[11px] font-semibold text-white">{i + 1}</span>
              </span>
              <h3 className="mt-5 text-lg font-semibold text-fg">{s.title}</h3>
              <p className="mx-auto mt-1.5 max-w-[250px] text-[15px] text-muted">{s.text}</p>
            </li>
          ))}
        </ol>
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
          <div className="grid grid-cols-2 gap-4">
            {[
              [`${services.length}+`, "engineering services", "/services"],
              [products.length, "ready-to-launch products", "/products"],
              [`${technologies.length}+`, "technologies in our stack", "/technologies"],
              [industries.length, "industries served", "/industries"],
            ].map(([v, l, h], i) => (
              <Link key={String(l)} href={String(h)} className={i === 0 ? "card card-hover band-brand p-6 text-white" : "card card-hover p-6"} data-theme={i === 0 ? "dark" : undefined}>
                <p className="text-4xl font-semibold tracking-tight text-fg sm:text-5xl">{v}</p>
                <p className="mt-2 text-sm text-muted">{l}</p>
              </Link>
            ))}
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

      <CTABand />
    </>
  );
}
