import { CalendarDays, CheckCircle2, ShieldCheck } from "lucide-react";
import { InquiryForm } from "./InquiryForm";
import { BookCallButton } from "./BookCall";
import { WhatsAppPicker } from "./WhatsAppPicker";
import { Section } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";

/**
 * Inline conversion block: the existing two-step InquiryForm first, then Calendly, then WhatsApp.
 * Reuses the same lead pipeline as /start-a-project — no second form system.
 */
export function LeadPanel({
  title,
  lede,
  service,
  source,
  whatsappText = "Hi Shivacha, I'd like to discuss a project.",
  points = ["Senior engineer reads every enquiry", "Reply within one business day", "NDA on request"],
  id = "enquire",
  className,
}: {
  title: string;
  lede: string;
  service?: string;
  source: string;
  whatsappText?: string;
  points?: string[];
  id?: string;
  className?: string;
}) {
  return (
    <Section id={id} className={cn("scroll-mt-24", className)}>
      <div className="grid gap-10 lg:grid-cols-[1fr_minmax(0,520px)] lg:gap-16">
        <div className="lg:pt-4">
          <p className="eyebrow mb-4">Next step</p>
          <h2 className="h-section text-fg">{title}</h2>
          <p className="lede mt-4 max-w-xl">{lede}</p>
          <ul className="mt-8 space-y-3">
            {points.map((p) => (
              <li key={p} className="flex items-center gap-3 text-[15px] text-muted">
                <CheckCircle2 className="size-4 shrink-0 text-brand-teal" aria-hidden /> {p}
              </li>
            ))}
          </ul>
          <div className="mt-10 rounded-2xl border border-line bg-ink-900 p-5">
            <p className="flex items-center gap-2 font-semibold text-fg">
              <CalendarDays className="size-4 text-brand-blue" aria-hidden /> Prefer to talk first?
            </p>
            <p className="mt-1 text-sm text-muted">Book a 30-minute call, or message the nearest team on WhatsApp.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <BookCallButton label="Book a Call" variant="secondary" source={source} />
              <WhatsAppPicker text={whatsappText} label="WhatsApp" location={source} variant="ghost" />
            </div>
          </div>
          <p className="mt-6 flex items-center gap-2 text-xs text-dim">
            <ShieldCheck className="size-3.5" aria-hidden /> Your details are used only to reply to this enquiry.
          </p>
        </div>
        <div className="card p-6 shadow-[0_30px_80px_-40px_rgb(0_0_0/0.35)] sm:p-8">
          <InquiryForm source={source} defaultService={service} />
        </div>
      </div>
    </Section>
  );
}
