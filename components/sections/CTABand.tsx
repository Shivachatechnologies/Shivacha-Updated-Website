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
    <section className="border-t border-line py-20 sm:py-24">
      <div className="container-x">
        <div className="relative overflow-hidden rounded-3xl border border-line bg-ink-900 px-6 py-14 sm:px-12 sm:py-16">
          <div className="grid-bg pointer-events-none absolute inset-0 opacity-60" aria-hidden />
          <div
            className="pointer-events-none absolute -right-24 -bottom-40 size-[480px] rounded-full opacity-25 blur-[100px]"
            style={{ background: "conic-gradient(from 180deg, #8e6bff, #4c82ff, #2fd6ee, #1fc38e, #8e6bff)" }}
            aria-hidden
          />
          <div className="relative max-w-2xl">
            <h2 className="h-section text-gradient">{title}</h2>
            <p className="lede mt-5">{lede}</p>
            <div className="mt-9 flex flex-wrap gap-3">
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
