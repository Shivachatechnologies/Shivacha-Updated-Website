import type { ReactNode } from "react";
import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { siteConfig } from "@/data/siteConfig";
import { PageHero } from "@/components/sections/PageHero";
import { Section } from "@/components/ui/primitives";
import type { Crumb } from "@/components/ui/Breadcrumbs";

export function ContactLayout({ crumbs, title, lede, eyebrow, children, side }: { crumbs: Crumb[]; title: string; lede: string; eyebrow: string; children: ReactNode; side?: ReactNode }) {
  return (
    <>
      <PageHero crumbs={crumbs} eyebrow={<span className="eyebrow">{eyebrow}</span>} title={title} lede={lede} />
      <Section bordered={false} className="pt-0">
        <div className="grid gap-10 lg:grid-cols-[1.5fr_1fr]">
          <div className="card min-w-0 p-6 sm:p-8">{children}</div>
          <aside className="space-y-6">
            {side}
            <div className="card p-6">
              <p className="eyebrow mb-5">Direct contact</p>
              <ul className="space-y-4 text-sm">
                <li>
                  <a href={`mailto:${siteConfig.contact.email}`} className="flex items-center gap-3 text-muted hover:text-fg">
                    <Mail className="size-4" /> {siteConfig.contact.email}
                  </a>
                </li>
                <li>
                  <a href={siteConfig.contact.phoneHref} className="flex items-center gap-3 text-muted hover:text-fg">
                    <Phone className="size-4" /> {siteConfig.contact.phone}
                  </a>
                </li>
                <li>
                  <a href={siteConfig.contact.whatsapp} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 text-muted hover:text-fg">
                    <MessageCircle className="size-4" /> WhatsApp
                  </a>
                </li>
                <li className="flex items-start gap-3 text-muted">
                  <MapPin className="mt-0.5 size-4 shrink-0" />
                  <span>
                    {siteConfig.legalName}
                    <br />
                    Registered office: {siteConfig.registeredOffice.lines.join(", ")}
                  </span>
                </li>
              </ul>
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
