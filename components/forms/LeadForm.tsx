"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { CheckCircle2, Loader2, Paperclip } from "lucide-react";
import { formOptions, leadSchemas, type LeadType, validateLead, MAX_UPLOAD_FILES } from "@/lib/validation";
import { track, type AnalyticsEvent } from "@/lib/analytics";
import { cn } from "@/lib/cn";

type FieldDef =
  | { name: string; label: string; type: "text" | "email" | "tel" | "url"; placeholder?: string; autoComplete?: string; half?: boolean }
  | { name: string; label: string; type: "select"; options: string[]; half?: boolean }
  | { name: string; label: string; type: "textarea"; placeholder?: string; rows?: number }
  | { name: string; label: string; type: "file" };

const F = {
  name: { name: "name", label: "Name", type: "text", autoComplete: "name", half: true },
  email: { name: "email", label: "Business email", type: "email", autoComplete: "email", half: true },
  company: { name: "company", label: "Company", type: "text", autoComplete: "organization", half: true },
  phone: { name: "phone", label: "Phone", type: "tel", autoComplete: "tel", half: true },
  country: { name: "country", label: "Country", type: "text", autoComplete: "country-name", half: true },
  website: { name: "website", label: "Company website", type: "url", placeholder: "https://", half: true },
  role: { name: "role", label: "Role", type: "text", autoComplete: "organization-title", half: true },
  companySize: { name: "companySize", label: "Company size", type: "select", options: formOptions.companySize, half: true },
  industry: { name: "industry", label: "Industry", type: "select", options: formOptions.industry, half: true },
  requirement: { name: "requirement", label: "Requirement", type: "select", options: formOptions.requirement, half: true },
  division: { name: "division", label: "Division", type: "select", options: formOptions.division, half: true },
  budget: { name: "budget", label: "Budget", type: "select", options: formOptions.budget, half: true },
  timeline: { name: "timeline", label: "Timeline", type: "select", options: formOptions.timeline, half: true },
  teamSize: { name: "teamSize", label: "Team size", type: "select", options: formOptions.teamSize, half: true },
  message: { name: "message", label: "Project description", type: "textarea", placeholder: "What are you building? Where are you today? What does success look like?", rows: 5 },
  documents: { name: "documents", label: "Upload documents (optional)", type: "file" },
} satisfies Record<string, FieldDef>;

const variants: Record<LeadType, { fields: FieldDef[]; cta: string; event: AnalyticsEvent; success: string }> = {
  project: {
    fields: [F.name, F.email, F.company, F.phone, F.country, F.website, F.companySize, F.industry, F.requirement, F.division, F.budget, F.timeline, F.message, F.documents],
    cta: "Start the Conversation",
    event: "start_project",
    success: "Thank you. A Shivacha lead will review your project and reply within two business days.",
  },
  contact: {
    fields: [F.name, F.email, F.company, F.phone, F.country, { ...F.message, label: "Message", placeholder: "How can we help?" }],
    cta: "Send Message",
    event: "contact_submit",
    success: "Thank you for reaching out. We will reply within two business days.",
  },
  demo: {
    fields: [F.name, F.email, F.company, F.role, F.country, { name: "product", label: "Product", type: "text", half: true }, { ...F.message, label: "What would you like to see?", placeholder: "Your use case, markets and any integration requirements.", rows: 4 }],
    cta: "Request Demo",
    event: "demo_request",
    success: "Thank you. We will contact you to schedule a tailored product demo.",
  },
  meeting: {
    fields: [F.name, F.email, F.company, F.country, F.division, { name: "preferredTime", label: "Preferred days / times (with time zone)", type: "text", half: true }, { ...F.message, label: "Agenda", placeholder: "What would you like to discuss?", rows: 4 }],
    cta: "Request Meeting",
    event: "book_meeting",
    success: "Thank you. We will send calendar options for your preferred times.",
  },
  hire: {
    fields: [F.name, F.email, F.company, F.country, { name: "team", label: "Team or roles needed", type: "text", placeholder: "e.g. Smart contract team, 2 AI engineers", half: true }, F.teamSize, F.timeline, { ...F.message, label: "Context", placeholder: "Your product, stack and what the team will own.", rows: 4 }],
    cta: "Build This Team",
    event: "start_project",
    success: "Thank you. An engineering advisor will contact you to discuss team composition.",
  },
  resource: {
    fields: [F.name, F.email, F.company, F.country, F.role],
    cta: "Download Resource",
    event: "resource_request",
    success: "Thank you. We will email the resource to your business address.",
  },
  newsletter: { fields: [F.email], cta: "Subscribe", event: "newsletter_signup", success: "Subscribed. Thank you." },
  job: {
    fields: [F.name, F.email, F.phone, F.country, { name: "linkedin", label: "LinkedIn or portfolio URL", type: "url", half: true }, { ...F.message, label: "Why this role?", placeholder: "Relevant experience and what you want to work on.", rows: 5 }],
    cta: "Submit Application",
    event: "job_apply",
    success: "Thank you for applying. We review every application and will be in touch if there is a fit.",
  },
};

