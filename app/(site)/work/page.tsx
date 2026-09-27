import { allCaseStudies } from "@/lib/cms/content";
import { buildMetadata } from "@/lib/seo";
import { withSeo } from "@/lib/cms/seo";
import { PageHero } from "@/components/sections/PageHero";
import { CTABand } from "@/components/sections/CTABand";
import { Section } from "@/components/ui/primitives";
import { WorkListing } from "@/components/sections/WorkListing";

export const generateMetadata = () => withSeo(buildMetadata({
  title: "Work: Reference Architectures & Case Studies",
  description: "How Shivacha approaches complex systems — reference architectures for AI assistants and agents, SaaS, neobanks, hybrid payments, tokenization, custody and cloud platforms.",
  path: "/work",
}));

export default async function WorkPage() {
  const caseStudies = await allCaseStudies();
  return (
    <>
      <PageHero crumbs={[{ name: "Work", href: "/work" }]} eyebrow={<span className="eyebrow">Work</span>} title="How we approach complex systems." lede="Engineering write-ups from our divisions. Reference architectures describe our approach to a class of system; client case studies are published only with verified client approval." />
      <Section className="pt-0">
        <WorkListing items={caseStudies} />
      </Section>
      <CTABand />
    </>
  );
}
