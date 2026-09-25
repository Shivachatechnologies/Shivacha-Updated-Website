import { notFound } from "next/navigation";
import { technologies, getTechnology } from "@/data/technologies";
import { buildMetadata } from "@/lib/seo";
import { TechnologyTemplate } from "@/components/templates/TechnologyTemplate";

type P = { params: Promise<{ slug: string }> };
export const dynamicParams = false;
export const generateStaticParams = () => technologies.map((t) => ({ slug: t.slug }));

export async function generateMetadata({ params }: P) {
  const { slug } = await params;
  const t = getTechnology(slug);
  if (!t) return {};
  return buildMetadata({ title: `${t.name} Development & Engineering`, description: t.summary + " " + t.overview.slice(0, 160), path: `/technologies/${slug}` });
}

export default async function Page({ params }: P) {
  const { slug } = await params;
  const t = getTechnology(slug);
  if (!t) notFound();
  return <TechnologyTemplate tech={t} />;
}
