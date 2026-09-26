import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { glossary, glossaryCategories } from "@/data/glossary";
import { siteConfig } from "@/data/siteConfig";
import { buildMetadata } from "@/lib/seo";
import { PageHero } from "@/components/sections/PageHero";
import { CTABand } from "@/components/sections/CTABand";
import { JsonLd, Section } from "@/components/ui/primitives";

export const metadata = buildMetadata({
  title: "Technology Glossary — Blockchain, FinTech, AI & Cloud Terms",
  description: "Plain-English definitions of blockchain, Web3, FinTech, AI and cloud engineering terms — from account abstraction and RAG to idempotency and zero trust.",
  path: "/glossary",
});

const byCat = glossaryCategories.map((c) => ({ c, id: c.toLowerCase().replace(/[^a-z0-9]+/g, "-"), items: glossary.filter((g) => g.category === c).sort((a, b) => a.term.localeCompare(b.term)) }));

export default function GlossaryPage() {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "DefinedTermSet",
          name: "Shivacha Technologies glossary",
          url: `${siteConfig.url}/glossary`,
          hasDefinedTerm: glossary.map((g) => ({ "@type": "DefinedTerm", name: g.term, description: g.definition, url: `${siteConfig.url}/glossary#${g.slug}`, inDefinedTermSet: `${siteConfig.url}/glossary` })),
        }}
      />
      <PageHero
        crumbs={[{ name: "Resources", href: "/resources" }, { name: "Glossary", href: "/glossary" }]}
        eyebrow={<span className="eyebrow">Glossary</span>}
        title="Technology terms, explained plainly."
        lede={`${glossary.length} definitions across blockchain, FinTech, AI and cloud engineering — written by the engineers who build these systems.`}
      >
        <nav aria-label="Glossary sections" className="flex flex-wrap gap-2">
          {byCat.map(({ c, id }) => (
            <a key={id} href={`#${id}`} className="chip">
              {c}
            </a>
          ))}
        </nav>
      </PageHero>
      {byCat.map(({ c, id, items }) => (
        <Section key={id} id={id}>
          <h2 className="h-section mb-8 text-fg">{c}</h2>
          <dl className="grid gap-4 md:grid-cols-2">
            {items.map((g) => (
              <div key={g.slug} id={g.slug} className="card scroll-mt-24 p-6">
                <dt className="text-lg font-semibold text-fg">{g.term}</dt>
                <dd className="mt-2 text-[15px] leading-relaxed text-muted">{g.definition}</dd>
                {g.href && (
                  <Link href={g.href} className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-blue hover:underline">
                    Related service <ArrowUpRight className="size-3.5" aria-hidden />
                  </Link>
                )}
              </div>
            ))}
          </dl>
        </Section>
      ))}
      <CTABand title="Have a project in mind?" lede="Tell us what you are building and we will reply with questions, an approach and next steps." />
    </>
  );
}
