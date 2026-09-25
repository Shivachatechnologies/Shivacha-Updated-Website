import { getLegalPage } from "@/data/legal";
import { PageHero } from "@/components/sections/PageHero";
import { Section } from "@/components/ui/primitives";

export function LegalPageView({ slug }: { slug: string }) {
  const p = getLegalPage(slug);
  return (
    <>
      <PageHero crumbs={[{ name: p.title, href: `/${slug}` }]} eyebrow={<span className="eyebrow">Last updated {p.updated}</span>} title={p.title} lede={p.description} />
      <Section bordered={false} className="pt-0">
        <div className="prose-sh max-w-3xl">
          {p.sections.map((s) => (
            <section key={s.heading}>
              <h2>{s.heading}</h2>
              {s.body.map((b) => (
                <p key={b.slice(0, 24)}>{b}</p>
              ))}
            </section>
          ))}
          <p className="mt-12 text-sm text-dim">This page is provided for information and should be reviewed by qualified counsel. Contact contact@shivacha.com with questions.</p>
        </div>
      </Section>
    </>
  );
}
