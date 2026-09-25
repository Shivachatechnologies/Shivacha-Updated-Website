import type { Capability, Division, DivisionId } from "./types";
import { faqs, pts } from "./_helpers";

export const divisions: Division[] = [
  {
    id: "ai",
    slug: "ai",
    name: "Shivacha AI",
    short: "AI",
    tagline: "Intelligent systems built for real-world workflows.",
    description:
      "Generative AI, AI agents, machine learning and automation engineered into the systems your business already runs on.",
    color: "violet",
    icon: "Brain",
    cta: "Build Your AI System",
    ctaHref: "/start-a-project?division=ai",
  },
  {
    id: "digital",
    slug: "digital",
    name: "Shivacha Digital",
    short: "Digital",
    tagline: "Digital products designed to launch and scale.",
    description:
      "Custom software, SaaS, web and mobile products and enterprise platforms — from first release to high-scale operation.",
    color: "blue",
    icon: "CodeXml",
    cta: "Build Your Product",
    ctaHref: "/start-a-project?division=digital",
  },
  {
    id: "fintech",
    slug: "fintech",
    name: "Shivacha FinTech",
    short: "FinTech",
    tagline: "Infrastructure for the next generation of financial products.",
    description:
      "Banking, payments, cards, lending and wealth platforms — plus Web3 finance and hybrid rails that connect fiat and digital assets.",
    color: "emerald",
    icon: "Landmark",
    cta: "Discuss Your Financial Platform",
    ctaHref: "/start-a-project?division=fintech",
  },
  {
    id: "web3",
    slug: "web3",
    name: "Shivacha Web3",
    short: "Web3",
    tagline: "Institutional-grade blockchain and digital asset engineering.",
    description:
      "Protocols, smart contracts, tokenization, DeFi, wallets, exchanges and digital asset infrastructure for serious builders.",
    color: "cyan",
    icon: "Blocks",
    cta: "Discuss Your Digital Asset Initiative",
    ctaHref: "/start-a-project?division=web3",
  },
  {
    id: "cloud",
    slug: "cloud",
    name: "Shivacha Cloud",
    short: "Cloud",
    tagline: "Infrastructure engineered for reliability and security.",
    description:
      "Cloud architecture, migration, DevOps, platform engineering, SRE and cybersecurity for systems that cannot go down.",
    color: "sky",
    icon: "Cloud",
    cta: "Architect Your Infrastructure",
    ctaHref: "/start-a-project?division=cloud",
  },
];

export const getDivision = (id: DivisionId) => divisions.find((d) => d.id === id)!;

