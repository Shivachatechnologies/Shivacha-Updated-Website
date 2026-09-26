import Image from "next/image";
import { LinkButton } from "@/components/ui/primitives";
import { BookCallButton } from "@/components/leads/BookCall";

export function CTABand({
  title = "Tell us what you're building.",
  lede = "Share your goals and constraints. We will come back with an approach, a team and a plan.",
  primary = { label: "Discuss Your Project", href: "/start-a-project" },
  secondary,
}: {
  title?: string;
  lede?: string;
  primary?: { label: string; href: string };
  secondary?: { label: string; href: string };
}) {
  return (
    <section className="py-16 sm:py-20">
      <div className="container-x">
        <div data-theme="dark" className="band-brand relative overflow-hidden rounded-[28px] px-6 py-14 text-fg sm:px-12 sm:py-16 lg:px-16">
          <Image src="/graphics/3d-api.png" alt="" aria-hidden width={560} height={325} sizes="480px" className="pointer-events-none absolute top-1/2 -right-10 hidden w-[44%] max-w-[520px] -translate-y-1/2 opacity-90 lg:block" />
          <div className="relative max-w-2xl">
            <h2 className="h-section text-fg">{title}</h2>
            <p className="lede mt-4">{lede}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton href={primary.href} track={`cta:${primary.label}`}>
                {primary.label}
              </LinkButton>
              {secondary ? (
                <LinkButton href={secondary.href} variant="secondary" track={`cta:${secondary.label}`}>
                  {secondary.label}
                </LinkButton>
              ) : (
                <BookCallButton label="Schedule a Consultation" variant="secondary" source="cta_band" />
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
