import { notFound } from "next/navigation";
import { industries, getIndustry } from "@/data/industries";
import { buildMetadata } from "@/lib/seo";
import { IndustryTemplate } from "@/components/templates/IndustryTemplate";

type P = { params: Promise<{ slug: string }> };
export const dynamicParams = false;
export const generateStaticParams = () => industries.map((i) => ({ slug: i.slug }));

export async function generateMetadata({ params }: P) {
  const { slug } = await params;
  const i = getIndustry(slug);
  if (!i) return {};
  return buildMetadata({ title: `${i.name} Technology Solutions`, description: i.summary, path: `/industries/${slug}` });
}

export default async function Page({ params }: P) {
  const { slug } = await params;
  const i = getIndustry(slug);
  if (!i) notFound();
  return <IndustryTemplate industry={i} />;
}
