import Link from "next/link";
import { footerNav } from "@/data/navigation";
import { siteConfig } from "@/data/siteConfig";
import { NewsletterForm } from "@/components/forms/NewsletterForm";
import { Logo } from "./Logo";

export function Footer() {
  return (
    <footer className="relative border-t border-line bg-ink-950 pt-20 pb-28 sm:pb-12">
      <div className="container-x">
        <div className="grid gap-12 border-b border-line pb-16 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <h2 className="text-4xl font-semibold tracking-[-0.03em] text-gradient sm:text-6xl">Let&apos;s build what&apos;s next.</h2>
            <p className="mt-5 max-w-lg text-muted">{siteConfig.description}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/start-a-project" className="btn-primary" data-track="cta:footer-start">
                Start a Project
              </Link>
              <Link href="/book-a-meeting" className="btn-secondary" data-track="cta:footer-meeting">
                Book a Meeting
              </Link>
            </div>
          </div>
          <div className="lg:pl-12">
            <p className="eyebrow mb-4">Newsletter</p>
            <p className="mb-5 text-sm text-muted">Engineering notes on AI, fintech, Web3 and cloud. No filler, unsubscribe any time.</p>
            <NewsletterForm />
            <div className="mt-8 grid gap-2 text-sm">
              <a href={`mailto:${siteConfig.contact.email}`} className="text-muted hover:text-fg" data-track="email">
                {siteConfig.contact.email}
              </a>
              <a href={siteConfig.contact.phoneHref} className="text-muted hover:text-fg" data-track="phone">
                {siteConfig.contact.phone}
              </a>
              <a href={siteConfig.contact.whatsapp} target="_blank" rel="noopener noreferrer" className="text-muted hover:text-fg" data-track="whatsapp">
                WhatsApp
              </a>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8 py-14 sm:grid-cols-3 lg:grid-cols-5">
          {footerNav.map((col) => (
            <div key={col.title}>
              <p className="mb-4 font-mono text-[11px] tracking-[0.16em] text-dim uppercase">{col.title}</p>
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

        <div className="flex flex-col gap-6 border-t border-line pt-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Logo />
            <span className="hidden text-xs text-dim md:inline">AI · Digital · FinTech · Web3 · Cloud</span>
          </div>
          <div className="flex items-center gap-5 text-xs text-dim">
            <a href={siteConfig.social.linkedin} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-fg" aria-label="Shivacha on LinkedIn">
              <svg viewBox="0 0 24 24" className="size-4 fill-current" aria-hidden="true">
                <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z" />
              </svg>
              LinkedIn
            </a>
            <span>
              © {new Date().getFullYear()} {siteConfig.legalName}
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
