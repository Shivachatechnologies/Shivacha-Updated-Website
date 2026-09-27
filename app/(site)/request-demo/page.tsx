import Link from "next/link";
import { getProduct } from "@/data/products";
import { FEATURED_PLATFORMS, launchFor } from "@/data/launch";
import { buildMetadata } from "@/lib/seo";
import { withSeo } from "@/lib/cms/seo";
import { ContactLayout } from "@/components/sections/ContactLayout";
import { LeadForm } from "@/components/forms/LeadForm";

export const generateMetadata = () => withSeo(buildMetadata({ title: "Request a Product Demo", description: "Request a tailored demo of a Shivacha ready-to-launch platform — digital banking, payments, exchanges, tokenization, AI agents and more.", path: "/request-demo" }));

export default function RequestDemoPage() {
  return (
    <ContactLayout
      crumbs={[{ name: "Request Demo", href: "/request-demo" }]}
      eyebrow="Product demo"
      title="Request a product demo."
      lede="Tell us which product and use case you are interested in. We tailor every demo to your markets, partners and integrations."
      side={
        <div className="card p-6">
          <p className="eyebrow mb-4">Popular white-label platforms</p>
          <ul className="grid grid-cols-2 gap-2 text-sm">
            {FEATURED_PLATFORMS.map((slug) => (
              <li key={slug}>
                <Link href={`/products/${slug}`} className="text-muted hover:text-fg">
                  {launchFor(slug)?.cardName ?? getProduct(slug)?.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      }
    >
      <LeadForm type="demo" />
    </ContactLayout>
  );
}
