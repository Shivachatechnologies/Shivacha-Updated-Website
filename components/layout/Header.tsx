"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, ArrowUpRight, ChevronDown, Menu, Search, X } from "lucide-react";
import type { NavItem, NavTab } from "@/data/navigation";
import type { NavLink } from "@/data/types";
import { divisionTone } from "@/components/ui/division";
import { Icon } from "@/components/ui/Icon";
import { AutoIcon } from "@/components/graphics/autoIcon";
import { cn } from "@/lib/cn";
import { Logo } from "./Logo";
import { BookCallButton, openBookCall } from "@/components/leads/BookCall";

export const openSearch = () => window.dispatchEvent(new CustomEvent("shivacha:search"));

export function Header({ nav, contact }: { nav: NavItem[]; contact: { email: string; phone: string; phoneHref: string } }) {
  const [open, setOpen] = useState<string | null>(null);
  const [tab, setTab] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const [mobile, setMobile] = useState(false);
  const pathname = usePathname();
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close menus on navigation (React's recommended "adjust state during render" pattern).
  const [prevPath, setPrevPath] = useState(pathname);
  if (pathname !== prevPath) {
    setPrevPath(pathname);
    setOpen(null);
    setMobile(false);
  }

  useEffect(() => {
    document.body.style.overflow = mobile ? "hidden" : "";
    // Lets floating widgets step aside while the mobile menu is open (see globals.css).
    if (mobile) document.documentElement.dataset.nav = "open";
    else delete document.documentElement.dataset.nav;
  }, [mobile]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const enter = (label: string) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    if (open !== label) setTab(0);
    setOpen(label);
  };
  const leave = () => {
    closeTimer.current = setTimeout(() => setOpen(null), 140);
  };
  const active = nav.find((n) => n.label === open);

  return (
    <header className="fixed inset-x-0 top-0 z-50" onMouseLeave={leave} style={{ ["--hdr-h" as string]: scrolled ? "56px" : "72px" }}>
      {/* Background lives on a sibling layer: backdrop-filter on <header> itself would trap the fixed mobile drawer. */}
      <div
        aria-hidden
        className={cn(
          "absolute inset-x-0 top-0 h-[var(--hdr-h)] border-b transition-[height,background-color,border-color] duration-300 ease-out",
          scrolled || open || mobile ? "border-line bg-ink-950/85 backdrop-blur-xl" : "border-transparent",
        )}
      />
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:rounded-md focus:bg-fg focus:px-3 focus:py-2 focus:text-ink-950">
        Skip to content
      </a>
      <div className="container-x relative flex h-[var(--hdr-h)] items-center justify-between gap-6 transition-[height] duration-300 ease-out">
        <Link href="/" aria-label="Shivacha Technologies home" className="shrink-0">
          <Logo />
        </Link>

        <nav aria-label="Main" className="hidden xl:block">
          <ul className="flex items-center gap-1 2xl:gap-2">
            {nav.map((item) => {
              const isOpen = open === item.label;
              const current = pathname.startsWith(item.href);
              return (
                <li key={item.label} onMouseEnter={() => enter(item.label)}>
                  <Link
                    href={item.href}
                    aria-expanded={isOpen}
                    aria-controls={isOpen ? "mega-menu" : undefined}
                    onFocus={() => enter(item.label)}
                    className={cn(
                      "relative flex items-center gap-1 px-3 py-2 text-[14px] font-medium transition-colors duration-200 after:absolute after:inset-x-3 after:-bottom-px after:h-px after:origin-left after:bg-fg after:transition-transform after:duration-200",
                      isOpen || current ? "text-fg after:scale-x-100" : "text-muted after:scale-x-0 hover:text-fg",
                    )}
                  >
                    {item.label}
                    <ChevronDown className={cn("size-3.5 opacity-60 transition-transform duration-200", isOpen && "rotate-180")} aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openSearch}
            className="flex size-9 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:border-line-strong hover:text-fg"
            aria-label="Search the site (Ctrl+K)"
            title="Search (⌘K)"
          >
            <Search className="size-4" aria-hidden />
          </button>
          <Link href="/contact" className="hidden px-2 text-[14px] font-medium text-muted transition-colors hover:text-fg lg:inline">
            Contact
          </Link>
          <Link href="/start-a-project" className="btn-primary hidden h-9 px-4 text-[13px] sm:inline-flex" data-track="cta:header-discuss-product">
            Discuss Your Product
          </Link>
          <button
            type="button"
            className="flex size-9 items-center justify-center rounded-lg border border-line text-fg xl:hidden"
            aria-label={mobile ? "Close menu" : "Open menu"}
            aria-expanded={mobile}
            onClick={() => setMobile((m) => !m)}
          >
            {mobile ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
        </div>
      </div>

      {/* Desktop mega menu */}
      {active && (
        <div id="mega-menu" className="absolute inset-x-0 top-[var(--hdr-h)] hidden xl:block" onMouseEnter={() => enter(active.label)}>
          <div className="container-x pt-2">
            <div className="animate-[menu-in_.2s_ease-out] overflow-hidden rounded-xl border border-line bg-ink-900 shadow-[0_24px_60px_-30px_rgb(11_20_36/0.35)]">
              {active.tabs ? <TabbedPanel item={active} tab={tab} setTab={setTab} /> : <ColumnsPanel item={active} />}
              {active.footer && (
                <div className="flex items-center justify-between gap-6 border-t border-line bg-ink-850 px-7 py-3.5 text-sm">
                  <p className="text-muted">
                    {active.footer.text}{" "}
                    <Link href={active.footer.href} className="font-semibold text-brand-blue hover:underline">
                      {active.footer.label} →
                    </Link>
                  </p>
                  <Link
                    href="/book-a-meeting"
                    onClick={(e) => {
                      e.preventDefault();
                      openBookCall({ source: "mega_menu" });
                    }}
                    className="inline-flex items-center gap-1.5 font-medium text-fg hover:text-brand-blue"
                  >
                    Not sure where to start? Talk to a Solution Architect <ArrowRight className="size-3.5" />
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mobile navigation */}
      {mobile && <MobileMenu nav={nav} contact={contact} />}
    </header>
  );
}

/* ───────── Desktop panels ───────── */

function TabbedPanel({ item, tab, setTab }: { item: NavItem; tab: number; setTab: (i: number) => void }) {
  const tabs = item.tabs!;
  const cur = tabs[tab];
  const t = divisionTone[cur.tone];
  return (
    <div className="grid grid-cols-[290px_1fr]">
      <ul className="space-y-1 border-r border-line bg-ink-850 p-3" role="tablist" aria-label={`${item.label} categories`}>
        {tabs.map((x, i) => (
          <li key={x.label} role="presentation">
            <TabButton tab={x} active={i === tab} onSelect={() => setTab(i)} />
          </li>
        ))}
      </ul>
      <div className="p-7" role="tabpanel">
        <div className="mb-6 flex items-start justify-between gap-6 border-b border-line pb-5">
          <div>
            <p className="label-tech flex items-center gap-2">
              <span className={cn("size-1.5 rounded-full", t.dot)} aria-hidden />
              {cur.label === "Cybersecurity" ? "Security engineering" : cur.label === "Dedicated Teams" ? "Engagement" : `Shivacha ${cur.label === "Software" ? "Product Engineering" : cur.label}`}
            </p>
            <p className="mt-2 text-xl font-medium tracking-[-0.02em] text-fg">{cur.description}</p>
          </div>
          <Link href={cur.href} className="group inline-flex shrink-0 items-center gap-1.5 border-b border-line-strong pb-0.5 text-sm font-medium text-fg transition-colors hover:border-fg">
            Overview <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
        <div className={cn("grid gap-x-8 gap-y-6", cur.columns.length >= 4 ? "grid-cols-4" : "grid-cols-3")}>
          {cur.columns.map((c) => (
            <div key={c.title}>
              <p className="label-tech mb-3">{c.title}</p>
              <ul className="space-y-0.5">
                {c.links.map((l) => (
                  <li key={l.href + l.label}>
                    <Link href={l.href} className="group -mx-2 flex items-center justify-between rounded-lg px-2 py-1.5 text-[14px] text-muted transition-colors hover:bg-ink-850 hover:text-fg">
                      {l.label}
                      <ArrowRight className="size-3 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TabButton({ tab, active, onSelect }: { tab: NavTab; active: boolean; onSelect: () => void }) {
  const t = divisionTone[tab.tone];
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onMouseEnter={onSelect}
      onFocus={onSelect}
      onClick={onSelect}
      className={cn(
        "relative flex w-full items-center gap-3 rounded-lg p-2.5 text-left transition-colors duration-150",
        active ? "bg-ink-900 ring-1 ring-line" : "hover:bg-ink-900/60",
      )}
    >
      {active && <span aria-hidden className={cn("absolute top-2.5 bottom-2.5 left-0 w-[2px] rounded-full", t.dot)} />}
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg border border-line", active ? t.text : "text-muted")}>
        <Icon name={tab.icon} className="size-[18px]" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-fg">{tab.label}</span>
        <span className="block text-xs leading-snug text-dim">{tab.description}</span>
      </span>
    </button>
  );
}

function ColumnsPanel({ item }: { item: NavItem }) {
  const cols = item.columns ?? [];
  return (
    <div className={cn("grid", item.feature ? "grid-cols-[1fr_320px]" : "grid-cols-1")}>
      <div className={cn("grid gap-x-6 gap-y-6 p-7", cols.length >= 3 ? "grid-cols-3" : "grid-cols-2")}>
        {cols.map((c) => (
          <div key={c.title}>
            <p className="label-tech mb-2 px-2">{c.title}</p>
            <ul className="space-y-0.5">
              {c.links.map((l) => (
                <li key={l.href + l.label}>
                  <RichLink link={l} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {item.feature && (
        <div className="p-3">
          <FeatureCard {...item.feature} />
        </div>
      )}
    </div>
  );
}

function LinkIcon({ link, className }: { link: NavLink; className?: string }) {
  if (link.logo) {
    const dark = parseInt(link.logo.hex.slice(0, 2), 16) + parseInt(link.logo.hex.slice(2, 4), 16) + parseInt(link.logo.hex.slice(4, 6), 16) < 120;
    return (
      <svg viewBox="0 0 24 24" className={className} fill={dark ? "currentColor" : `#${link.logo.hex}`} aria-hidden>
        <path d={link.logo.path} />
      </svg>
    );
  }
  if (link.icon) return <Icon name={link.icon} className={className} />;
  return <AutoIcon title={link.label} hint={link.description} className={className} />;
}

function RichLink({ link }: { link: NavLink }) {
  return (
    <Link href={link.href} className="group flex items-start gap-3 rounded-lg p-2 transition-colors duration-150 hover:bg-ink-850">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-line bg-ink-900 text-fg transition-colors group-hover:border-line-strong">
        <LinkIcon link={link} className="size-[18px]" />
      </span>
      <span className="min-w-0 pt-0.5">
        <span className="block text-[14px] font-semibold text-fg">{link.label}</span>
        {link.description && <span className="mt-0.5 line-clamp-1 text-[12.5px] text-dim">{link.description}</span>}
      </span>
    </Link>
  );
}

function FeatureCard({ eyebrow, title, description, href, cta }: NonNullable<NavItem["feature"]>) {
  return (
    <Link href={href} data-theme="dark" className="band-brand group relative flex h-full min-h-[260px] flex-col overflow-hidden rounded-xl p-6 text-fg">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/shivacha-mark.svg" alt="" aria-hidden className="pointer-events-none absolute -right-10 -bottom-12 size-48 opacity-[0.14] transition-transform duration-500 group-hover:scale-105" />
      <span className="relative text-xs font-semibold text-brand-blue">{eyebrow}</span>
      <span className="relative mt-3 text-xl leading-snug font-semibold">{title}</span>
      <span className="relative mt-2 text-sm leading-relaxed text-muted">{description}</span>
      <span className="relative mt-auto inline-flex w-fit items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#0b1424] transition-transform group-hover:translate-x-0.5">
        {cta} <ArrowUpRight className="size-4" />
      </span>
    </Link>
  );
}

/* ───────── Mobile ───────── */

function MobileMenu({ nav, contact }: { nav: NavItem[]; contact: { email: string; phone: string; phoneHref: string } }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <div className="fixed inset-x-0 top-[var(--hdr-h)] bottom-0 animate-[menu-in_.18s_ease-out] overflow-y-auto border-t border-line bg-ink-950 xl:hidden">
      <nav aria-label="Mobile" className="container-x pt-3 pb-36">
        <ul>
          {nav.map((item) => {
            const isOpen = expanded === item.label;
            return (
              <li key={item.label} className="border-b border-line">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setExpanded(isOpen ? null : item.label)}
                  className="flex w-full items-center justify-between py-4 text-left text-[17px] font-semibold text-fg"
                >
                  {item.label}
                  <span className={cn("flex size-7 items-center justify-center rounded-full border border-line transition-transform", isOpen && "rotate-180 bg-tint/[0.05]")}>
                    <ChevronDown className="size-4 text-muted" />
                  </span>
                </button>
                {isOpen && (
                  <div className="animate-[menu-in_.18s_ease-out] pb-5">
                    {item.tabs ? (
                      <div className="grid grid-cols-2 gap-2">
                        {item.tabs.map((t) => (
                          <MobileTile key={t.label} href={t.href} label={t.label} icon={<Icon name={t.icon} className="size-[18px]" />} tone={t.tone} />
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {(item.columns ?? []).map((c) => (
                          <div key={c.title}>
                            <p className="mb-1 text-xs font-semibold text-dim">{c.title}</p>
                            <ul>
                              {c.links.map((l) => (
                                <li key={l.href + l.label}>
                                  <Link href={l.href} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 text-[15px] text-fg active:bg-ink-850">
                                    <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", l.logo ? "border border-line bg-ink-900" : "bg-brand-blue/10 text-brand-blue")}>
                                      <LinkIcon link={l} className="size-4" />
                                    </span>
                                    {l.label}
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    )}
                    <Link href={item.footer?.href ?? item.href} className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-blue">
                      {item.footer?.label ?? `${item.label} overview`} <ArrowRight className="size-3.5" />
                    </Link>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <div className="mt-8 grid gap-3">
          <Link href="/start-a-project" className="btn-primary">
            Discuss Your Product
          </Link>
          <BookCallButton label="Book a Call" variant="secondary" source="mobile_menu" />
        </div>
        <div className="mt-8 space-y-1 text-sm text-muted">
          <a href={`mailto:${contact.email}`} className="block py-1 hover:text-fg">
            {contact.email}
          </a>
          <a href={contact.phoneHref} className="block py-1 hover:text-fg">
            {contact.phone}
          </a>
        </div>
      </nav>
    </div>
  );
}

function MobileTile({ href, label, icon, tone }: { href: string; label: string; icon: ReactNode; tone: NavTab["tone"] }) {
  const t = divisionTone[tone];
  return (
    <Link href={href} className="flex items-center gap-3 rounded-xl border border-line bg-ink-900 p-3 text-[15px] font-medium text-fg">
      <span className={cn("flex size-9 items-center justify-center rounded-lg", t.bg, t.text)}>{icon}</span>
      {label}
    </Link>
  );
}
