import Image from "next/image";
import { AlertTriangle, Check, Lightbulb, Play, Plug, Server, ShieldCheck, SlidersHorizontal } from "lucide-react";
import type { Product } from "@/data/types";
import { getDivision } from "@/data/capabilities";
import { hasLiveDemo } from "@/data/products";
import { pick, relatedCaseStudies, relatedInsights, relatedResources } from "@/lib/relations";
import { productSchema } from "@/lib/jsonld";
import { PageHero } from "@/components/sections/PageHero";
import { ArchitectureDiagram, ChipLinks, PointsGrid, PointsList, RelatedSection, TechGrid } from "@/components/sections/blocks";
import { FAQ } from "@/components/sections/FAQ";
import { CTABand } from "@/components/sections/CTABand";
import { DivisionBadge, JsonLd, LinkButton, Section, SectionHeader } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { DivisionArt } from "@/components/graphics/DivisionArt";
import { divisionTone } from "@/components/ui/division";
import { DashboardPreview } from "@/components/visuals/DashboardPreview";
import { ProductViewTracker } from "@/components/forms/ProductViewTracker";
import { launchFor } from "@/data/launch";
import { LaunchPanel } from "@/components/sections/Launch";
import { ArchitectureFlow, STORIES } from "@/components/sections/ArchitectureStory";

const productStory: Record<string, keyof typeof STORIES> = { "crypto-exchange": "exchange", "p2p-trading-platform": "exchange", "crypto-card": "card", "ai-agent-platform": "agents" };
import { toCaseItem, toInsightItem, toProductItem, toResourceItem, toServiceItem, toIndustryLink, nonNull } from "./mappers";

export function DemoButtons({ product, compact }: { product: Product; compact?: boolean }) {
  const live = hasLiveDemo(product);
  return (
    <>
      {live && (
        <LinkButton href={product.demoUrl!} external track={`demo:live-${product.slug}`}>
          Live Demo
        </LinkButton>
      )}
      <LinkButton href={`/request-demo?product=${encodeURIComponent(product.name)}`} variant={live ? "secondary" : "primary"} track={`demo:request-${product.slug}`}>
        Request Demo
      </LinkButton>
      {!compact && (
        <LinkButton href={`/book-a-meeting?product=${encodeURIComponent(product.name)}`} variant="ghost" track={`demo:book-${product.slug}`}>
          Book Demo
        </LinkButton>
      )}
    </>
  );
}

