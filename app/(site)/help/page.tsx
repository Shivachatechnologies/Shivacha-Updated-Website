import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { withSeo } from "@/lib/cms/seo";
import { getHelpArticles } from "@/lib/cms/public";
import { KB_CATEGORIES, KB_CATEGORY_LABEL } from "@/lib/knowledge/constants";
import { PageHero } from "@/components/sections/PageHero";
import { CTABand } from "@/components/sections/CTABand";
import { Section } from "@/components/ui/primitives";

export const revalidate = 3600;
export const generateMetadata = () => withSeo(buildMetadata({ title: "Help Centre", description: "Answers and guides from Shivacha Technologies on our services, products, delivery process, support and billing.", path: "/help" }));

export default async function HelpCentre() {
  const articles = await getHelpArticles();
  const groups = KB_CATEGORIES.map((c) => ({ c, items: articles.filter((a) => a.category === c) })).filter((g) => g.items.length);
  return (
    <>
      <PageHero crumbs={[{ name: "Help Centre", href: "/help" }]} eyebrow={<span className="eyebrow">Help Centre</span>} title="How can we help?" lede="Guides and answers about working with Shivacha Technologies — services, products, delivery, support and billing." />
      <Section>
        {groups.length === 0 ? (
          <p className="text-muted">No help articles are published yet. <Link href="/contact" className="text-brand-blue hover:underline">Contact us</Link> and our team will answer directly.</p>
        ) : (
          <div className="space-y-12">
            {groups.map(({ c, items }) => (
              <div key={c}>
                <h2 className="h-section mb-6 text-fg">{KB_CATEGORY_LABEL[c]}</h2>
                <ul className="grid gap-4 md:grid-cols-2">
                  {items.map((a) => (
                    <li key={a.slug}>
                      <Link href={`/help/${a.slug}`} className="card block h-full p-6 transition-colors hover:border-brand-blue/40">
                        <p className="text-lg font-semibold text-fg">{a.title}</p>
                        {a.excerpt && <p className="mt-2 text-[15px] leading-relaxed text-muted">{a.excerpt}</p>}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Section>
      <CTABand />
    </>
  );
}
