import { PageHero } from "@/components/sections/PageHero";
import { CTABand } from "@/components/sections/CTABand";
import { FAQ } from "@/components/sections/FAQ";
import { LinkButton, Section, SectionHeader } from "@/components/ui/primitives";
import { markdownToSections, paragraphs } from "@/lib/cms/mappers";
import { parsePairs } from "@/lib/admin/sections";

type Section = { id: string; type: string; data: unknown };
export interface CmsPageData {
  slug: string;
  title: string;
  heroTitle: string | null;
  heroDescription: string | null;
  content: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  sections: Section[];
}

const safeHref = (h?: string) => (h && /^(https?:\/\/|\/(?!\/)|#|mailto:|tel:)/i.test(h) ? h : undefined);

/** Markdown subset rendered as React elements (never as raw HTML). */
function Prose({ md }: { md?: string | null }) {
  const sections = markdownToSections(md, "");
  return (
    <div className="max-w-3xl space-y-6">
      {sections.map((s, i) => (
        <div key={i} className="space-y-4">
          {s.heading && <h3 className="text-xl font-semibold tracking-tight text-fg">{s.heading}</h3>}
          {s.body.map((p, j) => (
            <p key={j} className="text-[16px] leading-relaxed text-muted">{p}</p>
          ))}
          {s.bullets && (
            <ul className="list-disc space-y-1.5 pl-5 text-[15.5px] text-muted">
              {s.bullets.map((b, j) => <li key={j}>{b}</li>)}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

function Block({ s }: { s: Section }) {
  const d = (s.data ?? {}) as Record<string, string>;
  switch (s.type) {
    case "hero":
      return (
        <Section>
          {d.eyebrow && <p className="eyebrow mb-4">{d.eyebrow}</p>}
          {d.title && <h2 className="h-section max-w-3xl text-fg">{d.title}</h2>}
          {d.body && <p className="lede mt-4 max-w-2xl">{d.body}</p>}
          {d.ctaLabel && safeHref(d.ctaHref) && <LinkButton href={safeHref(d.ctaHref)!} className="mt-8">{d.ctaLabel}</LinkButton>}
        </Section>
      );
    case "text":
      return (
        <Section>
          {d.title && <SectionHeader title={d.title} />}
          <Prose md={d.body} />
        </Section>
      );
    case "features": {
      const items = parsePairs(d.items);
      return (
        <Section tone="muted">
          {d.title && <SectionHeader title={d.title} lede={d.intro} />}
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map(([t, desc], i) => (
              <div key={i} className="card p-6">
                <p className="font-semibold text-fg">{t}</p>
                {desc && <p className="mt-2 text-sm leading-relaxed text-muted">{desc}</p>}
              </div>
            ))}
          </div>
        </Section>
      );
    }
    case "image":
      return safeHref(d.src) ? (
        <Section>
          <figure>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={safeHref(d.src)} alt={d.alt ?? ""} loading="lazy" className="w-full rounded-2xl border border-line" />
            {d.caption && <figcaption className="mt-3 text-sm text-dim">{d.caption}</figcaption>}
          </figure>
        </Section>
      ) : null;
    case "faq":
      return <FAQ title={d.title || undefined} items={parsePairs(d.items).filter(([q, a]) => q && a).map(([q, a]) => ({ q, a }))} />;
    case "cta":
      return <CTABand title={d.title || undefined} lede={d.body || undefined} primary={d.ctaLabel && safeHref(d.ctaHref) ? { label: d.ctaLabel, href: safeHref(d.ctaHref)! } : undefined} />;
    default:
      return null;
  }
}

export function CmsPage({ page }: { page: CmsPageData }) {
  const intro = paragraphs(page.content);
  return (
    <>
      <PageHero crumbs={[{ name: page.title, href: `/${page.slug}` }]} title={page.heroTitle || page.title} lede={page.heroDescription ?? undefined}>
        {page.ctaLabel && safeHref(page.ctaHref ?? undefined) && <LinkButton href={safeHref(page.ctaHref!)!} className="mt-8">{page.ctaLabel}</LinkButton>}
      </PageHero>
      {intro.length > 0 && (
        <Section className="pt-0">
          <Prose md={page.content} />
        </Section>
      )}
      {page.sections.map((s) => (
        <Block key={s.id} s={s} />
      ))}
      {!page.sections.some((s) => s.type === "cta") && <CTABand />}
    </>
  );
}
