"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { ArrowLeft, ArrowRight, Building2, Check, Loader2, Lock, Mail, Phone, User } from "lucide-react";
import { BUDGET_OPTIONS, SERVICE_OPTIONS } from "@/lib/leads/options";
import { validateLead } from "@/lib/validation";
import { track } from "@/lib/analytics";
import { attributionProps, getAttribution } from "@/lib/attribution";
import { WhatsAppPicker } from "./WhatsAppPicker";
import { cn } from "@/lib/cn";
import { DIAL_COUNTRIES, guessDialCountry, toE164 } from "@/lib/phone";
import { BookCallButton } from "./BookCall";

type Values = { name: string; email: string; phone: string; company: string; service: string; budget: string; message: string };
const initial: Values = { name: "", email: "", phone: "", company: "", service: "", budget: "", message: "" };
const STEP1: (keyof Values)[] = ["name", "email", "phone"];

/**
 * Two-step project inquiry. Step 1 captures contact details (so a lead exists even if step 2 is skipped
 * later by sales follow-up), step 2 the project. Only name and email are mandatory.
 */
export function InquiryForm({ source, className, variant = "page", defaultService }: { source?: string; className?: string; variant?: "page" | "modal"; defaultService?: string }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [v, setV] = useState<Values>({ ...initial, service: defaultService && (SERVICE_OPTIONS as readonly string[]).includes(defaultService) ? defaultService : "" });
  const [dialIso, setDialIso] = useState("IN");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [serverError, setServerError] = useState("");
  const [leadId, setLeadId] = useState("");
  const startedAt = useRef(0);
  const started = useRef(false);
  const finished = useRef(false);
  const stepRef = useRef<1 | 2 | 3>(1);
  const honeypot = useRef<HTMLInputElement>(null);
  const firstField = useRef<HTMLInputElement>(null);
  const formName = variant === "modal" ? "inquiry_modal" : "inquiry_page";
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- time-zone guess is only available after hydration
    setDialIso(guessDialCountry());
  }, []);

  useEffect(() => {
    startedAt.current = Date.now();
    if (variant === "modal") firstField.current?.focus();
  }, [variant]);

  // Prefill from the URL (e.g. the project estimator links here with ?service=…&brief=…&budget=…).
  useEffect(() => {
    if (variant !== "page") return;
    const q = new URLSearchParams(window.location.search);
    const division: Record<string, string> = { web3: "Blockchain Development", fintech: "FinTech Development", ai: "AI Development", digital: "Web Development" };
    const service = q.get("service") ?? division[q.get("division") ?? ""] ?? "";
    const budget = q.get("budget") ?? "";
    const brief = (q.get("brief") ?? "").slice(0, 1500);
    if (!service && !brief && !budget) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-off sync from the URL after hydration
    setV((cur) => ({
      ...cur,
      service: cur.service || ((SERVICE_OPTIONS as readonly string[]).includes(service) ? service : ""),
      budget: cur.budget || ((BUDGET_OPTIONS as readonly string[]).includes(budget) ? budget : ""),
      message: cur.message || brief,
    }));
  }, [variant]);

  // Abandonment: the visitor started but left (tab hidden, page closed or modal closed) before submitting.
  useEffect(() => {
    const abandon = () => {
      if (started.current && !finished.current) {
        finished.current = true;
        track("form_abandon", { form: formName, step: stepRef.current, ...attributionProps() });
      }
    };
    const onHide = () => document.visibilityState === "hidden" && abandon();
    window.addEventListener("pagehide", abandon);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", abandon);
      document.removeEventListener("visibilitychange", onHide);
      abandon();
    };
  }, [formName]);

  const set = (k: keyof Values) => (e: { target: { value: string } }) => {
    setV((cur) => ({ ...cur, [k]: e.target.value }));
    if (errors[k])
      setErrors((cur) => {
        const next = { ...cur };
        delete next[k];
        return next;
      });
  };

  const onStart = () => {
    if (started.current) return;
    started.current = true;
    track("form_start", { form: formName, ...attributionProps() });
  };

  const goStep = (s: 1 | 2 | 3) => {
    stepRef.current = s;
    setStep(s);
  };

  function continueToStep2(e: React.FormEvent) {
    e.preventDefault();
    const check = validateLead("project", { name: v.name, email: v.email, phone: toE164(dialIso, v.phone) });
    const stepErrors = Object.fromEntries(Object.entries(check.errors).filter(([k]) => STEP1.includes(k as keyof Values)));
    setErrors(stepErrors);
    if (Object.keys(stepErrors).length) {
      document.getElementById(`inq-${Object.keys(stepErrors)[0]}`)?.focus();
      return;
    }
    onStart();
    track("form_step_complete", { form: formName, step: 1 });
    goStep(2);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const payload: Record<string, string> = { ...v, phone: toE164(dialIso, v.phone), type: "project", source: source ?? window.location.pathname, _t: String(startedAt.current), company_fax: honeypot.current?.value ?? "", ...getAttribution() };
    const token = (e.currentTarget.querySelector('[name="cf-turnstile-response"]') as HTMLInputElement | null)?.value;
    if (token) payload["cf-turnstile-response"] = token;
    const check = validateLead("project", payload);
    setErrors(check.errors);
    if (!check.ok) {
      if (Object.keys(check.errors).some((k) => STEP1.includes(k as keyof Values))) goStep(1);
      return;
    }
    track("form_step_complete", { form: formName, step: 2 });
    setSending(true);
    setServerError("");
    try {
      const res = await fetch("/api/lead", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; id?: string; error?: string; errors?: Record<string, string> };
      if (!res.ok || !json.ok) {
        if (json.errors) {
          setErrors(json.errors);
          if (Object.keys(json.errors).some((k) => STEP1.includes(k as keyof Values))) goStep(1);
        }
        setServerError(json.error ?? (json.errors ? "" : "Something went wrong. Please try again, or email sales@shivacha.com."));
        return;
      }
      finished.current = true;
      setLeadId(json.id ?? "");
      track("generate_lead", { form: formName, service: v.service || "Not specified", budget: v.budget || "Not specified", ...attributionProps() });
      goStep(3);
    } catch {
      setServerError("Network error. Please try again, or email sales@shivacha.com.");
    } finally {
      setSending(false);
    }
  }

  if (step === 3) return <InquirySuccess name={v.name} email={v.email} leadId={leadId} className={className} />;

  return (
    <div className={cn("relative", className)}>
      {/* Progress */}
      <div className="mb-7">
        <div className="mb-3 flex items-center justify-between text-xs font-medium">
          <span className="text-brand-blue">Step {step} of 2</span>
          <span className="text-dim">{step === 1 ? "Your details" : "Your project"}</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-tint/[0.08]" aria-hidden>
          <div className="h-full rounded-full bg-brand-600 transition-[width] duration-500 ease-out" style={{ width: step === 1 ? "50%" : "100%" }} />
        </div>
      </div>

      {step === 1 ? (
        <form key="s1" onSubmit={continueToStep2} noValidate className="animate-[fade-in_.35s_ease] space-y-5" aria-label="Project inquiry, step 1 of 2">
          <Field id="inq-name" label="Full name" required icon={<User className="size-4" />} error={errors.name}>
            <input ref={firstField} id="inq-name" value={v.name} onChange={set("name")} onFocus={onStart} autoComplete="name" className="field h-12 pl-11" placeholder="Jane Doe" aria-invalid={!!errors.name} />
          </Field>
          <Field id="inq-email" label="Work email" required icon={<Mail className="size-4" />} error={errors.email}>
            <input id="inq-email" type="email" inputMode="email" value={v.email} onChange={set("email")} onFocus={onStart} autoComplete="email" className="field h-12 pl-11" placeholder="jane@company.com" aria-invalid={!!errors.email} />
          </Field>
          <Field id="inq-phone" label="WhatsApp / Phone" hint="Optional" error={errors.phone}>
            <div className="flex gap-2">
              <div className="relative shrink-0">
                <Phone className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-dim" aria-hidden />
                <select aria-label="Country calling code" value={dialIso} onChange={(e) => setDialIso(e.target.value)} className="field h-12 w-[112px] pr-2 pl-9 text-sm">
                  {DIAL_COUNTRIES.map((c) => (
                    <option key={c.iso} value={c.iso} title={c.name}>
                      {c.iso} +{c.dial}
                    </option>
                  ))}
                </select>
              </div>
              <input id="inq-phone" type="tel" inputMode="tel" value={v.phone} onChange={set("phone")} onFocus={onStart} autoComplete="tel-national" className="field h-12 min-w-0 flex-1" placeholder="Mobile number" aria-invalid={!!errors.phone} />
            </div>
          </Field>
          <button type="submit" className="btn-primary h-12 w-full text-[15px]">
            Continue <ArrowRight className="size-4" />
          </button>
          <Assurance />
        </form>
      ) : (
        <form key="s2" onSubmit={submit} noValidate className="animate-[fade-in_.35s_ease] space-y-5" aria-label="Project inquiry, step 2 of 2">
          <div className="absolute -left-[9999px]" aria-hidden="true">
            <label>
              Leave this field empty
              <input ref={honeypot} type="text" name="company_fax" tabIndex={-1} autoComplete="off" />
            </label>
          </div>
          <Field id="inq-company" label="Company name" icon={<Building2 className="size-4" />} error={errors.company}>
            <input id="inq-company" value={v.company} onChange={set("company")} autoComplete="organization" className="field h-12 pl-11" placeholder="Company Ltd" />
          </Field>
          <Field id="inq-service" label="Service required" error={errors.service}>
            <select id="inq-service" value={v.service} onChange={set("service")} className="field h-12">
              <option value="">Select a service…</option>
              {SERVICE_OPTIONS.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </Field>
          <fieldset>
            <legend className="label">Estimated budget</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {BUDGET_OPTIONS.map((b) => {
                const on = v.budget === b;
                return (
                  <label
                    key={b}
                    className={cn(
                      "flex h-11 cursor-pointer items-center justify-center rounded-xl border text-sm font-medium transition-all select-none",
                      on ? "border-brand-600 bg-brand-600 text-white shadow-[0_8px_20px_-10px_rgb(1_149_255/0.8)]" : "border-line-strong bg-ink-900 text-muted hover:border-brand-blue/40 hover:text-fg",
                    )}
                  >
                    <input type="radio" name="budget" value={b} checked={on} onChange={set("budget")} className="sr-only" />
                    {b}
                  </label>
                );
              })}
            </div>
          </fieldset>
          <Field id="inq-message" label="Project description" error={errors.message}>
            <textarea id="inq-message" value={v.message} onChange={set("message")} rows={variant === "modal" ? 3 : 4} className="field resize-y" placeholder="What are you building, and what would a great outcome look like?" />
          </Field>
          {siteKey && (
            <div>
              <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
              <div className="cf-turnstile" data-sitekey={siteKey} />
            </div>
          )}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
            <button type="button" onClick={() => goStep(1)} className="btn-ghost h-12 justify-center sm:justify-start">
              <ArrowLeft className="size-4" /> Back
            </button>
            <button type="submit" disabled={sending} className="btn-primary h-12 flex-1 text-[15px]">
              {sending ? <Loader2 className="size-4 animate-spin" /> : null}
              Submit Project Inquiry
            </button>
          </div>
          {serverError && (
            <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 light:text-red-700">
              {serverError}
            </p>
          )}
          <Assurance />
        </form>
      )}
    </div>
  );
}

