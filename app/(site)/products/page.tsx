import { products, hasLiveDemo, getProduct } from "@/data/products";
import { FEATURED_PLATFORMS, launchFor } from "@/data/launch";
import { LaunchModel, PlatformCard } from "@/components/sections/Launch";
import { buildMetadata } from "@/lib/seo";
import { withSeo } from "@/lib/cms/seo";
import { PageHero } from "@/components/sections/PageHero";
import { CTABand } from "@/components/sections/CTABand";
import { Section, SectionHeader, LinkButton } from "@/components/ui/primitives";
import { ProductMarketplace } from "@/components/sections/ProductMarketplace";
import { DashboardPreview } from "@/components/visuals/DashboardPreview";

export const generateMetadata = () => withSeo(buildMetadata({
  title: "White-Label Products: Crypto Exchange, Wallet, Neobank, Crypto Card & AI Platforms",
  description: `${products.length} white-label and ready-to-launch platforms — crypto exchange, crypto wallet, P2P trading, neobank, crypto card, payment gateway, RWA tokenization, DeFi and AI agent platforms — customised by dedicated engineering teams. Demos on request.`,
  path: "/products",
}));

export default function ProductsPage() {
  return (
    <>
      <PageHero
        crumbs={[{ name: "Products", href: "/products" }]}
        eyebrow={<span className="eyebrow">White-label · Ready to launch · {products.length} platforms</span>}
        title="White-label platforms. Launch without starting from zero."
        lede="Production-ready foundations for digital assets, FinTech, Web3 and AI — deployed into your environment, customised to your brand and business model, and extended by a dedicated engineering team."
        aside={<DashboardPreview kind="exchange" name="White-Label Crypto Exchange" />}
      >
        <LinkButton href="/request-demo" track="demo:products-index">
          Request Product Demo
        </LinkButton>
        <LinkButton href="#marketplace" variant="secondary">
          Browse all platforms
        </LinkButton>
      </PageHero>
      <Section id="featured">
        <SectionHeader eyebrow="Ready-to-launch platforms" title="Our most requested white-label platforms." />
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {FEATURED_PLATFORMS.map((slug, i) => (
            <PlatformCard key={slug} product={getProduct(slug)!} launch={launchFor(slug)!} className={i === FEATURED_PLATFORMS.length - 1 && FEATURED_PLATFORMS.length % 2 === 1 ? "md:col-span-2 lg:col-span-1" : undefined} />
          ))}
        </div>
      </Section>
      <Section id="marketplace">
        <SectionHeader eyebrow="All platforms" title="Browse every product." />
        <ProductMarketplace items={products.map((p) => ({ slug: p.slug, name: launchFor(p.slug)?.seoTitle ?? p.name, division: p.division, category: p.category, tagline: p.tagline, live: hasLiveDemo(p), timeline: launchFor(p.slug)?.timeline }))} />
      </Section>
      <LaunchModel />
      <CTABand title="See a platform in action." lede="Get a tailored demo, an implementation timeline and a technical proposal for your launch." primary={{ label: "Request Product Demo", href: "/request-demo" }} />
    </>
  );
}
