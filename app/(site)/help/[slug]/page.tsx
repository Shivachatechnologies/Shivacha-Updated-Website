import Link from "next/link";
import { notFound } from "next/navigation";
import { siteConfig } from "@/data/siteConfig";
import { buildMetadata } from "@/lib/seo";
import { withSeo } from "@/lib/cms/seo";
import { getHelpArticle } from "@/lib/cms/public";
import { KB_CATEGORY_LABEL } from "@/lib/knowledge/constants";
import { PageHero } from "@/components/sections/PageHero";
import { CTABand } from "@/components/sections/CTABand";
import { JsonLd, Section } from "@/components/ui/primitives";
import { Markdown } from "@/components/admin/ai/markdown";

export const revalidate = 3600;
export const dynamicParams = true;
export const generateStaticParams = () => [];

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const a = await getHelpArticle((await params).slug);
  if (!a) return buildMetadata({ title: "Help article", description: "Shivacha Technologies help centre.", path: "/help", noindex: true });
  return withSeo(buildMetadata({ title: a.seoTitle || a.title, description: a.seoDescription || a.excerpt || a.title, path: `/help/${a.slug}`, type: "article", publishedTime: a.publishedAt ? new Date(a.publishedAt).toISOString() : undefined }));
}

export default async function HelpArticle({ params }: { params: Promise<{ slug: string }> }) {
  const a = await getHelpArticle((await params).slug);
  if (!a) notFound();
  return (
    <>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "Article", headline: a.title, description: a.excerpt ?? undefined, dateModified: new Date(a.updatedAt).toISOString(), datePublished: a.publishedAt ? new Date(a.publishedAt).toISOString() : undefined, publisher: { "@type": "Organization", name: siteConfig.name }, mainEntityOfPage: `${siteConfig.url}/help/${a.slug}` }} />
      <PageHero crumbs={[{ name: "Help Centre", href: "/help" }, { name: a.title, href: `/help/${a.slug}` }]} eyebrow={<span className="eyebrow">{KB_CATEGORY_LABEL[a.category]}</span>} title={a.title} lede={a.excerpt ?? undefined} />
      <Section>
        <article className="mx-auto max-w-3xl text-[16px]">
          <Markdown text={a.body} relativeLinks />
          <p className="mt-10 text-sm text-muted">Still need help? <Link href="/contact" className="text-brand-blue hover:underline">Contact our team</Link>.</p>
        </article>
      </Section>
      <CTABand />
    </>
  );
}
