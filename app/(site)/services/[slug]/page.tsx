import { notFound } from "next/navigation";
import { services } from "@/data/services";
import { getGroup } from "@/data/serviceGroups";
import { buildMetadata } from "@/lib/seo";
import { withSeo } from "@/lib/cms/seo";
import { resolveService } from "@/lib/cms/content";
import { ServiceTemplate } from "@/components/templates/ServiceTemplate";

type P = { params: Promise<{ slug: string }> };

// Built-in services are pre-rendered; published CMS-only services render on demand.
export const dynamicParams = true;
export const generateStaticParams = () => services.map((s) => ({ slug: s.slug }));

export async function generateMetadata({ params }: P) {
  const { slug } = await params;
  const r = await resolveService(slug);
  if (!r) return {};
  const { service: s, cms } = r;
  const g = getGroup(s.group)!;
  const meta = buildMetadata({ title: cms?.seoTitle || `${s.name} | ${g.track ?? g.name}`, description: cms?.seoDescription || s.summary, path: `/services/${slug}`, keywords: s.keywords });
  if (cms?.canonical) meta.alternates = { canonical: cms.canonical };
  if (cms?.ogImage) meta.openGraph = { ...meta.openGraph, images: [{ url: cms.ogImage }] };
  return withSeo(meta);
}

export default async function Page({ params }: P) {
  const { slug } = await params;
  const r = await resolveService(slug);
  if (!r) notFound();
  return <ServiceTemplate service={r.service} />;
}
