import Image from "next/image";
import Link from "next/link";
import { siFacebook, siInstagram, siThreads, siX, siYoutube } from "simple-icons";
import { MessageCircle, Briefcase, Mail, MapPin, MessageSquare, Phone, Users } from "lucide-react";
import { footerNav } from "@/data/navigation";
import type { NavColumn } from "@/data/types";
import { siteConfig } from "@/data/siteConfig";
import { NewsletterForm } from "@/components/forms/NewsletterForm";
import { Flag } from "@/components/graphics/Flag";
import { Logo } from "./Logo";
import { WorldClock } from "./WorldClock";

const socials = [
  { name: "LinkedIn", href: siteConfig.social.linkedin, icon: undefined },
  { name: "Instagram", href: siteConfig.social.instagram, icon: siInstagram.path },
  { name: "X", href: siteConfig.social.x, icon: siX.path },
  { name: "Facebook", href: siteConfig.social.facebook, icon: siFacebook.path },
  { name: "YouTube", href: siteConfig.social.youtube, icon: siYoutube.path },
  { name: "Threads", href: siteConfig.social.threads, icon: siThreads.path },
];

const legalLinks = [
  ["Privacy", "/privacy-policy"],
  ["Terms", "/terms"],
  ["Cookies", "/cookie-policy"],
  ["Security", "/security"],
  ["Disclaimer", "/disclaimer"],
  ["Accessibility", "/accessibility"],
] as const;

const enquiryIcon = { sales: Briefcase, hr: Users, general: MessageSquare } as const;

