import Link from "next/link";
import { ArrowUpRight, KeyRound, Layers, ShieldCheck } from "lucide-react";
import { products, getProduct } from "@/data/products";
import { services } from "@/data/services";
import { technologies } from "@/data/technologies";
import { industries } from "@/data/industries";
import { insights } from "@/data/insights";
import { siteConfig } from "@/data/siteConfig";
import { FEATURED_PLATFORMS, launchFor } from "@/data/launch";
import { buildMetadata } from "@/lib/seo";
import { withSeo } from "@/lib/cms/seo";
import { Section, SectionHeader, LinkButton } from "@/components/ui/primitives";
import { Icon, industryIcon } from "@/components/ui/Icon";
import { HybridFintechDiagram } from "@/components/visuals/HybridFintechDiagram";
import { InfrastructureVisual } from "@/components/visuals/InfrastructureVisual";
import { SecurityLayersVisual } from "@/components/visuals/SystemVisuals";
import { FAQ } from "@/components/sections/FAQ";
import { generalFaqs } from "@/data/faqs";
import { CTABand } from "@/components/sections/CTABand";
import { LaunchModel, PlatformCard } from "@/components/sections/Launch";
import { DivisionExplorer } from "@/components/sections/DivisionExplorer";
import { DivisionSwitcher } from "@/components/sections/DivisionSwitcher";
import { ArchitectureFlow, STORIES } from "@/components/sections/ArchitectureStory";
import { TechMarquee } from "@/components/graphics/TechMarquee";
import { Cover } from "@/components/graphics/Cover";
import { BookCallButton } from "@/components/leads/BookCall";

export const generateMetadata = () => withSeo(buildMetadata({
  title: "Shivacha Technologies — Web3, FinTech, Digital Asset, AI & Cloud Infrastructure",
  description:
    "Shivacha engineers the systems behind digital finance, Web3 and intelligent technology: white-label crypto exchanges, wallets, neobanks, crypto card infrastructure, tokenization and AI agent platforms, plus custom engineering and dedicated teams.",
  path: "/",
}));

const engagement = [
  { n: "01", title: "White-label platforms", text: "Start from a production-ready foundation and customise it to your brand, workflows and partners.", href: "/products" },
  { n: "02", title: "Custom engineering", text: "Platforms engineered around your business when no foundation fits. You own the code and infrastructure.", href: "/services" },
  { n: "03", title: "Dedicated teams", text: "Senior engineers who work inside your roadmap, tools and time zone.", href: "/dedicated-teams" },
  { n: "04", title: "Enterprise deployment", text: "Multi-region, compliance-aware deployment and operations for systems that cannot go down.", href: "/capabilities/cloud" },
];

const principles = [
  { icon: Layers, title: "One engineering organisation", text: "Web3, digital asset, FinTech, AI and cloud engineers on one team — no hand-offs between vendors." },
  { icon: ShieldCheck, title: "Security from day one", text: "Threat modelling, least-privilege access and audit-ready engineering on every engagement." },
  { icon: KeyRound, title: "Your IP, your cloud", text: "Code and infrastructure live in your accounts. No lock-in to us." },
];

