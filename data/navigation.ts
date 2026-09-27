import type { DivisionId, NavColumn, NavLink } from "./types";
import { products } from "./products";
import { teams } from "./teams";
import { solutions } from "./solutions";
import { industries } from "./industries";
import { technologies } from "./technologies";
import { techLogo } from "@/lib/brand/techLogos";

export interface NavTab {
  label: string;
  href: string;
  description: string;
  /** Icon name from components/ui/Icon and division colour for the tab. */
  icon: string;
  tone: DivisionId;
  columns: NavColumn[];
}

export interface NavItem {
  label: string;
  href: string;
  /** Simple mega menu with columns. */
  columns?: NavColumn[];
  /** Tabbed mega menu (Services). */
  tabs?: NavTab[];
  feature?: { eyebrow: string; title: string; description: string; href: string; cta: string };
  /** Small print under the panel, e.g. a link to the full index. */
  footer?: { text: string; label: string; href: string };
}

const l = (label: string, href: string, description?: string, icon?: string): NavLink => ({ label, href, description, icon });
const s = (slug: string, label: string) => l(label, `/services/${slug}`);
const product = (slug: string, label: string, icon?: string) => l(label, `/products/${slug}`, products.find((p) => p.slug === slug)?.tagline, icon);
const team = (slug: string, label: string, icon?: string) => l(label, `/dedicated-teams/${slug}`, teams.find((t) => t.slug === slug)?.summary, icon);
const solution = (slug: string, label: string, icon?: string) => l(label, `/solutions/${slug}`, solutions.find((x) => x.slug === slug)?.summary, icon);
const industry = (slug: string, label: string, icon?: string) => l(label, `/industries/${slug}`, industries.find((x) => x.slug === slug)?.summary, icon);
const tech = (slug: string, label: string): NavLink => {
  const icon = techLogo[slug];
  const t = technologies.find((x) => x.slug === slug);
  return { label, href: `/technologies/${slug}`, description: t?.summary, logo: icon ? { path: icon.path, hex: icon.hex } : undefined };
};