const mapsUrl = (o: (typeof siteConfig.offices)[number]) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([...o.lines, o.country].join(", "))}`;

function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z" />
    </svg>
  );
}

export function Footer({ nav = footerNav }: { nav?: NavColumn[] }) {
  const countries = new Set(siteConfig.offices.map((o) => o.country)).size;
  return (
    <footer data-theme="dark" className="band-brand relative overflow-hidden pt-16 pb-28 text-fg sm:pb-10 lg:pt-20">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/shivacha-mark.svg" alt="" aria-hidden className="pointer-events-none absolute -top-40 -right-40 size-[560px] opacity-[0.04]" />
      <div className="container-x relative">
        {/* Brand + enquiry desks */}
        <div className="grid gap-12 border-b border-line pb-14 lg:grid-cols-[1fr_2.1fr] lg:gap-16">
          <div>
            <Logo size="lg" />
            <p className="mt-6 max-w-sm text-[15px] leading-relaxed text-muted">{siteConfig.description}</p>
            <div className="mt-7">
              <p className="mb-3 text-sm font-semibold text-fg">Follow us</p>
              <ul className="flex flex-wrap gap-2.5">
                {socials.map((x) => (
                  <li key={x.name}>
                    <a
                      href={x.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Shivacha on ${x.name}`}
                      title={x.name}
                      data-track={`social:${x.name.toLowerCase()}`}
                      className="flex size-10 items-center justify-center rounded-full border border-line bg-white/[0.04] text-muted transition-all hover:-translate-y-0.5 hover:border-brand-blue/50 hover:bg-brand-blue/15 hover:text-fg"
                    >
                      {x.icon ? (
                        <svg viewBox="0 0 24 24" className="size-[17px]" fill="currentColor" aria-hidden>
                          <path d={x.icon} />
                        </svg>
                      ) : (
                        <LinkedInIcon className="size-[17px]" />
                      )}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div>
            <p className="eyebrow mb-5">Connect with us</p>
            <div className="grid gap-4 sm:grid-cols-3">
              {siteConfig.enquiries.map((e) => {
                const I = enquiryIcon[e.id as keyof typeof enquiryIcon];
                return (
                  <div key={e.id} className="rounded-2xl border border-line bg-white/[0.03] p-5 transition-colors hover:border-line-strong hover:bg-white/[0.05]">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-brand-blue/15 text-brand-blue">
                      <I className="size-5" strokeWidth={1.8} aria-hidden />
                    </span>
                    <p className="mt-4 font-semibold text-fg">{e.label}</p>
                    <p className="mt-0.5 text-xs text-dim">{e.description}</p>
                    <ul className="mt-4 space-y-2 text-sm">
                      <li>
                        <a href={`mailto:${e.email}`} className="flex items-center gap-2.5 break-all text-muted hover:text-fg" data-track={`email:${e.id}`}>
                          <Mail className="size-4 shrink-0 text-brand-blue" aria-hidden /> {e.email}
                        </a>
                      </li>
                      <li>
                        <a href={e.phoneHref} className="flex items-center gap-2.5 text-muted hover:text-fg" data-track={`phone:${e.id}`}>
                          <Phone className="size-4 shrink-0 text-brand-blue" aria-hidden /> {e.phone}
                        </a>
                      </li>
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Worldwide network */}
        <div className="relative border-b border-line py-14">
          <Image src="/graphics/3d-globe.jpg" alt="" aria-hidden width={640} height={480} sizes="560px" className="pointer-events-none absolute -top-10 right-[-6%] hidden w-[46%] max-w-[600px] opacity-40 mix-blend-screen lg:block" style={{ maskImage: "radial-gradient(closest-side, black 55%, transparent)" }} />
          <div className="relative mb-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="eyebrow mb-3">Worldwide network</p>
              <h2 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
                {siteConfig.offices.length} offices in {countries} countries.
              </h2>
            </div>
            <p className="max-w-sm text-sm text-muted">Delivery teams work across time zones for clients in North America, Europe, the Middle East, Africa and Asia-Pacific.</p>
          </div>
          <ul className="relative grid gap-4 sm:grid-cols-3">
            {siteConfig.offices.map((o) => (
              <li key={o.city} className="group relative flex flex-col rounded-2xl border border-line bg-white/[0.03] p-5 transition-colors hover:border-line-strong">
                <span className="flex items-center gap-2.5 text-xs font-semibold tracking-wide text-muted">
                  <Flag code={o.countryCode as "IN" | "US" | "GB"} />
                  {o.country}
                </span>
                <p className="mt-5 flex items-center gap-2 text-lg font-semibold text-fg">
                  {o.label}
                  {o.headquarters && <span className="rounded-full bg-brand-blue/15 px-2 py-0.5 text-[10.5px] font-semibold text-brand-blue">HQ</span>}
                </p>
                <p className="mt-1 text-xs text-dim">{o.entity}</p>
                <address className="mt-3 text-sm leading-relaxed text-muted not-italic">
                  {o.lines.map((line) => (
                    <span key={line} className="block">
                      {line}
                    </span>
                  ))}
                </address>
                <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-5 text-sm">
                  {o.phone && (
                    <a href={o.phoneHref} className="inline-flex items-center gap-2 text-muted hover:text-fg">
                      <Phone className="size-3.5 text-brand-blue" aria-hidden /> {o.phone}
                    </a>
                  )}
                  {(() => {
                    const wa = siteConfig.whatsappLines.find((l) => l.countryCode === o.countryCode);
                    return wa ? (
                      <a href={`https://wa.me/${wa.number}`} target="_blank" rel="noopener noreferrer" data-track={`whatsapp:footer-${wa.id}`} className="inline-flex items-center gap-1.5 text-muted hover:text-fg" aria-label={`WhatsApp our ${o.country} team`}>
                        <MessageCircle className="size-3.5 text-brand-blue" aria-hidden /> WhatsApp
                      </a>
                    ) : null;
                  })()}
                  <a href={mapsUrl(o)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-muted hover:text-fg" aria-label={`Directions to the ${o.label} office`}>
                    <MapPin className="size-3.5 text-brand-blue" aria-hidden /> Directions
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Sitemap */}
        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-6 gap-y-10 border-b border-line py-14 sm:grid-cols-3 lg:grid-cols-6">
          {nav.map((col) => (
            <div key={col.title} className="min-w-0">
              <p className="label-tech mb-4 text-muted">{col.title}</p>
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
        </nav>

        {/* Newsletter */}
        <div className="flex flex-col gap-6 border-b border-line py-10 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="font-medium text-fg">Engineering notes, once a month</p>
            <p className="mt-1 text-sm text-muted">Web3, digital assets, FinTech, AI and cloud. No filler, unsubscribe any time.</p>
          </div>
          <div className="w-full lg:max-w-md">
            <NewsletterForm />
          </div>
        </div>

        {/* World clock */}
        <div className="border-b border-line py-12">
          <div className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="eyebrow mb-3">World clock</p>
              <h2 className="text-xl font-semibold tracking-tight text-fg sm:text-2xl">Working across your time zone.</h2>
            </div>
            <p className="max-w-sm text-sm text-muted">Local time in the markets we serve most often.</p>
          </div>
          <WorldClock />
        </div>

        {/* Bottom bar */}
        <div className="flex flex-col gap-4 pt-8 text-sm text-dim md:flex-row md:items-center md:justify-between">
          <div className="space-y-1.5">
            <p>
              © {new Date().getFullYear()} {siteConfig.name}. All rights reserved.
            </p>
            <p className="text-xs">
              {siteConfig.entities.map((e, i) => (
                <span key={e.name}>
                  {i > 0 && <span aria-hidden> · </span>}
                  {e.name} ({e.countryCode === "GB" ? "UK" : e.countryCode === "US" ? "USA" : e.country})
                </span>
              ))}
            </p>
          </div>
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {legalLinks.map(([label, href]) => (
              <li key={href}>
                <Link href={href} className="hover:text-fg">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
