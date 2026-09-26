import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { landingPages, getLanding } from "@/data/landing";
import { buildMetadata } from "@/lib/seo";
import { notFound } from "next/navigation";
import { InquiryForm } from "@/components/leads/InquiryForm";
import { BookCallButton } from "@/components/leads/BookCall";
import { WhatsAppPicker } from "@/components/leads/WhatsAppPicker";
import { DivisionArt } from "@/components/graphics/DivisionArt";
import { PointsGrid } from "@/components/sections/blocks";
import { Section, SectionHeader } from "@/components/ui/primitives";

/** Paid-campaign landing pages: form above the fold, noindex, reuse the standard lead pipeline. */
type P = { params: Promise<{ slug: string }> };
export const dynamicParams = false;
export const generateStaticParams = () => landingPages.map((l) => ({ slug: l.slug }));

export async function generateMetadata({ params }: P) {
  const { slug } = await params;
  const l = getLanding(slug);
  if (!l) return {};
  return buildMetadata({ title: `${l.headline} ${l.accent}`.replace(/,\s/, " "), description: l.lede, path: `/lp/${slug}`, noindex: true });
}

export default async function LandingPage({ params }: P) {
  const { slug } = await params;
  const l = getLanding(slug);
  if (!l) notFound();
  const source = `lp:${l.slug}`;
  return (
    <>
      <section className="relative overflow-hidden pt-28 pb-16 sm:pt-32 lg:pt-36">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[520px]" style={{ background: "radial-gradient(55% 70% at 80% 0%, rgb(1 149 255 / 0.14), transparent 70%)" }} />
        <div className="container-x relative grid gap-12 lg:grid-cols-[1fr_minmax(0,520px)] lg:gap-16">
          <div className="lg:pt-4">
            <h1 className="h-page text-fg">
              {l.headline} <span className="accent-word">{l.accent}</span>
            </h1>
            <p className="lede mt-5 max-w-xl">{l.lede}</p>
            <ul className="mt-8 grid gap-3 sm:grid-cols-2">
              {l.bullets.map((b) => (
                <li key={b} className="flex items-start gap-2.5 text-[15px] text-muted">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand-teal" aria-hidden /> {b}
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap gap-3">
              <BookCallButton label="Book a Call" variant="secondary" source={source} />
              <WhatsAppPicker text={`Hi Shivacha, I'm interested in ${l.service.toLowerCase()}.`} label="WhatsApp" location={source} variant="ghost" placement="down" />
            </div>
            <DivisionArt division={l.division} topic={l.topic} className="mt-10 hidden max-w-lg lg:block" />
          </div>
          <div id="enquire" className="card scroll-mt-24 p-6 shadow-[0_30px_80px_-40px_rgb(0_0_0/0.35)] sm:p-8 lg:sticky lg:top-24 lg:self-start">
            <h2 className="mb-1 text-xl font-semibold tracking-tight text-fg">{l.cta}</h2>
            <p className="mb-6 text-sm text-muted">Two quick steps. A senior engineer replies within one business day.</p>
            <InquiryForm source={source} defaultService={l.service} />
          </div>
        </div>
      </section>
      <Section>
        <SectionHeader eyebrow="What you get" title="From first call to launch" />
        <PointsGrid points={l.deliverables} columns={4} numbered />
        <p className="mt-10 text-sm text-muted">
          Learn more:{" "}
          {l.links.map((x, i) => (
            <span key={x.href}>
              {i > 0 && " · "}
              <Link href={x.href} className="font-medium text-brand-blue hover:underline">
                {x.label}
              </Link>
            </span>
          ))}
        </p>
      </Section>
    </>
  );
}