export const capabilities: Capability[] = [
  {
    division: "ai",
    title: "Shivacha AI",
    metaTitle: "AI Engineering, Generative AI & AI Agents",
    metaDescription:
      "Shivacha AI designs and builds production AI systems: LLM applications, RAG, AI agents, copilots, machine learning, computer vision and workflow automation.",
    h1: "AI systems engineered for real work, not demos.",
    lede:
      "We design, build and operate generative AI, agentic systems and machine learning that plug into your data, your tools and your controls — and keep working after launch.",
    overview: [
      "Most organisations have already run an AI pilot. Far fewer have an AI system in production that people trust, that is measured, and that improves over time. The gap is rarely the model. It is retrieval quality, integration with systems of record, evaluation, access control, latency and cost — the engineering around the model.",
      "Shivacha AI is built around that engineering. We treat an AI capability as a software product with a data layer, an orchestration layer, a model layer and an operations layer. Each is designed deliberately: which documents an assistant may see, which tools an agent may call, how outputs are checked, how failures are caught and how a human stays in the loop where the stakes require it.",
      "Our work spans generative AI (LLM applications, retrieval-augmented generation, copilots, conversational and voice interfaces), agentic AI (multi-step agents that plan, call tools and complete tasks), classical machine learning (forecasting, scoring, classification, recommendation), perception (computer vision, document understanding, speech) and the data engineering that feeds all of it.",
      "Because Shivacha also runs Digital, FinTech, Web3 and Cloud divisions, AI work is not isolated. An AI agent that reconciles payments is designed with people who build payment platforms. A document-processing pipeline for lending is designed with people who build loan origination systems. That context is where most AI value is actually captured.",
    ],
    problems: pts([
      "Pilots that never reach production|Prototypes built on notebooks and prompts break down when they meet real data volumes, permissions and uptime requirements.",
      "Hallucination and trust|Users stop relying on assistants that confidently return wrong answers. Grounding, citations and evaluation are engineering problems.",
      "Disconnected from systems of record|An assistant that cannot read your CRM, ERP, ticketing or core systems — or act in them — adds a tab, not value.",
      "Unpredictable cost and latency|Token spend and response times grow non-linearly without caching, routing, model selection and prompt discipline.",
      "Security, privacy and governance|Sensitive data, access control, audit trails and model risk need design from day one, not a review at the end.",
      "No way to measure improvement|Without offline evaluation sets and production telemetry, every change to a prompt or model is a guess.",
    ]),
    pillars: [
      {
        title: "Generative AI & LLM applications",
        description:
          "Assistants, copilots, chat and voice interfaces grounded in your knowledge through retrieval-augmented generation, with citations, guardrails and evaluation built in.",
        groups: ["genai-llm"],
      },
      {
        title: "AI agents & automation",
        description:
          "Agents that plan and execute multi-step work across your tools — triage, research, reconciliation, onboarding, document processing — with human approval where it matters.",
        groups: ["ai-agents"],
      },
      {
        title: "Machine learning & perception",
        description:
          "Predictive models, NLP, computer vision and the data pipelines behind them, deployed with MLOps so models are monitored, retrained and versioned.",
        groups: ["ml"],
      },
      {
        title: "Enterprise AI & product",
        description:
          "AI strategy, integration and full AI product development — from use-case selection and architecture to production operation.",
        groups: ["ai-enterprise"],
      },
    ],
    architecture: [
      { name: "Experience", items: ["Web & mobile apps", "Copilots in existing tools", "Chat & voice", "APIs"] },
      { name: "Orchestration", items: ["Agent runtime", "Tool calling", "Workflow engine", "Human-in-the-loop"] },
      { name: "Intelligence", items: ["LLMs (hosted & open-weight)", "Fine-tuned models", "Classical ML", "Vision & speech"] },
      { name: "Knowledge", items: ["RAG pipelines", "Vector search", "Embeddings", "Knowledge graphs"] },
      { name: "Data", items: ["Ingestion & ETL", "Feature stores", "Data warehouse", "Document stores"] },
      { name: "Operations", items: ["Evaluation suites", "Observability", "Cost controls", "Access & audit"] },
    ],
    approach: pts([
      "Use-case qualification|We score candidate use cases on value, feasibility, data readiness and risk, and pick the ones that can reach production.",
      "Evaluation first|Before building, we define what 'good' means with a test set and metrics, so every iteration is measured rather than judged by feel.",
      "Thin vertical slice|We ship one narrow workflow end-to-end — data, retrieval, model, UI, logging — then widen it.",
      "Production hardening|Guardrails, fallbacks, rate limits, caching, access control and monitoring are added before broad rollout.",
      "Operate and improve|Telemetry, feedback capture and scheduled evaluation runs keep quality visible as data, users and models change.",
    ]),
    outcomes: pts([
      "Assistants people actually use|Grounded answers with sources, in the tools employees and customers already work in.",
      "Automated multi-step work|Agents that complete defined tasks and escalate exceptions, instead of just suggesting text.",
      "Controlled cost|Model routing, caching and prompt design that keep unit economics predictable.",
      "Governed AI|Clear data boundaries, audit logs and review workflows that satisfy security and risk teams.",
    ]),
    faqs: faqs([
      ["Which models do you work with?", "We are model-agnostic. We build with hosted frontier models through their APIs and with open-weight models deployed in your cloud, and we often route between several models by task, cost and latency. The architecture is designed so that models can be swapped as the market moves."],
      ["Can our data stay inside our environment?", "Yes. Retrieval indexes, vector databases, logs and — where required — open-weight models can run inside your own cloud account or VPC. We design data flows so that only the minimum context needed is ever sent to an external model provider, and only where your policies allow it."],
      ["How do you deal with hallucinations?", "Through retrieval grounding, citations, constrained output formats, verification steps, refusal behaviour for out-of-scope questions, and — most importantly — an evaluation set that measures factual accuracy on your own questions before and after every change."],
      ["What does a first engagement look like?", "Typically a two-to-four week discovery and prototype on one high-value workflow, with an evaluation set, followed by a production build. For clear requirements we can start directly with a production build or a dedicated AI team."],
      ["Do you build AI agents that take actions?", "Yes. We build agents with explicit tool permissions, step limits, approval gates and full action logs. High-impact actions are routed to a human for approval until the agent's reliability on that task has been demonstrated."],
      ["Can you add AI to an existing product?", "Most of our AI work is exactly that: adding copilots, search, summarisation, extraction or automation to platforms that already exist, through APIs and embedded UI components."],
    ]),
    industries: ["fintech", "banking", "insurance", "healthcare", "ecommerce", "saas", "logistics", "enterprise"],
    technologies: ["llm", "openai", "rag", "ai-agents", "vector-databases", "embeddings", "fine-tuning", "mlops", "python", "fastapi"],
    products: ["ai-agent-platform", "ai-customer-support", "ai-copilot", "ai-document-processing", "ai-workflow-automation", "voice-ai"],
  },
  {
    division: "digital",
    title: "Shivacha Digital",
    metaTitle: "Custom Software, SaaS, Web & Mobile Product Engineering",
    metaDescription:
      "Shivacha Digital engineers custom software, SaaS platforms, web and mobile apps, APIs and enterprise systems — from MVP to scale, including legacy modernization.",
    h1: "Digital products engineered to launch — and to last.",
    lede:
      "Product strategy, design and full-stack engineering for SaaS platforms, enterprise software, web and mobile applications, APIs and the modernization of systems that have outgrown themselves.",
    overview: [
      "Every modern company is, in part, a software company. Its customer experience is an app, its operations run on internal platforms, and its partners connect through APIs. The quality of that software sets the ceiling for everything else the business wants to do.",
      "Shivacha Digital builds that software. We work across the full product lifecycle: shaping an idea into a scoped first release, designing the experience, engineering the frontend, backend, data and infrastructure, and then scaling and evolving the product as usage and requirements grow.",
      "We are equally comfortable with a greenfield SaaS product, a multi-sided marketplace, a customer portal, a mobile app, or an enterprise platform with complex permissions and integrations. We also take on the harder work of modernizing legacy systems — incrementally, without stopping the business.",
      "Our engineering is opinionated where it matters: typed codebases, automated testing, CI/CD from the first sprint, infrastructure as code, observability, and documented architecture decisions. Those habits are what let a product keep shipping in year three, not just in month three.",
    ],
    problems: pts([
      "Ideas stuck before a first release|Scope creep and unclear priorities delay launch and burn budget before users see anything.",
      "Products that cannot scale|Early architectural shortcuts become outages, slow pages and fragile releases as usage grows.",
      "Legacy systems holding the business back|Monoliths, outdated frameworks and undocumented code make every change slow and risky.",
      "Fragmented tools and manual work|Teams stitch together spreadsheets and disconnected SaaS instead of working in one coherent system.",
      "Inconsistent experience across channels|Web, mobile and internal tools drift apart in design, data and behaviour.",
      "Engineering capacity gaps|Roadmaps outpace the in-house team's ability to deliver without sacrificing quality.",
    ]),
    pillars: [
      {
        title: "Product engineering",
        description:
          "SaaS platforms, MVPs, marketplaces and commerce — built with product thinking, fast iteration and an architecture that survives growth.",
        groups: ["product-eng"],
      },
      {
        title: "Web, mobile & full-stack",
        description:
          "Web applications, native and cross-platform mobile apps, frontends, backends and APIs engineered for performance and accessibility.",
        groups: ["web-mobile"],
      },
      {
        title: "Enterprise software",
        description:
          "Custom platforms, CRM, ERP, portals and business automation that fit how your organisation actually works.",
        groups: ["software-eng", "modernization"],
      },
      {
        title: "APIs & integration",
        description:
          "REST, GraphQL, gRPC, real-time, identity and event-driven integration that connects products, partners and internal systems.",
        groups: ["api-integration"],
      },
    ],
    architecture: [
      { name: "Clients", items: ["Web (Next.js, React)", "iOS & Android", "Admin consoles", "Partner portals"] },
      { name: "Edge", items: ["CDN & caching", "API gateway", "Auth & SSO", "Rate limiting"] },
      { name: "Services", items: ["Domain services", "Background workers", "Search", "Notifications"] },
      { name: "Integration", items: ["REST & GraphQL", "Webhooks", "Event bus", "Third-party APIs"] },
      { name: "Data", items: ["PostgreSQL", "Redis", "Object storage", "Analytics warehouse"] },
      { name: "Delivery", items: ["CI/CD", "Infrastructure as code", "Observability", "Feature flags"] },
    ],
    approach: pts([
      "Discovery & scoping|Users, jobs-to-be-done, constraints and success metrics become a prioritised backlog and a release plan.",
      "Design & architecture|UX flows and a design system alongside architecture decisions, data models and integration contracts.",
      "Iterative delivery|Two-week increments with working software in a staging environment and regular demos.",
      "Quality engineering|Automated unit, integration and end-to-end tests, code review and performance budgets on every change.",
      "Launch & scale|Production readiness reviews, monitoring, runbooks and a roadmap for the next stage of growth.",
    ]),
    outcomes: pts([
      "A shippable first release|Focused scope that gets real users on the product quickly.",
      "An architecture with headroom|Services, data and infrastructure designed for the next order of magnitude.",
      "Maintainable codebases|Typed, tested, documented code that any competent team can pick up.",
      "Faster delivery cycles|CI/CD and automation that make releases routine instead of events.",
    ]),
    faqs: faqs([
      ["Do you work with startups or enterprises?", "Both. For startups we focus on scoped MVPs and fast iteration toward product-market fit. For enterprises we focus on integration, security, governance and incremental modernization. The engineering standards are the same."],
      ["Which technologies do you use?", "Our default web stack is TypeScript with React and Next.js on the frontend and Node.js, Python, Go or Java on the backend, with PostgreSQL as the primary database. For mobile we use Swift, Kotlin, Flutter or React Native depending on requirements. We adapt to your existing stack when it makes sense."],
      ["Who owns the code?", "You do. Code, designs and documentation are delivered into your repositories and accounts, and intellectual property is assigned to you under the engagement agreement."],
      ["Can you take over an existing codebase?", "Yes. We start with a structured code and architecture review, stabilise builds and deployments, add tests around critical paths, and then continue feature development or modernization."],
      ["How do you estimate projects?", "After discovery we estimate by feature, with explicit assumptions and risks. Fixed-scope, time-and-materials and dedicated-team models are all available depending on how stable the requirements are."],
    ]),
    industries: ["saas", "ecommerce", "education", "logistics", "healthcare", "real-estate", "travel", "enterprise"],
    technologies: ["typescript", "react", "nextjs", "nodejs", "python", "go", "postgresql", "flutter", "react-native", "kubernetes"],
    products: ["crm-platform", "erp-platform", "marketplace-platform", "ecommerce-platform", "booking-platform", "enterprise-portal", "learning-platform", "logistics-platform"],
  },
  {
    division: "fintech",
    title: "Shivacha FinTech",
    metaTitle: "FinTech Engineering: Banking, Payments, Web3 & Hybrid Finance",
    metaDescription:
      "Shivacha FinTech builds digital banking, payment, card, lending and wealth platforms, Web3 finance, and hybrid infrastructure connecting fiat rails with digital assets.",
    h1: "Financial technology across traditional, digital-asset and hybrid rails.",
    lede:
      "We engineer banking, payments, cards, lending and wealth platforms — and the Web3 and hybrid infrastructure that connects traditional financial systems with programmable digital assets.",
    overview: [
      "Financial products are defined by details that most software never has to consider: double-entry ledgers that must always balance, idempotent payment flows, settlement windows, reconciliation against external statements, regulatory reporting, fraud controls and audit trails that must hold up years later.",
      "Shivacha FinTech is organised around three tracks. Web2 FinTech covers traditional financial technology: digital banking and neobanks, core banking integrations, payment gateways and orchestration, card programs, lending, wealth and embedded finance. Web3 FinTech covers crypto banking, stablecoin payments, digital asset trading and tokenized finance. Hybrid FinTech — a core Shivacha differentiator — connects the two.",
      "The hybrid track exists because the market is converging. Payment companies are adding stablecoin settlement, banks are exploring tokenized deposits and assets, and crypto-native firms need fiat on- and off-ramps, bank accounts and card programs. Building those products requires engineers who understand both a card authorisation flow and an ERC-20 transfer — and the ledger that reconciles them.",
      "We position ourselves as a technology partner. We build and integrate the software; licensed partners — banks, e-money institutions, card issuers and processors, custodians and compliance providers — provide the regulated services. Our architecture is designed to make those integrations clean, auditable and replaceable.",
    ],
    problems: pts([
      "Ledgers that do not reconcile|Balances drift from bank and processor statements because the ledger was an afterthought instead of the core.",
      "Single-provider lock-in|A payment or banking-as-a-service provider outage or policy change can halt the entire business.",
      "Slow partner integrations|Every new bank, processor, KYC vendor or card program takes months because there is no integration layer.",
      "Fiat and crypto in separate silos|Customers want one experience across bank accounts, cards, stablecoins and digital assets; most stacks cannot deliver it.",
      "Compliance bolted on late|KYC, AML screening, transaction monitoring and audit trails retrofitted after launch cost more and work worse.",
      "Scale and reliability risk|Payment spikes, settlement batches and month-end reporting expose weak points in architecture.",
    ]),
    pillars: [
      {
        title: "Web2 FinTech",
        description:
          "Digital banking, neobanks, core banking integration, payments, cards, lending, wealth and embedded finance on traditional rails.",
        groups: ["banking", "payments", "cards", "lending", "wealth", "embedded-finance"],
      },
      {
        title: "Web3 FinTech",
        description:
          "Crypto banking, stablecoin and digital asset payments, crypto cards, tokenized finance and institutional digital asset platforms.",
        groups: ["web3-fintech"],
      },
      {
        title: "Hybrid FinTech",
        description:
          "Integration layers that connect bank accounts, payment networks and ledgers with wallets, stablecoins and tokenized assets.",
        groups: ["hybrid-fintech"],
      },
    ],
    architecture: [
      { name: "Channels", items: ["Mobile banking", "Web dashboards", "Merchant portals", "Partner APIs"] },
      { name: "Product services", items: ["Accounts", "Payments", "Cards", "Lending", "Wallets"] },
      { name: "Financial core", items: ["Double-entry ledger", "Balances & holds", "Fees & pricing", "Reconciliation"] },
      { name: "Risk & compliance tech", items: ["KYC/KYB integration", "AML screening", "Fraud rules", "Transaction monitoring"] },
      { name: "Rails", items: ["Banks & BaaS", "Card processors", "Payment networks", "Blockchains & stablecoins"] },
      { name: "Operations", items: ["Back-office", "Reporting", "Audit trails", "Observability"] },
    ],
    approach: pts([
      "Model the money first|We design the ledger, account structure and money-movement states before screens, so every flow is auditable.",
      "Abstract the providers|Banks, processors, KYC and custody vendors sit behind adapters so they can be added, routed or replaced.",
      "Design for failure|Idempotency keys, retries, timeouts, outbox patterns and reconciliation jobs are part of the core design.",
      "Compliance-ready by default|Audit logs, maker-checker controls, data retention and reporting hooks are built in from the first release.",
      "Launch with partners|We work alongside your licensed partners and compliance advisors through integration, testing and go-live.",
    ]),
    outcomes: pts([
      "Ledger-accurate products|Balances that reconcile with every external statement, every day.",
      "Provider flexibility|Multi-bank, multi-processor architectures that reduce concentration risk.",
      "Faster partner onboarding|An integration layer that turns new rails into configuration and adapters.",
      "Unified fiat and digital assets|One customer experience across accounts, cards, stablecoins and tokens.",
    ]),
    faqs: faqs([
      ["Is Shivacha a licensed financial institution?", "No. Shivacha is a technology company. We design, build and integrate financial software. Regulated activities — holding customer funds, issuing cards, providing custody, lending — are performed by your organisation or by licensed partners under their own authorisations."],
      ["What is the difference between Web2, Web3 and Hybrid FinTech?", "Web2 FinTech runs on traditional rails such as bank accounts, card networks and domestic payment schemes. Web3 FinTech runs on blockchains, stablecoins and digital assets. Hybrid FinTech connects the two, for example a wallet that holds both fiat and stablecoins, or a payment platform that accepts cards and settles in stablecoins."],
      ["Can you integrate with our existing core banking system?", "Yes. We build integration layers and middleware for existing core banking systems, and we also build new ledgers and product services where a modern core is needed alongside or instead of a legacy one."],
      ["Do you help with PCI DSS or similar requirements?", "We design architectures aligned with standards such as PCI DSS — tokenisation, network segmentation, encryption and access control — and produce technical documentation for your assessors. Certification itself is performed by qualified assessors."],
      ["Do you provide ready-made fintech products?", "Yes. Our ready-to-launch platforms for digital banking, payment gateways, orchestration, wallets, card management, lending and more can be configured and extended instead of built from scratch."],
    ]),
    industries: ["fintech", "banking", "payments", "insurance", "ecommerce", "real-estate", "enterprise", "startups"],
    technologies: ["double-entry-ledgers", "iso-20022", "iso-8583", "pci-dss", "open-banking-apis", "java", "go", "postgresql", "kafka", "ethereum"],
    products: ["digital-bank", "neobank", "payment-gateway", "payment-orchestration", "digital-wallet", "card-management", "lending-platform", "hybrid-wallet"],
  },
  {
    division: "web3",
    title: "Shivacha Web3",
    metaTitle: "Web3, Blockchain, Tokenization & Digital Asset Engineering",
    metaDescription:
      "Shivacha Web3 engineers protocols, audit-ready smart contracts, RWA tokenization, DeFi, stablecoin rails, wallets, exchanges and institutional digital asset infrastructure.",
    h1: "Web3 engineering for protocols, assets and institutions.",
    lede:
      "From protocol design and audit-ready smart contracts to real-world asset tokenization, stablecoin rails, custody integration and exchange infrastructure — built with institutional discipline.",
    overview: [
      "Web3 has moved past experiments. Asset managers are tokenizing funds and treasuries, payment companies are settling in stablecoins, enterprises are issuing digital securities, and protocols are managing significant on-chain value. The engineering bar has risen accordingly.",
      "Shivacha Web3 works at that bar. Our services are organised the way institutional buyers think: strategy and architecture; protocol and infrastructure engineering; smart contract engineering; financial applications such as DeFi, tokenization and stablecoins; user-facing applications such as wallets and exchanges; and the identity, data and security layers that make any of it operable.",
      "Our smart contract practice is audit-ready by design: specifications before code, invariant and fuzz testing, formal documentation of trust assumptions, upgrade and admin-key design, and preparation for independent third-party audits. We do not present internal review as a substitute for an independent audit.",
      "We also build the off-chain systems that institutional Web3 depends on — custody and MPC integrations, transaction policy engines, indexers, reconciliation, compliance tooling integrations and operations dashboards — and connect them to traditional finance through the Shivacha FinTech hybrid track.",
    ],
    problems: pts([
      "Smart contract risk|Exploits come from logic errors, unsafe upgrade paths and unexamined trust assumptions, not just code style.",
      "Tokenization without infrastructure|Issuing a token is easy; investor onboarding, transfer restrictions, corporate actions and settlement are not.",
      "Fragmented chains and liquidity|Multi-chain products face bridging risk, inconsistent tooling and fragmented users.",
      "Institutional operational gaps|Custody, approvals, policy controls, reconciliation and reporting are often missing from crypto-native stacks.",
      "Data you cannot trust|On-chain data is public but hard to index, normalise and reconcile with off-chain records.",
      "Compliance integration|Screening, travel rule messaging and identity must be integrated into flows without breaking user experience.",
    ]),
    pillars: [
      {
        title: "Strategy & protocol engineering",
        description:
          "Digital asset strategy, token economics, protocol design, L1/L2 and appchain development, node infrastructure and interoperability.",
        groups: ["web3-strategy", "protocol", "smart-contracts"],
      },
      {
        title: "Tokenization & digital assets",
        description:
          "Real-world asset tokenization, digital securities, institutional custody integration, policy engines and digital asset operations.",
        groups: ["rwa", "digital-assets"],
      },
      {
        title: "DeFi, stablecoins & payments",
        description:
          "DEXs, lending, staking, derivatives, stablecoin platforms and crypto payment rails with risk engineering built in.",
        groups: ["defi", "stablecoins", "web3-payments"],
      },
      {
        title: "Wallets, exchanges & trust layer",
        description:
          "Wallets and account abstraction, exchange infrastructure, identity and compliance integrations, on-chain data and Web3 security.",
        groups: ["wallets", "exchanges", "web3-identity", "web3-data", "web3-security"],
      },
    ],
    architecture: [
      { name: "Applications", items: ["Wallets", "Exchanges", "Tokenization portals", "dApps"] },
      { name: "Off-chain services", items: ["Indexers", "Policy engine", "Order matching", "Reconciliation"] },
      { name: "Smart contracts", items: ["Token standards", "Protocol logic", "Access control", "Upgrade modules"] },
      { name: "Custody & keys", items: ["MPC & multisig", "HSM integration", "Account abstraction", "Signing policies"] },
      { name: "Networks", items: ["Ethereum & L2s", "Solana", "EVM appchains", "Permissioned ledgers"] },
      { name: "Trust layer", items: ["Identity & credentials", "Screening integrations", "Monitoring", "Audit readiness"] },
    ],
    approach: pts([
      "Specify before building|Protocol and contract specifications, threat models and trust assumptions are written and reviewed first.",
      "Minimise on-chain surface|Only logic that needs to be trustless goes on-chain; everything else is simpler, cheaper off-chain.",
      "Test adversarially|Unit, integration, fuzz, invariant and fork tests simulate attackers, not just happy paths.",
      "Prepare for audit|Documentation, test coverage and known-issue lists are prepared so independent auditors can go deep.",
      "Operate safely|Monitoring, pausing mechanisms, incident runbooks and key ceremonies are planned before mainnet.",
    ]),
    outcomes: pts([
      "Audit-ready contracts|Specifications, tests and documentation that make independent audits faster and more thorough.",
      "Complete asset lifecycles|Issuance, onboarding, transfer, corporate actions and redemption handled end-to-end.",
      "Institutional operations|Policy-controlled custody, approvals, reconciliation and reporting.",
      "Chain-flexible architecture|Designs that can expand to new networks without rewriting the product.",
    ]),
    faqs: faqs([
      ["Do you audit smart contracts?", "We engineer audit-ready contracts and perform thorough internal security review, testing and audit preparation. For production deployments holding meaningful value, we recommend and help coordinate independent third-party audits; we do not present internal review as an independent audit."],
      ["Which blockchains do you work with?", "Ethereum and EVM networks including Arbitrum, Optimism, Base, Polygon, BNB Chain and Avalanche; Solana; and permissioned platforms such as Hyperledger. Network selection is driven by your asset, users, liquidity, cost and compliance requirements."],
      ["Can you help with the legal side of tokenization?", "No. We are a technology company. We build tokenization platforms that can encode transfer restrictions, investor eligibility and lifecycle rules defined by your legal and compliance advisors. Structuring and regulatory analysis must come from qualified counsel."],
      ["Do you provide custody?", "No. We integrate with qualified custodians and MPC or HSM-based key management providers, and we build the wallets, policy engines and operational tooling around them."],
      ["Can you build on permissioned or private chains?", "Yes. For consortium and enterprise use cases we build on permissioned platforms and design interoperability with public networks where needed."],
    ]),
    industries: ["fintech", "banking", "real-estate", "payments", "gaming", "energy", "enterprise", "startups"],
    technologies: ["ethereum", "solidity", "foundry", "openzeppelin", "solana", "rust", "arbitrum", "base", "chainlink", "erc-3643"],
    products: ["tokenization-platform", "rwa-platform", "crypto-exchange", "web3-wallet", "defi-platform", "digital-asset-platform", "blockchain-explorer", "staking-platform"],
  },
  {
    division: "cloud",
    title: "Shivacha Cloud",
    metaTitle: "Cloud, DevOps, Platform Engineering & Cybersecurity",
    metaDescription:
      "Shivacha Cloud delivers cloud architecture and migration on AWS, Azure and Google Cloud, Kubernetes, DevOps, platform engineering, SRE and cybersecurity.",
    h1: "Cloud infrastructure that is secure, observable and boring — in the best way.",
    lede:
      "Cloud architecture and migration, Kubernetes and DevOps, platform engineering, site reliability engineering and cybersecurity for systems that need to stay up and stay safe.",
    overview: [
      "Infrastructure is invisible when it works and existential when it does not. An outage during a product launch, a misconfigured storage bucket or a failed deployment on a Friday evening can undo months of product work.",
      "Shivacha Cloud builds infrastructure that makes those failures rare and recoverable. We design cloud architectures on AWS, Azure and Google Cloud; migrate workloads with minimal disruption; build Kubernetes and container platforms; automate everything as code; and put monitoring, alerting and incident response in place so teams know about problems before customers do.",
      "Platform engineering is central to how we work. Rather than handing over a pile of infrastructure, we build paved roads — templates, pipelines, self-service environments and guardrails — that let product teams ship safely without becoming infrastructure experts.",
      "Security runs through all of it. Identity and access management, zero-trust networking, secrets management, encryption, vulnerability management and threat detection are part of the architecture rather than a later audit. For AI, FinTech and Web3 workloads — where the other Shivacha divisions operate — that discipline is non-negotiable.",
    ],
    problems: pts([
      "Unreliable releases|Manual deployments and environment drift cause failed releases and long rollbacks.",
      "Rising cloud cost|Over-provisioned resources and poor visibility make cloud spend grow faster than the business.",
      "Blind spots in production|Without metrics, logs and traces, incidents are found by customers and diagnosed slowly.",
      "Security misconfiguration|Excessive permissions, exposed services and unmanaged secrets create avoidable risk.",
      "Stalled migrations|Moving from on-premises or between clouds drags on because dependencies were never mapped.",
      "Developer friction|Product engineers wait on tickets for environments, pipelines and access.",
    ]),
    pillars: [
      {
        title: "Cloud architecture & migration",
        description:
          "Consulting, landing zones, migration and managed operations across AWS, Azure and Google Cloud, including resilience and disaster recovery.",
        groups: ["cloud-platforms"],
      },
      {
        title: "DevOps & platform engineering",
        description:
          "Kubernetes, containers, CI/CD, infrastructure as code, internal developer platforms and site reliability engineering.",
        groups: ["devops-platform"],
      },
      {
        title: "Cybersecurity",
        description:
          "Cloud, application and API security, identity, zero trust, encryption, threat detection, monitoring and penetration testing.",
        groups: ["cybersecurity"],
      },
    ],
    architecture: [
      { name: "Edge", items: ["CDN & WAF", "DDoS protection", "DNS", "API gateway"] },
      { name: "Compute", items: ["Kubernetes", "Containers", "Serverless", "VMs"] },
      { name: "Platform", items: ["CI/CD", "GitOps", "Service templates", "Self-service environments"] },
      { name: "Data", items: ["Managed databases", "Backups & replication", "Object storage", "Caching"] },
      { name: "Security", items: ["IAM & SSO", "Secrets management", "Encryption", "Threat detection"] },
      { name: "Operations", items: ["Metrics & logs", "Tracing", "Alerting & on-call", "Cost management"] },
    ],
    approach: pts([
      "Assess|We map workloads, dependencies, risks, costs and team capabilities to establish a baseline.",
      "Design the target|Reference architecture, landing zone, network, identity and security controls are designed up front.",
      "Automate everything|Infrastructure, configuration, pipelines and policies are defined as code and version-controlled.",
      "Migrate and modernise incrementally|Workloads move in waves with rollback plans, validation and parallel running where needed.",
      "Operate with SLOs|Service level objectives, dashboards, alerts and runbooks turn reliability into a managed quantity.",
    ]),
    outcomes: pts([
      "Routine, reversible releases|Automated pipelines with progressive delivery and fast rollback.",
      "Visible, controlled cost|Tagging, rightsizing and budgets that make spend predictable.",
      "Measured reliability|SLOs, error budgets and incident reviews that improve uptime over time.",
      "Security by default|Least-privilege access, encrypted data and continuous monitoring from day one.",
    ]),
    faqs: faqs([
      ["Which cloud providers do you support?", "AWS, Microsoft Azure and Google Cloud, as well as Cloudflare at the edge and hybrid or on-premises Kubernetes. We recommend a provider based on your workloads, existing contracts, data residency and team skills."],
      ["Do you offer managed services after migration?", "Yes. We offer ongoing managed cloud operations including monitoring, patching, cost optimisation, backup verification and incident response, with defined service levels."],
      ["Can you help us pass security reviews?", "We implement technical controls and produce architecture and control documentation that support frameworks such as ISO 27001 and SOC 2. Formal certification and attestation are performed by accredited auditors."],
      ["Do you build internal developer platforms?", "Yes. We build platforms with service templates, golden-path pipelines, preview environments and self-service infrastructure, typically on Kubernetes with GitOps."],
      ["How do you approach disaster recovery?", "We start from recovery time and recovery point objectives per system, then design backup, replication and failover strategies to meet them — and we test recovery regularly rather than assuming it works."],
    ]),
    industries: ["saas", "fintech", "banking", "healthcare", "ecommerce", "government", "enterprise", "media"],
    technologies: ["aws", "azure", "google-cloud", "kubernetes", "terraform", "docker", "argocd", "prometheus", "grafana", "cloudflare"],
    products: ["cloud-landing-zone", "developer-platform", "observability-stack"],
  },
];

export const getCapability = (id: string) => capabilities.find((c) => c.division === id);
