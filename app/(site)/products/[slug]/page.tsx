import { notFound } from "next/navigation";
import { products } from "@/data/products";
import { buildMetadata } from "@/lib/seo";
import { withSeo } from "@/lib/cms/seo";
import { resolveProduct } from "@/lib/cms/content";
import { launchFor } from "@/data/launch";
import { ProductTemplate } from "@/components/templates/ProductTemplate";

type P = { params: Promise<{ slug: string }> };

// Built-in products are pre-rendered; published CMS-only products render on demand.
export const dynamicParams = true;
export const generateStaticParams = () => products.map((p) => ({ slug: p.slug }));

export async function generateMetadata({ params }: P) {
  const { slug } = await params;
  const r = await resolveProduct(slug);
  if (!r) return {};
  const { product: p, cms } = r;
  const l = launchFor(slug);
  const title = cms?.seoTitle || (l ? `${l.seoTitle} — ${p.name}` : `${p.name} — ${p.category} Platform`);
  const lead = l ? `${l.seoTitle}: typical software implementation ${l.timeline}. ` : "";
  const meta = buildMetadata({ title, description: cms?.seoDescription || `${lead}${p.tagline} ${p.description}`.slice(0, 300), path: `/products/${slug}` });
  if (cms?.canonical) meta.alternates = { canonical: cms.canonical };
  if (cms?.ogImage) meta.openGraph = { ...meta.openGraph, images: [{ url: cms.ogImage }] };
  return withSeo(meta);
}

export default async function Page({ params }: P) {
  const { slug } = await params;
  const r = await resolveProduct(slug);
  if (!r) notFound();
  return <ProductTemplate product={r.product} />;
}
