import type { Permission } from "@/lib/auth/permissions";
import { insightCategories } from "@/data/insights";

/**
 * Config-driven CMS resources. Each entry drives the admin list, the edit form, server-side
 * validation/serialisation (lib/admin/resource-actions.ts) and public cache invalidation.
 */

export type FieldType = "text" | "textarea" | "markdown" | "url" | "number" | "datetime" | "select" | "list" | "pairs" | "faqs" | "tags" | "image";

export interface Field {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: readonly (readonly [string, string])[];
  help?: string;
  max?: number;
  group?: "Content" | "Details" | "Media" | "SEO" | "Publishing";
}

export interface Resource {
  key: ResourceKey;
  model: "service" | "product" | "blogPost" | "caseStudy" | "industry" | "technology" | "faq" | "page";
  title: string;
  singular: string;
  description: string;
  permission: Permission;
  titleField: string;
  slug: boolean;
  status: boolean;
  sortable: boolean;
  columns: { field: string; label: string; format?: "option" | "date" | "badge" }[];
  fields: Field[];
  tags: string[];
  publicPath?: (slug: string) => string;
  listPath?: string;
}

export const DIVISIONS = [
  ["WEB3", "Web3"],
  ["FINTECH", "FinTech"],
  ["DIGITAL_ASSETS", "Digital Assets"],
  ["AI", "AI"],
  ["CLOUD", "Cloud"],
  ["DIGITAL", "Digital Products"],
] as const;

export const TECH_CATEGORIES = [
  ["FRONTEND", "Frontend"],
  ["BACKEND", "Backend"],
  ["MOBILE", "Mobile"],
  ["BLOCKCHAIN", "Blockchain"],
  ["WEB3", "Web3"],
  ["AI", "AI"],
  ["CLOUD", "Cloud"],
  ["DATABASE", "Database"],
  ["DEVOPS", "DevOps"],
  ["OTHER", "Other"],
] as const;

export const STATUS_OPTIONS = [
  ["DRAFT", "Draft"],
  ["PUBLISHED", "Published"],
  ["ARCHIVED", "Archived"],
] as const;

const seo: Field[] = [
  { name: "seoTitle", label: "SEO title", type: "text", max: 70, group: "SEO", help: "Up to ~60 characters. Defaults to the page title." },
  { name: "seoDescription", label: "Meta description", type: "textarea", max: 300, group: "SEO", help: "120–160 characters works best." },
  { name: "canonical", label: "Canonical URL", type: "url", group: "SEO", help: "Leave empty to use the page's own URL." },
  { name: "ogImage", label: "Open Graph image", type: "image", group: "SEO" },
];
const publishing = (sortable = true): Field[] => [
  { name: "status", label: "Status", type: "select", options: STATUS_OPTIONS, group: "Publishing", required: true },
  { name: "publishedAt", label: "Publish date (UTC)", type: "datetime", group: "Publishing", help: "Set automatically when first published." },
  ...(sortable ? [{ name: "sortOrder", label: "Sort order", type: "number", group: "Publishing" } as Field] : []),
];

