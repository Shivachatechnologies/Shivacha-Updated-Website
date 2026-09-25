import type { ArchitectureLayer, DivisionId, PreviewKind, Product, ProductCta } from "../types";
import { faqs, pts } from "../_helpers";
import { demoLinks } from "../demoLinks";

const deploymentDefaults: Record<DivisionId, string[]> = {
  ai: ["Your cloud account (AWS, Azure, Google Cloud)", "Private VPC with self-hosted models", "Managed deployment operated by Shivacha", "Hybrid: hosted UI, private data plane"],
  digital: ["Your cloud account", "Managed SaaS-style deployment", "On-premises Kubernetes", "Multi-region for high availability"],
  fintech: ["Your cloud account in your chosen region", "Dedicated single-tenant deployment", "Private cloud / on-premises Kubernetes", "Managed deployment with operational support"],
  web3: ["Your cloud account with self-hosted nodes", "Dedicated single-tenant deployment", "Hybrid with custodian-hosted key management", "Managed deployment with monitoring"],
  cloud: ["AWS", "Microsoft Azure", "Google Cloud", "Hybrid and on-premises Kubernetes"],
};

const customizationDefaults: Record<DivisionId, string[]> = {
  ai: ["Model and provider selection", "Custom tools and integrations", "Brand, tone and guardrail policies", "Workflow and approval rules", "Custom evaluation sets"],
  digital: ["White-label branding and themes", "Custom modules and workflows", "Roles, permissions and approval rules", "Integrations with your existing systems", "Localisation and multi-currency"],
  fintech: ["White-label mobile and web apps", "Product, fee and limit configuration", "Partner and provider adapters", "Custom workflows and back-office tools", "Reporting and data exports"],
  web3: ["Network and asset configuration", "Custom smart contract modules", "Compliance and eligibility rules", "White-label interfaces", "Custody and partner integrations"],
  cloud: ["Account and network topology", "Policy and guardrail sets", "Toolchain choices", "Service templates", "Alerting and escalation rules"],
};

const securityDefaults: Record<DivisionId, string[]> = {
  ai: ["Data stays in your environment where required", "Role-based access and document-level permissions", "Prompt-injection and output guardrails", "Full audit logs of prompts, tool calls and outputs", "Encryption in transit and at rest"],
  digital: ["Role-based access control and SSO", "Encryption in transit and at rest", "Audit logs for sensitive actions", "OWASP-aligned secure development", "Automated dependency and container scanning"],
  fintech: ["Double-entry ledger with immutable journal", "Maker-checker controls for sensitive operations", "Encryption, tokenisation and secrets management", "Strong customer authentication and device binding", "Comprehensive audit trails", "Architecture aligned with PCI DSS where card data is involved"],
  web3: ["Audit-ready smart contracts with documented trust assumptions", "Institutional key management via MPC, multisig or HSM integration", "Transaction policies and approval quorums", "On-chain monitoring and alerting", "Pause and incident response controls"],
  cloud: ["Least-privilege IAM", "Policy as code guardrails", "Centralised, tamper-resistant logging", "Encryption by default", "Continuous posture monitoring"],
};

export interface ProductInput {
  slug: string;
  name: string;
  division: DivisionId;
  category: string;
  tagline: string;
  description: string;
  problem: string;
  solution: string;
  modules: string[];
  features: string[];
  useCases: string[];
  architecture: ArchitectureLayer[];
  technologies: string[];
  integrations: string[];
  industries: string[];
  services: string[];
  related: string[];
  faq: [string, string][];
  preview: PreviewKind;
  deploymentOptions?: string[];
  customizationOptions?: string[];
  security?: string[];
  ctaType?: ProductCta;
  caseStudies?: string[];
}

export const prod = (p: ProductInput): Product => {
  const demo = demoLinks[p.slug];
  return {
    slug: p.slug,
    name: p.name,
    division: p.division,
    category: p.category,
    tagline: p.tagline,
    description: p.description,
    heroImage: demo?.heroImage ?? "",
    screenshots: demo?.screenshots ?? [],
    demoUrl: demo?.demoUrl,
    videoUrl: demo?.videoUrl,
    features: p.features,
    technologies: p.technologies,
    integrations: p.integrations,
    industries: p.industries,
    deploymentOptions: p.deploymentOptions ?? deploymentDefaults[p.division],
    customizationOptions: p.customizationOptions ?? customizationDefaults[p.division],
    security: p.security ?? securityDefaults[p.division],
    faqs: faqs(p.faq),
    relatedProducts: p.related,
    caseStudies: p.caseStudies ?? [],
    requestDemo: true,
    ctaType: p.ctaType ?? (demo?.demoUrl ? "live-demo" : "request-demo"),
    problem: p.problem,
    solution: p.solution,
    modules: pts(p.modules),
    useCases: pts(p.useCases),
    architecture: p.architecture,
    preview: p.preview,
    services: p.services,
  };
};
