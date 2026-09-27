"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, X } from "lucide-react";

/**
 * Site-wide announcement managed in Admin → Settings. Rendered as a dismissible pill at the bottom-left
 * (the header is fixed at the top and the chat launcher sits bottom-right), remembered per session.
 */
export function AnnouncementBar({ text, href }: { text: string; href?: string }) {
  const [show, setShow] = useState(false);
  const key = `shv-announce:${text.slice(0, 40)}`;
  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = sessionStorage.getItem(key) === "1";
    } catch {
      /* storage blocked */
    }
    const t = setTimeout(() => setShow(!dismissed), 1200);
    return () => clearTimeout(t);
  }, [key]);
  if (!show) return null;
  const safe = href && /^(https:\/\/|\/(?!\/))/.test(href) ? href : undefined;
  const body = (
    <>
      <span className="min-w-0 flex-1 text-[13.5px] leading-snug">{text}</span>
      {safe && <ArrowRight className="size-4 shrink-0" aria-hidden />}
    </>
  );
  return (
    <div role="region" aria-label="Announcement" className="fixed bottom-[84px] left-4 z-40 flex max-w-[min(440px,calc(100vw-2rem))] sm:bottom-6 sm:max-w-[min(440px,calc(100vw-16rem))] animate-[fade-in_.3s_ease-out] items-center gap-2 rounded-xl border border-line bg-ink-900 py-2.5 pr-2 pl-4 text-fg shadow-[0_16px_40px_-16px_rgb(11_20_36/0.45)]">
      {safe ? (
        <Link href={safe} className="flex min-w-0 flex-1 items-center gap-2 hover:text-brand-blue" data-track="announcement">
          {body}
        </Link>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-2">{body}</div>
      )}
      <button
        type="button"
        aria-label="Dismiss announcement"
        className="flex size-8 shrink-0 items-center justify-center rounded-md text-dim hover:text-fg"
        onClick={() => {
          setShow(false);
          try {
            sessionStorage.setItem(key, "1");
          } catch {
            /* ignore */
          }
        }}
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