const RESOURCES_LIST: Resource[] = [
  {
    key: "services",
    model: "service",
    title: "Services",
    singular: "Service",
    description: "Service pages. A published entry with the same slug as a built-in service overrides its copy; new slugs create new pages.",
    permission: "services:manage",
    titleField: "name",
    slug: true,
    status: true,
    sortable: true,
    columns: [
      { field: "division", label: "Division", format: "option" },
      { field: "status", label: "Status", format: "badge" },
      { field: "updatedAt", label: "Updated", format: "date" },
    ],
    fields: [
      { name: "name", label: "Service name", type: "text", required: true, group: "Content" },
      { name: "slug", label: "Slug", type: "text", group: "Content", help: "URL: /services/<slug>. Lowercase letters, numbers and hyphens." },
      { name: "division", label: "Division", type: "select", options: DIVISIONS, required: true, group: "Content" },
      { name: "shortDescription", label: "Short description", type: "textarea", max: 300, group: "Content", help: "One-line value proposition." },
      { name: "description", label: "Overview", type: "markdown", group: "Content" },
      { name: "heroTitle", label: "Hero title", type: "text", group: "Content" },
      { name: "heroDescription", label: "Hero description", type: "textarea", group: "Content" },
      { name: "benefits", label: "Use cases / benefits", type: "pairs", group: "Details", help: "One per line: Title | Description" },
      { name: "features", label: "Capabilities / features", type: "pairs", group: "Details", help: "One per line: Title | Description" },
      { name: "technologies", label: "Technologies", type: "list", group: "Details", help: "One technology slug or name per line." },
      { name: "deliverables", label: "Deliverables", type: "list", group: "Details" },
      { name: "process", label: "Process", type: "pairs", group: "Details", help: "One step per line: Step | Description" },
      { name: "faqs", label: "FAQs", type: "faqs", group: "Details", help: "One per line: Question | Answer" },
      { name: "ctaLabel", label: "CTA label", type: "text", group: "Details" },
      { name: "ctaHref", label: "CTA link", type: "url", group: "Details" },
      { name: "heroImage", label: "Hero image", type: "image", group: "Media" },
      { name: "gallery", label: "Gallery images", type: "list", group: "Media", help: "One image URL per line (from the Media library)." },
      ...seo,
      ...publishing(),
    ],
    tags: ["cms:services"],
    publicPath: (s) => `/services/${s}`,
    listPath: "/services",
  },
  {
    key: "products",
    model: "product",
    title: "Products",
    singular: "Product",
    description: "White-label platforms. A published entry with the same slug as a built-in product overrides its copy; new slugs create new product pages.",
    permission: "products:manage",
    titleField: "name",
    slug: true,
    status: true,
    sortable: true,
    columns: [
      { field: "division", label: "Division", format: "option" },
      { field: "category", label: "Category" },
      { field: "status", label: "Status", format: "badge" },
      { field: "updatedAt", label: "Updated", format: "date" },
    ],
    fields: [
      { name: "name", label: "Product name", type: "text", required: true, group: "Content" },
      { name: "slug", label: "Slug", type: "text", group: "Content", help: "URL: /products/<slug>" },
      { name: "category", label: "Category", type: "text", group: "Content", help: "e.g. Crypto Exchange, Neo-banking" },
      { name: "division", label: "Division", type: "select", options: DIVISIONS, required: true, group: "Content" },
      { name: "heroTitle", label: "Tagline / hero title", type: "text", group: "Content" },
      { name: "heroDescription", label: "Hero description", type: "textarea", group: "Content" },
      { name: "description", label: "Description", type: "markdown", group: "Content" },
      { name: "features", label: "Features", type: "list", group: "Details" },
      { name: "modules", label: "Modules", type: "pairs", group: "Details", help: "One per line: Module | Description" },
      { name: "architecture", label: "Architecture layers", type: "pairs", group: "Details", help: "One per line: Layer | item, item, item" },
      { name: "techStack", label: "Technology stack", type: "list", group: "Details" },
      { name: "integrations", label: "Integrations", type: "list", group: "Details" },
      { name: "deployment", label: "Deployment options", type: "list", group: "Details" },
      { name: "customization", label: "Customisation options", type: "list", group: "Details" },
      { name: "timeline", label: "Typical implementation timeline", type: "text", group: "Details", help: "Software implementation only; excludes third-party approvals." },
      { name: "demoCtaLabel", label: "Demo CTA label", type: "text", group: "Details" },
      { name: "leadCtaLabel", label: "Lead CTA label", type: "text", group: "Details" },
      { name: "relatedServices", label: "Related services", type: "list", group: "Details", help: "Service slugs, one per line." },
      { name: "faqs", label: "FAQs", type: "faqs", group: "Details", help: "One per line: Question | Answer" },
      { name: "screenshots", label: "Screenshots", type: "list", group: "Media", help: "Image URLs, one per line. Leave empty to show the built-in interface preview." },
      { name: "mockups", label: "Mockups", type: "list", group: "Media" },
      ...seo,
      ...publishing(),
    ],
    tags: ["cms:products"],
    publicPath: (s) => `/products/${s}`,
    listPath: "/products",
  },
  {
    key: "blog",
    model: "blogPost",
    title: "Blog",
    singular: "Post",
    description: "Articles published under /insights. Set a future publish date on a published post to schedule it.",
    permission: "blog:manage",
    titleField: "title",
    slug: true,
    status: true,
    sortable: false,
    columns: [
      { field: "category", label: "Category", format: "option" },
      { field: "status", label: "Status", format: "badge" },
      { field: "publishedAt", label: "Publish date", format: "date" },
    ],
    fields: [
      { name: "title", label: "Title", type: "text", required: true, group: "Content" },
      { name: "slug", label: "Slug", type: "text", group: "Content", help: "URL: /insights/<slug>" },
      { name: "excerpt", label: "Excerpt", type: "textarea", max: 400, group: "Content" },
      { name: "content", label: "Content", type: "markdown", group: "Content", help: "Markdown: ## Heading, blank line between paragraphs, - bullet lists." },
      { name: "authorName", label: "Author", type: "text", group: "Details" },
      { name: "category", label: "Category", type: "select", options: insightCategories.map((c) => [c.slug, c.name] as const), group: "Details", required: true },
      { name: "tags", label: "Tags", type: "tags", group: "Details", help: "Comma separated." },
      { name: "readingTime", label: "Reading time (minutes)", type: "number", group: "Details", help: "Calculated from the content when empty." },
      { name: "featuredImage", label: "Featured image", type: "image", group: "Media" },
      ...seo,
      ...publishing(false),
    ],
    tags: ["cms:blog"],
    publicPath: (s) => `/insights/${s}`,
    listPath: "/insights",
  },
  {
    key: "case-studies",
    model: "caseStudy",
    title: "Case Studies",
    singular: "Case study",
    description: "Only publish real, verified and approved information. Never add unverified clients, metrics or testimonials.",
    permission: "caseStudies:manage",
    titleField: "title",
    slug: true,
    status: true,
    sortable: true,
    columns: [
      { field: "industry", label: "Industry" },
      { field: "status", label: "Status", format: "badge" },
      { field: "updatedAt", label: "Updated", format: "date" },
    ],
    fields: [
      { name: "title", label: "Title", type: "text", required: true, group: "Content" },
      { name: "slug", label: "Slug", type: "text", group: "Content", help: "URL: /work/<slug>" },
      { name: "client", label: "Client name", type: "text", group: "Content", help: "Only when the client relationship is verified and publicly approved. Leave empty for reference architectures." },
      { name: "industry", label: "Industry", type: "text", group: "Content" },
      { name: "challenge", label: "Challenge", type: "markdown", group: "Content" },
      { name: "solution", label: "Solution", type: "markdown", group: "Content" },
      { name: "architecture", label: "Architecture", type: "markdown", group: "Content" },
      { name: "technologies", label: "Technologies", type: "list", group: "Details" },
      { name: "deliverables", label: "Deliverables", type: "list", group: "Details" },
      { name: "results", label: "Results", type: "markdown", group: "Details", help: "Describe verified outcomes only." },
      { name: "metrics", label: "Metrics", type: "pairs", group: "Details", help: "Only real, verified metrics. One per line: Label | Value" },
      { name: "testimonial", label: "Testimonial", type: "textarea", group: "Details", help: "Only a real, approved quote with the client's permission." },
      { name: "images", label: "Images", type: "list", group: "Media", help: "Image URLs, one per line." },
      ...seo,
      ...publishing(),
    ],
    tags: ["cms:case-studies"],
    publicPath: (s) => `/work/${s}`,
    listPath: "/work",
  },
  {
    key: "industries",
    model: "industry",
    title: "Industries",
    singular: "Industry",
    description: "Industry pages under /industries.",
    permission: "industries:manage",
    titleField: "name",
    slug: true,
    status: true,
    sortable: true,
    columns: [
      { field: "status", label: "Status", format: "badge" },
      { field: "updatedAt", label: "Updated", format: "date" },
    ],
    fields: [
      { name: "name", label: "Industry name", type: "text", required: true, group: "Content" },
      { name: "slug", label: "Slug", type: "text", group: "Content", help: "URL: /industries/<slug>" },
      { name: "heroTitle", label: "Hero title", type: "text", group: "Content" },
      { name: "heroDescription", label: "Hero description", type: "textarea", group: "Content" },
      { name: "description", label: "Summary", type: "textarea", group: "Content" },
      { name: "content", label: "Content", type: "markdown", group: "Content" },
      { name: "services", label: "Related services", type: "list", group: "Details", help: "Service slugs, one per line." },
      { name: "products", label: "Related products", type: "list", group: "Details", help: "Product slugs, one per line." },
      { name: "technologies", label: "Technologies", type: "list", group: "Details" },
      { name: "faqs", label: "FAQs", type: "faqs", group: "Details", help: "One per line: Question | Answer" },
      ...seo,
      ...publishing(),
    ],
    tags: ["cms:industries"],
    publicPath: (s) => `/industries/${s}`,
    listPath: "/industries",
  },
  {
    key: "technologies",
    model: "technology",
    title: "Technologies",
    singular: "Technology",
    description: "Technology pages under /technologies, grouped by category.",
    permission: "technologies:manage",
    titleField: "name",
    slug: true,
    status: true,
    sortable: true,
    columns: [
      { field: "category", label: "Category", format: "option" },
      { field: "status", label: "Status", format: "badge" },
      { field: "updatedAt", label: "Updated", format: "date" },
    ],
    fields: [
      { name: "name", label: "Name", type: "text", required: true, group: "Content" },
      { name: "slug", label: "Slug", type: "text", group: "Content", help: "URL: /technologies/<slug>" },
      { name: "category", label: "Category", type: "select", options: TECH_CATEGORIES, required: true, group: "Content" },
      { name: "description", label: "Description", type: "markdown", group: "Content" },
      { name: "website", label: "Official website", type: "url", group: "Content" },
      { name: "seoTitle", label: "SEO title", type: "text", max: 70, group: "SEO" },
      { name: "seoDescription", label: "Meta description", type: "textarea", max: 300, group: "SEO" },
      ...publishing(),
    ],
    tags: ["cms:technologies"],
    publicPath: (s) => `/technologies/${s}`,
    listPath: "/technologies",
  },
  {
    key: "faqs",
    model: "faq",
    title: "FAQs",
    singular: "FAQ",
    description: "Questions shown on service and product pages (by slug) and in the general FAQ.",
    permission: "faqs:manage",
    titleField: "question",
    slug: false,
    status: true,
    sortable: true,
    columns: [
      { field: "category", label: "Category" },
      { field: "serviceSlug", label: "Service" },
      { field: "productSlug", label: "Product" },
      { field: "status", label: "Status", format: "badge" },
    ],
    fields: [
      { name: "question", label: "Question", type: "text", required: true, group: "Content" },
      { name: "answer", label: "Answer", type: "markdown", required: true, group: "Content" },
      { name: "category", label: "Category", type: "text", group: "Details", help: "e.g. Pricing, Security, Process" },
      { name: "serviceSlug", label: "Service slug", type: "text", group: "Details", help: "Show on /services/<slug>." },
      { name: "productSlug", label: "Product slug", type: "text", group: "Details", help: "Show on /products/<slug>." },
      { name: "status", label: "Status", type: "select", options: STATUS_OPTIONS, required: true, group: "Publishing" },
      { name: "sortOrder", label: "Sort order", type: "number", group: "Publishing" },
    ],
    tags: ["cms:faqs"],
  },
  {
    key: "pages",
    model: "page",
    title: "Pages",
    singular: "Page",
    description: "Custom pages built from sections, published at /<slug>.",
    permission: "pages:manage",
    titleField: "title",
    slug: true,
    status: true,
    sortable: false,
    columns: [
      { field: "slug", label: "URL" },
      { field: "status", label: "Status", format: "badge" },
      { field: "updatedAt", label: "Updated", format: "date" },
    ],
    fields: [
      { name: "title", label: "Page title", type: "text", required: true, group: "Content" },
      { name: "slug", label: "Slug", type: "text", group: "Content", help: "URL: /<slug>. Cannot match an existing site route." },
      { name: "heroTitle", label: "Hero title", type: "text", group: "Content" },
      { name: "heroDescription", label: "Hero description", type: "textarea", group: "Content" },
      { name: "content", label: "Intro content", type: "markdown", group: "Content" },
      { name: "ctaLabel", label: "CTA label", type: "text", group: "Content" },
      { name: "ctaHref", label: "CTA link", type: "url", group: "Content" },
      ...seo,
      ...publishing(false),
    ],
    tags: ["cms:pages"],
    publicPath: (s) => `/${s}`,
  },
];

