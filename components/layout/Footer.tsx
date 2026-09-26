import Link from "next/link";
import { Mail, MessageCircle, Phone } from "lucide-react";
import { footerNav } from "@/data/navigation";
import { siteConfig } from "@/data/siteConfig";
import { NewsletterForm } from "@/components/forms/NewsletterForm";
import { Logo } from "./Logo";

export function Footer() {
  return (
    <footer data-theme="dark" className="band-brand relative pt-16 pb-28 text-fg sm:pb-10">
      <div className="container-x">
        <div className="grid gap-12 border-b border-line pb-12 lg:grid-cols-[1fr_1.9fr]">
          <div>
            <Logo size="lg" />
            <p className="mt-6 max-w-sm text-[15px] leading-relaxed text-muted">{siteConfig.description}</p>
            <ul className="mt-6 space-y-3 text-sm">
              <li>
                <a href={`mailto:${siteConfig.contact.email}`} className="inline-flex items-center gap-3 text-muted hover:text-fg" data-track="email">
                  <Mail className="size-4 text-brand-blue" aria-hidden /> {siteConfig.contact.email}
                </a>
              </li>
              <li>
                <a href={siteConfig.contact.phoneHref} className="inline-flex items-center gap-3 text-muted hover:text-fg" data-track="phone">
                  <Phone className="size-4 text-brand-blue" aria-hidden /> {siteConfig.contact.phone}
                </a>
              </li>
              <li>
                <a href={siteConfig.contact.whatsapp} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-3 text-muted hover:text-fg" data-track="whatsapp">
                  <MessageCircle className="size-4 text-brand-blue" aria-hidden /> WhatsApp
                </a>
              </li>
            </ul>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-5">
            {footerNav.map((col) => (
              <div key={col.title}>
                <p className="mb-4 text-sm font-semibold text-fg">{col.title}</p>
                <ul className="space-y-2.5">
                  {col.links.map((l) => (
                    <li key={l.href}>
                      <Link href={l.href} className="text-sm text-muted transition-colors hover:text-fg">
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-6 border-b border-line py-10 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <p className="font-semibold text-fg">Engineering notes, once a month</p>
            <p className="mt-1 text-sm text-muted">AI, fintech, Web3 and cloud. No filler, unsubscribe any time.</p>
          </div>
          <div className="w-full md:w-[420px]">
            <NewsletterForm />
          </div>
        </div>

        <div className="flex flex-col gap-4 pt-8 text-sm text-dim sm:flex-row sm:items-center sm:justify-between">
          <span>
            © {new Date().getFullYear()} {siteConfig.legalName}
          </span>
          <a href={siteConfig.social.linkedin} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 hover:text-fg" aria-label="Shivacha on LinkedIn">
            <svg viewBox="0 0 24 24" className="size-4 fill-current" aria-hidden="true">
              <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z" />
            </svg>
            LinkedIn
          </a>
        </div>
      </div>
    </footer>
  );
}
