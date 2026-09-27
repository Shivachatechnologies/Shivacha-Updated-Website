"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calculator, CalendarDays } from "lucide-react";
import { Modal, openBookCall } from "./BookCall";
import { WhatsAppLines } from "./WhatsAppPicker";
import { track } from "@/lib/analytics";

const KEY = "shv_exit_intent";
/** Pages where the visitor is already converting — never interrupt them. */
const SKIP = /^\/(start-a-project|contact|book-a-meeting|request-demo|hire-developers|project-estimator|lp\/|careers|privacy-policy|terms|cookie-policy)/;
const MIN_TIME_MS = 20_000;

/**
 * A single, polite exit-intent prompt on desktop: shown at most once per visitor, only after
 * 20 seconds on the site, only when the pointer leaves through the top of the window, and never
 * again after it has been shown or dismissed.
 */
export function ExitIntent() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (SKIP.test(pathname)) return;
    let done = false;
    try {
      done = !!localStorage.getItem(KEY);
    } catch {
      done = true; // no storage → cannot guarantee "only once", so don't show at all
    }
    if (done || window.matchMedia("(pointer: coarse)").matches) return;
    const armedAt = Date.now();
    const onLeave = (e: MouseEvent) => {
      if (e.clientY > 0 || e.relatedTarget || Date.now() - armedAt < MIN_TIME_MS) return;
      if (document.querySelector('[role="dialog"]')) return; // another modal is open
      try {
        localStorage.setItem(KEY, new Date().toISOString());
      } catch {
        return;
      }
      setOpen(true);
      track("exit_intent_shown", { path: pathname });
      document.removeEventListener("mouseout", onLeave);
    };
    document.addEventListener("mouseout", onLeave);
    return () => document.removeEventListener("mouseout", onLeave);
  }, [pathname]);

  const close = useCallback(() => setOpen(false), []);
  const act = (action: string) => {
    track("exit_intent_action", { action, path: pathname });
    setOpen(false);
  };

  return (
    <Modal open={open} onClose={close} title="Before you go">
      <div className="p-6 sm:p-7">
        <p className="text-xl font-semibold tracking-tight text-fg">Planning a technology project?</p>
        <p className="mt-2 text-[15px] text-muted">Get an indicative timeline in 30 seconds, talk to an engineer, or message our team. No obligation.</p>
        <div className="mt-6 grid gap-3">
          <Link href="/project-estimator" onClick={() => act("estimate")} className="btn-primary h-12 justify-center">
            <Calculator className="size-4" aria-hidden /> Get Estimate
          </Link>
          <button
            type="button"
            onClick={() => {
              act("book_call");
              openBookCall({ source: "exit_intent" });
            }}
            className="btn-secondary h-12 justify-center"
          >
            <CalendarDays className="size-4" aria-hidden /> Book a Call
          </button>
        </div>
        <p className="mt-6 mb-2 text-xs font-medium text-dim">Or WhatsApp the nearest team</p>
        <WhatsAppLines text="Hi Shivacha, I'm planning a technology project." location="exit_intent" onPick={() => act("whatsapp")} compact />
      </div>
    </Modal>
  );
}
