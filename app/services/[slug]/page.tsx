import { notFound } from "next/navigation";
import { services, getService } from "@/data/services";
import { getGroup } from "@/data/serviceGroups";
import { buildMetadata } from "@/lib/seo";
import { ServiceTemplate } from "@/components/templates/ServiceTemplate";

type P = { params: Promise<{ slug: string }> };

export const dynamicParams = false;
export const generateStaticParams = () => services.map((s) => ({ slug: s.slug }));

export async function generateMetadata({ params }: P) {
  const { slug } = await params;
  const s = getService(slug);
  if (!s) return {};
  const g = getGroup(s.group)!;
  return buildMetadata({ title: `${s.name} | ${g.track ?? g.name}`, description: s.summary, path: `/services/${slug}`, keywords: s.keywords });
}

export default async function Page({ params }: P) {
  const { slug } = await params;
  const s = getService(slug);
  if (!s) notFound();
  return <ServiceTemplate service={s} />;
}
