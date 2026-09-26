import type { ReactNode } from "react";
import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { siteConfig } from "@/data/siteConfig";
import { PageHero } from "@/components/sections/PageHero";
import { Section } from "@/components/ui/primitives";
import { BookCallButton } from "@/components/leads/BookCall";
import type { Crumb } from "@/components/ui/Breadcrumbs";

export function ContactLayout({ crumbs, title, lede, eyebrow, children, side }: { crumbs: Crumb[]; title: string; lede: string; eyebrow: string; children: ReactNode; side?: ReactNode }) {
  return (
    <>
      <PageHero crumbs={crumbs} eyebrow={<span className="eyebrow">{eyebrow}</span>} title={title} lede={lede} />
      <Section className="pt-0">
        <div className="grid gap-10 lg:grid-cols-[1.5fr_1fr]">
          <div className="card min-w-0 p-6 sm:p-8">{children}</div>
          <aside className="space-y-6">
            {side}
            <div className="card p-6">
              <p className="eyebrow mb-5">Direct contact</p>
              <ul className="divide-y divide-line">
                {siteConfig.enquiries.map((e) => (
                  <li key={e.id} className="py-3.5 first:pt-0 last:pb-0">
                    <p className="text-sm font-semibold text-fg">{e.label}</p>
                    <a href={`mailto:${e.email}`} className="mt-1.5 flex items-center gap-2.5 text-sm text-muted hover:text-fg">
                      <Mail className="size-4 text-brand-blue" /> {e.email}
                    </a>
                    <a href={e.phoneHref} className="mt-1 flex items-center gap-2.5 text-sm text-muted hover:text-fg">
                      <Phone className="size-4 text-brand-blue" /> {e.phone}
                    </a>
                  </li>
                ))}
              </ul>
              <a href={siteConfig.contact.whatsapp} target="_blank" rel="noopener noreferrer" className="mt-5 flex items-center gap-2.5 text-sm font-medium text-brand-blue hover:underline">
                <MessageCircle className="size-4" /> Chat on WhatsApp
              </a>
            </div>
            <div className="card p-6">
              <p className="eyebrow mb-5">Offices</p>
              <ul className="space-y-4">
                {siteConfig.offices.map((o) => (
                  <li key={o.city} className="flex gap-3 text-sm">
                    <MapPin className="mt-0.5 size-4 shrink-0 text-brand-blue" />
                    <span>
                      <span className="font-semibold text-fg">
                        {o.label}, {o.country}
                      </span>
                      <span className="block text-xs text-dim">{o.entity}</span>
                      <span className="block text-muted">{o.lines.join(", ")}</span>
                      {o.phone && (
                        <a href={o.phoneHref} className="text-muted hover:text-fg">
                          {o.phone}
                        </a>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div data-theme="dark" className="band-brand rounded-2xl p-6 text-fg">
              <p className="text-lg font-semibold">Book a Free Consultation</p>
              <p className="mt-1 text-sm text-muted">30 minutes with a solution architect. No commitment.</p>
              <BookCallButton label="Book a Call" className="mt-5 h-10" source="contact_sidebar" />
            </div>
            <div className="card p-6">
              <p className="eyebrow mb-3">What happens next</p>
              <ol className="space-y-3 text-sm text-muted">
                <li>1. A Shivacha lead reviews your message.</li>
                <li>2. We reply within two business days, usually with questions or a meeting invite.</li>
                <li>3. We propose an approach, team and plan — under NDA if needed.</li>
              </ol>
            </div>
          </aside>
        </div>
      </Section>
    </>
  );
}
