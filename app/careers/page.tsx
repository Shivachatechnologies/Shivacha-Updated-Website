import Link from "next/link";
import { careerDepartments, jobs } from "@/data/careers";
import { buildMetadata } from "@/lib/seo";
import { PageHero } from "@/components/sections/PageHero";
import { CTABand } from "@/components/sections/CTABand";
import { LinkCard, Section, SectionHeader } from "@/components/ui/primitives";

export const metadata = buildMetadata({
  title: "Careers",
  description: "Careers at Shivacha: engineering, AI, product, design, sales and operations roles in a remote-first team building AI, fintech, Web3 and cloud systems.",
  path: "/careers",
});

export default function CareersPage() {
  return (
    <>
      <PageHero crumbs={[{ name: "Careers", href: "/careers" }]} eyebrow={<span className="eyebrow">Careers</span>} title="Build systems that matter, with people who care about craft." lede="Shivacha is a remote-first team of engineers, designers and product people building AI, fintech, Web3 and cloud systems for companies worldwide." />
      <Section bordered={false} className="pt-0">
        <SectionHeader eyebrow="Teams" title="Where you could work" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {careerDepartments.map((d) => (
            <LinkCard key={d.slug} href={`/careers/${d.slug}`} title={d.name} description={d.description} eyebrow={`${jobs.filter((j) => j.department === d.slug).length} open tracks`} />
          ))}
        </div>
      </Section>
      <Section>
        <SectionHeader eyebrow="Open application tracks" title="Apply to a track" lede="We hire continuously as client work grows. Tracks are reviewed for current and upcoming roles." />
        <div className="divide-y divide-line border-y border-line">
          {jobs.map((j) => (
            <Link key={j.slug} href={`/careers/${j.slug}`} className="group flex flex-col gap-2 py-5 sm:flex-row sm:items-center sm:justify-between">
              <span className="font-medium text-fg group-hover:underline">{j.title}</span>
              <span className="text-sm text-dim">
                {careerDepartments.find((d) => d.slug === j.department)?.name} · {j.location} · {j.type}
              </span>
            </Link>
          ))}
        </div>
      </Section>
      <CTABand title="Don't see your role?" lede="Send us a note about what you do best — we are always interested in exceptional engineers and builders." primary={{ label: "Contact us", href: "/contact" }} secondary={{ label: "Our culture", href: "/company/culture" }} />
    </>
  );
}
