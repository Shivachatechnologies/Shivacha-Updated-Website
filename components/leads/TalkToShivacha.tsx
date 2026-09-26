"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, CalendarDays, FileText, MessageCircle, X } from "lucide-react";
import { track } from "@/lib/analytics";
import { captureAttribution } from "@/lib/attribution";
import { whatsappHref } from "@/lib/calendly";
import dynamic from "next/dynamic";

// Loaded only when the modal opens, keeping the form code out of every page's initial bundle.
const InquiryForm = dynamic(() => import("./InquiryForm").then((m) => m.InquiryForm), { ssr: false });
import { Modal, openBookCall } from "./BookCall";

const INQUIRY_EVENT = "shivacha:inquiry";

/** Opens the project inquiry form in a modal (used by "Send Project Inquiry" and other CTAs). */
export function openInquiry(detail: { source?: string; service?: string } = {}) {
  track("cta_click", { cta: "send_project_inquiry", location: detail.source ?? "unknown" });
  window.dispatchEvent(new CustomEvent(INQUIRY_EVENT, { detail }));
}

/** Floating "Talk to Shivacha" button + the global inquiry modal. Mounted once in the root layout. */
export function TalkToShivacha() {
  const [menu, setMenu] = useState(false);
  const [inquiry, setInquiry] = useState<{ open: boolean; service?: string; source?: string }>({ open: false });
  const pathname = usePathname();
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    captureAttribution();
  }, []);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent<{ service?: string; source?: string }>).detail ?? {};
      setMenu(false);
      setInquiry({ open: true, service: d.service, source: d.source });
    };
    window.addEventListener(INQUIRY_EVENT, onOpen);
    return () => window.removeEventListener(INQUIRY_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => wrap.current && !wrap.current.contains(e.target as Node) && setMenu(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  // The dedicated inquiry and booking pages already show the form.
  const hidden = pathname === "/start-a-project" || pathname === "/book-a-meeting";

  return (
    <>
      {!hidden && (
        <div ref={wrap} className="fixed right-4 bottom-4 z-[60] sm:right-6 sm:bottom-6" style={{ marginBottom: "env(safe-area-inset-bottom)" }}>
          {menu && (
            <div role="menu" aria-label="Talk to Shivacha" className="absolute right-0 bottom-[calc(100%+12px)] w-[300px] animate-[menu-in_.18s_ease-out] overflow-hidden rounded-2xl border border-line bg-ink-900 p-2 shadow-[0_30px_80px_-20px_rgb(0_0_0/0.45)]">
              <p className="px-3 pt-2 pb-3 text-sm text-muted">How would you like to start?</p>
              <MenuItem
                icon={<CalendarDays className="size-5" />}
                title="Book a Call"
                text="Pick a time that suits you"
                onClick={() => {
                  setMenu(false);
                  openBookCall({ source: "floating_button" });
                }}
              />
              <MenuItem icon={<FileText className="size-5" />} title="Send Project Inquiry" text="Two quick steps, reply in one business day" onClick={() => openInquiry({ source: "floating_button" })} />
              <a
                href={whatsappHref("Hi Shivacha, I'd like to discuss a project.")}
                target="_blank"
                rel="noopener noreferrer"
                role="menuitem"
                onClick={() => track("whatsapp_click", { location: "floating_button" })}
                className="mt-1 flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-muted hover:bg-ink-850 hover:text-fg"
              >
                <MessageCircle className="size-4" /> or chat on WhatsApp
              </a>
            </div>
          )}
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={menu}
            onClick={() => {
              setMenu((m) => !m);
              if (!menu) track("cta_click", { cta: "talk_to_shivacha" });
            }}
            className="group flex h-12 items-center gap-2.5 rounded-full bg-brand-600 pr-5 pl-2 font-semibold text-white shadow-[0_16px_40px_-12px_rgb(1_115_204/0.8)] ring-4 ring-brand-blue/15 transition-transform hover:-translate-y-0.5 sm:h-13"
          >
            <span className="flex size-8 items-center justify-center rounded-full bg-white/15 sm:size-9">
              {menu ? (
                <X className="size-4" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src="/brand/shivacha-mark.svg" alt="" className="size-5 brightness-0 invert" />
              )}
            </span>
            <span className="text-[15px]">Talk to Shivacha</span>
          </button>
        </div>
      )}

      <Modal open={inquiry.open} onClose={() => setInquiry({ open: false })} title="Discuss your project">
        <div className="p-6 sm:p-7">
          <InquiryForm variant="modal" source={inquiry.source ? `${pathname} (${inquiry.source})` : pathname} defaultService={inquiry.service} />
        </div>
      </Modal>
    </>
  );
}

function MenuItem({ icon, title, text, onClick }: { icon: React.ReactNode; title: string; text: string; onClick: () => void }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className="group flex w-full items-center gap-3 rounded-xl p-3 text-left transition-colors hover:bg-ink-850">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-blue/10 text-brand-blue transition-colors group-hover:bg-brand-600 group-hover:text-white">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-fg">{title}</span>
        <span className="block text-xs text-dim">{text}</span>
      </span>
      <ArrowRight className="size-4 text-dim transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}
