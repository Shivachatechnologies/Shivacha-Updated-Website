import type { DivisionId, FAQ } from "./types";
import { faqs } from "./_helpers";

/** Role-specific "hire developers" landing pages served at /hire-{role}-developers. */
export interface HireRole {
  slug: string;
  role: string; // e.g. "Blockchain Developers"
  short: string; // e.g. "blockchain developer"
  division: DivisionId;
  summary: string;
  intro: string;
  whenToHire: string[];
  responsibilities: string[];
  skills: string[];
  vetting: string[];
  technologies: string[];
  services: string[];
  team?: string; // dedicated team slug
  service: string; // SERVICE_OPTIONS value used to prefill the inquiry form
  cta: string;
  faqs: FAQ[];
}

const common: [string, string][] = [
  ["How quickly can developers start?", "It depends on the role, seniority and number of people. We share profiles for your review first; initial engineers can often start within a few weeks of agreeing scope. We will not promise a start date before we have checked availability."],
  ["Do the developers work in our tools and time zone?", "Yes. They work in your repositories, tracker and chat, and we agree a meaningful overlap with your working hours before the engagement starts. We have offices in India, the USA and the UK."],
  ["Who owns the code?", "You do. All work product and IP are assigned to you under the engagement agreement, and NDAs are signed before any confidential material is shared."],
  ["Can we interview the developers?", "Yes. You review profiles and can interview every engineer before they join your project."],
];

const role = (r: Omit<HireRole, "faqs"> & { faq: [string, string][] }): HireRole => {
  const { faq, ...rest } = r;
  return { ...rest, faqs: faqs([...faq, ...common]) };
};

