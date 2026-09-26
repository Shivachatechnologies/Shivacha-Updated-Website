import type { DivisionId, Point } from "./types";

/**
 * Division-level facts used to build direct, citable answers on every service page
 * ("what is it, who is it for, how long, what drives cost, how to start"). Deliberately
 * factual: no prices, no guarantees — cost and timeline are expressed as drivers and typical ranges.
 */
export interface DivisionAnswers {
  whoFor: string;
  timeline: string;
  costFactors: string[];
  security: Point[];
}

export const divisionAnswers: Record<DivisionId, DivisionAnswers> = {
  ai: {
    whoFor: "product companies adding AI features, enterprises automating knowledge work, and teams whose AI pilot needs to become a dependable production system",
    timeline: "A scoped proof of value usually takes 4–8 weeks; a production system with evaluation, integrations and guardrails typically takes 3–6 months.",
    costFactors: ["Number and quality of data sources", "Accuracy targets and evaluation effort", "Integrations with business systems", "Model choice, hosting and per-request cost", "Human-in-the-loop and audit requirements", "Data residency and privacy constraints"],
    security: [
      { title: "Data boundaries", description: "Permission-aware retrieval so users only see answers from documents they may access." },
      { title: "Guardrails", description: "Input and output checks, tool allow-lists and human approval for consequential actions." },
      { title: "No training on your data", description: "Provider settings and contracts chosen so your data is not used to train third-party models." },
      { title: "Audit trail", description: "Prompts, sources, tool calls and approvals logged for review." },
    ],
  },
  digital: {
    whoFor: "startups building a first product, scale-ups extending a platform, and enterprises replacing or modernising internal software",
    timeline: "An MVP typically takes 8–14 weeks; larger platforms are delivered in phases with a usable release every few weeks.",
    costFactors: ["Number of user roles and core workflows", "Platforms (web, iOS, Android)", "Third-party integrations", "Design depth and accessibility targets", "Data migration from existing systems", "Performance, scale and uptime requirements"],
    security: [
      { title: "Secure SDLC", description: "Code review, dependency scanning and secrets kept out of source control." },
      { title: "Authentication", description: "Proven identity providers, MFA and least-privilege roles." },
      { title: "OWASP coverage", description: "Protection against common web and API vulnerabilities, verified in testing." },
      { title: "Backups & recovery", description: "Automated backups with tested restore procedures." },
    ],
  },
  fintech: {
    whoFor: "neobanks, payment companies, lenders, wealth platforms and financial institutions building or modernising customer-facing and back-office systems",
    timeline: "A regulated-market MVP usually takes 4–7 months including partner integrations; extensions to an existing platform can ship in weeks.",
    costFactors: ["Banking, card, payment and KYC partners to integrate", "Ledger and reconciliation complexity", "Number of currencies, countries and payment rails", "Compliance, reporting and audit requirements", "Mobile, web and back-office scope", "Availability and disaster-recovery targets"],
    security: [
      { title: "Ledger integrity", description: "Double-entry, immutable journals and daily reconciliation against partners." },
      { title: "Idempotent money movement", description: "Every payment operation safe to retry, with no double-spend." },
      { title: "Access control", description: "Maker-checker approvals, least privilege and full audit logging." },
      { title: "Data protection", description: "Encryption in transit and at rest, tokenised card data and PCI-aware architecture." },
    ],
  },
  web3: {
    whoFor: "Web3 startups, fintechs adding digital assets, and institutions exploring tokenization, stablecoins or on-chain settlement",
    timeline: "A focused contract system or dApp MVP typically takes 8–14 weeks plus independent audit time; institutional platforms usually take 4–9 months.",
    costFactors: ["Contract complexity and number of chains", "Custody and wallet model", "Independent audit scope", "Indexing, analytics and back-office tooling", "Compliance integrations (KYC, AML, Travel Rule)", "Upgradeability and governance requirements"],
    security: [
      { title: "Specification first", description: "Roles, invariants and threat model documented before code." },
      { title: "Adversarial testing", description: "Fuzz, invariant and fork tests plus static analysis on every change." },
      { title: "Key management", description: "Admin keys in multisig or MPC with timelocks on sensitive actions." },
      { title: "Independent audit", description: "Code prepared for — and we recommend — an external audit before mainnet value." },
    ],
  },
  cloud: {
    whoFor: "companies migrating to the cloud, teams whose releases are slow or risky, and organisations that need stronger reliability, security or cost control",
    timeline: "Assessments take 2–4 weeks; platform builds and migrations are usually delivered in 2–6 month phases.",
    costFactors: ["Number of applications and environments", "Compliance and data-residency requirements", "Availability and recovery objectives", "Existing automation and IaC maturity", "Multi-cloud or hybrid scope", "Ongoing managed-service needs"],
    security: [
      { title: "Infrastructure as code", description: "Every change reviewed, versioned and reproducible." },
      { title: "Identity & network", description: "Least-privilege IAM, private networking and zero-trust access." },
      { title: "Secrets & encryption", description: "Central secrets management and encryption by default." },
      { title: "Monitoring", description: "Alerting, audit logs and incident runbooks from day one." },
    ],
  },
};

/** Page-specific CTA label for a service, falling back to the division CTA. */
export function ctaFor(name: string, group: string, division: DivisionId, fallback: string): string {
  const t = `${name} ${group}`.toLowerCase();
  if (/exchange|brokerage|trading/.test(t)) return "Get Exchange Development Estimate";
  if (/\bmvp\b/.test(t)) return "Discuss My MVP";
  if (division === "web3" || /blockchain|web3|smart contract|token|defi/.test(t)) return "Discuss Your Blockchain Project";
  if (division === "fintech") return "Discuss Your FinTech Product";
  if (division === "ai") return "Build Your AI Product";
  return fallback;
}

/** Maps a service page to the closest option in the inquiry form's service list. */
export function serviceOption(name: string, division: DivisionId): string {
  const t = name.toLowerCase();
  if (/exchange/.test(t)) return "Crypto Exchange Development";
  if (/wallet/.test(t) && division === "web3") return "Crypto Wallet Development";
  if (/smart contract|solidity/.test(t)) return "Smart Contract Development";
  if (/web3|dapp/.test(t)) return "Web3 Development";
  if (division === "web3") return "Blockchain Development";
  if (division === "fintech") return "FinTech Development";
  if (division === "ai") return "AI Development";
  if (/saas/.test(t)) return "SaaS Development";
  if (/mobile|ios|android/.test(t)) return "Mobile App Development";
  if (/web|frontend|full-stack|ecommerce/.test(t)) return "Web Development";
  return "Other";
}
