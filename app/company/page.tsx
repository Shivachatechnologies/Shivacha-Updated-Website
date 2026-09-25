import Link from "next/link";
import { companyPages, engagementWays } from "@/data/company";
import { founder } from "@/data/leadership";
import { siteConfig } from "@/data/siteConfig";
import { buildMetadata } from "@/lib/seo";
import { PageHero } from "@/components/sections/PageHero";
import { CTABand } from "@/components/sections/CTABand";
import { LinkCard, Section, SectionHeader } from "@/components/ui/primitives";

export const metadata = buildMetadata({
  title: "Company",
  description: "About Shivacha Technologies — our divisions, vision, mission, leadership, engineering standards, culture, global delivery and partner program.",
  path: "/company",
});

export default function CompanyPage() {
  return (
    <>
      <PageHero crumbs={[{ name: "Company", href: "/company" }]} eyebrow={<span className="eyebrow">{siteConfig.legalName}</span>} title="Technology for companies building what comes next." lede={siteConfig.description} />
      <Section bordered={false} className="pt-0">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {companyPages.map((p) => (
            <LinkCard key={p.slug} href={`/company/${p.slug}`} title={p.title} description={p.lede} />
          ))}
          <LinkCard href="/company/leadership" title="Leadership" description="The people leading Shivacha." />
          <LinkCard href="/company/founder" title="Founder" description={`${founder.name}, ${founder.role}.`} />
          <LinkCard href="/careers" title="Careers" description="Join a distributed team building production systems for clients worldwide." />
        </div>
      </Section>
      <Section>
        <SectionHeader eyebrow="How clients work with us" title="Five ways to engage" />
        <div className="grid gap-4 md:grid-cols-5">
          {engagementWays.map((w) => (
            <Link key={w.n} href={w.href} className="card card-hover p-6">
              <span className="font-mono text-xs text-dim">{w.n}</span>
              <h3 className="mt-4 font-semibold text-fg">{w.title}</h3>
              <p className="mt-2 text-sm text-muted">{w.description}</p>
            </Link>
          ))}
        </div>
      </Section>
      <CTABand />
    </>
  );
}
