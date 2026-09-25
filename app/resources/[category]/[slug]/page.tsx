import { notFound } from "next/navigation";
import { resources, getResource } from "@/data/resources";
import { buildMetadata } from "@/lib/seo";
import { ResourceTemplate } from "@/components/templates/ContentTemplates";

type P = { params: Promise<{ category: string; slug: string }> };
export const dynamicParams = false;
export const generateStaticParams = () => resources.map((r) => ({ category: r.category, slug: r.slug }));

export async function generateMetadata({ params }: P) {
  const { slug } = await params;
  const r = getResource(slug);
  if (!r) return {};
  return buildMetadata({ title: r.title, description: r.summary, path: `/resources/${r.category}/${r.slug}` });
}

export default async function Page({ params }: P) {
  const { category, slug } = await params;
  const r = getResource(slug);
  if (!r || r.category !== category) notFound();
  return <ResourceTemplate resource={r} />;
}
