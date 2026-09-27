/**
 * Ready-to-launch / white-label metadata for products (and the service pages that sell the same
 * platform as a custom build). Timelines are TYPICAL SOFTWARE IMPLEMENTATION ranges for a defined
 * configuration — they never include licences, banking/issuer/custody onboarding, audits or other
 * third-party dependencies (see LAUNCH_DISCLAIMER). Only products with a genuine white-label
 * foundation get a timeline.
 */

export type LaunchTier = "Fast configuration" | "White-label implementation" | "Advanced customization" | "Complex enterprise";
export type Customization = "Configurable" | "Highly customizable" | "Fully custom";

export interface LaunchInfo {
  /** e.g. "3–4 weeks" */
  timeline: string;
  tier: LaunchTier;
  customization: Customization;
  /** Advanced / custom build range, where useful. */
  advanced?: string;
  /** Short module list for product cards. */
  keyModules: string[];
  /** Search-facing title for the product page. */
  seoTitle: string;
  /** Short name used on homepage cards. */
  cardName: string;
  apiReady?: boolean;
}

export const LAUNCH_DISCLAIMER =
  "Timelines refer to software implementation and deployment scope for a defined configuration. Third-party integrations, regulatory approvals, banking and card-issuer onboarding, custody and liquidity agreements, security audits and other external dependencies may require additional time.";

export const LAUNCH_TIERS: { tier: LaunchTier; range: string; description: string }[] = [
  { tier: "Fast configuration", range: "1–2 weeks", description: "Branding, configuration and deployment of an existing foundation with standard integrations." },
  { tier: "White-label implementation", range: "3–4 weeks", description: "A white-label platform configured to your workflows, with your chosen partner integrations." },
  { tier: "Advanced customization", range: "4–6 weeks", description: "New modules, custom business logic and multiple integrations on top of the foundation." },
  { tier: "Complex enterprise", range: "6–10+ weeks", description: "Multi-entity, multi-region or deeply integrated systems, or custom protocol work." },
];

