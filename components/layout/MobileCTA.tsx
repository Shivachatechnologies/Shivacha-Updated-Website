import Link from "next/link";

/** Sticky, thumb-reachable CTA bar on small screens. */
export function MobileCTA() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-ink-950/90 p-3 backdrop-blur-xl sm:hidden" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
      <div className="grid grid-cols-2 gap-2">
        <Link href="/book-a-meeting" className="btn-secondary h-11" data-track="cta:mobile-meeting">
          Book a Meeting
        </Link>
        <Link href="/start-a-project" className="btn-primary h-11" data-track="cta:mobile-start">
          Start a Project
        </Link>
      </div>
    </div>
  );
}
