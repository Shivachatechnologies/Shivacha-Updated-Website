import { solutions } from "@/data/solutions";
import { buildMetadata } from "@/lib/seo";
import { PageHero } from "@/components/sections/PageHero";
import { CTABand } from "@/components/sections/CTABand";
import { LinkCard, Section, SectionHeader } from "@/components/ui/primitives";

export const metadata = buildMetadata({
  title: "Solutions for Enterprises, Startups & Transformation",
  description: "Shivacha solutions for enterprises, startups and scaleups, digital, AI, cloud, fintech and Web3 transformation, product and dedicated engineering, and Web2 + Web3 fintech.",
  path: "/solutions",
});

const groups = [
  { title: "By stage", slugs: ["enterprise", "startups", "scaleups", "mvp-to-scale"] },
  { title: "Transformation", slugs: ["digital-transformation", "ai-transformation", "cloud-transformation", "fintech-transformation", "web3-transformation"] },
  { title: "Engineering models", slugs: ["product-engineering", "dedicated-engineering", "managed-engineering", "legacy-modernization", "platform-modernization"] },
];

export default function SolutionsPage() {
  const hybrid = solutions.find((s) => s.slug === "web2-web3-fintech")!;
  return (
    <>
      <PageHero crumbs={[{ name: "Solutions", href: "/solutions" }]} eyebrow={<span className="eyebrow">Solutions</span>} title="Solutions shaped around where you are — and where you're going." lede="Whether you are launching a first product, scaling a platform or transforming an enterprise, each solution combines the right divisions, services and platforms." />
      <Section bordered={false} className="pt-0">
        <LinkCard href={`/solutions/${hybrid.slug}`} title={hybrid.h1} description={hybrid.summary} eyebrow="Shivacha differentiator · Web2 + Web3 FinTech" division="fintech" className="p-8" />
      </Section>
      {groups.map((g) => (
        <Section key={g.title}>
          <SectionHeader title={g.title} />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {g.slugs.map((slug) => {
              const s = solutions.find((x) => x.slug === slug)!;
              return <LinkCard key={slug} href={`/solutions/${slug}`} title={s.name} description={s.summary} eyebrow={s.divisions.map((d) => d.toUpperCase()).join(" · ")} />;
            })}
          </div>
        </Section>
      ))}
      <CTABand />
    </>
  );
}