function Field({ id, label, required, hint, icon, error, children }: { id: string; label: string; required?: boolean; hint?: string; icon?: React.ReactNode; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="label flex items-baseline justify-between">
        <span>
          {label}
          {required && <span className="text-brand-blue"> *</span>}
        </span>
        {hint && <span className="text-[11px] font-normal text-dim">{hint}</span>}
      </label>
      <div className="relative">
        {icon && <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-dim">{icon}</span>}
        {children}
      </div>
      {error && (
        <p id={`${id}-err`} className="mt-1.5 text-xs font-medium text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}

function Assurance() {
  return (
    <p className="flex items-center justify-center gap-1.5 text-center text-xs text-dim">
      <Lock className="size-3" aria-hidden /> Confidential. We reply within one business day. <Link href="/privacy-policy" className="underline hover:text-fg">Privacy</Link>
    </p>
  );
}

export function InquirySuccess({ name, email, leadId, className }: { name: string; email: string; leadId?: string; className?: string }) {
  return (
    <div className={cn("animate-[fade-in_.4s_ease] text-center", className)} role="status">
      <span className="relative mx-auto flex size-16 items-center justify-center rounded-full bg-brand-teal/15 text-brand-teal">
        <span className="absolute inset-0 animate-ping rounded-full bg-brand-teal/20 [animation-iteration-count:2]" aria-hidden />
        <Check className="size-8" strokeWidth={2.5} />
      </span>
      <h3 className="mt-6 text-2xl font-semibold tracking-tight text-fg">Your request has been received.</h3>
      <p className="mx-auto mt-2 max-w-sm text-[15px] text-muted">Our team will review your requirements and contact you shortly.</p>
      <div className="mt-8 rounded-2xl border border-line bg-ink-850 p-5">
        <p className="font-semibold text-fg">Want to speak with us directly?</p>
        <div className="mt-4 flex flex-col justify-center gap-3 sm:flex-row">
          <BookCallButton label="Book a Call" prefill={{ name, email }} className="h-11" source="inquiry_success" />
          <WhatsAppPicker text={`Hi Shivacha, I just sent a project inquiry${leadId ? ` (ref ${leadId})` : ""}.`} location="inquiry_success" className="h-11 w-full sm:w-auto" />
        </div>
      </div>
      {leadId && <p className="mt-5 text-xs text-dim">Reference {leadId} · a confirmation is on its way to {email}</p>}
    </div>
  );
}
