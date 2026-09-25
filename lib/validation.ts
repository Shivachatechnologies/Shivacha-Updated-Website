/** Shared, dependency-free validation used by both client forms and the /api/lead route. */

export type LeadType = "project" | "contact" | "demo" | "meeting" | "hire" | "resource" | "newsletter" | "job";

type Rule = { required?: boolean; max: number; min?: number; kind?: "email" | "url" | "phone" | "text" };

const base: Record<string, Rule> = {
  name: { required: true, min: 2, max: 100 },
  email: { required: true, max: 160, kind: "email" },
  company: { max: 140 },
  phone: { max: 40, kind: "phone" },
  country: { max: 80 },
  website: { max: 200, kind: "url" },
  companySize: { max: 40 },
  industry: { max: 60 },
  requirement: { max: 80 },
  division: { max: 40 },
  budget: { max: 40 },
  timeline: { max: 40 },
  message: { max: 5000 },
  role: { max: 100 },
  product: { max: 120 },
  resource: { max: 160 },
  team: { max: 120 },
  teamSize: { max: 40 },
  job: { max: 120 },
  linkedin: { max: 200, kind: "url" },
  preferredTime: { max: 120 },
  source: { max: 200 },
};

export const leadSchemas: Record<LeadType, Record<string, Rule>> = {
  project: { ...base, company: { ...base.company, required: true }, message: { ...base.message, required: true, min: 20 } },
  contact: { name: base.name, email: base.email, company: base.company, phone: base.phone, country: base.country, message: { ...base.message, required: true, min: 10 }, source: base.source },
  demo: { name: base.name, email: base.email, company: { ...base.company, required: true }, country: base.country, role: base.role, product: { ...base.product, required: true }, message: base.message, source: base.source },
  meeting: { name: base.name, email: base.email, company: { ...base.company, required: true }, country: base.country, division: base.division, preferredTime: base.preferredTime, message: base.message, source: base.source },
  hire: { name: base.name, email: base.email, company: { ...base.company, required: true }, country: base.country, team: { ...base.team, required: true }, teamSize: base.teamSize, timeline: base.timeline, message: base.message, source: base.source },
  resource: { name: base.name, email: base.email, company: { ...base.company, required: true }, country: { ...base.country, required: true }, role: { ...base.role, required: true }, resource: { ...base.resource, required: true }, source: base.source },
  newsletter: { email: base.email, source: base.source },
  job: { name: base.name, email: base.email, phone: base.phone, country: base.country, linkedin: base.linkedin, job: { ...base.job, required: true }, message: { ...base.message, required: true, min: 20 }, source: base.source },
};

const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i;
const URL_RE = /^(https?:\/\/)?[\w.-]+\.[a-z]{2,}(\/[^\s]*)?$/i;
const PHONE = /^[+()\d\s.-]{6,40}$/;

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export const clean = (v: unknown) => (typeof v === "string" ? v.replace(CONTROL, "").trim() : "");

export function validateLead(type: LeadType, data: Record<string, unknown>) {
  const schema = leadSchemas[type];
  const errors: Record<string, string> = {};
  const values: Record<string, string> = {};
  for (const [key, rule] of Object.entries(schema)) {
    const v = clean(data[key]);
    if (!v) {
      if (rule.required) errors[key] = "This field is required.";
      continue;
    }
    if (v.length > rule.max) errors[key] = `Please keep this under ${rule.max} characters.`;
    else if (rule.min && v.length < rule.min) errors[key] = `Please enter at least ${rule.min} characters.`;
    else if (rule.kind === "email" && !EMAIL.test(v)) errors[key] = "Please enter a valid email address.";
    else if (rule.kind === "url" && !URL_RE.test(v)) errors[key] = "Please enter a valid URL.";
    else if (rule.kind === "phone" && !PHONE.test(v)) errors[key] = "Please enter a valid phone number.";
    values[key] = v;
  }
  return { ok: Object.keys(errors).length === 0, errors, values };
}

export const ALLOWED_UPLOAD_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "image/png",
  "image/jpeg",
];
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_UPLOAD_FILES = 5;

export const formOptions = {
  companySize: ["1–10", "11–50", "51–200", "201–1,000", "1,001–5,000", "5,000+"],
  industry: ["FinTech", "Banking", "Payments", "Insurance", "Healthcare", "E-commerce", "Real Estate", "Logistics", "Education", "Travel & Hospitality", "Media & Gaming", "SaaS", "Government", "Energy", "Agriculture", "Other"],
  requirement: ["Custom engineering", "Product engineering", "Ready-to-launch product", "Dedicated engineering team", "Technology transformation", "Consulting / architecture review", "Not sure yet"],
  division: ["AI", "Digital", "FinTech", "Web3", "Cloud", "Multiple / not sure"],
  budget: ["Under $25k", "$25k–$75k", "$75k–$150k", "$150k–$500k", "$500k+", "Not defined yet"],
  timeline: ["As soon as possible", "Within 1 month", "1–3 months", "3–6 months", "Exploring"],
  teamSize: ["1 specialist", "2–4 (pod)", "5–10 (team)", "10+", "Not sure"],
};