export const productLaunch: Record<string, LaunchInfo> = {
  // Digital assets
  "crypto-exchange": { timeline: "3–4 weeks", advanced: "4–8+ weeks", tier: "White-label implementation", customization: "Highly customizable", keyModules: ["Spot trading", "Wallets", "Matching engine", "Liquidity", "P2P", "KYC/AML", "Admin", "API"], seoTitle: "White-Label Crypto Exchange Platform", cardName: "White-Label Crypto Exchange", apiReady: true },
  "crypto-wallet": { timeline: "2–3 weeks", advanced: "3–5 weeks", tier: "White-label implementation", customization: "Highly customizable", keyModules: ["Multi-chain", "Custody / MPC", "Swap", "Send & receive", "Admin", "API"], seoTitle: "White-Label Crypto Wallet", cardName: "White-Label Crypto Wallet", apiReady: true },
  "p2p-trading-platform": { timeline: "3–4 weeks", tier: "White-label implementation", customization: "Highly customizable", keyModules: ["Ads", "Escrow", "Trade chat", "Disputes", "Merchants", "Admin"], seoTitle: "White-Label P2P Crypto Trading Platform", cardName: "P2P Trading Platform", apiReady: true },
  "digital-asset-platform": { timeline: "3–5 weeks", tier: "White-label implementation", customization: "Highly customizable", keyModules: ["Brokerage", "Custody integration", "Treasury", "Reporting", "Admin"], seoTitle: "Digital Asset Brokerage & Custody Platform", cardName: "Trading & Brokerage Platform", apiReady: true },
  "web3-launchpad": { timeline: "3–4 weeks", tier: "White-label implementation", customization: "Configurable", keyModules: ["Project listings", "Token sales", "Vesting", "KYC", "Admin"], seoTitle: "White-Label Crypto Launchpad", cardName: "Crypto Launchpad" },
  // FinTech
  neobank: { timeline: "3–4 weeks", advanced: "4–6+ weeks", tier: "White-label implementation", customization: "Highly customizable", keyModules: ["Multi-currency accounts", "Payments", "Cards", "KYC/KYB", "Ledger", "Admin"], seoTitle: "White-Label Neobank Platform", cardName: "White-Label Neobank", apiReady: true },
  "digital-bank": { timeline: "4–6 weeks", advanced: "6–10+ weeks", tier: "Advanced customization", customization: "Highly customizable", keyModules: ["Core accounts", "Payments", "Lending hooks", "Back office", "Reporting"], seoTitle: "Digital Banking Platform", cardName: "Digital Banking Platform", apiReady: true },
  "crypto-card": { timeline: "3–5 weeks", tier: "White-label implementation", customization: "Highly customizable", keyModules: ["Virtual & physical cards", "Wallet funding", "Conversion", "Controls", "KYC/KYB", "Settlement"], seoTitle: "Crypto Card Infrastructure", cardName: "Crypto Card Platform", apiReady: true },
  "crypto-payment": { timeline: "3–4 weeks", tier: "White-label implementation", customization: "Configurable", keyModules: ["Checkout", "Invoices", "Multi-chain", "Settlement", "Merchant dashboard", "API"], seoTitle: "White-Label Crypto Payment Gateway", cardName: "Crypto Payment Gateway", apiReady: true },
  "payment-gateway": { timeline: "3–4 weeks", advanced: "4–6 weeks", tier: "White-label implementation", customization: "Highly customizable", keyModules: ["Checkout", "Acquirer adapters", "Tokenisation", "Merchant portal", "Reconciliation"], seoTitle: "White-Label Payment Gateway", cardName: "Payment Gateway", apiReady: true },
  "payment-orchestration": { timeline: "3–4 weeks", tier: "White-label implementation", customization: "Highly customizable", keyModules: ["Routing", "Retries", "Provider adapters", "Reconciliation", "Analytics"], seoTitle: "Payment Orchestration Platform", cardName: "Payment Orchestration", apiReady: true },
  "digital-wallet": { timeline: "3–4 weeks", tier: "White-label implementation", customization: "Highly customizable", keyModules: ["Multi-currency balances", "P2P transfers", "Top-ups", "Cards", "Ledger"], seoTitle: "Multi-Currency Wallet & Account Platform", cardName: "Multi-Currency Wallet", apiReady: true },
  "stablecoin-payment": { timeline: "3–5 weeks", tier: "White-label implementation", customization: "Highly customizable", keyModules: ["Stablecoin rails", "On/off-ramp", "Treasury", "Payouts", "Compliance hooks"], seoTitle: "Stablecoin Payment Platform", cardName: "Stablecoin Payments", apiReady: true },
  "remittance-platform": { timeline: "3–5 weeks", tier: "White-label implementation", customization: "Highly customizable", keyModules: ["Quotes & FX", "Payout partners", "KYC", "Tracking", "Compliance"], seoTitle: "White-Label Remittance Platform", cardName: "Remittance Platform", apiReady: true },
  "merchant-payment": { timeline: "3–4 weeks", tier: "White-label implementation", customization: "Configurable", keyModules: ["Merchant onboarding", "Payment links", "QR", "Settlements", "Dashboard"], seoTitle: "Merchant Payments Platform", cardName: "Merchant Payments", apiReady: true },
  // Web3
  "rwa-platform": { timeline: "3–5 weeks", advanced: "5–8+ weeks", tier: "White-label implementation", customization: "Highly customizable", keyModules: ["Asset onboarding", "Token issuance", "Investor portal", "Compliance hooks", "Transfers", "Reporting"], seoTitle: "RWA Tokenization Platform", cardName: "RWA Tokenization Platform", apiReady: true },
  "tokenization-platform": { timeline: "3–5 weeks", tier: "White-label implementation", customization: "Highly customizable", keyModules: ["Issuance", "Cap table", "Distributions", "Transfer rules", "Admin"], seoTitle: "Asset Tokenization Platform", cardName: "Tokenization Platform", apiReady: true },
  "defi-platform": { timeline: "4–6 weeks", advanced: "6–10+ weeks", tier: "Advanced customization", customization: "Highly customizable", keyModules: ["DEX / AMM", "Lending", "Vaults", "Oracles", "Risk controls", "Analytics"], seoTitle: "White-Label DeFi Platform", cardName: "DeFi Platform" },
  "staking-platform": { timeline: "3–4 weeks", tier: "White-label implementation", customization: "Configurable", keyModules: ["Validator integration", "Rewards", "Unbonding", "Dashboard", "Reporting"], seoTitle: "White-Label Staking Platform", cardName: "Staking Platform", apiReady: true },
  "token-launch-platform": { timeline: "3–4 weeks", tier: "White-label implementation", customization: "Configurable", keyModules: ["Token contracts", "Vesting", "Claims", "Dashboards"], seoTitle: "Token Launch Platform", cardName: "Token Launch Platform" },
  // AI
  "ai-agent-platform": { timeline: "3–5 weeks", advanced: "5–8+ weeks", tier: "White-label implementation", customization: "Highly customizable", keyModules: ["Agent builder", "Tools", "Approvals", "Evaluations", "Audit log"], seoTitle: "AI Agent Platform", cardName: "AI Agent Platform", apiReady: true },
  "ai-saas": { timeline: "3–4 weeks", tier: "White-label implementation", customization: "Highly customizable", keyModules: ["Multi-tenant", "Model routing", "Billing", "Knowledge base", "Admin"], seoTitle: "White-Label AI Platform", cardName: "White-Label AI Platform", apiReady: true },
  "ai-workflow-automation": { timeline: "2–4 weeks", tier: "White-label implementation", customization: "Highly customizable", keyModules: ["Workflow builder", "Document AI", "Approvals", "Integrations"], seoTitle: "AI Workflow Automation Platform", cardName: "AI Automation", apiReady: true },
  "ai-customer-support": { timeline: "3–4 weeks", tier: "White-label implementation", customization: "Configurable", keyModules: ["Grounded answers", "Handoff", "Ticketing", "Analytics"], seoTitle: "AI Customer Operations Platform", cardName: "AI Customer Operations", apiReady: true },
  // Cloud
  "cloud-landing-zone": { timeline: "1–2 weeks", tier: "Fast configuration", customization: "Configurable", keyModules: ["Accounts & networks", "Guardrails", "Identity", "Logging"], seoTitle: "Cloud Landing Zone", cardName: "Cloud Landing Zone" },
  "observability-stack": { timeline: "1–2 weeks", tier: "Fast configuration", customization: "Configurable", keyModules: ["Metrics", "Logs", "Traces", "Alerting"], seoTitle: "Observability Stack", cardName: "Observability Stack" },
  "developer-platform": { timeline: "2–4 weeks", tier: "White-label implementation", customization: "Highly customizable", keyModules: ["Golden paths", "CI/CD", "Service catalogue", "Environments"], seoTitle: "Internal Developer Platform", cardName: "Developer Platform" },
};

