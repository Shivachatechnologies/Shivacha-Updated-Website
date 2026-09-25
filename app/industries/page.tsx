import Link from "next/link";
import { industries } from "@/data/industries";
import { buildMetadata } from "@/lib/seo";
import { PageHero } from "@/components/sections/PageHero";
import { CTABand } from "@/components/sections/CTABand";
import { Section } from "@/components/ui/primitives";
import { Icon, industryIcon } from "@/components/ui/Icon";

export const metadata = buildMetadata({
  title: "Industries: FinTech, Banking, Healthcare, E-commerce & More",
  description: `Technology solutions for ${industries.length} industries — from fintech, banking and payments to healthcare, logistics, real estate, energy and government.`,
  path: "/industries",
});

export default function IndustriesPage() {
  return (
    <>
      <PageHero crumbs={[{ name: "Industries", href: "/industries" }]} eyebrow={<span className="eyebrow">{industries.length} industries</span>} title="Technology shaped by industry realities." lede="Each industry has its own constraints, regulations and opportunities. We connect them to the right services, products and technologies." />
      <Section bordered={false} className="pt-0">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {industries.map((i) => (
            <Link key={i.slug} href={`/industries/${i.slug}`} className="card card-hover group flex flex-col p-6">
              <Icon name={industryIcon[i.slug] ?? "Building2"} className="size-5 text-dim group-hover:text-fg" />
              <h2 className="mt-5 text-lg font-semibold text-fg">{i.name}</h2>
              <p className="mt-2 text-sm text-muted">{i.summary}</p>
            </Link>
          ))}
        </div>
      </Section>
      <CTABand />
    </>
  );
}