export const mainNav: NavItem[] = [
  {
    label: "Solutions",
    href: "/solutions",
    columns: [
      {
        title: "By goal",
        links: [
          solution("digital-transformation", "Digital Transformation", "Workflow"),
          solution("ai-transformation", "AI Transformation"),
          solution("product-engineering", "Product Engineering", "Rocket"),
          solution("legacy-modernization", "Legacy Modernization"),
          solution("mvp-to-scale", "MVP to Scale"),
        ],
      },
      {
        title: "By stage",
        links: [
          solution("startups", "Startups", "Rocket"),
          solution("scaleups", "Scaleups"),
          solution("enterprise", "Enterprise", "Building2"),
          solution("dedicated-engineering", "Dedicated Engineering", "Users"),
        ],
      },
      {
        title: "By domain",
        links: [
          solution("fintech-transformation", "FinTech Transformation", "Landmark"),
          solution("web3-transformation", "Web3 Transformation", "Blocks"),
          solution("cloud-transformation", "Cloud Transformation", "Cloud"),
          solution("web2-web3-fintech", "Web2 + Web3 FinTech", "Coins"),
        ],
      },
    ],
    feature: {
      eyebrow: "Our specialism",
      title: "Web2 + Web3 FinTech",
      description: "One ledger and one set of controls across bank rails, cards, stablecoins and tokenized assets.",
      href: "/solutions/web2-web3-fintech",
      cta: "See the architecture",
    },
    footer: { text: "15 solutions by goal, stage and domain.", label: "All solutions", href: "/solutions" },
  },
  {
    label: "Services",
    href: "/services",
    footer: { text: "300+ services across Web3, FinTech, Digital Assets, AI and Cloud.", label: "Browse all services", href: "/services" },
    tabs: [
      {
        label: "Web3",
        icon: "Blocks",
        tone: "web3",
        href: "/capabilities/web3",
        description: "Blockchain and decentralized infrastructure built for rapid deployment.",
        columns: [
          { title: "Strategy", links: [s("web3-consulting", "Web3 Consulting"), s("digital-asset-strategy", "Digital Asset Strategy"), s("protocol-consulting", "Protocol Architecture")] },
          { title: "Infrastructure", links: [s("blockchain-infrastructure", "Blockchain Infrastructure"), s("protocol-development", "Protocol Engineering"), s("interoperability-development", "Interoperability"), s("layer-2-development", "L1 / L2 Infrastructure")] },
          { title: "Financial", links: [s("defi-development", "DeFi"), s("dex-development", "DEX"), s("rwa-tokenization", "RWA"), s("asset-tokenization", "Tokenization"), s("stablecoin-platform-development", "Stablecoins"), s("crypto-payment-gateway", "Crypto Payments")] },
          { title: "Build", links: [s("blockchain-development", "Blockchain Development"), s("web3-development", "Web3 Development"), s("smart-contract-development", "Smart Contracts"), s("token-development", "Token Development"), s("staking-platform-development", "Staking")] },
          { title: "Security", links: [s("smart-contract-security", "Smart Contract Security"), s("protocol-security", "Protocol Security"), s("audit-readiness", "Audit Readiness")] },
        ],
      },
      {
        label: "FinTech",
        icon: "Landmark",
        tone: "fintech",
        href: "/capabilities/fintech",
        description: "Financial infrastructure for next-generation banking and payments.",
        columns: [
          { title: "Banking", links: [s("digital-banking-development", "Digital Banking"), s("neobank-development", "Neobank"), s("core-banking-platform", "Core Banking"), s("banking-api", "Banking APIs")] },
          { title: "Payments", links: [s("payment-gateway-development", "Payment Gateway"), s("payment-orchestration", "Payment Orchestration"), s("merchant-payment-platform", "Merchant Payments"), s("cross-border-payment-platform", "Cross-border Payments")] },
          { title: "Cards & Web3 Finance", links: [s("crypto-card-platform", "Crypto Cards"), s("card-issuing-platform", "Debit / Prepaid Cards"), s("stablecoin-payment-infrastructure", "Stablecoin Payments"), s("remittance-platform", "Remittance")] },
          { title: "Infrastructure", links: [s("financial-api-development", "Financial APIs"), s("fintech-development", "Ledger"), s("payment-reconciliation", "Reconciliation"), s("compliance-automation", "Risk & Compliance Tech")] },
        ],
      },
      {
        label: "Digital Assets",
        icon: "Coins",
        tone: "digital-assets",
        href: "/capabilities/digital-assets",
        description: "White-label exchanges, wallets and digital asset platforms.",
        columns: [
          { title: "Exchanges", links: [s("crypto-exchange-development", "Crypto Exchange"), s("centralized-exchange-development", "Centralized Exchange"), s("hybrid-exchange-development", "Hybrid Exchange"), s("p2p-exchange-development", "P2P Exchange"), s("exchange-matching-engine", "Matching Engine")] },
          { title: "Wallets", links: [s("crypto-wallet-development", "Crypto Wallet"), s("multi-chain-wallet-development", "Multi-Chain Wallet"), s("custodial-wallet-development", "Custodial Wallet"), s("institutional-wallet-development", "MPC / Institutional Wallet")] },
          { title: "Trading & Custody", links: [s("crypto-brokerage-platform", "Brokerage Platform"), s("digital-asset-custody-integration", "Digital Asset Custody"), s("crypto-onramp", "Crypto On-Ramp"), s("crypto-offramp", "Crypto Off-Ramp")] },
          { title: "White-label", links: [l("White-Label Exchange", "/products/crypto-exchange"), l("White-Label Wallet", "/products/crypto-wallet"), l("P2P Trading Platform", "/products/p2p-trading-platform"), l("Crypto Launchpad", "/products/web3-launchpad")] },
        ],
      },
      {
        label: "AI",
        icon: "Brain",
        tone: "ai",
        href: "/capabilities/ai",
        description: "Generative AI, agents, machine learning and automation.",
        columns: [
          { title: "Generative AI", links: [s("generative-ai", "Generative AI"), s("llm-development", "LLM Development"), s("rag-development", "RAG Development"), s("ai-copilot-development", "AI Copilots"), s("voice-ai-development", "Voice AI")] },
          { title: "Agents & Automation", links: [s("ai-agents", "AI Agents"), s("agentic-ai-development", "Agentic AI"), s("ai-workflow-automation", "Workflow Automation"), s("ai-document-processing", "Document Processing")] },
          { title: "ML & Enterprise", links: [s("machine-learning", "Machine Learning"), s("computer-vision", "Computer Vision"), s("enterprise-ai", "Enterprise AI"), s("ai-consulting", "AI Consulting")] },
        ],
      },
      {
        label: "Cloud",
        icon: "Cloud",
        tone: "cloud",
        href: "/capabilities/cloud",
        description: "Infrastructure engineered for reliability and security.",
        columns: [
          { title: "Cloud", links: [s("cloud-consulting", "Cloud Consulting"), s("cloud-migration", "Cloud Migration"), s("aws-development", "AWS"), s("azure-development", "Azure"), s("google-cloud-development", "Google Cloud")] },
          { title: "DevOps & Platform", links: [s("devops", "DevOps"), s("kubernetes", "Kubernetes"), s("ci-cd", "CI/CD"), s("platform-engineering", "Platform Engineering"), s("site-reliability-engineering", "SRE")] },
          { title: "Resilience", links: [s("disaster-recovery", "Disaster Recovery"), s("high-availability", "High Availability"), s("cloud-monitoring", "Monitoring"), s("cloud-managed-services", "Managed Services")] },
        ],
      },
      {
        label: "Software",
        icon: "CodeXml",
        tone: "digital",
        href: "/capabilities/digital",
        description: "Digital products designed to launch and scale.",
        columns: [
          { title: "Product", links: [s("saas-development", "SaaS Development"), s("mvp-development", "MVP Development"), s("marketplace-development", "Marketplaces"), s("ecommerce-development", "E-commerce")] },
          { title: "Engineering", links: [s("custom-software-development", "Custom Software"), s("web-development", "Web Apps"), s("mobile-app-development", "Mobile Apps"), s("api-development", "APIs")] },
          { title: "Enterprise", links: [s("enterprise-software", "Enterprise Software"), s("crm-development", "CRM"), s("erp-development", "ERP"), s("legacy-modernization", "Legacy Modernization")] },
        ],
      },
      {
        label: "Cybersecurity",
        icon: "ShieldCheck",
        tone: "cloud",
        href: "/services#cybersecurity",
        description: "Security engineering across cloud, applications and identity.",
        columns: [
          { title: "Protect", links: [s("cloud-security", "Cloud Security"), s("application-security", "Application Security"), s("api-security", "API Security"), s("encryption", "Encryption")] },
          { title: "Identity", links: [s("identity-access-management", "Identity & Access"), s("zero-trust", "Zero Trust"), s("secrets-management", "Secrets Management")] },
          { title: "Detect & Test", links: [s("threat-detection", "Threat Detection"), s("security-monitoring", "Security Monitoring"), s("penetration-testing", "Penetration Testing")] },
        ],
      },
      {
        label: "Dedicated Teams",
        icon: "Users",
        tone: "digital",
        href: "/dedicated-teams",
        description: "Senior engineers and squads working inside your roadmap.",
        columns: [
          { title: "Specialist teams", links: [team("blockchain-team", "Blockchain Team"), team("fintech-team", "FinTech Team"), team("ai-team", "AI Team"), team("devops-team", "DevOps Team")] },
          { title: "Hire developers", links: [l("Blockchain Developers", "/hire-blockchain-developers"), l("Solidity Developers", "/hire-solidity-developers"), l("AI Developers", "/hire-ai-developers"), l("FinTech Developers", "/hire-fintech-developers")] },
          { title: "Engineering", links: [l("React Developers", "/hire-react-developers"), l("Node.js Developers", "/hire-nodejs-developers"), l("Python Developers", "/hire-python-developers"), l("Dedicated Developers", "/hire-dedicated-developers")] },
        ],
      },
    ],
  },
  {
    label: "Products",
    href: "/products",
    columns: [
      {
        title: "Digital Assets",
        links: [
          product("crypto-exchange", "White-Label Crypto Exchange", "LineChart"),
          product("crypto-wallet", "White-Label Crypto Wallet", "Wallet"),
          product("p2p-trading-platform", "P2P Trading Platform", "Users"),
          product("web3-launchpad", "Crypto Launchpad", "Rocket"),
        ],
      },
      {
        title: "FinTech",
        links: [
          product("neobank", "White-Label Neobank", "Smartphone"),
          product("crypto-card", "Crypto Card Platform", "CreditCard"),
          product("crypto-payment", "Crypto Payment Gateway", "Coins"),
          product("digital-bank", "Digital Banking Platform", "Landmark"),
        ],
      },
      {
        title: "Web3 & AI",
        links: [
          product("rwa-platform", "RWA Tokenization Platform", "House"),
          product("defi-platform", "DeFi Platform", "Layers"),
          product("staking-platform", "Staking Platform", "Blocks"),
          product("ai-agent-platform", "AI Agent Platform", "Bot"),
        ],
      },
    ],
    feature: {
      eyebrow: "White-label platforms",
      title: "Launch without starting from zero",
      description: "Production-ready foundations, customised by dedicated engineers. Typical software implementation: 1–6 weeks.",
      href: "/products",
      cta: "Browse all products",
    },
  },
  {
    label: "Industries",
    href: "/industries",
    columns: [
      {
        title: "Financial services",
        links: [industry("banking", "Banking", "Landmark"), industry("fintech", "FinTech", "Coins"), industry("payments", "Payments", "CreditCard"), industry("insurance", "Insurance", "ShieldCheck")],
      },
      {
        title: "Commerce & platforms",
        links: [industry("ecommerce", "E-commerce", "ShoppingCart"), industry("saas", "SaaS", "Layers"), industry("gaming", "Gaming", "Gamepad2"), industry("real-estate", "Real Estate", "House")],
      },
      {
        title: "Enterprise & public",
        links: [industry("enterprise", "Enterprise", "Building2"), industry("healthcare", "Healthcare", "HeartPulse"), industry("logistics", "Logistics", "Truck"), industry("education", "Education", "GraduationCap")],
      },
    ],
    feature: {
      eyebrow: "Regulated industries",
      title: "Built for high-stakes systems",
      description: "Finance, payments and digital assets — where correctness, security and auditability decide success.",
      href: "/industries/fintech",
      cta: "FinTech industry",
    },
    footer: { text: "19 industries.", label: "All industries", href: "/industries" },
  },
  {
    label: "Technologies",
    href: "/technologies",
    columns: [
      { title: "Build", links: [tech("react", "React"), tech("nextjs", "Next.js"), tech("nodejs", "Node.js"), tech("python", "Python"), tech("flutter", "Flutter")] },
      { title: "Data & Cloud", links: [tech("postgresql", "PostgreSQL"), tech("kafka", "Apache Kafka"), tech("kubernetes", "Kubernetes"), tech("terraform", "Terraform"), tech("google-cloud", "Google Cloud")] },
      { title: "AI & Web3", links: [tech("llm", "LLMs"), tech("rag", "RAG"), tech("ethereum", "Ethereum"), tech("solidity", "Solidity"), tech("solana", "Solana")] },
    ],
    footer: { text: "134 technologies in 14 categories.", label: "Technology directory", href: "/technologies" },
  },
  {
    label: "Resources",
    href: "/resources",
    columns: [
      {
        title: "Learn",
        links: [
          l("Insights", "/insights", "Guides and engineering notes", "Newspaper"),
          l("Resources", "/resources", "Guides, checklists and templates", "BookOpen"),
          l("Glossary", "/glossary", "Technology terms explained", "BookOpen"),
          l("Work", "/work", "Reference architectures", "Layers"),
        ],
      },
      {
        title: "Company",
        links: [
          l("About", "/company/about", "Who we are and how we work", "Building2"),
          l("Leadership", "/company/leadership", "The people who lead Shivacha", "Users"),
          l("Careers", "/careers", "Open application tracks", "Briefcase"),
          l("Contact", "/contact", "Offices and enquiry desks", "Mail"),
        ],
      },
    ],
    feature: {
      eyebrow: "Planning tool",
      title: "Project estimator",
      description: "Indicative timeline and team shape for your platform in about 30 seconds. No prices, no email required.",
      href: "/project-estimator",
      cta: "Estimate a project",
    },
  },
];

