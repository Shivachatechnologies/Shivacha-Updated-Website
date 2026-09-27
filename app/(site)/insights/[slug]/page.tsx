import { notFound } from "next/navigation";
import { insights, insightCategories, getInsightCategory } from "@/data/insights";
import { allInsights, resolveInsight } from "@/lib/cms/content";
import { buildMetadata } from "@/lib/seo";
import { withSeo } from "@/lib/cms/seo";
import { PageHero } from "@/components/sections/PageHero";
import { CTABand } from "@/components/sections/CTABand";
import { Section } from "@/components/ui/primitives";
import { InsightTemplate } from "@/components/templates/ContentTemplates";
import { InsightList } from "@/components/sections/InsightList";

type P = { params: Promise<{ slug: string }> };
// Built-in articles are pre-rendered; published CMS posts render on demand.
export const dynamicParams = true;
export const generateStaticParams = () => [...insightCategories.map((c) => ({ slug: c.slug })), ...insights.map((i) => ({ slug: i.slug }))];

export async function generateMetadata({ params }: P) {
  const { slug } = await params;
  const cat = getInsightCategory(slug);
  if (cat) return withSeo(buildMetadata({ title: `${cat.name} Insights`, description: cat.description, path: `/insights/${slug}` }));
  const r = await resolveInsight(slug);
  if (!r) return {};
  const { insight: i, cms } = r;
  const meta = buildMetadata({ title: cms?.seoTitle || i.title, description: cms?.seoDescription || i.excerpt, path: `/insights/${slug}`, type: "article", publishedTime: i.date });
  if (cms?.canonical) meta.alternates = { canonical: cms.canonical };
  const og = cms?.ogImage || cms?.featuredImage;
  if (og) meta.openGraph = { ...meta.openGraph, images: [{ url: og }] };
  return withSeo(meta);
}

export default async function Page({ params }: P) {
  const { slug } = await params;
  const cat = getInsightCategory(slug);
  if (cat) {
    const items = (await allInsights()).filter((i) => i.category === cat.slug);
    return (
      <>
        <PageHero crumbs={[{ name: "Insights", href: "/insights" }, { name: cat.name, href: `/insights/${cat.slug}` }]} eyebrow={<span className="eyebrow">Insights</span>} title={`${cat.name} insights`} lede={cat.description} />
        <Section className="pt-0">
          <InsightList items={items} />
        </Section>
        <CTABand />
      </>
    );
  }
  const r = await resolveInsight(slug);
  if (!r) notFound();
  return <InsightTemplate insight={r.insight} />;
}