/** Homepage "Ready-to-launch platforms" order. */
export const FEATURED_PLATFORMS = ["crypto-exchange", "crypto-wallet", "neobank", "crypto-card", "p2p-trading-platform", "digital-asset-platform", "defi-platform", "rwa-platform", "ai-agent-platform"];

/** Service pages that sell the same platform as a custom build: link to the white-label product and show its range. */
export const serviceToProduct: Record<string, string> = {
  "crypto-exchange-development": "crypto-exchange",
  "centralized-exchange-development": "crypto-exchange",
  "hybrid-exchange-development": "crypto-exchange",
  "spot-exchange-development": "crypto-exchange",
  "exchange-matching-engine": "crypto-exchange",
  "p2p-exchange-development": "p2p-trading-platform",
  "crypto-wallet-development": "crypto-wallet",
  "multi-chain-wallet-development": "crypto-wallet",
  "custodial-wallet-development": "crypto-wallet",
  "crypto-brokerage-platform": "digital-asset-platform",
  "neobank-development": "neobank",
  "digital-banking-development": "digital-bank",
  "crypto-card-platform": "crypto-card",
  "crypto-payment-gateway": "crypto-payment",
  "payment-gateway-development": "payment-gateway",
  "payment-orchestration": "payment-orchestration",
  "stablecoin-payment-gateway": "stablecoin-payment",
  "remittance-platform": "remittance-platform",
  "rwa-tokenization": "rwa-platform",
  "asset-tokenization": "tokenization-platform",
  "defi-development": "defi-platform",
  "dex-development": "defi-platform",
  "staking-platform-development": "staking-platform",
  "ai-agents": "ai-agent-platform",
  "ai-workflow-automation": "ai-workflow-automation",
};

export const launchFor = (slug: string): LaunchInfo | undefined => productLaunch[slug];
