import { products, hasLiveDemo } from "@/data/products";
import { buildMetadata } from "@/lib/seo";
import { PageHero } from "@/components/sections/PageHero";
import { CTABand } from "@/components/sections/CTABand";
import { Section, SectionHeader, LinkButton } from "@/components/ui/primitives";
import { ProductMarketplace } from "@/components/sections/ProductMarketplace";
import { DashboardPreview } from "@/components/visuals/DashboardPreview";
import { PointsGrid } from "@/components/sections/blocks";
import { pts } from "@/data/_helpers";

export const metadata = buildMetadata({
  title: "Ready-to-Launch Products: FinTech, Web3, AI, Digital & Cloud",
  description: `Explore ${products.length} configurable Shivacha platforms — digital banking, payments, exchanges, tokenization, AI agents, CRM, marketplaces and cloud foundations — with demos on request.`,
  path: "/products",
});

export default function ProductsPage() {
  return (
    <>
      <PageHero
        crumbs={[{ name: "Products", href: "/products" }]}
        eyebrow={<span className="eyebrow">{products.length} ready-to-launch products</span>}
        title="Start from a platform. Make it yours."
        lede="Configurable Shivacha platforms deployed into your environment, customised to your business model and extended by our engineers — so you launch faster without giving up control."
        aside={<DashboardPreview kind="exchange" name="Shivacha Exchange" />}
      >
        <LinkButton href="/request-demo" track="demo:products-index">
          Request Product Demo
        </LinkButton>
        <LinkButton href="#marketplace" variant="secondary">
          Browse products
        </LinkButton>
      </PageHero>
      <Section id="marketplace">
        <ProductMarketplace items={products.map((p) => ({ slug: p.slug, name: p.name, division: p.division, category: p.category, tagline: p.tagline, live: hasLiveDemo(p) }))} />
      </Section>
      <Section>
        <SectionHeader eyebrow="How it works" title="Platform speed, custom ownership" />
        <PointsGrid
          columns={4}
          numbered
          points={pts([
            "Demo & discovery|A tailored walkthrough and a review of your requirements, partners and markets.",
            "Configuration|Branding, products, rules and integrations configured for your model.",
            "Customisation|Our engineers extend the platform where your differentiation lives.",
            "Deploy & operate|Deployed in your cloud with documentation, support and optional managed operations.",
          ])}
        />
      </Section>
      <CTABand title="See a product in action." primary={{ label: "Request Product Demo", href: "/request-demo" }} secondary={{ label: "Book Demo", href: "/book-a-meeting" }} />
    </>
  );
}