export function LeadForm({ type, hidden = {}, className, compact }: { type: LeadType; hidden?: Record<string, string>; className?: string; compact?: boolean }) {
  const v = variants[type];
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState("");
  const [prefill, setPrefill] = useState<Record<string, string>>({});
  const [fileNames, setFileNames] = useState<string[]>([]);
  const startedAt = useRef(Date.now());
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const map: Record<string, string> = {};
    const division = p.get("division");
    if (division) {
      const match = formOptions.division.find((d) => d.toLowerCase() === division.toLowerCase());
      if (match) map.division = match;
    }
    for (const k of ["product", "team", "job"]) if (p.get(k)) map[k] = p.get(k)!.slice(0, 120);
    setPrefill(map);
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    data.set("source", window.location.pathname);
    const obj = Object.fromEntries([...data.entries()].filter(([, val]) => typeof val === "string")) as Record<string, string>;
    const check = validateLead(type, obj);
    setErrors(check.errors);
    if (!check.ok) {
      const first = Object.keys(check.errors)[0];
      form.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    setStatus("sending");
    setServerError("");
    try {
      const res = await fetch("/api/lead", { method: "POST", body: data });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; errors?: Record<string, string> };
      if (!res.ok || !json.ok) {
        if (json.errors) setErrors(json.errors);
        setServerError(json.error ?? "Something went wrong. Please try again or email contact@shivacha.com.");
        setStatus("error");
        return;
      }
      track(v.event, { form: type, division: obj.division, industry: obj.industry, budget: obj.budget, product: obj.product || hidden.product, resource: hidden.resource });
      setStatus("done");
    } catch {
      setServerError("Network error. Please try again or email contact@shivacha.com.");
      setStatus("error");
    }
  }

  if (status === "done")
    return (
      <div className={cn("card flex flex-col items-start gap-3 p-8", className)} role="status">
        <CheckCircle2 className="size-6 text-brand-emerald" />
        <p className="text-lg font-medium text-fg">Received.</p>
        <p className="text-sm text-muted">{v.success}</p>
      </div>
    );

  return (
    <form onSubmit={onSubmit} noValidate className={cn("grid gap-4 sm:grid-cols-2", className)} aria-label={`${v.cta} form`}>
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="_t" value={startedAt.current} />
      {Object.entries(hidden).map(([k, val]) => (
        <input key={k} type="hidden" name={k} value={val} />
      ))}
      <div className="absolute -left-[9999px]" aria-hidden="true">
        <label>
          Leave this field empty
          <input type="text" name="company_fax" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      {v.fields.map((f) => {
        if (hidden[f.name] !== undefined) return null;
        const id = `${type}-${f.name}`;
        const err = errors[f.name];
        const full = f.type === "textarea" || f.type === "file" || !("half" in f && f.half) || compact;
        return (
          <div key={f.name} className={cn(full && "sm:col-span-2")}>
            <label htmlFor={id} className="label">
              {f.label}
              {leadRequired(type, f.name) && <span className="text-brand-blue"> *</span>}
            </label>
            {f.type === "select" ? (
              <select id={id} name={f.name} className="field" defaultValue={prefill[f.name] ?? ""} key={prefill[f.name] ?? "none"} aria-invalid={!!err} aria-describedby={err ? `${id}-err` : undefined}>
                <option value="">Select…</option>
                {f.options.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            ) : f.type === "textarea" ? (
              <textarea id={id} name={f.name} rows={f.rows ?? 4} placeholder={f.placeholder} className="field resize-y" aria-invalid={!!err} aria-describedby={err ? `${id}-err` : undefined} />
            ) : f.type === "file" ? (
              <label htmlFor={id} className="field flex cursor-pointer items-center gap-3 text-muted">
                <Paperclip className="size-4" />
                <span className="truncate">{fileNames.length ? fileNames.join(", ") : `Up to ${MAX_UPLOAD_FILES} files · PDF, DOC, PPT, XLS, PNG, JPG · 10 MB total`}</span>
                <input
                  id={id}
                  name="documents"
                  type="file"
                  multiple
                  className="sr-only"
                  accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.png,.jpg,.jpeg"
                  onChange={(e) => setFileNames([...(e.target.files ?? [])].map((x) => x.name))}
                />
              </label>
            ) : (
              <input
                id={id}
                name={f.name}
                type={f.type}
                placeholder={"placeholder" in f ? f.placeholder : undefined}
                autoComplete={"autoComplete" in f ? f.autoComplete : undefined}
                defaultValue={prefill[f.name]}
                key={prefill[f.name] ?? "none"}
                className="field"
                aria-invalid={!!err}
                aria-describedby={err ? `${id}-err` : undefined}
              />
            )}
            {err && (
              <p id={`${id}-err`} className="mt-1.5 text-xs text-red-400">
                {err}
              </p>
            )}
          </div>
        );
      })}

      {siteKey && (
        <div className="sm:col-span-2">
          <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
          <div className="cf-turnstile" data-sitekey={siteKey} data-theme="dark" />
        </div>
      )}

      <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-dim">
          We use your details only to respond to this request. See our{" "}
          <a href="/privacy-policy" className="underline hover:text-fg">
            privacy policy
          </a>
          .
        </p>
        <button type="submit" className="btn-primary" disabled={status === "sending"}>
          {status === "sending" && <Loader2 className="size-4 animate-spin" />}
          {v.cta}
        </button>
      </div>
      {serverError && (
        <p className="text-sm text-red-400 sm:col-span-2" role="alert">
          {serverError}
        </p>
      )}
    </form>
  );
}

const leadRequired = (type: LeadType, name: string) => !!leadSchemas[type][name]?.required;
