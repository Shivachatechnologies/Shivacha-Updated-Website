import type { NavColumn, NavLink } from "./types";

export interface NavTab {
  label: string;
  href: string;
  description: string;
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
}

const l = (label: string, href: string, description?: string): NavLink => ({ label, href, description });
const s = (slug: string, label: string) => l(label, `/services/${slug}`);

export const mainNav: NavItem[] = [
  {
    label: "Capabilities",
    href: "/capabilities",
    columns: [
      {
        title: "Divisions",
        links: [
          l("Shivacha AI", "/capabilities/ai", "Generative AI, agents, ML and automation"),
          l("Shivacha Digital", "/capabilities/digital", "Software, SaaS, web and mobile"),
          l("Shivacha FinTech", "/capabilities/fintech", "Web2, Web3 and hybrid finance"),
          l("Shivacha Web3", "/capabilities/web3", "Protocols, tokenization, DeFi, custody"),
          l("Shivacha Cloud", "/capabilities/cloud", "Cloud, DevOps and cybersecurity"),
        ],
      },
      {
        title: "Ways to work with us",
        links: [
          l("Custom Engineering", "/services"),
          l("Product Engineering", "/solutions/product-engineering"),
          l("Ready-to-Launch Products", "/products"),
          l("Dedicated Teams", "/dedicated-teams"),
          l("Technology Transformation", "/solutions/digital-transformation"),
        ],
      },
    ],
    feature: {
      eyebrow: "Differentiator",
      title: "Web2 + Web3 FinTech",
      description: "Connect traditional financial infrastructure with programmable digital assets.",
      href: "/solutions/web2-web3-fintech",
      cta: "Explore hybrid fintech",
    },
  },
  {
    label: "Products",
    href: "/products",
    columns: [
      {
        title: "FinTech",
        links: [
          l("Digital Bank", "/products/digital-bank"),
          l("Neobank", "/products/neobank"),
          l("Payment Gateway", "/products/payment-gateway"),
          l("Payment Orchestration", "/products/payment-orchestration"),
          l("Hybrid Wallet", "/products/hybrid-wallet"),
          l("Lending Platform", "/products/lending-platform"),
        ],
      },
      {
        title: "Web3",
        links: [
          l("Crypto Exchange", "/products/crypto-exchange"),
          l("RWA Platform", "/products/rwa-platform"),
          l("Tokenization Platform", "/products/tokenization-platform"),
          l("Digital Asset Platform", "/products/digital-asset-platform"),
          l("Web3 Wallet", "/products/web3-wallet"),
          l("DeFi Platform", "/products/defi-platform"),
        ],
      },
      {
        title: "AI & Digital",
        links: [
          l("AI Agent Platform", "/products/ai-agent-platform"),
          l("AI Customer Support", "/products/ai-customer-support"),
          l("AI Copilot Kit", "/products/ai-copilot"),
          l("Document AI", "/products/ai-document-processing"),
          l("CRM Platform", "/products/crm-platform"),
          l("Marketplace Platform", "/products/marketplace-platform"),
        ],
      },
    ],
    feature: {
      eyebrow: "Ready to launch",
      title: "All products",
      description: "Configurable platforms across AI, Digital, FinTech, Web3 and Cloud.",
      href: "/products",
      cta: "Browse the marketplace",
    },
  },
  {
    label: "Services",
    href: "/services",
    tabs: [
      {
        label: "AI",
        href: "/capabilities/ai",
        description: "Intelligent systems built for real-world workflows.",
        columns: [
          { title: "Generative AI", links: [s("generative-ai", "Generative AI"), s("llm-development", "LLM Development"), s("rag-development", "RAG Development"), s("ai-copilot-development", "AI Copilots"), s("voice-ai-development", "Voice AI")] },
          { title: "Agents & Automation", links: [s("ai-agents", "AI Agents"), s("agentic-ai-development", "Agentic AI"), s("ai-workflow-automation", "Workflow Automation"), s("ai-document-processing", "Document Processing")] },
          { title: "ML & Enterprise", links: [s("machine-learning", "Machine Learning"), s("computer-vision", "Computer Vision"), s("enterprise-ai", "Enterprise AI"), s("ai-consulting", "AI Consulting")] },
        ],
      },
      {
        label: "Software",
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
    label: "Solutions",
    href: "/solutions",
    columns: [
      { title: "By stage", links: [l("Enterprise", "/solutions/enterprise"), l("Startups", "/solutions/startups"), l("Scaleups", "/solutions/scaleups"), l("MVP to Scale", "/solutions/mvp-to-scale")] },
      { title: "Transformation", links: [l("Digital Transformation", "/solutions/digital-transformation"), l("AI Transformation", "/solutions/ai-transformation"), l("Cloud Transformation", "/solutions/cloud-transformation"), l("FinTech Transformation", "/solutions/fintech-transformation"), l("Web3 Transformation", "/solutions/web3-transformation")] },
      { title: "Engineering", links: [l("Product Engineering", "/solutions/product-engineering"), l("Legacy Modernization", "/solutions/legacy-modernization"), l("Platform Modernization", "/solutions/platform-modernization"), l("Managed Engineering", "/solutions/managed-engineering")] },
    ],
    feature: {
      eyebrow: "Web2 + Web3",
      title: "Hybrid FinTech",
      description: "One ledger and one set of controls across bank rails, cards, stablecoins and tokenized assets.",
      href: "/solutions/web2-web3-fintech",
      cta: "See the architecture",
    },
  },
  {
    label: "Teams",
    href: "/dedicated-teams",
    columns: [
      { title: "Software", links: [l("Full-Stack Team", "/dedicated-teams/full-stack-team"), l("Frontend Team", "/dedicated-teams/frontend-team"), l("Backend Team", "/dedicated-teams/backend-team"), l("Mobile Team", "/dedicated-teams/mobile-team"), l("QA Team", "/dedicated-teams/qa-team")] },
      { title: "AI, FinTech & Web3", links: [l("AI Team", "/dedicated-teams/ai-team"), l("AI Agent Team", "/dedicated-teams/ai-agent-team"), l("FinTech Team", "/dedicated-teams/fintech-team"), l("Payments Team", "/dedicated-teams/payments-team"), l("Blockchain Team", "/dedicated-teams/blockchain-team"), l("Smart Contract Team", "/dedicated-teams/smart-contract-team")] },
      { title: "Cloud & Product", links: [l("DevOps Team", "/dedicated-teams/devops-team"), l("Cloud Team", "/dedicated-teams/cloud-team"), l("Cybersecurity Team", "/dedicated-teams/cybersecurity-team"), l("Product Design Team", "/dedicated-teams/product-design-team"), l("Product Management", "/dedicated-teams/product-management-team")] },
    ],
    feature: {
      eyebrow: "Dedicated teams",
      title: "Build your engineering organisation",
      description: "Specialists, pods and full teams working inside your roadmap.",
      href: "/hire-developers",
      cta: "Build this team",
    },
  },
  {
    label: "Industries",
    href: "/industries",
    columns: [
      { title: "Financial", links: [l("FinTech", "/industries/fintech"), l("Banking", "/industries/banking"), l("Payments", "/industries/payments"), l("Insurance", "/industries/insurance"), l("Real Estate", "/industries/real-estate")] },
      { title: "Digital", links: [l("SaaS", "/industries/saas"), l("E-commerce", "/industries/ecommerce"), l("Media", "/industries/media"), l("Gaming", "/industries/gaming"), l("Education", "/industries/education")] },
      { title: "Real economy", links: [l("Healthcare", "/industries/healthcare"), l("Logistics", "/industries/logistics"), l("Energy", "/industries/energy"), l("Government", "/industries/government"), l("All industries", "/industries")] },
    ],
  },
  {
    label: "Technologies",
    href: "/technologies",
    columns: [
      { title: "Build", links: [l("React", "/technologies/react"), l("Next.js", "/technologies/nextjs"), l("Node.js", "/technologies/nodejs"), l("Python", "/technologies/python"), l("Flutter", "/technologies/flutter")] },
      { title: "AI & Web3", links: [l("LLMs", "/technologies/llm"), l("RAG", "/technologies/rag"), l("Ethereum", "/technologies/ethereum"), l("Solidity", "/technologies/solidity"), l("ERC-3643", "/technologies/erc-3643")] },
      { title: "Cloud & Data", links: [l("Kubernetes", "/technologies/kubernetes"), l("AWS", "/technologies/aws"), l("Terraform", "/technologies/terraform"), l("PostgreSQL", "/technologies/postgresql"), l("Kafka", "/technologies/kafka")] },
    ],
    feature: {
      eyebrow: "Directory",
      title: "Technology directory",
      description: "130+ technologies across 14 categories — and how we use each one.",
      href: "/technologies",
      cta: "Browse technologies",
    },
  },
  {
    label: "Company",
    href: "/company",
    columns: [
      { title: "Company", links: [l("About", "/company/about"), l("Leadership", "/company/leadership"), l("Engineering", "/company/engineering"), l("Global Presence", "/company/global-presence"), l("Careers", "/careers")] },
      { title: "Learn", links: [l("Insights", "/insights"), l("Resources", "/resources"), l("Work", "/work"), l("Markets", "/markets"), l("Contact", "/contact")] },
    ],
  },
];

export const footerNav: NavColumn[] = [
  { title: "Capabilities", links: [l("AI", "/capabilities/ai"), l("Digital", "/capabilities/digital"), l("FinTech", "/capabilities/fintech"), l("Web3", "/capabilities/web3"), l("Cloud", "/capabilities/cloud")] },
  { title: "Offerings", links: [l("Products", "/products"), l("Services", "/services"), l("Solutions", "/solutions"), l("Dedicated Teams", "/dedicated-teams"), l("Hire Developers", "/hire-developers")] },
  { title: "Explore", links: [l("Industries", "/industries"), l("Technologies", "/technologies"), l("Work", "/work"), l("Markets", "/markets"), l("Resources", "/resources"), l("Insights", "/insights")] },
  { title: "Company", links: [l("About", "/company/about"), l("Leadership", "/company/leadership"), l("Careers", "/careers"), l("Partners", "/company/partners"), l("Contact", "/contact")] },
  { title: "Legal", links: [l("Privacy", "/privacy-policy"), l("Terms", "/terms"), l("Cookies", "/cookie-policy"), l("Security", "/security"), l("Disclaimer", "/disclaimer"), l("Accessibility", "/accessibility")] },
];
