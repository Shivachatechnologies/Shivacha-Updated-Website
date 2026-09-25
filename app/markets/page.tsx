import Link from "next/link";
import { markets } from "@/data/markets";
import { siteConfig } from "@/data/siteConfig";
import { buildMetadata } from "@/lib/seo";
import { PageHero } from "@/components/sections/PageHero";
import { CTABand } from "@/components/sections/CTABand";
import { Section } from "@/components/ui/primitives";

export const metadata = buildMetadata({
  title: "Global Markets: North America, Europe, Middle East, Asia-Pacific & Africa",
  description: "Shivacha delivers AI, digital, fintech, Web3 and cloud engineering for companies across North America, Europe, the Middle East, Asia-Pacific and Africa.",
  path: "/markets",
});

export default function MarketsPage() {
  const regions = markets.filter((m) => m.type === "region");
  return (
    <>
      <PageHero crumbs={[{ name: "Markets", href: "/markets" }]} eyebrow={<span className="eyebrow">Global delivery</span>} title="Technology services for companies worldwide." lede={`${siteConfig.delivery} We do not claim physical offices outside our registered location.`} />
      <Section bordered={false} className="pt-0">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {regions.map((r) => (
            <div key={r.slug} className="card flex flex-col p-6">
              <Link href={`/markets/${r.slug}`} className="text-xl font-semibold text-fg hover:underline">
                {r.name}
              </Link>
              <p className="mt-2 text-sm text-muted">{r.summary}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                {(r.countries ?? []).map((c) => {
                  const m = markets.find((x) => x.slug === c)!;
                  return (
                    <Link key={c} href={`/markets/${c}`} className="chip">
                      {m.name}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Section>
      <CTABand />
    </>
  );
}
