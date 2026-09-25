import Link from "next/link";
import { products } from "@/data/products";
import { buildMetadata } from "@/lib/seo";
import { ContactLayout } from "@/components/sections/ContactLayout";
import { LeadForm } from "@/components/forms/LeadForm";

export const metadata = buildMetadata({ title: "Request a Product Demo", description: "Request a tailored demo of a Shivacha ready-to-launch platform — digital banking, payments, exchanges, tokenization, AI agents and more.", path: "/request-demo" });

export default function RequestDemoPage() {
  return (
    <ContactLayout
      crumbs={[{ name: "Request Demo", href: "/request-demo" }]}
      eyebrow="Product demo"
      title="Request a product demo."
      lede="Tell us which product and use case you are interested in. We tailor every demo to your markets, partners and integrations."
      side={
        <div className="card p-6">
          <p className="eyebrow mb-4">Popular products</p>
          <ul className="grid grid-cols-2 gap-2 text-sm">
            {products.slice(0, 16).map((p) => (
              <li key={p.slug}>
                <Link href={`/products/${p.slug}`} className="text-muted hover:text-fg">
                  {p.name.replace("Shivacha ", "")}
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