export type ResourceKey = "services" | "products" | "blog" | "case-studies" | "industries" | "technologies" | "faqs" | "pages";
export const RESOURCES = Object.fromEntries(RESOURCES_LIST.map((r) => [r.key, r])) as Record<ResourceKey, Resource>;
export const isResourceKey = (k: string): k is ResourceKey => k in RESOURCES;

/* ───────── value (de)serialisation shared by the form and the action ───────── */

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

/** Renders a stored value into the text shown in a form control. */
export function toFormValue(field: Field, v: unknown): string {
  if (v == null) return "";
  switch (field.type) {
    case "list":
      return Array.isArray(v) ? v.map(String).join("\n") : "";
    case "tags":
      return Array.isArray(v) ? v.join(", ") : "";
    case "pairs":
      return Array.isArray(v) ? v.map((p: { title?: string; description?: string }) => `${p.title ?? ""} | ${p.description ?? ""}`).join("\n") : "";
    case "faqs":
      return Array.isArray(v) ? v.map((p: { q?: string; a?: string }) => `${p.q ?? ""} | ${p.a ?? ""}`).join("\n") : "";
    case "datetime":
      return v instanceof Date ? v.toISOString().slice(0, 16) : String(v).slice(0, 16);
    default:
      return String(v);
  }
}

