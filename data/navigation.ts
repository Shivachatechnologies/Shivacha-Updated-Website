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
    label: "Services",
    href: "/services",
    footer: { text: "311+ services across five divisions.", label: "Browse all services", href: "/services" },
    tabs: [
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
        label: "FinTech",
        icon: "Landmark",
        tone: "fintech",
        href: "/capabilities/fintech",
        description: "Infrastructure for the next generation of financial products.",
        columns: [
          { title: "Banking", links: [s("digital-banking-development", "Digital Banking"), s("neobank-development", "Neobank"), s("core-banking-platform", "Core Banking"), s("banking-api", "Banking APIs")] },
          { title: "Payments", links: [s("payment-gateway-development", "Payment Gateway"), s("payment-orchestration", "Payment Orchestration"), s("merchant-payment-platform", "Merchant Payments"), s("cross-border-payment-platform", "Cross-border Payments")] },
          { title: "Web3 Finance", links: [s("stablecoin-fintech", "Stablecoins"), s("crypto-payment-platform", "Crypto Payments"), s("digital-asset-financial-infrastructure", "Digital Assets"), s("tokenized-finance", "Tokenization")] },
          { title: "Infrastructure", links: [s("financial-api-development", "Financial APIs"), s("fintech-development", "Ledger"), s("payment-reconciliation", "Reconciliation"), s("compliance-automation", "Risk & Compliance Tech")] },
        ],
      },
      {
        label: "Web3",
        icon: "Blocks",
        tone: "web3",
        href: "/capabilities/web3",
        description: "Institutional-grade blockchain and digital asset engineering.",
        columns: [
          { title: "Strategy", links: [s("web3-consulting", "Web3 Consulting"), s("digital-asset-strategy", "Digital Asset Strategy"), s("protocol-consulting", "Protocol Architecture")] },
          { title: "Infrastructure", links: [s("blockchain-infrastructure", "Blockchain Infrastructure"), s("protocol-development", "Protocol Engineering"), s("interoperability-development", "Interoperability"), s("digital-asset-custody-integration", "Custody Integration")] },
          { title: "Financial", links: [s("defi-development", "DeFi"), s("rwa-tokenization", "RWA"), s("asset-tokenization", "Tokenization"), s("stablecoin-platform-development", "Stablecoins"), s("crypto-payment-gateway", "Crypto Payments")] },
          { title: "Applications", links: [s("crypto-exchange-development", "Exchanges"), s("crypto-wallet-development", "Wallets"), s("smart-contract-development", "dApps & Contracts"), s("marketplace-development", "Marketplaces")] },
          { title: "Security", links: [s("smart-contract-security", "Smart Contract Security"), s("protocol-security", "Protocol Security"), s("audit-readiness", "Audit Readiness")] },
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
    ],
  },
  {
    label: "Products",
    href: "/products",
    columns: [
      {
        title: "FinTech",
        links: [
          product("neobank", "Neobank", "Smartphone"),
          product("digital-bank", "Digital Bank", "Landmark"),
          product("payment-gateway", "Payment Gateway", "CreditCard"),
          product("payment-orchestration", "Payment Orchestration", "Workflow"),
          product("hybrid-wallet", "Hybrid Wallet", "Wallet"),
        ],
      },
      {
        title: "Web3",
        links: [
          product("crypto-exchange", "Crypto Exchange", "LineChart"),
          product("rwa-platform", "RWA Platform", "House"),
          product("tokenization-platform", "Tokenization Platform", "Coins"),
          product("web3-wallet", "Web3 Wallet", "Wallet"),
          product("defi-platform", "DeFi Platform", "Layers"),
        ],
      },
      {
        title: "AI & Digital",
        links: [
          product("ai-agent-platform", "AI Agent Platform", "Bot"),
          product("ai-customer-support", "AI Customer Support", "Headphones"),
          product("ai-document-processing", "Document AI", "FileText"),
          product("crm-platform", "CRM Platform", "Users"),
          product("marketplace-platform", "Marketplace Platform", "Store"),
        ],
      },
    ],
    feature: {
      eyebrow: "48 ready-to-launch products",
      title: "Launch in weeks, not years",
      description: "Deploy in your own cloud, customise to your model and keep full control.",
      href: "/products",
      cta: "Browse all products",
    },
  },
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
        title: "By industry",
        links: [
          industry("banking", "Banking", "Landmark"),
          industry("payments", "Payments", "CreditCard"),
          industry("insurance", "Insurance", "ShieldCheck"),
          industry("healthcare", "Healthcare", "HeartPulse"),
          industry("ecommerce", "E-commerce", "ShoppingCart"),
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
    footer: { text: "15 solutions and 19 industries.", label: "All industries", href: "/industries" },
  },
  {
    label: "Teams",
    href: "/dedicated-teams",
    columns: [
      {
        title: "Engineering",
        links: [team("full-stack-team", "Full-Stack Team", "CodeXml"), team("mobile-team", "Mobile Team", "Smartphone"), team("devops-team", "DevOps Team", "GitMerge"), team("qa-team", "QA Team", "BadgeCheck")],
      },
      {
        title: "Specialist",
        links: [team("ai-team", "AI Team", "Brain"), team("fintech-team", "FinTech Team", "Landmark"), team("blockchain-team", "Blockchain Team", "Blocks"), team("cybersecurity-team", "Cybersecurity Team", "ShieldCheck")],
      },
    ],
    feature: {
      eyebrow: "Dedicated teams",
      title: "Build your engineering organisation",
      description: "Specialists, pods and full teams that work inside your roadmap and tools.",
      href: "/hire-developers",
      cta: "Hire developers",
    },
    footer: { text: "24 team types, from one specialist to a full squad.", label: "All teams", href: "/dedicated-teams" },
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
    label: "Company",
    href: "/company",
    columns: [
      {
        title: "Company",
        links: [
          l("About", "/company/about", "Who we are and how we work", "Building2"),
          l("Leadership", "/company/leadership", "The people who lead Shivacha", "Users"),
          l("Careers", "/careers", "Open application tracks", "Briefcase"),
          l("Contact", "/contact", "Talk to our team", "Mail"),
        ],
      },
      {
        title: "Learn",
        links: [
          l("Insights", "/insights", "Notes from our engineers", "Newspaper"),
          l("Resources", "/resources", "Guides, checklists and templates", "BookOpen"),
          l("Work", "/work", "Reference architectures", "Layers"),
          l("Markets", "/markets", "Where we deliver", "Globe"),
        ],
      },
    ],
    feature: {
      eyebrow: "Capabilities",
      title: "Five divisions, one partner",
      description: "AI, Digital, FinTech, Web3 and Cloud, engineered together.",
      href: "/capabilities",
      cta: "Explore capabilities",
    },
  },
];

export const footerNav: NavColumn[] = [
  { title: "Capabilities", links: [l("AI", "/capabilities/ai"), l("Digital", "/capabilities/digital"), l("FinTech", "/capabilities/fintech"), l("Web3", "/capabilities/web3"), l("Cloud", "/capabilities/cloud")] },
  { title: "Offerings", links: [l("Products", "/products"), l("Services", "/services"), l("Solutions", "/solutions"), l("Dedicated Teams", "/dedicated-teams"), l("Hire Developers", "/hire-developers")] },
  { title: "Explore", links: [l("Industries", "/industries"), l("Technologies", "/technologies"), l("Work", "/work"), l("Markets", "/markets"), l("Resources", "/resources"), l("Insights", "/insights")] },
  { title: "Company", links: [l("About", "/company/about"), l("Leadership", "/company/leadership"), l("Careers", "/careers"), l("Partners", "/company/partners"), l("Contact", "/contact")] },
];
