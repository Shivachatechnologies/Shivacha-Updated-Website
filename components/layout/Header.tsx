"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, ChevronDown, Menu, Search, X } from "lucide-react";
import type { NavItem } from "@/data/navigation";
import { cn } from "@/lib/cn";
import { Logo } from "./Logo";

export const openSearch = () => window.dispatchEvent(new CustomEvent("shivacha:search"));

export function Header({ nav }: { nav: NavItem[] }) {
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

  useEffect(() => {
    setOpen(null);
    setMobile(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = mobile ? "hidden" : "";
  }, [mobile]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const enter = (label: string) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(label);
    setTab(0);
  };
  const leave = () => {
    closeTimer.current = setTimeout(() => setOpen(null), 120);
  };
  const active = nav.find((n) => n.label === open);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-colors duration-300",
        scrolled || open || mobile ? "border-b border-line bg-ink-950/85 backdrop-blur-xl" : "border-b border-transparent",
      )}
      onMouseLeave={leave}
    >
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:rounded-md focus:bg-fg focus:px-3 focus:py-2 focus:text-ink-950">
        Skip to content
      </a>
      <div className="container-x flex h-16 items-center justify-between gap-6">
        <Link href="/" aria-label="Shivacha Technologies home" className="shrink-0">
          <Logo />
        </Link>

        <nav aria-label="Main" className="hidden xl:block">
          <ul className="flex items-center gap-0.5">
            {nav.map((item) => (
              <li key={item.label} onMouseEnter={() => enter(item.label)}>
                <Link
                  href={item.href}
                  aria-expanded={open === item.label}
                  onFocus={() => enter(item.label)}
                  className={cn(
                    "flex items-center gap-1 rounded-full px-3 py-2 text-[13.5px] transition-colors",
                    open === item.label || pathname.startsWith(item.href) ? "text-fg" : "text-muted hover:text-fg",
                  )}
                >
                  {item.label}
                  <ChevronDown className={cn("size-3.5 transition-transform", open === item.label && "rotate-180")} aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openSearch}
            className="flex h-9 items-center gap-2 rounded-full border border-line bg-white/[0.03] px-3 text-sm text-muted transition-colors hover:border-line-strong hover:text-fg"
            aria-label="Search the site"
          >
            <Search className="size-4" aria-hidden />
            <span className="hidden sm:inline">Search</span>
            <kbd className="hidden rounded border border-line px-1.5 font-mono text-[10px] text-dim lg:inline">⌘K</kbd>
          </button>
          <Link href="/start-a-project" className="btn-primary hidden h-9 px-4 text-[13px] sm:inline-flex" data-track="cta:header-start-project">
            Start a Project
          </Link>
          <button
            type="button"
            className="flex size-9 items-center justify-center rounded-full border border-line text-fg xl:hidden"
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
        <div className="absolute inset-x-0 top-16 hidden border-b border-line bg-ink-950/95 backdrop-blur-xl xl:block" onMouseEnter={() => enter(active.label)}>
          <div className="container-x py-8">
            {active.tabs ? (
              <div className="grid grid-cols-[220px_1fr] gap-8">
                <ul className="space-y-1 border-r border-line pr-6">
                  {active.tabs.map((t, i) => (
                    <li key={t.label}>
                      <button
                        type="button"
                        onMouseEnter={() => setTab(i)}
                        onFocus={() => setTab(i)}
                        className={cn(
                          "flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                          tab === i ? "bg-white/[0.05] text-fg" : "text-muted hover:text-fg",
                        )}
                      >
                        {t.label}
                        <ArrowRight className={cn("size-3.5", tab === i ? "opacity-100" : "opacity-0")} />
                      </button>
                    </li>
                  ))}
                  <li className="pt-3">
                    <Link href="/services" className="px-3 text-xs text-dim hover:text-fg">
                      All 300+ services →
                    </Link>
                  </li>
                </ul>
                <div>
                  <div className="mb-6 flex items-baseline justify-between">
                    <p className="text-sm text-muted">{active.tabs[tab].description}</p>
                    <Link href={active.tabs[tab].href} className="text-xs text-dim hover:text-fg">
                      Overview →
                    </Link>
                  </div>
                  <div className="grid grid-cols-5 gap-6">
                    {active.tabs[tab].columns.map((c) => (
                      <MenuColumn key={c.title} title={c.title} links={c.links} />
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-[1fr_300px] gap-10">
                <div className="grid grid-cols-3 gap-8">
                  {active.columns?.map((c) => (
                    <MenuColumn key={c.title} title={c.title} links={c.links} withDesc />
                  ))}
                </div>
                {active.feature && (
                  <Link href={active.feature.href} className="card card-hover relative flex flex-col overflow-hidden p-6">
                    <div className="absolute -top-16 -right-16 size-48 rounded-full bg-brand-blue/20 blur-3xl" aria-hidden />
                    <span className="eyebrow relative">{active.feature.eyebrow}</span>
                    <span className="relative mt-3 text-lg font-semibold text-fg">{active.feature.title}</span>
                    <span className="relative mt-2 text-sm text-muted">{active.feature.description}</span>
                    <span className="relative mt-auto flex items-center gap-1.5 pt-6 text-sm text-fg">
                      {active.feature.cta} <ArrowRight className="size-3.5" />
                    </span>
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mobile navigation */}
      {mobile && (
        <div className="fixed inset-x-0 top-16 bottom-0 overflow-y-auto border-t border-line bg-ink-950 xl:hidden">
          <nav aria-label="Mobile" className="container-x pt-4 pb-32">
            {nav.map((item) => (
              <details key={item.label} className="group border-b border-line">
                <summary className="flex cursor-pointer list-none items-center justify-between py-4 text-base text-fg [&::-webkit-details-marker]:hidden">
                  {item.label}
                  <ChevronDown className="size-4 text-dim transition-transform group-open:rotate-180" />
                </summary>
                <div className="space-y-5 pb-5">
                  <Link href={item.href} className="block text-sm text-brand-blue">
                    {item.label} overview →
                  </Link>
                  {(item.tabs ?? [{ label: "", href: item.href, description: "", columns: item.columns ?? [] }]).map((t) => (
                    <div key={t.label || item.label}>
                      {t.label && <p className="mb-2 font-mono text-[11px] tracking-widest text-dim uppercase">{t.label}</p>}
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                        {t.columns.flatMap((c) => c.links).slice(0, 10).map((lnk) => (
                          <Link key={lnk.href + lnk.label} href={lnk.href} className="py-1 text-sm text-muted">
                            {lnk.label}
                          </Link>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            ))}
            <div className="mt-8 grid gap-3">
              <Link href="/start-a-project" className="btn-primary">
                Start a Project
              </Link>
              <Link href="/book-a-meeting" className="btn-secondary">
                Book a Meeting
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}

function MenuColumn({ title, links, withDesc }: { title: string; links: { label: string; href: string; description?: string }[]; withDesc?: boolean }) {
  return (
    <div>
      <p className="mb-3 font-mono text-[10.5px] tracking-[0.16em] text-dim uppercase">{title}</p>
      <ul className="space-y-1.5">
        {links.map((l) => (
          <li key={l.href + l.label}>
            <Link href={l.href} className="group block rounded-md py-1 text-sm text-muted transition-colors hover:text-fg">
              <span>{l.label}</span>
              {withDesc && l.description && <span className="block text-xs text-dim group-hover:text-muted">{l.description}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
