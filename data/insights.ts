import type { Insight, InsightCategory } from "./types";

export const insightCategories: InsightCategory[] = [
  { slug: "ai", name: "AI", description: "Engineering production AI: LLMs, agents, retrieval, evaluation and governance." },
  { slug: "fintech", name: "FinTech", description: "Ledgers, payments, banking and the convergence of fiat and digital assets." },
  { slug: "web3", name: "Web3", description: "Tokenization, smart contracts, DeFi and institutional digital asset infrastructure." },
  { slug: "cloud", name: "Cloud", description: "Cloud architecture, platform engineering, reliability and cost." },
  { slug: "software-engineering", name: "Software Engineering", description: "Architecture, delivery practices and engineering quality." },
  { slug: "cybersecurity", name: "Cybersecurity", description: "Practical security engineering across cloud, applications and Web3." },
  { slug: "digital-transformation", name: "Digital Transformation", description: "Delivering measurable change in complex organisations." },
  { slug: "product", name: "Product", description: "Product strategy and design for digital, AI and financial products." },
  { slug: "startups", name: "Startups", description: "Building and scaling products with limited time and runway." },
  { slug: "enterprise", name: "Enterprise", description: "Technology leadership in large organisations." },
];

const AUTHOR = "Shivacha Engineering";

export const insights: Insight[] = [
  {
    slug: "why-ai-pilots-fail-to-reach-production",
    title: "Why most AI pilots never reach production — and the engineering that fixes it",
    category: "ai",
    division: "ai",
    excerpt: "The model is rarely the problem. Retrieval quality, evaluation, integration and governance decide whether an AI pilot becomes a production system.",
    date: "2026-09-15",
    readingTime: "9 min",
    author: AUTHOR,
    sections: [
      {
        heading: "The demo is the easy part",
        body: [
          "A capable language model, a few documents and an afternoon are enough to build an impressive demo. That is precisely why so many organisations have AI pilots — and why so few of them become systems people rely on every day.",
          "The distance between demo and production is not about model capability. It is about everything around the model: which data it may see, how answers are checked, how the system behaves when it does not know, how it connects to the tools where work actually happens and how anyone knows whether a change made it better or worse.",
        ],
      },
      {
        heading: "Failure mode 1: no definition of 'good'",
        body: [
          "Most pilots are evaluated by feel. A few stakeholders ask questions, the answers look plausible, and the pilot is declared a success — until real users ask real questions. Without an evaluation set, every prompt change or model upgrade is a guess.",
          "The fix is to build the evaluation set before building the system: a few hundred representative questions or tasks with expected answers and sources, scored automatically on every change. It turns AI development into engineering.",
        ],
        bullets: ["Collect questions from real users, not from the project team", "Score correctness, groundedness and format separately", "Re-run evaluations on every prompt, retrieval or model change"],
      },
      {
        heading: "Failure mode 2: retrieval treated as an afterthought",
        body: [
          "For knowledge-grounded assistants, answer quality is capped by retrieval quality. Documents parsed badly, chunks split mid-table, keyword-only or vector-only search and missing permission filters all produce confident but wrong answers.",
          "Treat retrieval as its own system with its own metrics: are the right passages in the top results? Hybrid search, structure-aware chunking and re-ranking usually matter more than switching to a larger model.",
        ],
      },
      {
        heading: "Failure mode 3: disconnected from systems of record",
        body: [
          "An assistant that cannot read the CRM, the ticketing system or the core platform — or act in them — adds a new tab rather than removing work. Integration is where most value is captured and where most pilots stop.",
          "Production AI needs typed, permission-scoped tools that call your APIs, with approval gates for consequential actions and complete logs of what was done on whose behalf.",
        ],
      },
      {
        heading: "Failure mode 4: governance arrives at the end",
        body: [
          "Security and risk teams asked to approve a finished pilot will, reasonably, find problems: unclear data flows, no audit trail, no way to restrict what the model sees. Rework follows, momentum fades.",
          "Bringing governance into the architecture from day one — data boundaries, logging, risk tiering, human review for high-stakes outputs — turns it from a gate into a design input.",
        ],
      },
      {
        heading: "What production-ready looks like",
        body: [
          "A production AI system has an owner, a measured baseline, an evaluation suite, permission-aware data access, integrations into real workflows, cost and latency controls, monitoring with user feedback and a governance record. None of it is exotic. All of it is engineering.",
        ],
        bullets: ["Evaluation set and quality metrics", "Permission-aware retrieval", "Typed tools with approval gates", "Cost, latency and usage dashboards", "Audit logs and review workflows"],
      },
    ],
    services: ["enterprise-ai", "rag-development", "ai-agents", "ai-consulting"],
    technologies: ["llm", "rag", "vector-databases", "ai-agents"],
    tags: ["AI", "LLM", "RAG", "Evaluation", "Governance"],
  },
  {
    slug: "your-ledger-is-your-product",
    title: "Your ledger is your product: designing money movement that always reconciles",
    category: "fintech",
    division: "fintech",
    excerpt: "Fintech products are judged on experience but survive on correctness. A double-entry ledger at the core is what makes balances provable.",
    date: "2026-09-08",
    readingTime: "10 min",
    author: AUTHOR,
    sections: [
      {
        heading: "Balances that cannot be explained are a liability",
        body: [
          "Early fintech products often store a balance column and update it as transactions arrive. It works — until a webhook is delivered twice, a card authorisation is reversed after settlement, or a partner statement disagrees with your numbers and nobody can explain why.",
          "A double-entry ledger replaces mutable balances with an immutable journal of balanced entries. Every balance becomes the sum of explainable movements, and every discrepancy can be traced to a specific entry.",
        ],
      },
      {
        heading: "Model the money before the screens",
        body: [
          "Before designing onboarding flows or dashboards, define the account structure: customer accounts, holds, fees, settlement and suspense accounts, partner accounts. Then model each money movement as a state machine with the ledger entries each transition produces.",
          "This exercise surfaces the hard questions early: what happens when an authorisation expires, how refunds after settlement are recorded, how currency conversion is represented and where fees land.",
        ],
        bullets: ["Holds are separate from settled balances", "Every movement has an idempotency key", "Journal entries are never edited — only reversed"],
      },
      {
        heading: "Idempotency and the outbox pattern",
        body: [
          "Distributed systems retry. Payment providers resend webhooks. Mobile clients double-tap. Every operation that moves money must be idempotent: repeating it returns the original result rather than moving money twice.",
          "When a ledger transaction must also publish an event — to notify the user, update analytics or trigger a payout — write the event to an outbox table in the same database transaction and publish it asynchronously. This avoids the classic failure where money moves but the event is lost, or vice versa.",
        ],
      },
      {
        heading: "Reconcile from day one",
        body: [
          "Reconciliation is how you prove your ledger matches reality: bank statements, processor settlement files, custodian balances. It should run daily from the first day of production, with automated matching and exception queues, not as a month-end scramble.",
          "The same principle applies to digital assets: on-chain balances and custodian records must reconcile with the internal ledger continuously.",
        ],
      },
      {
        heading: "Owning the ledger means owning your future",
        body: [
          "A ledger you own — independent of any single BaaS provider or processor — is what allows you to add partners, switch providers, launch new products and answer auditors with confidence. It is also what makes hybrid products possible: a stablecoin is simply another asset in a well-designed multi-asset ledger.",
        ],
      },
    ],
    services: ["fintech-development", "core-banking-platform", "payment-reconciliation", "digital-asset-financial-infrastructure"],
    technologies: ["double-entry-ledgers", "postgresql", "kafka"],
    tags: ["FinTech", "Ledger", "Payments", "Reconciliation"],
  },
  {
    slug: "tokenization-is-an-operations-problem",
    title: "Tokenization is an operations problem, not a token problem",
    category: "web3",
    division: "web3",
    excerpt: "Minting a token takes minutes. Running an asset's full lifecycle on-chain — eligibility, distributions, recovery, reconciliation — is the real work.",
    date: "2026-08-28",
    readingTime: "8 min",
    author: AUTHOR,
    sections: [
      {
        heading: "The easy part and the hard part",
        body: [
          "Deploying a token contract representing fund units or property shares is straightforward. What makes tokenization valuable — and difficult — is everything that happens after: who may hold the token, how distributions are paid, what happens when an investor loses access to a wallet, how on-chain records stay aligned with the legal register.",
          "Successful tokenization programmes treat the token as one component of an operational platform rather than the platform itself.",
        ],
      },
      {
        heading: "Legal structure is a technical input",
        body: [
          "The legal structure — defined by qualified counsel — determines the technical design: whether the token is the register or mirrors one, which investors are eligible, which transfers need approval and what corporate actions must be supported. Technology teams should receive these rules as requirements, not invent them.",
        ],
      },
      {
        heading: "Identity-bound tokens",
        body: [
          "Permissioned token standards such as ERC-3643 check every transfer against an on-chain identity registry and modular compliance rules. Verified investors receive claims — jurisdiction, investor type, verification status — and transfers to wallets without the required claims simply fail.",
          "Personal data stays off-chain with identity providers; only claims or references live on-chain.",
        ],
        bullets: ["Eligibility enforced on every transfer", "Issuer recovery for lost wallets", "Holding limits and jurisdiction rules as modules"],
      },
      {
        heading: "Lifecycle services",
        body: [
          "Distributions, redemptions, corporate actions, NAV updates and investor reporting require off-chain services that read and update on-chain state reliably. These services — not the token contract — are where most engineering effort goes.",
        ],
      },
      {
        heading: "Reconciliation never stops",
        body: [
          "Token balances must reconcile with transfer agent registers, custodian records and payment flows. Automated reconciliation with clear exception handling is essential, as is governance for recovery and forced transfers.",
          "Tokenization delivers real benefits — faster settlement, programmable distributions, broader access — when it is engineered as an operations platform with the token at its core.",
        ],
      },
    ],
    services: ["rwa-tokenization", "security-token-development", "on-chain-identity", "fund-tokenization"],
    technologies: ["erc-3643", "erc-1400", "solidity"],
    tags: ["Tokenization", "RWA", "Digital Securities"],
  },
  {
    slug: "untested-disaster-recovery-is-a-hope",
    title: "Disaster recovery you haven't tested is a hope, not a plan",
    category: "cloud",
    division: "cloud",
    excerpt: "Backups are not recovery. Define objectives, automate restoration and rehearse — including the ransomware scenario.",
    date: "2026-08-20",
    readingTime: "7 min",
    author: AUTHOR,
    sections: [
      {
        heading: "Backups exist; recovery is assumed",
        body: [
          "Most organisations can say they have backups. Far fewer can say how long a full restore takes, whether the restored system actually works, or whether an attacker who compromised production could also delete the backups.",
        ],
      },
      {
        heading: "Start with objectives, per system",
        body: [
          "Recovery time objective (how long can this be down?) and recovery point objective (how much data can we lose?) should be set per system by business impact. A payment ledger and an internal wiki deserve very different investments.",
        ],
        bullets: ["RTO and RPO agreed with business owners", "Tiers of systems with matching strategies", "Dependencies mapped so recovery order is known"],
      },
      {
        heading: "Layer the protection",
        body: [
          "High availability across zones handles component failures. Cross-region replication handles regional outages. Immutable, isolated backups handle the worst case — including ransomware — because an attacker in production cannot reach them.",
        ],
      },
      {
        heading: "Automate the restore",
        body: [
          "Recovery environments defined as infrastructure as code can be created on demand, and restore procedures scripted so they do not depend on the one person who remembers how. Runbooks cover the parts that cannot be automated.",
        ],
      },
      {
        heading: "Rehearse, record, improve",
        body: [
          "Scheduled recovery drills turn assumptions into evidence. Each drill should produce a short report: what worked, how long it took against objectives, what to fix. Over time, recovery becomes routine — which is exactly what you want when it is no longer a drill.",
        ],
      },
    ],
    services: ["disaster-recovery", "high-availability", "cloud-security"],
    technologies: ["terraform", "aws", "postgresql"],
    tags: ["Cloud", "Disaster Recovery", "Resilience"],
  },
  {
    slug: "modular-monolith-first",
    title: "Modular monolith first: when microservices are actually worth it",
    category: "software-engineering",
    division: "digital",
    excerpt: "Microservices solve organisational scaling problems and introduce distributed-systems problems. Most products should earn them.",
    date: "2026-08-12",
    readingTime: "8 min",
    author: AUTHOR,
    sections: [
      {
        heading: "The appeal and the cost",
        body: [
          "Microservices promise independent deployment, independent scaling and technology freedom. They also bring network failures, distributed transactions, eventual consistency, versioned contracts and a large operational surface. For a small team, those costs arrive long before the benefits.",
        ],
      },
      {
        heading: "Structure without distribution",
        body: [
          "A modular monolith enforces clear domain boundaries inside one deployable unit: modules own their data, communicate through defined interfaces and cannot reach into each other's internals. You get most of the design benefits with none of the network.",
        ],
        bullets: ["One deployment, many well-bounded modules", "Module-owned schemas", "Interfaces that could become APIs later"],
      },
      {
        heading: "Signals it is time to split",
        body: [
          "Extract a service when a module has genuinely different scaling characteristics, needs independent release cadence because separate teams own it, or requires isolation for security or compliance reasons. Team structure is usually the strongest signal.",
        ],
      },
      {
        heading: "Extract with discipline",
        body: [
          "When extracting, keep contracts explicit, use events for cross-service state changes, apply the outbox pattern for reliable publishing, and invest in tracing and platform tooling before the number of services grows.",
        ],
      },
      {
        heading: "Architecture that can evolve",
        body: [
          "The goal is not to avoid microservices forever but to adopt them when they solve a real problem. Designing clean module boundaries from the start makes that transition an extraction rather than a rewrite.",
        ],
      },
    ],
    services: ["backend-development", "microservices-development", "software-modernization"],
    technologies: ["kafka", "kubernetes", "postgresql"],
    tags: ["Architecture", "Microservices", "Engineering"],
  },
  {
    slug: "security-starts-with-identity",
    title: "Most breaches start with identity: where to focus security effort first",
    category: "cybersecurity",
    division: "cloud",
    excerpt: "Before advanced tooling, get identity right: phishing-resistant MFA, least privilege, secrets out of code and logs you can actually search.",
    date: "2026-08-05",
    readingTime: "7 min",
    author: AUTHOR,
    sections: [
      {
        heading: "Attackers log in more than they break in",
        body: [
          "Stolen credentials, phished sessions, leaked API keys and over-privileged accounts feature in a large share of security incidents. Sophisticated exploits make headlines; identity weaknesses do most of the damage.",
        ],
      },
      {
        heading: "The first five controls",
        body: [
          "A small number of controls reduce risk disproportionately. They are not glamorous, and they are often incomplete even in mature organisations.",
        ],
        bullets: [
          "Phishing-resistant MFA (passkeys, security keys) for all staff and admin access",
          "Least-privilege roles and just-in-time elevation for administrators",
          "Secrets in a vault with rotation — never in code or images",
          "Centralised, retained logs of authentication and privileged actions",
          "Automated joiner-mover-leaver provisioning",
        ],
      },
      {
        heading: "Machines have identities too",
        body: [
          "Service accounts, CI/CD pipelines and workloads often hold the most powerful credentials. Short-lived, federated credentials — such as OIDC-based access from pipelines to cloud providers — remove long-lived keys that can leak.",
        ],
      },
      {
        heading: "In Web3, keys are identity",
        body: [
          "For digital asset systems, private keys are the ultimate credential. Institutional key management — MPC, multisig or HSM — combined with transaction policies and approval quorums applies the same principles: no single person or system should be able to move significant value alone.",
        ],
      },
      {
        heading: "Then build outward",
        body: [
          "With identity foundations in place, investments in detection, zero-trust networking and application security deliver far more value, because attackers can no longer simply log in.",
        ],
      },
    ],
    services: ["identity-access-management", "secrets-management", "zero-trust", "wallet-security"],
    technologies: ["keycloak", "hashicorp-vault", "oauth2", "mpc-cryptography"],
    tags: ["Security", "Identity", "Zero Trust"],
  },
  {
    slug: "transformation-measured-in-shipped-systems",
    title: "Transformation measured in shipped systems, not slideware",
    category: "digital-transformation",
    division: "digital",
    excerpt: "Transformation programmes succeed when every phase ships something that changes how customers are served or how work gets done.",
    date: "2026-07-29",
    readingTime: "6 min",
    author: AUTHOR,
    sections: [
      {
        heading: "The multi-year plan problem",
        body: [
          "Large transformation programmes often begin with a comprehensive plan and a long period before anything changes for customers or staff. By the time delivery starts, priorities have moved and confidence has faded.",
        ],
      },
      {
        heading: "Organise around value streams",
        body: [
          "Structure the programme around specific journeys and processes — opening an account, handling a claim, onboarding a supplier — rather than technology layers. Each value stream gets an owner, a baseline and outcome metrics.",
        ],
      },
      {
        heading: "Foundations that pay for themselves",
        body: [
          "API layers over legacy systems, shared identity and a cloud platform are foundations worth building — but only alongside the first value stream that needs them, so they are shaped by real use rather than speculation.",
        ],
        bullets: ["Build foundations with the first use case, not before it", "Reuse them for the next value stream", "Measure outcomes, not activity"],
      },
      {
        heading: "Adoption is part of delivery",
        body: [
          "A new system nobody uses has not transformed anything. Training, process changes and feedback loops belong in the delivery plan, with adoption measured like any other outcome.",
        ],
      },
    ],
    services: ["digital-product-development", "api-development", "business-automation"],
    technologies: ["nextjs", "kafka", "llm"],
    tags: ["Transformation", "Strategy"],
  },
  {
    slug: "designing-ai-products-users-trust",
    title: "Designing AI products users trust",
    category: "product",
    division: "ai",
    excerpt: "Trust in AI products is designed: show sources, make uncertainty visible, make correction easy and keep humans in control of consequential actions.",
    date: "2026-07-22",
    readingTime: "7 min",
    author: AUTHOR,
    sections: [
      {
        heading: "Trust is a product requirement",
        body: [
          "Users abandon AI features that are occasionally wrong in ways they cannot detect. The goal is not perfection — it is calibrated trust: users rely on the AI where it is reliable and can verify or correct it where it is not.",
        ],
      },
      {
        heading: "Show your work",
        body: [
          "Citations, highlighted source passages, the query behind a generated chart and a preview of the action an agent intends to take all let users verify quickly. Verification must be cheaper than doing the task manually.",
        ],
      },
      {
        heading: "Design for correction",
        body: [
          "Make it easy to edit, reject or refine AI output. Every correction is also feedback: captured properly, it improves prompts, retrieval and evaluation sets.",
        ],
        bullets: ["Inline editing of generated content", "One-click rejection with reason", "Undo for AI actions"],
      },
      {
        heading: "Keep humans in control",
        body: [
          "For consequential actions — sending money, contacting customers, changing records — suggest and confirm rather than act silently. Autonomy can grow as measured reliability justifies it.",
        ],
      },
      {
        heading: "Price the uncertainty",
        body: [
          "AI features have variable costs. Product design and pricing should account for model routing, caching and quotas so the experience stays good and margins stay healthy.",
        ],
      },
    ],
    services: ["ai-product-development", "ai-copilot-development", "generative-ai"],
    technologies: ["llm", "rag"],
    tags: ["Product", "AI UX", "Trust"],
  },
  {
    slug: "building-an-mvp-you-wont-rewrite",
    title: "Building an MVP you won't have to rewrite",
    category: "startups",
    division: "digital",
    excerpt: "Narrow scope, not low standards. The cheapest MVP is the one whose foundations survive product-market fit.",
    date: "2026-07-15",
    readingTime: "6 min",
    author: AUTHOR,
    sections: [
      {
        heading: "Cut scope, not quality",
        body: [
          "The fastest path to learning is a product that does one job well. Speed comes from building less — not from skipping types, tests, CI or sensible data models, which cost little upfront and a great deal to retrofit.",
        ],
      },
      {
        heading: "Decisions that are expensive to change",
        body: [
          "A few decisions deserve care even in an MVP because changing them later is painful.",
        ],
        bullets: [
          "Tenancy and permissions model",
          "Core data model and identifiers",
          "Money handling (if any) — use a ledger, not balance columns",
          "Authentication approach",
          "Analytics instrumentation",
        ],
      },
      {
        heading: "Decisions that can wait",
        body: [
          "Microservices, multi-region infrastructure, complex caching and custom design systems can wait. A well-structured monolith on a managed platform will carry most products well past product-market fit.",
        ],
      },
      {
        heading: "Instrument the hypotheses",
        body: [
          "An MVP exists to test assumptions. Define what behaviour would validate or invalidate them and instrument it from day one, so decisions after launch are based on data.",
        ],
      },
    ],
    services: ["mvp-development", "saas-development", "product-development"],
    technologies: ["nextjs", "typescript", "postgresql"],
    tags: ["Startups", "MVP", "Architecture"],
  },
  {
    slug: "stablecoins-in-the-enterprise-treasury",
    title: "Stablecoins in the enterprise treasury: a technology checklist",
    category: "enterprise",
    division: "fintech",
    excerpt: "Before holding or moving stablecoins, enterprises need custody, policies, accounting data, reconciliation and clear partner responsibilities.",
    date: "2026-07-08",
    readingTime: "7 min",
    author: AUTHOR,
    sections: [
      {
        heading: "Why treasuries are looking at stablecoins",
        body: [
          "Stablecoins can move value across borders around the clock and settle quickly, which is attractive for intercompany transfers, supplier payments and managing liquidity across regions. They also introduce new operational, technical and regulatory considerations that must be addressed with advisors.",
        ],
      },
      {
        heading: "Custody and key management",
        body: [
          "Enterprises should use qualified custodians or institutional MPC providers rather than ad-hoc wallets. Key management determines who can move funds and how recovery works.",
        ],
      },
      {
        heading: "Policies and approvals",
        body: [
          "Transaction policies — amount limits, destination allowlists, approval quorums, time windows — should mirror existing treasury controls and be enforced by software, not spreadsheets.",
        ],
        bullets: ["Segregation of duties for initiation and approval", "Allowlisted counterparty addresses", "Screening before outbound transfers"],
      },
      {
        heading: "Accounting and reconciliation",
        body: [
          "Finance teams need transaction data, valuations and fee records in formats their systems accept, and daily reconciliation between internal records, custodian balances and on-chain activity.",
        ],
      },
      {
        heading: "Risk and partners",
        body: [
          "Issuer, network and liquidity risks should be assessed and monitored. Conversion to and from fiat typically relies on licensed partners whose responsibilities must be clear. With these foundations, stablecoins become another controlled treasury instrument rather than an operational exception.",
        ],
      },
    ],
    services: ["stablecoin-treasury", "enterprise-wallet-development", "transaction-policy-engine", "stablecoin-settlement"],
    technologies: ["erc-20", "mpc-cryptography", "double-entry-ledgers"],
    tags: ["Stablecoins", "Treasury", "Enterprise"],
  },
];

export const getInsight = (slug: string) => insights.find((i) => i.slug === slug);
export const getInsightCategory = (slug: string) => insightCategories.find((c) => c.slug === slug);
