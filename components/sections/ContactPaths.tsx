import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BookCallButton } from "@/components/leads/BookCall";

const paths = [
  { n: "01", title: "Discuss a product", text: "Share what you are launching. A senior engineer replies within one business day.", href: "/start-a-project", cta: "Discuss Your Product" },
  { n: "02", title: "Request a technical proposal", text: "Scope, architecture, team and implementation timeline for a defined platform.", href: `/start-a-project?brief=${encodeURIComponent("Request for technical proposal: ")}`, cta: "Request Technical Proposal" },
  { n: "03", title: "Request a product demo", text: "A tailored walkthrough of a white-label platform for your market and partners.", href: "/request-demo", cta: "Request Demo" },
];

/** Contact routes: every path uses the existing inquiry form, demo form or Calendly — no new lead system. */
export function ContactPaths() {
  return (
    <ol className="grid border-t border-line sm:grid-cols-2 lg:grid-cols-4">
      {paths.map((p) => (
        <li key={p.n} className="flex flex-col border-b border-line py-6 sm:pr-6 lg:border-b-0 lg:pr-8">
          <span className="font-mono text-[12px] text-brand-blue">{p.n}</span>
          <h2 className="mt-3 text-lg font-medium tracking-[-0.015em] text-fg">{p.title}</h2>
          <p className="mt-1.5 flex-1 text-[14px] leading-relaxed text-muted">{p.text}</p>
          <Link href={p.href} className="group mt-4 inline-flex items-center gap-1.5 self-start border-b border-line-strong pb-0.5 text-sm font-medium text-fg hover:border-fg" data-track={`cta:contact-path-${p.n}`}>
            {p.cta} <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
        </li>
      ))}
      <li className="flex flex-col border-b border-line py-6 sm:pr-6 lg:border-b-0">
        <span className="font-mono text-[12px] text-brand-blue">04</span>
        <h2 className="mt-3 text-lg font-medium tracking-[-0.015em] text-fg">Talk to a solution architect</h2>
        <p className="mt-1.5 flex-1 text-[14px] leading-relaxed text-muted">Book 30 minutes to discuss architecture, integrations and timelines.</p>
        <BookCallButton label="Book a Call" variant="secondary" source="contact_paths" className="mt-4 h-10 self-start" />
      </li>
    </ol>
  );
}
