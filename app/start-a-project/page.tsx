import { CalendarDays, CheckCircle2, MessageCircle, ShieldCheck } from "lucide-react";
import { buildMetadata } from "@/lib/seo";
import { siteConfig } from "@/data/siteConfig";
import { whatsappHref } from "@/lib/calendly";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { InquiryForm } from "@/components/leads/InquiryForm";
import { BookCallButton } from "@/components/leads/BookCall";

export const metadata = buildMetadata({
  title: "Discuss Your Project",
  description: "Tell Shivacha about your Web3, blockchain, fintech, AI, SaaS or mobile project. Two quick steps — our team replies within one business day.",
  path: "/start-a-project",
});

const steps = [
  { t: "We review your brief", d: "A solution lead reads every inquiry, usually the same day." },
  { t: "We reply within one business day", d: "With questions, a first view and a time to talk." },
  { t: "You get an approach and estimate", d: "Scope, team and plan — under NDA if you need it." },
];

export default function StartProjectPage() {
  return (
    <section className="relative overflow-hidden pt-28 pb-20 sm:pt-32 lg:pt-36">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[520px]" style={{ background: "radial-gradient(55% 70% at 80% 0%, rgb(1 149 255 / 0.14), transparent 70%)" }} />
      <div className="container-x relative">
        <Breadcrumbs items={[{ name: "Discuss Your Project", href: "/start-a-project" }]} />
        <div className="grid gap-12 lg:grid-cols-[1fr_minmax(0,540px)] lg:gap-16">
          <div className="lg:pt-6">
            <p className="eyebrow mb-5">Discuss your project</p>
            <h1 className="h-page text-fg">
              Tell us what you&apos;re building. <span className="accent-word">We&apos;ll take it from there.</span>
            </h1>
            <p className="lede mt-5 max-w-xl">Two quick steps. Everything you share is confidential and read by a senior engineer, not a bot.</p>
            <ol className="mt-10 space-y-6">
              {steps.map((s, i) => (
                <li key={s.t} className="flex gap-4">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">{i + 1}</span>
                  <span>
                    <span className="block font-semibold text-fg">{s.t}</span>
                    <span className="mt-0.5 block text-[15px] text-muted">{s.d}</span>
                  </span>
                </li>
              ))}
            </ol>
            <div className="mt-10 rounded-2xl border border-line bg-ink-900 p-5">
              <p className="flex items-center gap-2 font-semibold text-fg">
                <CalendarDays className="size-4 text-brand-blue" /> Prefer to talk first?
              </p>
              <p className="mt-1 text-sm text-muted">Pick a time with our team, or message us on WhatsApp.</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <BookCallButton label="Book a Free Consultation" variant="secondary" source="start_project" />
                <a href={whatsappHref("Hi Shivacha, I'd like to discuss a project.")} target="_blank" rel="noopener noreferrer" data-track="whatsapp:start-project" className="btn-ghost">
                  <MessageCircle className="size-4" /> WhatsApp
                </a>
              </div>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
              <li className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-brand-teal" /> NDA on request
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-brand-teal" /> No commitment
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-brand-teal" /> {siteConfig.enquiries[0].email}
              </li>
            </ul>
          </div>
          <div className="card relative p-6 shadow-[0_30px_80px_-40px_rgb(0_0_0/0.45)] sm:p-8 lg:sticky lg:top-24 lg:self-start">
            <h2 className="mb-6 text-xl font-semibold tracking-tight text-fg">Project inquiry</h2>
            <InquiryForm />
          </div>
        </div>
      </div>
    </section>
  );
}