export default function HomePage() {
  const featured = FEATURED_PLATFORMS.map((slug) => ({ product: getProduct(slug)!, launch: launchFor(slug)! }));
  const latest = [...insights].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
  const offices = siteConfig.offices.map((o) => o.label.replace(", Texas", "")).join(" · ");

  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden pt-28 pb-12 sm:pt-32 lg:pt-36 lg:pb-16">
        <div aria-hidden className="grid-bg grid-fade pointer-events-none absolute inset-0 opacity-70" />
        <div className="container-x relative grid items-center gap-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-[clamp(2.5rem,4vw,5rem)]">
          <div className="min-w-0">
            <p className="eyebrow mb-7">Global technology infrastructure</p>
            <h1 className="text-[2.2rem] leading-[1.05] font-medium tracking-[-0.04em] text-balance text-fg sm:text-[3rem] lg:text-[3.35rem] xl:text-[3.75rem] 2xl:text-[4.15rem]">
              Engineering the systems behind the next generation of <span className="text-brand-blue">digital finance, Web3 and intelligent technology.</span>
            </h1>
            <p className="lede mt-6 max-w-xl 2xl:max-w-2xl">
              Shivacha designs, builds and operates Web3, FinTech, digital asset, AI and cloud platforms — from white-label foundations to fully custom infrastructure — for companies across the USA, UK, Europe, the Middle East and Asia-Pacific.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <LinkButton href="/start-a-project" track="cta:hero-discuss-product">
                Discuss Your Product
              </LinkButton>
              <LinkButton href="/capabilities" variant="secondary" track="cta:hero-capabilities">
                Explore Capabilities
              </LinkButton>
            </div>
            <dl className="mt-12 grid max-w-xl grid-cols-1 2xl:max-w-2xl gap-y-4 border-t border-line pt-6 sm:grid-cols-3 sm:gap-x-6">
              <div className="min-w-0">
                <dt className="label-tech">Divisions</dt>
                <dd className="mt-1.5 text-[14px] leading-snug text-fg">Web3 · FinTech · Digital Assets · AI · Cloud</dd>
              </div>
              <div className="min-w-0">
                <dt className="label-tech">Engagement</dt>
                <dd className="mt-1.5 text-[14px] leading-snug text-fg">White-label · Custom · Dedicated teams</dd>
              </div>
              <div className="min-w-0">
                <dt className="label-tech">Offices</dt>
                <dd className="mt-1.5 text-[14px] leading-snug text-fg">{offices}</dd>
              </div>
            </dl>
          </div>
          <InfrastructureVisual className="min-w-0" />
        </div>
      </section>

      {/* TECHNOLOGIES */}
      <section className="border-y border-line py-7" data-tone="plain">
        <div className="container-x mb-4 flex items-center justify-between gap-4">
          <p className="label-tech">Technologies we build with</p>
          <Link href="/technologies" className="text-sm font-medium text-muted hover:text-fg">
            All {technologies.length} →
          </Link>
        </div>
        <div className="container-x">
          <TechMarquee />
        </div>
      </section>

      {/* DIVISIONS */}
      <Section id="divisions">
        <SectionHeader eyebrow="Five divisions" title="Specialists in the systems that are hardest to build." lede="Select a division to see what it delivers, how it is engineered and how quickly it can launch." action={{ label: "All capabilities", href: "/capabilities" }} />
        <DivisionExplorer />
      </Section>

      {/* WHITE-LABEL SHOWROOM */}
      <Section id="platforms">
        <SectionHeader eyebrow="White-label platforms" title="Build. Customize. Launch. Scale." lede="Launch your product without starting from zero: production-ready foundations for digital assets, FinTech, Web3 and AI, customised by a dedicated engineering team." action={{ label: `All ${products.length} products`, href: "/products" }} />
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {featured.map(({ product, launch }, i) => (
            <PlatformCard key={product.slug} product={product} launch={launch} className={i === featured.length - 1 && featured.length % 2 === 1 ? "md:col-span-2 lg:col-span-1" : undefined} />
          ))}
        </div>
        <div className="mt-10 flex flex-wrap gap-3">
          <LinkButton href="/products" track="cta:showroom-explore">
            Explore White-Label Solutions
          </LinkButton>
          <LinkButton href="/request-demo" variant="secondary" track="cta:showroom-demo">
            Request Product Demo
          </LinkButton>
        </div>
      </Section>

      {/* ARCHITECTURE STORIES */}
      <Section id="how-it-works">
        <SectionHeader eyebrow="How it works" title="Engineered end to end." lede="The systems behind the products our clients launch — and the parts we build, integrate and operate." />
        <DivisionSwitcher
          panels={[STORIES.exchange, STORIES.card, STORIES.agents].map((st) => ({
            id: st.id,
            label: st.id === "exchange" ? "Crypto exchange" : st.id === "card" ? "Crypto card" : "AI agents",
            color: st.color,
            content: (
              <div>
                <div className="mb-10 grid gap-4 lg:grid-cols-[1fr_1.4fr] lg:items-end lg:gap-14">
                  <h3 className="text-[1.6rem] leading-[1.15] font-medium tracking-[-0.03em] text-fg sm:text-[1.9rem]">{st.title}</h3>
                  <p className="text-[15.5px] leading-relaxed text-muted">{st.intro}</p>
                </div>
                <ArchitectureFlow story={st} />
              </div>
            ),
          }))}
        />
      </Section>

      <LaunchModel />

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
            <ul className="mt-8 divide-y divide-line border-y border-line">
              {principles.map((p) => (
                <li key={p.title} className="flex gap-4 py-5">
                  <span className="icon-tile">
                    <p.icon className="size-5" strokeWidth={1.6} />
                  </span>
                  <span>
                    <span className="block font-semibold text-fg">{p.title}</span>
                    <span className="mt-1 block text-[15px] text-muted">{p.text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="min-w-0">
            <SecurityLayersVisual />
            <ul className="mt-4 grid grid-cols-2 border-t border-line sm:grid-cols-4">
              {[
                [`${services.length}+`, "services", "/services"],
                [products.length, "products", "/products"],
                [`${technologies.length}+`, "technologies", "/technologies"],
                [industries.length, "industries", "/industries"],
              ].map(([v, l, h]) => (
                <li key={String(l)}>
                  <Link href={String(h)} className="flex flex-col px-1 py-4 transition-colors hover:text-brand-blue">
                    <span className="text-2xl font-medium tracking-tight text-fg">{v}</span>
                    <span className="text-xs text-muted">{l}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      {/* ENGAGEMENT */}
      <Section>
        <SectionHeader eyebrow="Engagement models" title="Four ways to work with Shivacha." />
        <ol className="grid border-t border-line sm:grid-cols-2 lg:grid-cols-4">
          {engagement.map((w) => (
            <li key={w.n} className="border-b border-line lg:border-b-0">
              <Link href={w.href} className="group flex h-full flex-col py-6 sm:pr-6 lg:pr-8">
                <span className="font-mono text-[12px] text-brand-blue">{w.n}</span>
                <span className="mt-3 flex items-start justify-between gap-3 text-xl font-medium tracking-[-0.02em] text-fg">
                  {w.title}
                  <ArrowUpRight className="mt-1 size-4 shrink-0 text-dim transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-fg" aria-hidden />
                </span>
                <span className="mt-2 text-[14.5px] leading-relaxed text-muted">{w.text}</span>
              </Link>
            </li>
          ))}
        </ol>
        <div className="mt-10 flex flex-wrap gap-3">
          <LinkButton href="/start-a-project" track="cta:engagement-discuss">
            Discuss Your Product
          </LinkButton>
          <BookCallButton label="Talk to a Solution Architect" variant="secondary" source="engagement" />
        </div>
      </Section>

      {/* INDUSTRIES */}
      <Section>
        <SectionHeader eyebrow="Industries" title="Built for regulated, high-stakes industries." action={{ label: "All industries", href: "/industries" }} />
        <ul className="grid grid-cols-2 border-t border-l border-line sm:grid-cols-3 lg:grid-cols-5">
          {industries.slice(0, 10).map((i) => (
            <li key={i.slug} className="border-r border-b border-line">
              <Link href={`/industries/${i.slug}`} className="group flex h-full items-center gap-3 p-4 transition-colors hover:bg-ink-900 sm:p-5">
                <Icon name={industryIcon[i.slug] ?? "Building2"} className="size-5 shrink-0 text-muted transition-colors group-hover:text-fg" />
                <span className="text-[14.5px] font-medium text-fg">{i.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      {/* INSIGHTS */}
      <Section>
        <SectionHeader eyebrow="Insights" title="Notes from our engineers." action={{ label: "All insights", href: "/insights" }} />
        <div className="grid gap-8 md:grid-cols-3 md:gap-6">
          {latest.map((a) => (
            <Link key={a.slug} href={`/insights/${a.slug}`} className="group flex flex-col">
              <Cover kind={a.category} />
              <span className="mt-4 font-mono text-[11.5px] text-dim">
                {new Date(a.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} · {a.readingTime}
              </span>
              <h3 className="mt-2 text-lg leading-snug font-medium tracking-[-0.01em] text-fg group-hover:text-brand-blue">{a.title}</h3>
            </Link>
          ))}
        </div>
      </Section>

      <FAQ items={generalFaqs} title="Questions about Shivacha" eyebrow="Company FAQ" />
      <CTABand />
    </>
  );
}