const lines = (s: string) =>
  s
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 200);
const split2 = (l: string) => {
  const i = l.indexOf("|");
  return i < 0 ? [l.trim(), ""] : [l.slice(0, i).trim(), l.slice(i + 1).trim()];
};

/** Parses a submitted form value into the stored shape. Returns [value, error?]. */
export function fromFormValue(field: Field, raw: string): [unknown, string?] {
  const s = raw.trim();
  if (field.required && !s) return [null, "Required"];
  if (field.max && s.length > field.max) return [null, `Keep it under ${field.max} characters`];
  if (s.length > 100_000) return [null, "Too long"];
  switch (field.type) {
    case "number": {
      if (!s) return [field.name === "sortOrder" ? 0 : null];
      const n = Number(s);
      return Number.isInteger(n) && n >= -100000 && n <= 100000 ? [n] : [null, "Enter a whole number"];
    }
    case "datetime": {
      if (!s) return [null];
      const d = new Date(s.length === 16 ? `${s}:00Z` : s);
      return Number.isNaN(d.getTime()) ? [null, "Invalid date"] : [d];
    }
    case "select":
      if (!s) return [null];
      return field.options?.some(([v]) => v === s) ? [s] : [null, "Choose a valid option"];
    case "url":
    case "image":
      if (!s) return [null];
      return /^(https?:\/\/|\/(?!\/))[^\s<>"']*$/i.test(s) ? [s.slice(0, 2000)] : [null, "Use an https:// URL or a site path starting with /"];
    case "list":
      return [s ? lines(s) : null];
    case "tags":
      return [
        s
          ? s
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean)
              .slice(0, 30)
          : [],
      ];
    case "pairs":
      return [s ? lines(s).map((l) => (([title, description]) => ({ title, description }))(split2(l))) : null];
    case "faqs":
      return [s ? lines(s).map((l) => (([q, a]) => ({ q, a }))(split2(l))) : null];
    default:
      return [s || null];
  }
}
