import Link from "next/link";
import { notFound } from "next/navigation";
import { resourceCategories, getResourceCategory, resources } from "@/data/resources";
import { caseStudies } from "@/data/caseStudies";
import { generalFaqs } from "@/data/faqs";
import { buildMetadata } from "@/lib/seo";
import { PageHero } from "@/components/sections/PageHero";
import { CTABand } from "@/components/sections/CTABand";
import { FAQ } from "@/components/sections/FAQ";
import { LinkCard, Section } from "@/components/ui/primitives";

type P = { params: Promise<{ category: string }> };
export const dynamicParams = false;
export const generateStaticParams = () => resourceCategories.map((c) => ({ category: c.slug }));

const itemsFor = (slug: string) => resources.filter((r) => r.category === slug);

export async function generateMetadata({ params }: P) {
  const { category } = await params;
  const c = getResourceCategory(category);
  if (!c) return {};
  const empty = !itemsFor(category).length && !["faqs", "case-studies"].includes(category);
  return buildMetadata({ title: `${c.name} — Shivacha Resources`, description: c.description, path: `/resources/${category}`, noindex: empty });
}

export default async function Page({ params }: P) {
  const { category } = await params;
  const c = getResourceCategory(category);
  if (!c) notFound();
  const items = itemsFor(category);
  return (
    <>
      <PageHero crumbs={[{ name: "Resources", href: "/resources" }, { name: c.name, href: `/resources/${c.slug}` }]} eyebrow={<span className="eyebrow">Resources</span>} title={c.name} lede={c.description} />
      <Section bordered={false} className="pt-0">
        {category === "case-studies" ? (
          <div className="grid gap-4 md:grid-cols-2">
            {caseStudies.map((cs) => (
              <LinkCard key={cs.slug} href={`/work/${cs.slug}`} title={cs.title} description={cs.summary} eyebrow="Reference architecture" division={cs.division} />
            ))}
          </div>
        ) : items.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((r) => (
              <LinkCard key={r.slug} href={`/resources/${r.category}/${r.slug}`} title={r.title} description={r.summary} eyebrow={`${r.readingTime} · ${r.difficulty}`} division={r.division} />
            ))}
          </div>
        ) : category !== "faqs" ? (
          <div className="card p-10 text-center">
            <p className="text-lg text-fg">Nothing published here yet.</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted">We only publish {c.name.toLowerCase()} when we have something genuinely useful to share. Subscribe to the newsletter in the footer to hear when new material is available.</p>
            <Link href="/resources" className="btn-secondary mt-6">
              Browse all resources
            </Link>
          </div>
        ) : null}
      </Section>
      {category === "faqs" && <FAQ items={generalFaqs} title="Working with Shivacha" />}
      <CTABand />
    </>
  );
}
