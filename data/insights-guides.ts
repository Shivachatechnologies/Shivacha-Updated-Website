import type { Insight } from "./types";
import { faqs } from "./_helpers";

/**
 * Buyer guides: cost drivers, comparisons and hiring guides. No invented prices — cost is explained
 * through the scope, team and time that drive it, which is what an honest estimate is built from.
 */
const AUTHOR = "Shivacha Engineering";

export const guideInsights: Insight[] = [
  {
    slug: "blockchain-development-cost",
    title: "How much does blockchain development cost? The factors that actually drive the estimate",
    category: "web3",
    division: "web3",
    excerpt: "Blockchain budgets are driven by contract complexity, custody, audits, chains and the off-chain system around them. Here is how to scope each one before asking for a quote.",
    date: "2026-09-22",
    readingTime: "9 min",
    author: AUTHOR,
    sections: [
      {
        heading: "Why one-line price lists are misleading",
        body: [
          "Search for blockchain development cost and you will find tidy price tables. They are rarely useful, because two projects described as 'a token platform' can differ by an order of magnitude in effort. One is a standard token and a claim page; the other has permissioned transfers, investor onboarding, a custody integration and regulatory reporting.",
          "A realistic estimate is built from scope: which components you need, how complex each one is, and what assurance (testing, audit, monitoring) the value at risk demands. The sections below walk through those drivers so you can scope before you ask for a number.",
        ],
      },
      {
        heading: "Driver 1: smart contract complexity",
        body: [
          "Standard contracts built on reviewed libraries — an ERC-20 with vesting, an ERC-721 collection — are small pieces of work. Custom logic is where effort grows: pricing formulas, liquidations, cross-contract interactions, upgradeability and role systems each add specification, testing and review time.",
          "Contracts that will hold meaningful value need fuzz and invariant testing and an independent audit. Audit fees are paid to the audit firm and scale with lines of code and complexity; budget for them separately and book them early, because good auditors have waiting lists.",
        ],
        bullets: ["Number of contracts and external integrations", "Custom maths or economic logic", "Upgradeability and admin controls", "Independent audit scope and remediation time"],
      },
      {
        heading: "Driver 2: custody and wallets",
        body: [
          "Who holds the keys changes the architecture. Non-custodial dApps rely on users' wallets; custodial products need key management, withdrawal policies and operational controls; institutional platforms often integrate an MPC custody provider. Embedded wallets and account abstraction improve onboarding but add components to build and operate.",
        ],
      },
      {
        heading: "Driver 3: the off-chain system",
        body: [
          "In most production systems the off-chain part is larger than the contracts: indexers to read chain data quickly, a backend for accounts and notifications, admin and compliance tools, reporting and monitoring. Teams that budget only for contracts are usually surprised here.",
        ],
        bullets: ["Indexer or subgraph and API", "User accounts, KYC and notifications", "Admin, treasury and support tools", "Monitoring, alerting and incident runbooks"],
      },
      {
        heading: "Driver 4: chains, compliance and integrations",
        body: [
          "Each additional chain means deployments, testing and monitoring to maintain. Compliance integrations — KYC, wallet screening, Travel Rule messaging — add vendors and workflows. Fiat on- and off-ramps, custody providers and exchanges each bring an integration with its own sandbox and edge cases.",
        ],
      },
      {
        heading: "How to get an estimate you can trust",
        body: [
          "Write down the users, the core flows, the assets involved and the chains you are considering. Separate the must-haves for launch from later phases. Then ask for an estimate expressed as team, duration and assumptions — not just a total — so you can see what is included and challenge it.",
          "A short discovery phase is often the most effective way to reduce risk: it produces an architecture, a threat model and a phased plan, and the estimate that follows is far more reliable.",
        ],
      },
    ],
    services: ["blockchain-development", "smart-contract-development", "token-development", "blockchain-strategy"],
    technologies: ["ethereum", "solidity", "polygon", "solana"],
    tags: ["Cost guide", "Blockchain", "Smart contracts", "Budgeting"],
    cta: { label: "Discuss Your Blockchain Project", service: "Blockchain Development" },
    faqs: faqs([
      ["Is a smart contract audit included in development cost?", "Usually not. Independent audits are performed and invoiced by a separate audit firm. We prepare the code and documentation and fix findings."],
      ["What is the fastest low-risk way to start?", "A white-label foundation or a focused MVP on one chain, built on standard contracts, with non-launch features deferred. A discovery phase first keeps scope honest."],
    ]),
  },
  {
    slug: "crypto-exchange-development-cost",
    title: "Crypto exchange development cost: what goes into building a trading platform",
    category: "web3",
    division: "web3",
    excerpt: "A crypto exchange is several demanding systems at once — matching, wallets, risk, compliance and operations. Understanding each is the key to a realistic budget and timeline.",
    date: "2026-09-21",
    readingTime: "10 min",
    author: AUTHOR,
    sections: [
      {
        heading: "An exchange is not one product",
        body: [
          "A centralised exchange combines an order-matching engine, a balance ledger, hot and cold wallet infrastructure, deposit and withdrawal processing, KYC and AML, market data, a trading interface, an admin console and 24/7 operations. Each is a serious piece of engineering; together they are one of the more demanding products in fintech.",
          "That is why the first cost question is scope: spot only or derivatives, which assets and chains, which markets and licences, and whether you are building everything or starting from components.",
        ],
      },
      {
        heading: "The core components and what drives their effort",
        body: ["The effort for each component depends on performance targets, asset coverage and how much is bought versus built."],
        bullets: [
          "Matching engine — throughput and latency targets, order types, fairness guarantees",
          "Ledger — double-entry balances, fees, reconciliation with wallets and banks",
          "Wallet infrastructure — number of chains, hot/cold split, custody provider or in-house",
          "Compliance — KYC tiers, transaction monitoring, wallet screening, Travel Rule",
          "Trading UI and mobile apps — charts, order entry, portfolio, notifications",
          "Admin and operations — support tools, limits, listings, reporting",
        ],
      },
      {
        heading: "Build, white-label or hybrid?",
        body: [
          "White-label exchange software gets a platform live faster but limits differentiation and ties you to a vendor's roadmap. A full custom build gives control but takes longest. Many operators choose a hybrid: buy commodity components such as custody or KYC, and build the matching, ledger and experience that differentiate them.",
        ],
      },
      {
        heading: "Costs beyond engineering",
        body: [
          "Licensing and legal work, liquidity arrangements, security testing, third-party vendors (custody, KYC, market data) and round-the-clock operations are often larger ongoing costs than the initial build. Plan for them explicitly; we can scope the engineering, but licensing and legal advice must come from qualified advisors.",
        ],
      },
      {
        heading: "A realistic path to launch",
        body: [
          "Start with a narrow launch: a small set of assets and pairs, one or two fiat rails, and the compliance scope your licence requires. Invest early in the ledger and reconciliation, because fixing balance errors after launch is far more expensive than getting them right first.",
        ],
      },
    ],
    services: ["crypto-exchange-development", "centralized-exchange-development", "exchange-matching-engine", "exchange-wallet-infrastructure"],
    technologies: ["go", "rust", "postgresql", "kafka"],
    tags: ["Cost guide", "Crypto exchange", "Trading", "Budgeting"],
    cta: { label: "Get Exchange Development Estimate", service: "Crypto Exchange Development" },
    faqs: faqs([
      ["How long does it take to build a crypto exchange?", "A narrowly scoped spot exchange typically takes several months to reach a production launch, plus time for security testing, licensing and partner onboarding. Derivatives and multi-region launches take longer."],
      ["Do you help with exchange licences?", "No. We build the technology and support your compliance team with system documentation; licensing requires legal advisors."],
    ]),
  },
  {
    slug: "fintech-app-development-cost",
    title: "FinTech app development cost: scoping payments, banking and lending products",
    category: "fintech",
    division: "fintech",
    excerpt: "FinTech budgets are shaped less by screens than by partners, ledgers, compliance and reliability. A guide to the drivers behind a neobank, wallet, payments or lending build.",
    date: "2026-09-20",
    readingTime: "8 min",
    author: AUTHOR,
    sections: [
      {
        heading: "The screens are the smallest part",
        body: [
          "A FinTech app can look simple — a balance, a card, a transfer button — while the system behind it is not. Money movement must be correct, auditable and resilient to every failure a network or partner can produce. That is where most of the effort, and the budget, goes.",
        ],
      },
      {
        heading: "Driver 1: partners and integrations",
        body: [
          "Most FinTechs build on partners: a sponsor bank or BaaS provider, a card issuer-processor, payment processors, KYC and fraud vendors, open banking providers. Each integration brings sandbox quirks, certification steps and failure modes. The number and maturity of partners is often the single biggest driver of timeline.",
        ],
      },
      {
        heading: "Driver 2: ledger and reconciliation",
        body: [
          "A double-entry ledger, idempotent payment operations and daily reconciliation against partner reports are not optional at scale. Building them properly from the start is cheaper than retrofitting them after the first unexplained balance.",
        ],
        bullets: ["Double-entry journal and balance model", "Idempotency keys on every money-moving call", "Automated reconciliation and exception queues", "Reporting for finance and regulators"],
      },
      {
        heading: "Driver 3: compliance, security and operations",
        body: [
          "Onboarding flows, transaction monitoring, maker-checker approvals, audit logs, data protection and incident response all need engineering time — and their scope depends on your markets and licences. Your compliance team and advisors define the requirements; the engineering follows.",
        ],
      },
      {
        heading: "Scoping an MVP that can grow",
        body: [
          "Choose one market, one core use case and the minimum set of partners. Build the ledger and audit trail properly, keep the product surface small, and defer secondary features. This keeps the first release achievable without creating the rework that sinks many FinTech roadmaps.",
        ],
      },
    ],
    services: ["fintech-development", "neobank-development", "payment-platform-development", "lending-platform-development"],
    technologies: ["typescript", "nodejs", "postgresql", "kafka"],
    tags: ["Cost guide", "FinTech", "Payments", "Neobank"],
    cta: { label: "Discuss Your FinTech Product", service: "FinTech Development" },
  },
  {
    slug: "ai-development-cost",
    title: "AI development cost: what you pay for when you build an AI product or agent",
    category: "ai",
    division: "ai",
    excerpt: "Model fees are rarely the main cost. Data preparation, evaluation, integrations and guardrails decide both the budget and whether the system works.",
    date: "2026-09-19",
    readingTime: "8 min",
    author: AUTHOR,
    sections: [
      {
        heading: "The model is the cheapest part to start with",
        body: [
          "Access to capable language models is inexpensive to begin with, which is why demos are quick. The cost of a production AI system sits elsewhere: getting data into shape, defining and measuring quality, integrating with real workflows and keeping the system safe and affordable at scale.",
        ],
      },
      {
        heading: "Driver 1: data and retrieval",
        body: [
          "For assistants that answer from your documents, parsing, chunking, indexing and permission filtering are the core work. Messy PDFs, scanned documents and scattered sources add effort; so does respecting who may see what.",
        ],
      },
      {
        heading: "Driver 2: evaluation",
        body: [
          "An evaluation set — representative questions or tasks with expected results — is what turns AI development into engineering. Building it takes time with your subject-matter experts, and it pays for itself on every model or prompt change afterwards.",
        ],
      },
      {
        heading: "Driver 3: integrations and actions",
        body: [
          "Agents that act — create tickets, update records, draft payments — need typed tools, permissions, approval steps and audit logs. Each system integrated adds work, and higher-risk actions need more guardrails.",
        ],
        bullets: ["Tool and API integrations", "Human approval for consequential actions", "Logging and review workflows", "Fallbacks when the model is unsure"],
      },
      {
        heading: "Driver 4: running cost",
        body: [
          "Per-request model cost, hosting, vector storage and monitoring are ongoing. Caching, choosing smaller models where quality allows and limiting context size keep them predictable. Ask for an estimate of running cost alongside build cost.",
        ],
      },
    ],
    services: ["ai-development", "ai-agents", "rag-development", "ai-consulting"],
    technologies: ["python", "llm", "openai"],
    tags: ["Cost guide", "AI", "LLM", "Agents"],
    cta: { label: "Build Your AI Product", service: "AI Development" },
  },
  {
    slug: "mvp-development-cost",
    title: "MVP development cost: how to scope a first release without wasting runway",
    category: "startups",
    division: "digital",
    excerpt: "An MVP's cost is mostly a scoping decision. The discipline of cutting to the riskiest assumption is what keeps a first release fast and useful.",
    date: "2026-09-18",
    readingTime: "7 min",
    author: AUTHOR,
    sections: [
      {
        heading: "Minimum means the riskiest assumption",
        body: [
          "An MVP exists to test the assumption most likely to kill the business — that users want it, will pay, or will switch. Every feature that does not help test it is cost without learning. The biggest lever on MVP cost is therefore not the hourly rate but the feature list.",
        ],
      },
      {
        heading: "What drives effort",
        body: ["Once the core flow is clear, effort is driven by a handful of choices."],
        bullets: ["Number of user roles (each needs its own flows and permissions)", "Platforms — web only, or iOS and Android too", "Payments, integrations and admin tools", "Design polish needed for your audience", "Regulated data or domains (health, finance, crypto)"],
      },
      {
        heading: "Cut, defer or fake",
        body: [
          "For every feature ask: can we cut it, defer it to phase two, or handle it manually behind the scenes for the first hundred users? Manual operations are a legitimate MVP tool; automating them before you know they matter is not.",
        ],
      },
      {
        heading: "Build so you can keep going",
        body: [
          "Cutting scope is not the same as cutting quality. A sensible stack, automated tests on the core flows, CI/CD and basic monitoring cost little up front and prevent the rewrite that many MVPs need after early traction.",
        ],
      },
    ],
    services: ["mvp-development", "saas-development", "product-development", "web-development"],
    technologies: ["nextjs", "typescript", "postgresql"],
    tags: ["Cost guide", "MVP", "Startups"],
    cta: { label: "Discuss My MVP", service: "SaaS Development" },
  },
  {
    slug: "dedicated-developers-vs-project-outsourcing",
    title: "Dedicated developers vs project-based outsourcing: which model fits your roadmap?",
    category: "software-engineering",
    division: "digital",
    excerpt: "Fixed-scope projects and dedicated teams solve different problems. How to choose based on how well-defined your scope is and who owns product decisions.",
    date: "2026-09-17",
    readingTime: "7 min",
    author: AUTHOR,
    sections: [
      {
        heading: "Two models, two kinds of risk",
        body: [
          "In a fixed-scope project, the vendor commits to delivering a defined scope for an agreed price; the risk of estimation errors sits largely with the vendor, and change is handled through change requests. In a dedicated team, you get engineers who work only on your product under your direction; you own priorities and can change them every sprint.",
        ],
      },
      {
        heading: "Choose fixed scope when",
        body: [],
        bullets: ["The scope is well defined and unlikely to change", "You need a predictable budget for a single deliverable", "You do not have product or engineering leadership to direct a team", "The work has a clear end, such as a migration or integration"],
      },
      {
        heading: "Choose a dedicated team when",
        body: [],
        bullets: ["Your roadmap is evolving and priorities change often", "The product will be developed for many months or years", "You want engineers to build deep knowledge of your domain", "You have a product owner who can set priorities"],
      },
      {
        heading: "The hybrid many teams use",
        body: [
          "A common pattern is a fixed-scope discovery or MVP, followed by a dedicated team once the product direction is proven. It gives budget certainty up front and flexibility once learning speeds up.",
        ],
      },
    ],
    services: ["custom-software-development", "product-development", "mvp-development"],
    technologies: ["typescript", "react", "nodejs"],
    tags: ["Comparison", "Dedicated teams", "Outsourcing"],
    cta: { label: "Build My Development Team", service: "Dedicated Development Team" },
  },
  {
    slug: "ethereum-vs-polygon",
    title: "Ethereum vs Polygon: choosing where to deploy your smart contracts",
    category: "web3",
    division: "web3",
    excerpt: "Ethereum mainnet offers the deepest security and liquidity; Polygon offers lower fees and fast confirmation. The right choice depends on value at risk, users and ecosystem.",
    date: "2026-09-16",
    readingTime: "7 min",
    author: AUTHOR,
    sections: [
      {
        heading: "Same tooling, different trade-offs",
        body: [
          "Polygon PoS is EVM-compatible, so contracts written in Solidity with Foundry or Hardhat deploy to both networks with little change. The decision is less about code and more about security model, fees, user base and the protocols you need to integrate with.",
        ],
      },
      {
        heading: "When Ethereum mainnet fits",
        body: [],
        bullets: ["High-value assets where the strongest security and decentralisation matter", "Integration with DeFi protocols and liquidity that live on mainnet", "Institutional users who expect mainnet settlement", "Low transaction frequency, where higher fees per transaction are acceptable"],
      },
      {
        heading: "When Polygon fits",
        body: [],
        bullets: ["Consumer products with many low-value transactions", "Gaming, loyalty and collectibles where fees must be negligible", "Projects that want EVM tooling with lower cost", "Markets where Polygon ecosystem partners are already in use"],
      },
      {
        heading: "Don't forget the Layer 2s",
        body: [
          "Ethereum rollups such as Arbitrum, Optimism and Base also offer low fees with security anchored to Ethereum. For many new projects the realistic shortlist is Ethereum mainnet, one or two rollups and Polygon — compared on fees, ecosystem, bridging and the wallets your users already have.",
        ],
      },
      {
        heading: "Deciding",
        body: [
          "Write down the value at risk, expected transaction volume, required integrations and your users' wallets, then compare two or three networks against them. Deploying to several networks is possible, but each adds operational overhead, so start with one unless there is a clear reason.",
        ],
      },
    ],
    services: ["smart-contract-development", "blockchain-development", "layer-2-development"],
    technologies: ["ethereum", "polygon", "arbitrum", "optimism", "base"],
    tags: ["Comparison", "Ethereum", "Polygon", "Layer 2"],
    cta: { label: "Discuss Your Blockchain Project", service: "Blockchain Development" },
  },
  {
    slug: "solana-vs-evm",
    title: "Solana vs EVM chains: architecture, tooling and when each makes sense",
    category: "web3",
    division: "web3",
    excerpt: "Solana's parallel runtime and Rust programs differ fundamentally from the EVM's account model and Solidity. What that means for performance, talent and security.",
    date: "2026-09-14",
    readingTime: "8 min",
    author: AUTHOR,
    sections: [
      {
        heading: "Two different execution models",
        body: [
          "EVM chains execute Solidity or Vyper contracts that hold their own state. Solana programs are typically written in Rust (often with the Anchor framework) and are stateless; data lives in separate accounts passed into each instruction, which lets the runtime execute non-conflicting transactions in parallel.",
        ],
      },
      {
        heading: "Performance and cost",
        body: [
          "Solana is designed for high throughput and low fees on a single global state, which suits order books, payments and consumer apps with many transactions. EVM ecosystems reach low fees through Layer 2 rollups, at the cost of some fragmentation of liquidity and users across networks.",
        ],
      },
      {
        heading: "Tooling, talent and ecosystem",
        body: [
          "The EVM has the largest pool of developers, audited libraries such as OpenZeppelin, and the broadest wallet and DeFi support. Solana's tooling has matured substantially, but Rust and its account model have a steeper learning curve, and experienced auditors are fewer.",
        ],
      },
      {
        heading: "Security considerations",
        body: [
          "Each model has its own classes of bugs: re-entrancy and approval issues on the EVM; missing account ownership or signer checks on Solana. Whichever you choose, the team should know that platform's pitfalls well and test adversarially.",
        ],
      },
      {
        heading: "How to choose",
        body: [
          "Pick the ecosystem where your users, liquidity and integration partners already are, then check that performance and fees meet your needs. If you genuinely need both, design the off-chain system to be chain-agnostic and add the second chain once the first is stable.",
        ],
      },
    ],
    services: ["blockchain-development", "smart-contract-development", "web3-development"],
    technologies: ["solana", "rust", "ethereum", "solidity"],
    tags: ["Comparison", "Solana", "EVM", "Rust"],
    cta: { label: "Discuss Your Blockchain Project", service: "Blockchain Development" },
  },
  {
    slug: "react-vs-nextjs",
    title: "React vs Next.js: what's the difference and which should you build on?",
    category: "software-engineering",
    division: "digital",
    excerpt: "React is a UI library; Next.js is a framework built on it. When a plain React single-page app is enough, and when server rendering, routing and SEO make Next.js the better choice.",
    date: "2026-09-12",
    readingTime: "6 min",
    author: AUTHOR,
    sections: [
      {
        heading: "Library vs framework",
        body: [
          "React is a library for building user interfaces from components. On its own it leaves routing, data fetching, rendering strategy and build tooling to you. Next.js is a framework on top of React that provides those pieces — file-based routing, server and static rendering, server components, image optimisation and API routes.",
        ],
      },
      {
        heading: "When plain React is enough",
        body: [],
        bullets: ["Internal tools and dashboards behind a login", "Apps embedded inside another product", "Teams with an existing backend and routing setup they want to keep"],
      },
      {
        heading: "When Next.js is the better choice",
        body: [],
        bullets: ["Public pages that must rank in search and load fast", "Products mixing marketing pages, content and an app", "Teams that want server rendering and data fetching conventions out of the box", "Deployments on platforms optimised for Next.js"],
      },
      {
        heading: "Our default",
        body: [
          "For most new web products we start with Next.js and TypeScript because it covers both public and authenticated pages well. For a pure internal dashboard, a lighter React setup can be simpler. Either way, the decision should follow your product's needs, not fashion.",
        ],
      },
    ],
    services: ["web-development", "frontend-development", "saas-development"],
    technologies: ["react", "nextjs", "typescript"],
    tags: ["Comparison", "React", "Next.js"],
    cta: { label: "Build Your Product", service: "Web Development" },
  },
  {
    slug: "build-vs-buy-software",
    title: "Build vs buy: deciding when custom software is worth it",
    category: "enterprise",
    division: "digital",
    excerpt: "Buy what is commodity, build what differentiates — and be honest about which is which. A practical framework for build-versus-buy decisions.",
    date: "2026-09-10",
    readingTime: "7 min",
    author: AUTHOR,
    sections: [
      {
        heading: "The question behind the question",
        body: [
          "Build versus buy is really a question about differentiation and control. If a capability is how you win — your pricing engine, your underwriting, your customer experience — owning it is often worth the cost. If it is how everyone operates — payroll, email, accounting — buying is almost always better.",
        ],
      },
      {
        heading: "Buy when",
        body: [],
        bullets: ["The capability is commodity and mature products exist", "Speed matters more than fit", "You lack the team to maintain custom software long-term", "Regulatory or security certifications are expensive to reproduce"],
      },
      {
        heading: "Build when",
        body: [],
        bullets: ["The capability differentiates your product or operations", "Off-the-shelf tools force costly workarounds", "Licence costs at your scale exceed build and run cost", "You need control over data, roadmap or integration"],
      },
      {
        heading: "The common middle path",
        body: [
          "Most modern systems combine both: buy platforms for identity, payments, CRM or custody, and build the product layer and integrations that make them yours. The design goal is clean boundaries, so vendors can be swapped without rewriting the core.",
        ],
      },
      {
        heading: "Count the full cost",
        body: [
          "Compare total cost over several years: licences and usage fees versus build, hosting, maintenance and the team to own it. Include switching cost and vendor risk. The cheaper option in year one is often not the cheaper option in year three.",
        ],
      },
    ],
    services: ["custom-software-development", "enterprise-software", "software-modernization"],
    technologies: ["typescript", "postgresql"],
    tags: ["Comparison", "Strategy", "Enterprise"],
    cta: { label: "Discuss Your Project", service: "Other" },
  },
  {
    slug: "how-to-hire-blockchain-developers",
    title: "How to hire blockchain developers: skills to test and mistakes to avoid",
    category: "web3",
    division: "web3",
    excerpt: "Good blockchain developers combine security instinct, systems thinking and product sense. What to look for, how to test it, and the red flags that should end an interview.",
    date: "2026-09-09",
    readingTime: "8 min",
    author: AUTHOR,
    sections: [
      {
        heading: "Decide which blockchain developer you need",
        body: [
          "'Blockchain developer' covers very different roles: smart contract engineers, protocol and node engineers, dApp and wallet developers, and backend engineers who build indexers and integrations. Be specific about which you need — most products need two or three of these profiles, not one generalist.",
        ],
      },
      {
        heading: "Skills that matter",
        body: [],
        bullets: ["Security instinct: thinks about how code can be abused, not just how it works", "Testing discipline: fuzz and invariant tests, not only happy-path unit tests", "Understanding of gas, storage and upgrade patterns", "Off-chain skills: indexers, backends and key management", "Clear writing: specifications and documentation auditors can follow"],
      },
      {
        heading: "How to test them",
        body: [
          "Review real code they have shipped, ideally deployed and audited. Give a short practical exercise that includes a subtle vulnerability to find, not just a feature to write. Ask them to explain a design trade-off in writing — clarity of explanation predicts how well they will work with auditors and your team.",
        ],
      },
      {
        heading: "Red flags",
        body: [],
        bullets: ["Cannot explain common vulnerability classes or past incidents", "Dismisses audits or testing as unnecessary", "Copies contracts without understanding them", "Has only worked on testnets or tutorials for production roles"],
      },
      {
        heading: "In-house, freelance or dedicated team?",
        body: [
          "In-house hiring gives long-term ownership but takes time in a competitive market. Freelancers suit short, well-defined tasks. A dedicated team from a specialist partner gives you vetted engineers quickly, with continuity if someone leaves — useful while you build your own team.",
        ],
      },
    ],
    services: ["blockchain-development", "smart-contract-development", "web3-development"],
    technologies: ["solidity", "rust", "foundry", "ethereum"],
    tags: ["Hiring guide", "Blockchain", "Smart contracts"],
    cta: { label: "Hire Blockchain Developers", service: "Blockchain Development" },
  },
];
