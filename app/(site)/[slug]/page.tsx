import { notFound } from "next/navigation";
import { hireRoles, getHireRole } from "@/data/hire";
import { buildMetadata } from "@/lib/seo";
import { withSeo } from "@/lib/cms/seo";
import { getCmsPage } from "@/lib/cms/public";
import { HireTemplate } from "@/components/templates/HireTemplate";
import { CmsPage } from "@/components/templates/CmsPage";

/** Root-level pages: hire-role pages (e.g. /hire-blockchain-developers) and published CMS pages. Anything else 404s. */
type P = { params: Promise<{ slug: string }> };
export const dynamicParams = true;
export const generateStaticParams = () => hireRoles.map((r) => ({ slug: r.slug }));

export async function generateMetadata({ params }: P) {
  const { slug } = await params;
  const r = getHireRole(slug);
  if (r) return withSeo(buildMetadata({ title: `Hire ${r.role} — Vetted, Dedicated Engineers`, description: r.summary, path: `/${slug}` }));
  const page = await getCmsPage(slug);
  if (!page) return {};
  const meta = buildMetadata({ title: page.seoTitle || page.title, description: page.seoDescription || page.heroDescription || page.title, path: `/${slug}` });
  if (page.canonical) meta.alternates = { canonical: page.canonical };
  if (page.ogImage) meta.openGraph = { ...meta.openGraph, images: [{ url: page.ogImage }] };
  return withSeo(meta);
}

export default async function Page({ params }: P) {
  const { slug } = await params;
  const r = getHireRole(slug);
  if (r) return <HireTemplate role={r} />;
  const page = await getCmsPage(slug);
  if (!page) notFound();
  return <CmsPage page={page} />;
}
