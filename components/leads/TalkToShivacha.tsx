"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, CalendarDays, FileText, MessageCircle, X } from "lucide-react";
import { track } from "@/lib/analytics";
import { captureAttribution } from "@/lib/attribution";
import { WhatsAppLines } from "./WhatsAppPicker";
import dynamic from "next/dynamic";

// Loaded only when the modal opens, keeping the form code out of every page's initial bundle.
const InquiryForm = dynamic(() => import("./InquiryForm").then((m) => m.InquiryForm), { ssr: false });
import { Modal, openBookCall } from "./BookCall";

const INQUIRY_EVENT = "shivacha:inquiry";

/** Opens the project inquiry form in a modal (used by "Send Project Inquiry" and other CTAs). */
export function openInquiry(detail: { source?: string; service?: string } = {}) {
  track("cta_click", {
    cta: "send_project_inquiry",
    location: detail.source ?? "unknown",
  });
  window.dispatchEvent(new CustomEvent(INQUIRY_EVENT, { detail }));
}

/** Floating "Talk to Shivacha" button + the global inquiry modal. Mounted once in the root layout. */
export function TalkToShivacha() {
  const [menu, setMenu] = useState(false);
  const [inquiry, setInquiry] = useState<{
    open: boolean;
    service?: string;
    source?: string;
  }>({ open: false });
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
        <div ref={wrap} data-floating-actions className="fixed inset-x-0 bottom-0 z-[60] sm:inset-x-auto sm:right-6 sm:bottom-6">
          {menu && (
            <div
              role="menu"
              aria-label="Talk to Shivacha"
              className="absolute right-3 bottom-[calc(100%+12px)] w-[300px] sm:right-0 animate-[menu-in_.18s_ease-out] overflow-hidden rounded-2xl border border-line bg-ink-900 p-2 shadow-[0_30px_80px_-20px_rgb(0_0_0/0.45)]"
            >
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
              <div className="mt-1 border-t border-line px-2 pt-3 pb-1">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-dim">
                  <MessageCircle className="size-3.5" /> Or chat on WhatsApp
                </p>
                <WhatsAppLines text="Hi Shivacha, I'd like to discuss a project." location="floating_button" onPick={() => setMenu(false)} compact />
              </div>
            </div>
          )}
          {/* Mobile: sticky action bar */}
          <nav
            aria-label="Quick actions"
            className="grid grid-cols-3 border-t border-line bg-ink-900/95 px-2 pt-2 shadow-[0_-12px_30px_-18px_rgb(0_0_0/0.35)] backdrop-blur sm:hidden"
            style={{
              paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))",
            }}
          >
            <button
              type="button"
              onClick={() => {
                track("cta_click", { cta: "mobile_bar_enquire" });
                openInquiry({ source: "mobile_bar" });
              }}
              className="flex flex-col items-center gap-1 rounded-xl py-1.5 text-[11px] font-semibold text-fg"
            >
              <FileText className="size-5 text-brand-blue" aria-hidden /> Get Estimate
            </button>
            <button
              type="button"
              onClick={() => {
                track("cta_click", { cta: "mobile_bar_call" });
                openBookCall({ source: "mobile_bar" });
              }}
              className="flex flex-col items-center gap-1 rounded-xl py-1.5 text-[11px] font-semibold text-fg"
            >
              <CalendarDays className="size-5 text-brand-blue" aria-hidden /> Book a Call
            </button>
            <button type="button" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)} className="flex flex-col items-center gap-1 rounded-xl py-1.5 text-[11px] font-semibold text-fg">
              <MessageCircle className="size-5 text-[#1faa53]" aria-hidden /> WhatsApp
            </button>
          </nav>
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={menu}
            onClick={() => {
              setMenu((m) => !m);
              if (!menu) track("cta_click", { cta: "talk_to_shivacha" });
            }}
            className="group hidden h-12 items-center gap-2.5 rounded-full bg-brand-600 sm:flex pr-5 pl-2 font-semibold text-white shadow-[0_16px_40px_-12px_rgb(1_115_204/0.8)] ring-4 ring-brand-blue/15 transition-transform hover:-translate-y-0.5 sm:h-13"
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
