"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CalendarDays, Loader2, X } from "lucide-react";
import { bookCallHref, calendlyEmbedUrl, isCalendlyConfigured } from "@/lib/calendly";
import { track } from "@/lib/analytics";
import { attributionProps } from "@/lib/attribution";
import { cn } from "@/lib/cn";

type Prefill = { name?: string; email?: string };
const BOOK_EVENT = "shivacha:book-call";

/** Opens the in-site Calendly scheduler. Without Calendly configured it falls back to the meeting form. */
export function openBookCall(detail: Prefill & { source?: string } = {}) {
  track("calendly_click", { location: detail.source ?? "unknown", configured: isCalendlyConfigured(), ...attributionProps() });
  if (!isCalendlyConfigured()) {
    window.location.href = bookCallHref();
    return;
  }
  window.dispatchEvent(new CustomEvent(BOOK_EVENT, { detail }));
}

/**
 * "Book a Call" style CTA. Renders a real link (works without JavaScript and in new tabs) and opens the
 * embedded Calendly scheduler on click. Labels used across the site: Book a Call, Schedule a Consultation,
 * Talk to an Expert, Book a Free Consultation.
 */
export function BookCallButton({
  label = "Book a Call",
  variant = "primary",
  className,
  prefill,
  source,
  icon = true,
}: {
  label?: string;
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
  prefill?: Prefill;
  source?: string;
  icon?: boolean;
}) {
  return (
    <a
      href={bookCallHref()}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
        e.preventDefault();
        openBookCall({ ...prefill, source: source ?? label });
      }}
      data-track={`cta:${label}`}
      className={cn(variant === "primary" ? "btn-primary" : variant === "secondary" ? "btn-secondary" : "btn-ghost", className)}
    >
      {icon && <CalendarDays className="size-4" aria-hidden />}
      {label}
    </a>
  );
}

/** Shared modal chrome for the scheduler and the inquiry form. */
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    panel.current?.focus();
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/55 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={onClose}>
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        className={cn(
          "relative flex max-h-[92vh] w-full animate-[menu-in_.22s_ease-out] flex-col overflow-hidden rounded-t-3xl border border-line bg-ink-900 shadow-[0_40px_120px_-30px_rgb(0_0_0/0.6)] outline-none sm:rounded-3xl",
          wide ? "sm:max-w-4xl" : "sm:max-w-lg",
        )}
      >
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <p className="font-semibold text-fg">{title}</p>
          <button type="button" onClick={onClose} aria-label="Close" className="flex size-9 items-center justify-center rounded-full border border-line text-muted hover:text-fg">
            <X className="size-4" />
          </button>
        </div>
        <div className="overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

/** Listens for Calendly booking messages from the embedded iframe. */
function useCalendlyBookingTracking(source: string) {
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== "https://calendly.com") return;
      const data = e.data as { event?: string } | undefined;
      if (data?.event === "calendly.event_scheduled") track("calendly_booked", { location: source, ...attributionProps() });
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [source]);
}

export function CalendlyFrame({ prefill, className, source = "embed" }: { prefill?: Prefill; className?: string; source?: string }) {
  const [loaded, setLoaded] = useState(false);
  useCalendlyBookingTracking(source);
  const src = calendlyEmbedUrl({ ...prefill });
  if (!src) return null;
  return (
    <div className={cn("relative", className)}>
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">
          <Loader2 className="mr-2 size-4 animate-spin" /> Loading calendar…
        </div>
      )}
      <iframe src={src} title="Book a call with Shivacha Technologies" className="relative h-full w-full border-0" onLoad={() => setLoaded(true)} />
    </div>
  );
}

/** Global scheduler modal, mounted once in the root layout. */
export function CalendlyModalHost() {
  const [state, setState] = useState<{ open: boolean; prefill?: Prefill; source?: string }>({ open: false });
  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent<Prefill & { source?: string }>).detail ?? {};
      setState({ open: true, prefill: { name: d.name, email: d.email }, source: d.source });
    };
    window.addEventListener(BOOK_EVENT, onOpen);
    return () => window.removeEventListener(BOOK_EVENT, onOpen);
  }, []);
  return (
    <Modal open={state.open} onClose={() => setState({ open: false })} title="Book a call with Shivacha" wide>
      <CalendlyFrame prefill={state.prefill} source={state.source} className="h-[78vh] max-h-[720px] min-h-[560px]" />
    </Modal>
  );
}