export const hireRoles: HireRole[] = [
  role({
    slug: "hire-blockchain-developers",
    role: "Blockchain Developers",
    short: "blockchain developer",
    division: "web3",
    summary: "Hire blockchain developers who build complete on-chain systems — contracts, nodes, indexers, wallets and the backend around them.",
    intro: "A good blockchain developer knows that the contract is only one part of the system. Our blockchain engineers work across smart contracts, node and RPC infrastructure, event indexing, key management and the off-chain services that make a product usable, and they are used to documenting decisions for auditors, compliance teams and future maintainers.",
    whenToHire: ["You are building a blockchain product and need engineers who have shipped to mainnet", "Your in-house team is strong on web or backend but new to on-chain systems", "You need to migrate contracts or data to a new chain or Layer 2", "You need indexers, analytics or back-office tooling around existing contracts"],
    responsibilities: ["Design the on-chain / off-chain split and data model", "Write and test smart contracts to an audit-ready standard", "Run node, RPC and indexer infrastructure with monitoring", "Integrate wallets, custody providers and compliance tools", "Prepare deployment scripts, upgrade procedures and runbooks"],
    skills: ["Solidity", "Rust", "Go", "EVM internals", "Foundry / Hardhat", "The Graph / custom indexers", "Node operations", "TypeScript"],
    vetting: ["Code review of real contract and backend work", "Practical exercise covering security and gas trade-offs", "System design interview on an on-chain product", "Communication and documentation check"],
    technologies: ["ethereum", "solidity", "rust", "go", "foundry", "the-graph", "polygon", "solana"],
    services: ["blockchain-development", "smart-contract-development", "blockchain-infrastructure", "blockchain-indexing"],
    team: "blockchain-team",
    service: "Blockchain Development",
    cta: "Hire Blockchain Developers",
    faq: [["Are your blockchain developers full-time on our project?", "Yes, in a dedicated engagement each engineer works on your project only. Part-time or advisory arrangements are also possible for architecture reviews."]],
  }),
  role({
    slug: "hire-web3-developers",
    role: "Web3 Developers",
    short: "Web3 developer",
    division: "web3",
    summary: "Hire Web3 developers who ship dApps people can actually use — wallet onboarding, fast reads, clear transaction states and audit-ready contracts.",
    intro: "Web3 developers sit between product and protocol. Ours build the dApp frontend, wallet onboarding (browser wallets, embedded wallets, passkeys and smart accounts), the indexer that keeps the UI fast, and the contracts underneath. They care about the details that decide whether users stay: gas sponsorship, error messages, pending states and recovery flows.",
    whenToHire: ["You have contracts but the dApp experience is holding growth back", "You want to add wallets, tokens or on-chain settlement to an existing product", "You need a small, senior squad to take a Web3 MVP to launch", "Your team needs account-abstraction or embedded-wallet expertise"],
    responsibilities: ["Build dApp interfaces with robust transaction handling", "Implement wallet connection, embedded wallets and account abstraction", "Build subgraphs or custom indexers for fast data access", "Write and test contracts alongside the frontend", "Instrument analytics and monitoring for on-chain activity"],
    skills: ["TypeScript", "React / Next.js", "wagmi / viem", "Solidity", "ERC-4337", "Subgraphs", "Node.js", "Playwright"],
    vetting: ["Review of shipped dApp work", "Practical exercise on wallet and transaction flows", "Contract-reading and security awareness check", "Product and UX judgement interview"],
    technologies: ["nextjs", "react", "wagmi", "viem", "solidity", "the-graph", "base", "ethereum"],
    services: ["web3-development", "account-abstraction-development", "smart-wallet-development", "subgraph-development"],
    team: "web3-team",
    service: "Web3 Development",
    cta: "Hire Web3 Developers",
    faq: [["Can Web3 developers also handle our backend?", "Yes. Most of our Web3 engineers are full-stack and comfortable building the APIs, auth and admin tools that sit beside the contracts."]],
  }),
  role({
    slug: "hire-solidity-developers",
    role: "Solidity Developers",
    short: "Solidity developer",
    division: "web3",
    summary: "Hire Solidity developers who write specified, minimal and adversarially tested smart contracts — prepared for independent audit.",
    intro: "Solidity is easy to write and hard to write safely. Our Solidity developers start from a specification of roles and invariants, use well-reviewed libraries, keep code small, and test with unit, fuzz, invariant and fork tests. They hand over deployment scripts, admin procedures and a known-issues list so your independent auditors spend time on real risk.",
    whenToHire: ["You are preparing contracts for an external audit", "You need to extend or upgrade contracts already in production", "You are building a DeFi, token or tokenization protocol", "You need gas optimisation without trading away safety"],
    responsibilities: ["Write specifications, invariants and threat models", "Implement contracts with established libraries", "Build fuzz, invariant and fork test suites", "Resolve static-analysis findings", "Plan upgrades, timelocks and multisig administration"],
    skills: ["Solidity", "Foundry", "Hardhat", "OpenZeppelin", "Slither / static analysis", "EVM gas model", "Upgrade patterns", "Chainlink"],
    vetting: ["Review of audited or deployed contracts", "Timed security-focused coding exercise", "Invariant and fuzz-testing interview", "Written explanation of a design trade-off"],
    technologies: ["solidity", "foundry", "hardhat", "openzeppelin", "chainlink", "ethereum", "arbitrum", "optimism"],
    services: ["smart-contract-development", "smart-contract-testing", "gas-optimization", "smart-contract-audit-preparation"],
    team: "smart-contract-team",
    service: "Smart Contract Development",
    cta: "Hire Solidity Developers",
    faq: [["Do your Solidity developers perform audits?", "No. They prepare contracts for audit and review each other's code, but an independent audit firm should audit any contract that will hold meaningful value."]],
  }),
  role({
    slug: "hire-ai-developers",
    role: "AI Developers",
    short: "AI developer",
    division: "ai",
    summary: "Hire AI developers who take LLM, RAG and agent systems from demo to production — with evaluation, guardrails and cost control.",
    intro: "Most AI prototypes stall because nobody defined what 'good' means. Our AI developers build evaluation sets first, treat retrieval as its own system, add guardrails and human approval where actions matter, and watch latency and cost per request. They integrate models into the tools your teams already use rather than building yet another chat window.",
    whenToHire: ["You have an AI pilot that needs to become a reliable product", "You want to add assistants, search or automation to an existing platform", "You need RAG over your own documents with permissions respected", "You are building agents that take actions in business systems"],
    responsibilities: ["Build evaluation sets and automated quality checks", "Design retrieval pipelines: parsing, chunking, hybrid search, re-ranking", "Implement agents with tool use, approvals and audit logs", "Integrate models with product and business systems", "Monitor quality, latency and cost in production"],
    skills: ["Python", "TypeScript", "LLM APIs", "RAG", "Vector databases", "Agent frameworks", "Evaluation tooling", "MLOps"],
    vetting: ["Review of production AI work", "Practical exercise on retrieval and evaluation", "System design interview for an agent workflow", "Data-privacy and safety judgement check"],
    technologies: ["python", "openai", "llm", "typescript", "nextjs", "postgresql"],
    services: ["ai-development", "ai-agents", "rag-development", "llm-development"],
    team: "ai-team",
    service: "AI Development",
    cta: "Hire AI Developers",
    faq: [["Which AI models do your developers work with?", "Commercial APIs and open-weight models. We choose based on quality on your evaluation set, data-residency requirements, latency and cost."]],
  }),
  role({
    slug: "hire-fintech-developers",
    role: "FinTech Developers",
    short: "FinTech developer",
    division: "fintech",
    summary: "Hire FinTech developers who understand ledgers, payments, reconciliation and the controls regulators and partners expect.",
    intro: "Financial software fails in quiet ways: a rounding rule, a retried webhook, a missing idempotency key or a report that does not reconcile. Our FinTech developers build double-entry ledgers, payment and card integrations, KYC and onboarding flows and reconciliation jobs, and they design for audit trails and least-privilege access from the first sprint.",
    whenToHire: ["You are building a neobank, wallet, lending or payments product", "You are integrating a banking-as-a-service, card or payment provider", "Reconciliation, ledger accuracy or reporting is becoming a problem", "You need engineers comfortable working with compliance and risk teams"],
    responsibilities: ["Design ledgers and money-movement flows", "Integrate payment, card, banking and KYC providers", "Build idempotent, observable payment services", "Implement reconciliation and financial reporting", "Apply access control, audit logging and data protection"],
    skills: ["TypeScript / Node.js", "Java / Kotlin", "Python", "PostgreSQL", "Double-entry ledgers", "Payment APIs", "Event-driven architecture", "PCI-aware design"],
    vetting: ["Review of financial systems work", "Ledger and idempotency design exercise", "Integration and failure-handling interview", "Security and compliance awareness check"],
    technologies: ["typescript", "nodejs", "python", "postgresql", "kafka", "aws"],
    services: ["fintech-development", "payment-platform-development", "neobank-development", "lending-platform-development"],
    team: "fintech-team",
    service: "FinTech Development",
    cta: "Hire FinTech Developers",
    faq: [["Do you provide licences or regulatory approval?", "No. We build the technology. Licensing, regulatory approvals and legal advice must come from your licensed partners and advisors."]],
  }),
  role({
    slug: "hire-react-developers",
    role: "React Developers",
    short: "React developer",
    division: "digital",
    summary: "Hire React and Next.js developers who build fast, accessible interfaces and keep large frontends maintainable.",
    intro: "Our React developers write TypeScript-first, accessible components, choose sensible data-fetching and state patterns, and measure performance with Core Web Vitals instead of guessing. They work comfortably with designers, write tests that catch real regressions and know when server components, static rendering or client state is the right tool.",
    whenToHire: ["You are building a new web app, dashboard or marketing site", "Your frontend has become slow, fragile or hard to change", "You are migrating to Next.js App Router or a design system", "You need frontend capacity alongside an in-house backend team"],
    responsibilities: ["Build accessible, responsive UI in React and Next.js", "Create and maintain design-system components", "Improve Core Web Vitals and bundle size", "Integrate APIs, auth and analytics", "Write component and end-to-end tests"],
    skills: ["React", "Next.js", "TypeScript", "Tailwind CSS", "React Query", "Accessibility (WCAG)", "Playwright", "Storybook"],
    vetting: ["Review of shipped frontend work", "Practical component and state exercise", "Performance and accessibility interview", "Collaboration with design check"],
    technologies: ["react", "nextjs", "typescript", "tailwind"],
    services: ["frontend-development", "web-development", "saas-development", "full-stack-development"],
    team: "frontend-team",
    service: "Web Development",
    cta: "Hire React Developers",
    faq: [["Do your React developers also know React Native?", "Some do. If you need shared web and mobile code, tell us and we will propose engineers with both."]],
  }),
  role({
    slug: "hire-nodejs-developers",
    role: "Node.js Developers",
    short: "Node.js developer",
    division: "digital",
    summary: "Hire Node.js developers who build reliable APIs and services — typed, tested, observable and ready for real traffic.",
    intro: "Our Node.js developers build REST, GraphQL and event-driven services in TypeScript with NestJS, Fastify or Express. They design schemas carefully, handle retries and idempotency, add tracing and structured logs, and set up CI/CD so that releases are routine. They are used to integrating payment, identity and third-party APIs safely.",
    whenToHire: ["You need a new API or backend for a web or mobile product", "Your Node.js services are slow, unreliable or hard to deploy", "You are splitting a monolith or introducing queues and events", "You need backend engineers who can also support Web3 or AI integrations"],
    responsibilities: ["Design and build APIs and background workers", "Model data in PostgreSQL, MongoDB or Redis", "Integrate third-party APIs with retries and idempotency", "Add observability, rate limiting and security controls", "Automate testing and deployment"],
    skills: ["Node.js", "TypeScript", "NestJS / Fastify", "PostgreSQL", "Redis", "Message queues", "Docker", "OpenTelemetry"],
    vetting: ["Review of production backend work", "API design and failure-handling exercise", "Database and performance interview", "Security fundamentals check"],
    technologies: ["nodejs", "typescript", "nestjs", "postgresql", "redis", "docker"],
    services: ["backend-development", "api-development", "microservices-development", "full-stack-development"],
    team: "backend-team",
    service: "Web Development",
    cta: "Hire Node.js Developers",
    faq: [["Can your Node.js developers take over an existing codebase?", "Yes. We start with a short code and infrastructure review, agree priorities with you and then work in your repository."]],
  }),
  role({
    slug: "hire-python-developers",
    role: "Python Developers",
    short: "Python developer",
    division: "ai",
    summary: "Hire Python developers for APIs, data pipelines, automation and AI systems — clean, tested and production-ready.",
    intro: "Python is the language of data and AI, and also a solid choice for APIs and automation. Our Python developers build FastAPI and Django services, data pipelines and ML/LLM integrations, with type hints, tests and packaging that keep projects maintainable after the first release.",
    whenToHire: ["You are building AI, data or analytics features", "You need a FastAPI or Django backend", "You want to automate manual operations or reporting", "Your data pipelines are unreliable or hard to change"],
    responsibilities: ["Build APIs with FastAPI or Django", "Develop data pipelines and scheduled jobs", "Integrate ML models and LLM APIs", "Write tests, type checks and CI pipelines", "Optimise performance and cloud cost"],
    skills: ["Python", "FastAPI", "Django", "Pandas", "SQL", "Celery / queues", "LLM APIs", "Docker"],
    vetting: ["Review of production Python work", "Practical API or data exercise", "Testing and code-quality interview", "Data handling and privacy check"],
    technologies: ["python", "fastapi", "django", "postgresql", "docker", "openai"],
    services: ["backend-development", "ai-development", "ai-data-solutions", "business-automation"],
    team: "data-engineering-team",
    service: "AI Development",
    cta: "Hire Python Developers",
    faq: [["Do your Python developers work on machine learning?", "Yes, several specialise in ML and LLM systems. Tell us whether you need backend, data or ML focus and we will match profiles accordingly."]],
  }),
  role({
    slug: "hire-dedicated-developers",
    role: "Dedicated Developers",
    short: "dedicated developer",
    division: "digital",
    summary: "Hire dedicated developers or a complete squad that works only on your product, in your tools, under your direction.",
    intro: "A dedicated engagement gives you engineers who work only on your product, with Shivacha handling recruitment, HR, equipment and continuity. Start with one or two engineers or a full squad with a tech lead, QA and delivery manager, and scale up or down as your roadmap changes. You keep full control of priorities, code and IP.",
    whenToHire: ["Your roadmap is larger than your in-house team", "You need specialist skills (Web3, AI, FinTech) that are slow to hire locally", "You want a stable team rather than rotating freelancers", "You need to build a product team before raising or hiring in-house"],
    responsibilities: ["Deliver features against your roadmap", "Follow your engineering standards and rituals", "Maintain code quality, tests and documentation", "Report progress transparently every sprint", "Hand over cleanly if you bring work in-house"],
    skills: ["Full-stack engineering", "Mobile", "AI / ML", "Blockchain", "FinTech", "DevOps", "QA automation", "Delivery management"],
    vetting: ["Role-specific technical interviews", "Practical exercises reviewed by senior engineers", "Communication and ownership assessment", "Your own interviews before anyone starts"],
    technologies: ["typescript", "react", "nodejs", "python", "aws", "kubernetes"],
    services: ["custom-software-development", "product-development", "saas-development", "mvp-development"],
    team: "software-development-team",
    service: "Dedicated Development Team",
    cta: "Build My Development Team",
    faq: [["What is the minimum engagement?", "Engagements usually start at one full-time engineer for three months, so the developer can learn your product properly. Longer engagements give better continuity."]],
  }),
];

export const getHireRole = (slug: string) => hireRoles.find((r) => r.slug === slug);
