import { notFound } from "next/navigation";
import { insights, insightCategories, getInsight, getInsightCategory } from "@/data/insights";
import { buildMetadata } from "@/lib/seo";
import { PageHero } from "@/components/sections/PageHero";
import { CTABand } from "@/components/sections/CTABand";
import { Section } from "@/components/ui/primitives";
import { InsightTemplate } from "@/components/templates/ContentTemplates";
import { InsightList } from "@/components/sections/InsightList";

type P = { params: Promise<{ slug: string }> };
export const dynamicParams = false;
export const generateStaticParams = () => [...insightCategories.map((c) => ({ slug: c.slug })), ...insights.map((i) => ({ slug: i.slug }))];

export async function generateMetadata({ params }: P) {
  const { slug } = await params;
  const cat = getInsightCategory(slug);
  if (cat) return buildMetadata({ title: `${cat.name} Insights`, description: cat.description, path: `/insights/${slug}` });
  const i = getInsight(slug);
  if (!i) return {};
  return buildMetadata({ title: i.title, description: i.excerpt, path: `/insights/${slug}`, type: "article", publishedTime: i.date });
}

export default async function Page({ params }: P) {
  const { slug } = await params;
  const cat = getInsightCategory(slug);
  if (cat) {
    const items = insights.filter((i) => i.category === cat.slug);
    return (
      <>
        <PageHero crumbs={[{ name: "Insights", href: "/insights" }, { name: cat.name, href: `/insights/${cat.slug}` }]} eyebrow={<span className="eyebrow">Insights</span>} title={`${cat.name} insights`} lede={cat.description} />
        <Section bordered={false} className="pt-0">
          <InsightList items={items} />
        </Section>
        <CTABand />
      </>
    );
  }
  const i = getInsight(slug);
  if (!i) notFound();
  return <InsightTemplate insight={i} />;
}
