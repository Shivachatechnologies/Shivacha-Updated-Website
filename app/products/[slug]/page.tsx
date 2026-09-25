import { notFound } from "next/navigation";
import { products, getProduct } from "@/data/products";
import { buildMetadata } from "@/lib/seo";
import { ProductTemplate } from "@/components/templates/ProductTemplate";

type P = { params: Promise<{ slug: string }> };

export const dynamicParams = false;
export const generateStaticParams = () => products.map((p) => ({ slug: p.slug }));

export async function generateMetadata({ params }: P) {
  const { slug } = await params;
  const p = getProduct(slug);
  if (!p) return {};
  return buildMetadata({ title: `${p.name} — ${p.category} Platform`, description: `${p.tagline} ${p.description}`.slice(0, 300), path: `/products/${slug}` });
}

export default async function Page({ params }: P) {
  const { slug } = await params;
  const p = getProduct(slug);
  if (!p) notFound();
  return <ProductTemplate product={p} />;
}
