/**
 * Shared content model for the Shivacha website.
 * Every page is rendered from these structures — UI components never hold copy.
 */

export type DivisionId = "ai" | "digital" | "fintech" | "web3" | "cloud";

export interface FAQ {
  q: string;
  a: string;
}

/** A titled item with a supporting sentence. Authored as "Title — description" strings and parsed by lib/content. */
export interface Point {
  title: string;
  description: string;
}

export interface ArchitectureLayer {
  name: string;
  items: string[];
}

export interface Division {
  id: DivisionId;
  slug: DivisionId;
  name: string; // "Shivacha AI"
  short: string; // "AI"
  tagline: string;
  description: string;
  color: string; // css color token name
  icon: string;
  cta: string;
  ctaHref: string;
}

export interface Capability {
  division: DivisionId;
  title: string;
  metaTitle: string;
  metaDescription: string;
  h1: string;
  lede: string;
  overview: string[];
  problems: Point[];
  pillars: { title: string; description: string; groups: string[] }[];
  architecture: ArchitectureLayer[];
  approach: Point[];
  outcomes: Point[];
  faqs: FAQ[];
  industries: string[];
  technologies: string[];
  products: string[];
}

export interface ServiceGroup {
  id: string;
  division: DivisionId;
  name: string;
  /** Sub-track inside a division, e.g. "Web2 FinTech", "Web3 FinTech", "Hybrid FinTech". */
  track?: string;
  intro: string;
  architecture: ArchitectureLayer[];
  process: Point[];
  considerations: Point[];
  faqs: FAQ[];
  technologies: string[];
  industries: string[];
  products: string[];
  team?: string;
}

export interface Service {
  slug: string;
  name: string;
  group: string; // ServiceGroup id
  summary: string; // one-line value proposition, used as meta description
  overview: string; // unique overview paragraph
  useCases: Point[];
  capabilities: Point[];
  faqs: FAQ[];
  technologies?: string[];
  industries?: string[];
  products?: string[];
  related?: string[];
  /** Optional page-specific note, e.g. regulatory positioning. */
  note?: string;
  keywords?: string[];
}

export type ProductCta = "live-demo" | "request-demo" | "book-demo";

export type PreviewKind =
  | "banking"
  | "payments"
  | "wallet"
  | "cards"
  | "lending"
  | "exchange"
  | "tokenization"
  | "ai-agent"
  | "ai-chat"
  | "analytics"
  | "crm"
  | "commerce"
  | "booking"
  | "learning"
  | "logistics"
  | "explorer"
  | "defi"
  | "dao"
  | "portal";

export interface Product {
  slug: string;
  name: string;
  division: DivisionId;
  category: string;
  tagline: string;
  description: string;
  heroImage: string;
  screenshots: string[];
  demoUrl?: string;
  videoUrl?: string;
  features: string[];
  technologies: string[];
  integrations: string[];
  industries: string[];
  deploymentOptions: string[];
  customizationOptions: string[];
  security: string[];
  faqs: FAQ[];
  relatedProducts: string[];
  caseStudies: string[];
  requestDemo: boolean;
  ctaType: ProductCta;
  // Extended content
  problem: string;
  solution: string;
  modules: Point[];
  useCases: Point[];
  architecture: ArchitectureLayer[];
  preview: PreviewKind;
  services: string[];
}

export interface Solution {
  slug: string;
  name: string;
  h1: string;
  summary: string;
  audience: string;
  overview: string[];
  challenges: Point[];
  approach: Point[];
  deliverables: string[];
  services: string[];
  products: string[];
  technologies: string[];
  industries: string[];
  faqs: FAQ[];
  divisions: DivisionId[];
  cta?: string;
}

export interface Industry {
  slug: string;
  name: string;
  h1: string;
  summary: string;
  overview: string[];
  challenges: Point[];
  solutions: Point[];
  services: string[];
  products: string[];
  technologies: string[];
  solutionsLinks: string[];
  faqs: FAQ[];
  divisions: DivisionId[];
}

export type TechCategory =
  | "frontend"
  | "backend"
  | "mobile"
  | "ai"
  | "blockchain"
  | "web3-stack"
  | "token-standards"
  | "cloud"
  | "devops"
  | "databases"
  | "data"
  | "fintech"
  | "security"
  | "apis";

export interface Technology {
  slug: string;
  name: string;
  category: TechCategory;
  summary: string;
  overview: string;
  strengths: string[];
  howWeUse: Point[];
  considerations?: string;
  pairsWith: string[];
  services: string[];
  divisions: DivisionId[];
}

export interface Team {
  slug: string;
  name: string;
  division: DivisionId | "product";
  summary: string;
  overview: string;
  roles: string[];
  responsibilities: string[];
  skills: string[];
  services: string[];
  technologies: string[];
  idealFor: string[];
  faqs: FAQ[];
}

export interface EngagementModel {
  name: string;
  size: string;
  description: string;
  bestFor: string;
  composition: string;
}

export interface CaseStudy {
  slug: string;
  title: string;
  division: DivisionId;
  kind: "reference-architecture" | "client";
  /** Only set when the client relationship is verified and publicly approved. */
  client?: string;
  summary: string;
  challenge: string;
  context: string;
  approach: Point[];
  architecture: ArchitectureLayer[];
  technologies: string[];
  implementation: Point[];
  outcome: string;
  lessons: string[];
  services: string[];
  products: string[];
  industries: string[];
}

export interface Market {
  slug: string;
  name: string;
  type: "region" | "country";
  region?: string;
  h1: string;
  summary: string;
  overview: string[];
  focus: Point[];
  collaboration: string;
  industries: string[];
  services: string[];
  countries?: string[];
}

export type ResourceType =
  | "guide"
  | "whitepaper"
  | "report"
  | "architecture"
  | "technology-guide"
  | "product-brochure"
  | "case-study"
  | "checklist"
  | "template"
  | "faq"
  | "webinar"
  | "video";

export interface ResourceCategory {
  slug: string;
  name: string;
  type: ResourceType;
  description: string;
}

export interface Resource {
  slug: string;
  title: string;
  type: ResourceType;
  category: string; // ResourceCategory slug
  division: DivisionId;
  summary: string;
  readingTime: string;
  difficulty: "Introductory" | "Intermediate" | "Advanced";
  gated: boolean;
  featured?: boolean;
  date: string;
  contents: string[];
  audience: string;
  takeaways: string[];
  technologies: string[];
  industries: string[];
  services: string[];
}

export interface InsightSection {
  heading: string;
  body: string[];
  bullets?: string[];
}

export interface Insight {
  slug: string;
  title: string;
  category: string; // InsightCategory slug
  division?: DivisionId;
  excerpt: string;
  date: string;
  readingTime: string;
  author: string;
  sections: InsightSection[];
  services: string[];
  technologies: string[];
  tags: string[];
}

export interface InsightCategory {
  slug: string;
  name: string;
  description: string;
}

export interface CareerDepartment {
  slug: string;
  name: string;
  description: string;
  disciplines: string[];
}

export interface Job {
  slug: string;
  title: string;
  department: string;
  location: string;
  type: string;
  summary: string;
  responsibilities: string[];
  requirements: string[];
  niceToHave: string[];
}

export interface Leader {
  slug: string;
  name: string;
  role: string;
  bio: string[];
  linkedin?: string;
  verified: boolean;
}

export interface NavLink {
  label: string;
  href: string;
  description?: string;
}

export interface NavColumn {
  title: string;
  links: NavLink[];
}

export interface MegaMenu {
  label: string;
  href: string;
  columns: NavColumn[];
  feature?: { title: string; description: string; href: string; cta: string };
}