export function ProductTemplate({ product }: { product: Product }) {
  const division = getDivision(product.division);
  const tone = divisionTone[division.id];
  const related = pick.products(product.relatedProducts);
  const services = pick.services(product.services);
  const techs = pick.technologies(product.technologies);
  const cases = relatedCaseStudies({ products: [product.slug], services: product.services, division: division.id }, 2);
  const insights = relatedInsights({ services: product.services, technologies: product.technologies, division: division.id }, 3);
  const resources = relatedResources({ services: product.services }, 3);
  const launch = launchFor(product.slug);

  return (
    <>
      <JsonLd data={productSchema({ name: product.name, description: product.description, path: `/products/${product.slug}`, category: product.category })} />
      <ProductViewTracker slug={product.slug} division={product.division} />
      <PageHero
        crumbs={[
          { name: "Products", href: "/products" },
          { name: division.short, href: `/products?category=${division.id}` },
          { name: product.name, href: `/products/${product.slug}` },
        ]}
        eyebrow={
          <div className="flex flex-wrap items-center gap-2">
            <DivisionBadge division={division.id} />
            <span className="rounded-full border border-line px-2.5 py-1 text-[11px] text-muted">{product.category}</span>
            <span className="rounded-full border border-line px-2.5 py-1 text-[11px] text-muted">{launch ? "White-label · Ready to launch" : "Ready to launch"}</span>
          </div>
        }
        title={launch ? launch.seoTitle : product.name}
        lede={launch ? `${product.name}: ${product.tagline}` : product.tagline}
        accent={tone.hex}
        aside={product.heroImage ? <Image src={product.heroImage} alt={`${product.name} interface`} width={1200} height={800} className="rounded-2xl border border-line" priority /> : <Stage><DashboardPreview kind={product.preview} name={product.name} /></Stage>}
      >
        <DemoButtons product={product} />
      </PageHero>

      {launch && (
        <Section className="pt-0 sm:pt-0 lg:pt-0" tone="plain">
          <LaunchPanel launch={launch} productName={product.name} source={product.slug} />
        </Section>
      )}

      {productStory[product.slug] && (
        <Section id="how-it-works">
          <SectionHeader eyebrow="How it works" title={`${STORIES[productStory[product.slug]].title}.`} lede={STORIES[productStory[product.slug]].intro} />
          <ArchitectureFlow story={STORIES[productStory[product.slug]]} />
        </Section>
      )}

      <Section>
        <div className="grid gap-12 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <p className="eyebrow mb-4">Overview</p>
            <p className="text-xl leading-relaxed text-fg">{product.description}</p>
          </div>
          <div className="grid gap-4">
            <div className="card flex gap-4 p-6">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 light:text-amber-700">
                <AlertTriangle className="size-5" aria-hidden />
              </span>
              <div>
                <p className="font-semibold text-fg">The problem</p>
                <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{product.problem}</p>
              </div>
            </div>
            <div className="card flex gap-4 p-6" style={{ borderColor: `${tone.hex}55` }}>
              <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", tone.bg, tone.text)}>
                <Lightbulb className="size-5" aria-hidden />
              </span>
              <div>
                <p className="font-semibold text-fg">The solution</p>
                <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{product.solution}</p>
              </div>
            </div>
          </div>
        </div>
      </Section>

      <Section>
        <SectionHeader eyebrow="Feature modules" title="What's inside" />
        <PointsGrid points={product.modules} />
      </Section>

      <Section>
        <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr] lg:items-center">
          <div>
            <SectionHeader eyebrow="Product preview" title="Designed for operators and end users." className="mb-8" />
            <ul className="space-y-3">
              {product.features.map((f) => (
                <li key={f} className="flex items-start gap-3 text-[15px] text-muted">
                  <Check className={cn("mt-0.5 size-4 shrink-0", tone.text)} aria-hidden />
                  {f}
                </li>
              ))}
            </ul>
            {product.videoUrl && (
              <a href={product.videoUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary mt-8">
                <Play className="size-4" /> Watch walkthrough
              </a>
            )}
          </div>
          {product.screenshots.length ? (
            <div className="grid gap-4">
              {product.screenshots.map((src, i) => (
                <Image key={src} src={src} alt={`${product.name} screenshot ${i + 1}`} width={1200} height={800} className="rounded-2xl border border-line" loading="lazy" />
              ))}
            </div>
          ) : (
            <DivisionArt division={division.id} topic={product.name} label={`${product.name} illustration`} />
          )}
        </div>
      </Section>

      <Section>
        <div className="grid gap-12 lg:grid-cols-[1fr_1.25fr] lg:items-start">
          <div>
            <SectionHeader eyebrow="Architecture" title="Built to integrate and extend." lede="Modular services behind stable APIs, deployed into your environment." className="mb-8" />
            <TechGrid items={techs.slice(0, 6)} compact />
          </div>
          <ArchitectureDiagram layers={product.architecture} division={division.id} title={`${product.name} architecture`} />
        </div>
      </Section>

      <Section>
        <SectionHeader eyebrow="Specifications" title="Deployment, security and integration" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <SpecCard icon={<Plug className="size-5" />} title="Integrations" items={product.integrations} />
          <SpecCard icon={<ShieldCheck className="size-5" />} title="Security" items={product.security} />
          <SpecCard icon={<Server className="size-5" />} title="Deployment" items={product.deploymentOptions} />
          <SpecCard icon={<SlidersHorizontal className="size-5" />} title="Customisation" items={product.customizationOptions} />
        </div>
        <div className="mt-8 flex flex-wrap items-center gap-2">
          <span className="mr-2 text-sm font-medium text-muted">Industries:</span>
          <ChipLinks items={nonNull(product.industries.map(toIndustryLink))} />
        </div>
      </Section>

      <Section>
        <SectionHeader eyebrow="Use cases" title="Who launches with it" />
        <PointsList points={product.useCases} />
      </Section>

      <Section>
        <div className="card flex flex-col gap-6 p-8 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="eyebrow mb-3">See it in action</p>
            <p className="text-2xl font-semibold text-fg">{hasLiveDemo(product) ? "Try the live demo or book a guided walkthrough." : "Request a tailored demo for your use case."}</p>
            <p className="mt-2 text-sm text-muted">Demos are tailored to your markets, partners and integration requirements.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <DemoButtons product={product} compact />
          </div>
        </div>
      </Section>

      <RelatedSection eyebrow="Custom engineering" title="Extend it with our services" items={services.slice(0, 3).map(toServiceItem)} />
      <RelatedSection eyebrow="Related products" title="Works well with" items={related.slice(0, 3).map(toProductItem)} action={{ label: "All products", href: "/products" }} />
      <RelatedSection eyebrow="Learn more" title="Related thinking" items={[...cases.map(toCaseItem), ...insights.map(toInsightItem), ...resources.map(toResourceItem)].slice(0, 3)} />
      <FAQ items={product.faqs} />
      <CTABand title="Request a product demo." lede={`See how ${product.name} fits your business, and how we would customise and deploy it.`} primary={{ label: "Request Product Demo", href: `/request-demo?product=${encodeURIComponent(product.name)}` }} secondary={{ label: "Talk to sales", href: "/contact" }} />
    </>
  );
}

function SpecCard({ icon, title, items }: { icon: React.ReactNode; title: string; items: string[] }) {
  return (
    <div className="card p-6">
      <span className="icon-tile">{icon}</span>
      <p className="mt-5 mb-3 font-semibold text-fg">{title}</p>
      <ul className="space-y-2">
        {items.map((it) => (
          <li key={it} className="flex items-start gap-2 text-sm text-muted">
            <Check className="mt-0.5 size-3.5 shrink-0 text-brand-teal" aria-hidden />
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stage({ children }: { children: React.ReactNode }) {
  return (
    <div data-theme="dark" className="scene rounded-3xl border border-white/10 p-5 sm:p-8">
      {children}
    </div>
  );
}
