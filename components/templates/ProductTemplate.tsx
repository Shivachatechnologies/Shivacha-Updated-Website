import Image from "next/image";
import { Check, Play } from "lucide-react";
import type { Product } from "@/data/types";
import { getDivision } from "@/data/capabilities";
import { hasLiveDemo } from "@/data/products";
import { pick, relatedCaseStudies, relatedInsights, relatedResources } from "@/lib/relations";
import { productSchema } from "@/lib/jsonld";
import { PageHero } from "@/components/sections/PageHero";
import { ArchitectureDiagram, CheckList, ChipLinks, PointsGrid, RelatedSection } from "@/components/sections/blocks";
import { FAQ } from "@/components/sections/FAQ";
import { CTABand } from "@/components/sections/CTABand";
import { DivisionBadge, JsonLd, LinkButton, Section, SectionHeader } from "@/components/ui/primitives";
import { divisionTone } from "@/components/ui/division";
import { DashboardPreview } from "@/components/visuals/DashboardPreview";
import { ProductViewTracker } from "@/components/forms/ProductViewTracker";
import { toCaseItem, toInsightItem, toProductItem, toResourceItem, toServiceItem, toTechItem, toIndustryLink, nonNull } from "./mappers";

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
            <span className="rounded-full border border-line px-2.5 py-1 text-[11px] text-muted">Ready to launch</span>
          </div>
        }
        title={product.name}
        lede={product.tagline}
        accent={tone.hex}
        aside={product.heroImage ? <Image src={product.heroImage} alt={`${product.name} interface`} width={1200} height={800} className="rounded-2xl border border-line" priority /> : <DashboardPreview kind={product.preview} name={product.name} />}
      >
        <DemoButtons product={product} />
      </PageHero>

      <Section>
        <div className="grid gap-12 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <p className="eyebrow mb-4">Overview</p>
            <p className="text-xl leading-relaxed text-fg">{product.description}</p>
          </div>
          <div className="grid gap-4">
            <div className="card p-6">
              <p className="font-mono text-[11px] tracking-[0.16em] text-dim uppercase">The problem</p>
              <p className="mt-3 text-[15px] leading-relaxed text-muted">{product.problem}</p>
            </div>
            <div className="card p-6" style={{ borderColor: `${tone.hex}40` }}>
              <p className="font-mono text-[11px] tracking-[0.16em] uppercase" style={{ color: tone.hex }}>
                The solution
              </p>
              <p className="mt-3 text-[15px] leading-relaxed text-muted">{product.solution}</p>
            </div>
          </div>
        </div>
      </Section>

      <Section>
        <SectionHeader eyebrow="Feature modules" title="What's inside" />
        <PointsGrid points={product.modules} numbered />
      </Section>

      <Section>
        <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr] lg:items-center">
          <div>
            <SectionHeader eyebrow="Product preview" title="Designed for operators and end users." className="mb-8" />
            <ul className="space-y-3">
              {product.features.map((f) => (
                <li key={f} className="flex items-start gap-3 text-[15px] text-muted">
                  <Check className="mt-0.5 size-4 shrink-0" style={{ color: tone.hex }} aria-hidden />
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
            <DashboardPreview kind={product.preview} name={product.name} />
          )}
        </div>
      </Section>

      <Section>
        <div className="grid gap-12 lg:grid-cols-[1fr_1.25fr] lg:items-start">
          <SectionHeader eyebrow="Architecture" title="Built to integrate and extend." lede="Modular services behind stable APIs, deployed into your environment and connected to your partners through adapters." className="mb-0" />
          <ArchitectureDiagram layers={product.architecture} division={division.id} title={`${product.name} architecture`} />
        </div>
      </Section>

      <Section>
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-3">
          <InfoList title="Integrations" items={product.integrations} />
          <InfoList title="Security" items={product.security} />
          <div>
            <p className="eyebrow mb-5">Technology</p>
            <ChipLinks items={techs.map(toTechItem)} />
          </div>
          <InfoList title="Deployment" items={product.deploymentOptions} />
          <InfoList title="Customization" items={product.customizationOptions} />
          <div>
            <p className="eyebrow mb-5">Industries</p>
            <ChipLinks items={nonNull(product.industries.map(toIndustryLink))} />
          </div>
        </div>
      </Section>

      <Section>
        <SectionHeader eyebrow="Use cases" title="Who launches with it" />
        <PointsGrid points={product.useCases} columns={4} />
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

      <RelatedSection eyebrow="Custom engineering" title="Extend it with our services" items={services.map(toServiceItem)} />
      <RelatedSection eyebrow="Related products" title="Works well with" items={related.map(toProductItem)} action={{ label: "All products", href: "/products" }} />
      <RelatedSection eyebrow="Learn more" title="Related thinking" items={[...cases.map(toCaseItem), ...insights.map(toInsightItem), ...resources.map(toResourceItem)].slice(0, 6)} />
      <FAQ items={product.faqs} />
      <CTABand title="Request a product demo." lede={`See how ${product.name} fits your business, and how we would customise and deploy it.`} primary={{ label: "Request Product Demo", href: `/request-demo?product=${encodeURIComponent(product.name)}` }} secondary={{ label: "Talk to sales", href: "/contact" }} />
    </>
  );
}

function InfoList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="eyebrow mb-5">{title}</p>
      <CheckList items={items} className="sm:grid-cols-1" />
    </div>
  );
}

