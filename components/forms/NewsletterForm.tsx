"use client";

import { useRef, useState } from "react";
import { track } from "@/lib/analytics";

export function NewsletterForm() {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const started = useRef(Date.now());

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setState("sending");
    const res = await fetch("/api/lead", { method: "POST", body: fd }).catch(() => null);
    if (res?.ok) {
      track("newsletter_signup");
      setState("done");
    } else setState("error");
  }

  if (state === "done") return <p className="text-sm text-brand-emerald">Subscribed. Thank you.</p>;

  return (
    <form onSubmit={onSubmit} className="flex max-w-md gap-2" aria-label="Newsletter signup">
      <input type="hidden" name="type" value="newsletter" />
      <input type="hidden" name="_t" value={started.current} />
      <input type="text" name="company_fax" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      <label htmlFor="newsletter-email" className="sr-only">
        Business email
      </label>
      <input id="newsletter-email" type="email" name="email" required placeholder="you@company.com" className="field h-11 flex-1 rounded-full py-0" />
      <button type="submit" className="btn-secondary h-11" disabled={state === "sending"}>
        Subscribe
      </button>
      {state === "error" && <span className="sr-only" role="alert">Subscription failed</span>}
    </form>
  );
}
