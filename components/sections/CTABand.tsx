import { LinkButton } from "@/components/ui/primitives";

export function CTABand({
  title = "Tell us what you're building.",
  lede = "Share your goals and constraints. We will come back with an approach, a team and a plan.",
  primary = { label: "Start a Project", href: "/start-a-project" },
  secondary = { label: "Book a Meeting", href: "/book-a-meeting" },
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/shivacha-mark.svg" alt="" aria-hidden className="pointer-events-none absolute -right-16 -bottom-24 size-[420px] opacity-[0.12] sm:-right-8" />
          <div className="relative max-w-2xl">
            <h2 className="h-section text-fg">{title}</h2>
            <p className="lede mt-4">{lede}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton href={primary.href} track={`cta:${primary.label}`}>
                {primary.label}
              </LinkButton>
              <LinkButton href={secondary.href} variant="secondary" track={`cta:${secondary.label}`}>
                {secondary.label}
              </LinkButton>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
