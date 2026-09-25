import { notFound } from "next/navigation";
import { markets, getMarket } from "@/data/markets";
import { buildMetadata } from "@/lib/seo";
import { MarketTemplate } from "@/components/templates/ContentTemplates";

type P = { params: Promise<{ slug: string }> };
export const dynamicParams = false;
export const generateStaticParams = () => markets.map((m) => ({ slug: m.slug }));

export async function generateMetadata({ params }: P) {
  const { slug } = await params;
  const m = getMarket(slug);
  if (!m) return {};
  return buildMetadata({ title: `Technology Services in ${m.name}`, description: m.summary, path: `/markets/${slug}` });
}

export default async function Page({ params }: P) {
  const { slug } = await params;
  const m = getMarket(slug);
  if (!m) notFound();
  return <MarketTemplate market={m} />;
}
