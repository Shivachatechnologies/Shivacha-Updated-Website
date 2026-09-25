import { notFound } from "next/navigation";
import { caseStudies, getCaseStudy } from "@/data/caseStudies";
import { divisions, getDivision } from "@/data/capabilities";
import type { DivisionId } from "@/data/types";
import { buildMetadata } from "@/lib/seo";
import { PageHero } from "@/components/sections/PageHero";
import { CTABand } from "@/components/sections/CTABand";
import { Section } from "@/components/ui/primitives";
import { WorkListing } from "@/components/sections/WorkListing";
import { CaseStudyTemplate } from "@/components/templates/ContentTemplates";

type P = { params: Promise<{ slug: string }> };
const categories = ["case-studies", ...divisions.map((d) => d.id)] as const;
const isCategory = (s: string) => (categories as readonly string[]).includes(s);

export const dynamicParams = false;
export const generateStaticParams = () => [...categories.map((slug) => ({ slug })), ...caseStudies.map((c) => ({ slug: c.slug }))];

export async function generateMetadata({ params }: P) {
  const { slug } = await params;
  if (slug === "case-studies") return buildMetadata({ title: "Case Studies", description: "Shivacha case studies and engineering reference implementations across AI, digital, fintech, Web3 and cloud.", path: "/work/case-studies" });
  if (isCategory(slug)) {
    const d = getDivision(slug as DivisionId);
    return buildMetadata({ title: `${d.short} Work & Reference Architectures`, description: `Reference architectures and engineering write-ups from ${d.name}: ${d.tagline}`, path: `/work/${slug}` });
  }
  const c = getCaseStudy(slug);
  if (!c) return {};
  return buildMetadata({ title: c.title, description: c.summary, path: `/work/${slug}`, type: "article" });
}

export default async function Page({ params }: P) {
  const { slug } = await params;
  if (isCategory(slug)) {
    const division = slug === "case-studies" ? undefined : getDivision(slug as DivisionId);
    const items = division ? caseStudies.filter((c) => c.division === division.id) : caseStudies;
    return (
      <>
        <PageHero
          crumbs={[{ name: "Work", href: "/work" }, { name: division ? division.short : "Case studies", href: `/work/${slug}` }]}
          eyebrow={<span className="eyebrow">{division ? division.name : "Case studies"}</span>}
          title={division ? `${division.short} work: ${division.tagline.toLowerCase()}` : "Case studies and reference implementations."}
          lede={division ? division.description : "Verified client case studies will be published here with client approval. Until then, our reference architectures show how we design and build."}
        />
        <Section bordered={false} className="pt-0">
          <WorkListing items={items} active={slug as DivisionId | "case-studies"} />
        </Section>
        <CTABand />
      </>
    );
  }
  const c = getCaseStudy(slug);
  if (!c) notFound();
  return <CaseStudyTemplate cs={c} />;
}
