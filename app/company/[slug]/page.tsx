import { notFound } from "next/navigation";
import { companyPages, getCompanyPage } from "@/data/company";
import { leadership, founder } from "@/data/leadership";
import { buildMetadata } from "@/lib/seo";
import { PageHero } from "@/components/sections/PageHero";
import { CTABand } from "@/components/sections/CTABand";
import { PointsGrid } from "@/components/sections/blocks";
import { JsonLd, LinkButton, Section } from "@/components/ui/primitives";
import { siteConfig } from "@/data/siteConfig";

type P = { params: Promise<{ slug: string }> };
export const dynamicParams = false;
export const generateStaticParams = () => [...companyPages.map((p) => ({ slug: p.slug })), { slug: "leadership" }, { slug: "founder" }];

export async function generateMetadata({ params }: P) {
  const { slug } = await params;
  if (slug === "leadership") return buildMetadata({ title: "Leadership", description: "Meet the leadership of Shivacha Technologies.", path: "/company/leadership" });
  if (slug === "founder") return buildMetadata({ title: `${founder.name}, ${founder.role}`, description: `${founder.name} is the ${founder.role} of Shivacha Technologies.`, path: "/company/founder" });
  const p = getCompanyPage(slug);
  if (!p) return {};
  return buildMetadata({ title: p.metaTitle, description: p.metaDescription, path: `/company/${slug}` });
}

function PersonCard({ person }: { person: (typeof leadership)[number] }) {
  return (
    <div className="card p-8">
      <div className="flex size-16 items-center justify-center rounded-2xl border border-line-strong bg-ink-900 text-xl font-semibold text-fg" aria-hidden>
        {person.name
          .split(" ")
          .map((n) => n[0])
          .join("")}
      </div>
      <h2 className="mt-6 text-2xl font-semibold text-fg">{person.name}</h2>
      <p className="mt-1 text-sm text-muted">{person.role}</p>
      <div className="mt-5 space-y-3 text-[15px] leading-relaxed text-muted">
        {person.bio.map((b) => (
          <p key={b.slice(0, 20)}>{b}</p>
        ))}
      </div>
      {person.linkedin && (
        <a href={person.linkedin} target="_blank" rel="noopener noreferrer" className="btn-secondary mt-6">
          LinkedIn
        </a>
      )}
    </div>
  );
}

export default async function Page({ params }: P) {
  const { slug } = await params;
  if (slug === "leadership" || slug === "founder") {
    const isFounder = slug === "founder";
    return (
      <>
        {isFounder && (
          <JsonLd data={{ "@context": "https://schema.org", "@type": "Person", name: founder.name, jobTitle: founder.role, worksFor: { "@type": "Organization", name: siteConfig.name }, sameAs: founder.linkedin ? [founder.linkedin] : [] }} />
        )}
        <PageHero
          crumbs={[{ name: "Company", href: "/company" }, { name: isFounder ? "Founder" : "Leadership", href: `/company/${slug}` }]}
          eyebrow={<span className="eyebrow">{isFounder ? "Founder" : "Leadership"}</span>}
          title={isFounder ? founder.name : "Leadership"}
          lede={isFounder ? `${founder.role}, Shivacha Technologies.` : "Shivacha is led by people who build. We publish team members here as their profiles are confirmed."}
        />
        <Section bordered={false} className="pt-0">
          <div className="grid max-w-3xl gap-6">
            {(isFounder ? [founder] : leadership).map((p) => (
              <PersonCard key={p.slug} person={p} />
            ))}
          </div>
        </Section>
        <CTABand />
      </>
    );
  }
  const page = getCompanyPage(slug);
  if (!page) notFound();
  return (
    <>
      <PageHero crumbs={[{ name: "Company", href: "/company" }, { name: page.title, href: `/company/${slug}` }]} eyebrow={<span className="eyebrow">{page.title}</span>} title={page.h1} lede={page.lede}>
        {slug === "partners" && <LinkButton href="/contact">Discuss a partnership</LinkButton>}
      </PageHero>
      {page.sections.map((s) => (
        <Section key={s.heading}>
          <div className="grid gap-10 lg:grid-cols-[1fr_2fr]">
            <h2 className="text-2xl font-semibold tracking-tight text-fg">{s.heading}</h2>
            <div>
              <div className="prose-sh">
                {s.body.map((b) => (
                  <p key={b.slice(0, 24)}>{b}</p>
                ))}
              </div>
              {s.points && (
                <div className="mt-8">
                  <PointsGrid points={s.points} columns={2} />
                </div>
              )}
            </div>
          </div>
        </Section>
      ))}
      <CTABand />
    </>
  );
}