export const footerNav: NavColumn[] = [
  { title: "Services", links: [l("Web3", "/capabilities/web3"), l("FinTech", "/capabilities/fintech"), l("Digital Assets", "/capabilities/digital-assets"), l("AI", "/capabilities/ai"), l("Cloud", "/capabilities/cloud"), l("Product Engineering", "/capabilities/digital"), l("All services", "/services")] },
  { title: "Products", links: [l("White-Label Exchange", "/products/crypto-exchange"), l("White-Label Wallet", "/products/crypto-wallet"), l("White-Label Neobank", "/products/neobank"), l("Crypto Card Platform", "/products/crypto-card"), l("AI Agent Platform", "/products/ai-agent-platform"), l("All products", "/products")] },
  { title: "Solutions", links: [l("Startups", "/solutions/startups"), l("Enterprise", "/solutions/enterprise"), l("Web2 + Web3 FinTech", "/solutions/web2-web3-fintech"), l("Dedicated Teams", "/dedicated-teams"), l("Hire Developers", "/hire-developers"), l("White-Label Development", "/white-label-development")] },
  { title: "Industries", links: [l("Banking", "/industries/banking"), l("FinTech", "/industries/fintech"), l("Payments", "/industries/payments"), l("Enterprise", "/industries/enterprise"), l("Markets", "/markets"), l("All industries", "/industries")] },
  { title: "Resources", links: [l("Insights", "/insights"), l("Resources", "/resources"), l("Glossary", "/glossary"), l("Project Estimator", "/project-estimator"), l("Technologies", "/technologies"), l("Work", "/work")] },
  { title: "Company", links: [l("About", "/company/about"), l("Leadership", "/company/leadership"), l("Careers", "/careers"), l("Partners", "/company/partners"), l("Contact", "/contact")] },
];
