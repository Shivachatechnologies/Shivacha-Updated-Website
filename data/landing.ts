import type { DivisionId } from "./types";

/** Paid-traffic landing pages at /lp/{slug}. Noindex, excluded from the sitemap, form above the fold. */
export interface LandingPage {
  slug: string;
  division: DivisionId;
  topic: string;
  headline: string;
  accent: string;
  lede: string;
  bullets: string[];
  deliverables: { title: string; description: string }[];
  service: string;
  cta: string;
  links: { label: string; href: string }[];
}

export const landingPages: LandingPage[] = [
  {
    slug: "blockchain-development",
    division: "web3",
    topic: "blockchain smart contract",
    headline: "Blockchain development,",
    accent: "built for production.",
    lede: "Smart contracts, wallets, indexers and the backend around them — specified, tested adversarially and prepared for independent audit.",
    bullets: ["Senior blockchain engineers, India · USA · UK", "Ethereum, L2s, Polygon and Solana", "Audit-ready code with fuzz and invariant tests", "NDA before you share details"],
    deliverables: [
      { title: "Architecture & chain selection", description: "Written comparison of networks, custody and on-/off-chain split." },
      { title: "Smart contracts", description: "Specification-first contracts on reviewed libraries." },
      { title: "dApp, wallet & backend", description: "The interfaces and services users and operators touch." },
      { title: "Launch & operations", description: "Deployment scripts, monitoring and incident runbooks." },
    ],
    service: "Blockchain Development",
    cta: "Discuss Your Blockchain Project",
    links: [
      { label: "Blockchain development", href: "/services/blockchain-development" },
      { label: "Blockchain cost guide", href: "/insights/blockchain-development-cost" },
    ],
  },
  {
    slug: "web3-development",
    division: "web3",
    topic: "web3 dapp",
    headline: "Web3 products",
    accent: "people actually use.",
    lede: "dApps with simple onboarding — embedded wallets, sponsored gas, fast reads and clear transaction states — on audit-ready contracts.",
    bullets: ["Account abstraction & passkey login", "Next.js, wagmi, viem and subgraphs", "EVM chains and Solana", "Reply within one business day"],
    deliverables: [
      { title: "Product & UX", description: "Flows designed around wallets, gas and pending states." },
      { title: "Contracts", description: "Tested and documented for independent audit." },
      { title: "Indexer & API", description: "Fast, queryable on-chain data for the interface." },
      { title: "Launch support", description: "Monitoring, analytics and iteration after go-live." },
    ],
    service: "Web3 Development",
    cta: "Discuss Your Web3 Product",
    links: [
      { label: "Web3 development", href: "/services/web3-development" },
      { label: "Hire Web3 developers", href: "/hire-web3-developers" },
    ],
  },
  {
    slug: "fintech-development",
    division: "fintech",
    topic: "fintech payments banking",
    headline: "FinTech engineering",
    accent: "that reconciles.",
    lede: "Neobanks, wallets, payments and lending platforms built on double-entry ledgers, idempotent money movement and full audit trails.",
    bullets: ["BaaS, card, payment and KYC integrations", "Ledger and reconciliation from day one", "Security and compliance-aware delivery", "NDA on request"],
    deliverables: [
      { title: "Architecture", description: "Partners, ledger model and compliance requirements mapped." },
      { title: "Core platform", description: "Accounts, payments, cards or lending with a proper ledger." },
      { title: "Apps & back office", description: "Customer apps, admin, support and reporting tools." },
      { title: "Operations", description: "Reconciliation, monitoring and incident response." },
    ],
    service: "FinTech Development",
    cta: "Discuss Your FinTech Product",
    links: [
      { label: "FinTech development", href: "/services/fintech-development" },
      { label: "FinTech cost guide", href: "/insights/fintech-app-development-cost" },
    ],
  },
  {
    slug: "ai-development",
    division: "ai",
    topic: "ai agent llm",
    headline: "AI products,",
    accent: "from demo to production.",
    lede: "Assistants, RAG search and agents with evaluation sets, guardrails, human approval and cost control — integrated into the tools your teams use.",
    bullets: ["Evaluation-first development", "Permission-aware retrieval", "Agents with approvals and audit logs", "Your data is not used to train models"],
    deliverables: [
      { title: "Proof of value", description: "A scoped pilot measured against a real evaluation set." },
      { title: "Production system", description: "Retrieval, tools, guardrails and integrations." },
      { title: "Monitoring", description: "Quality, latency and cost dashboards." },
      { title: "Iteration", description: "Continuous improvement driven by evaluation results." },
    ],
    service: "AI Development",
    cta: "Build Your AI Product",
    links: [
      { label: "AI development", href: "/services/ai-development" },
      { label: "AI cost guide", href: "/insights/ai-development-cost" },
    ],
  },
  {
    slug: "dedicated-developers",
    division: "digital",
    topic: "dedicated team developers",
    headline: "Dedicated developers,",
    accent: "working as your team.",
    lede: "Vetted engineers who work only on your product, in your tools and time-zone overlap — from one developer to a full squad.",
    bullets: ["You interview every engineer", "Web3, AI, FinTech, web and mobile skills", "IP assigned to you, NDA as standard", "Scale up or down as the roadmap changes"],
    deliverables: [
      { title: "Requirement call", description: "Roles, seniority, stack and ownership agreed." },
      { title: "Profiles", description: "Shortlisted engineers for your review and interviews." },
      { title: "Onboarding", description: "Access, rituals and first-sprint goals set." },
      { title: "Ongoing reviews", description: "Quality and velocity check-ins; scale as needed." },
    ],
    service: "Dedicated Development Team",
    cta: "Build My Development Team",
    links: [
      { label: "Hire dedicated developers", href: "/hire-dedicated-developers" },
      { label: "Dedicated vs project outsourcing", href: "/insights/dedicated-developers-vs-project-outsourcing" },
    ],
  },
];

export const getLanding = (slug: string) => landingPages.find((l) => l.slug === slug);
