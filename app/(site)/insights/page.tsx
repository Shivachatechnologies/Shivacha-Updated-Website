import Link from "next/link";
import { insightCategories } from "@/data/insights";
import { allInsights } from "@/lib/cms/content";
import { buildMetadata } from "@/lib/seo";
import { withSeo } from "@/lib/cms/seo";
import { PageHero } from "@/components/sections/PageHero";
import { CTABand } from "@/components/sections/CTABand";
import { Section } from "@/components/ui/primitives";
import { InsightList } from "@/components/sections/InsightList";

export const generateMetadata = () => withSeo(buildMetadata({
  title: "Insights: AI, FinTech, Web3, Cloud & Engineering",
  description: "Engineering perspectives from Shivacha on production AI, ledgers and payments, tokenization, cloud reliability, security, product and transformation.",
  path: "/insights",
}));

export default async function InsightsPage() {
  const insights = await allInsights();
  return (
    <>
      <PageHero crumbs={[{ name: "Insights", href: "/insights" }]} eyebrow={<span className="eyebrow">Insights</span>} title="Engineering perspectives." lede="What we have learned building AI, financial, digital asset and cloud systems — written by Shivacha engineers." />
      <Section className="pt-0">
        <nav aria-label="Insight categories" className="mb-12 flex flex-wrap gap-2">
          {insightCategories.map((c) => (
            <Link key={c.slug} href={`/insights/${c.slug}`} className="chip">
              {c.name}
            </Link>
          ))}
        </nav>
        <InsightList items={insights} />
      </Section>
      <CTABand />
    </>
  );
}
