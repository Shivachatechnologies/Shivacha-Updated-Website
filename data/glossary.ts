/** Plain-English definitions of terms used across Shivacha's services. Each links to the most relevant page. */
export interface GlossaryTerm {
  term: string;
  slug: string;
  category: "Blockchain & Web3" | "FinTech" | "AI" | "Software & Cloud";
  definition: string;
  href?: string;
}

const t = (term: string, category: GlossaryTerm["category"], definition: string, href?: string): GlossaryTerm => ({
  term,
  slug: term.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
  category,
  definition,
  href,
});

export const glossary: GlossaryTerm[] = [
  // Blockchain & Web3
  t("Account abstraction", "Blockchain & Web3", "A design (ERC-4337 on Ethereum) that lets a wallet be a smart contract, enabling features such as gas sponsorship, passkey login, spending limits and social recovery.", "/services/account-abstraction-development"),
  t("AMM (automated market maker)", "Blockchain & Web3", "A decentralised exchange mechanism that prices trades using a formula over pooled liquidity instead of an order book.", "/services/amm-development"),
  t("Blockchain", "Blockchain & Web3", "A shared, append-only ledger maintained by a network of computers, where each block of transactions is cryptographically linked to the previous one so history cannot be changed without detection.", "/services/blockchain-development"),
  t("Bridge", "Blockchain & Web3", "Software that moves tokens or messages between blockchains, usually by locking assets on one chain and minting a representation on another. Bridges are a frequent target of attacks and need careful security design.", "/services/bridge-development"),
  t("Custody", "Blockchain & Web3", "Who controls the private keys to digital assets. Custodial services hold keys for users; non-custodial (self-custody) wallets leave keys with the user; MPC and multisig split control between parties.", "/services/digital-asset-custody-integration"),
  t("dApp", "Blockchain & Web3", "A decentralised application: a user interface and backend that interact with smart contracts on a blockchain.", "/services/web3-development"),
  t("DeFi", "Blockchain & Web3", "Decentralised finance: lending, trading, derivatives and other financial services implemented as smart contracts that anyone can use without an intermediary.", "/services/defi-development"),
  t("ERC-20", "Blockchain & Web3", "The Ethereum standard interface for fungible tokens — balances, transfers and approvals — supported by virtually all EVM wallets and exchanges.", "/services/token-development"),
  t("ERC-721 / ERC-1155", "Blockchain & Web3", "Ethereum standards for non-fungible (unique) and multi-token assets, used for NFTs, memberships, tickets and in-game items.", "/services/token-development"),
  t("ERC-3643", "Blockchain & Web3", "A token standard for permissioned, compliance-aware tokens where transfers are checked against investor identity and eligibility rules — common in security token projects.", "/services/security-token-development"),
  t("EVM", "Blockchain & Web3", "The Ethereum Virtual Machine, the execution environment for smart contracts on Ethereum and compatible chains such as Polygon, Arbitrum, Optimism and Base.", "/technologies/ethereum"),
  t("Gas", "Blockchain & Web3", "The fee paid to execute a transaction or smart contract on a blockchain, priced by computation and storage used.", "/services/gas-optimization"),
  t("Indexer", "Blockchain & Web3", "A service that reads blockchain events and stores them in a queryable database so applications can display on-chain data quickly.", "/services/indexer-development"),
  t("Layer 2 (L2)", "Blockchain & Web3", "A network that processes transactions off the main chain and posts proofs or data back to it, reducing cost while inheriting much of the base chain's security. Rollups are the most common type.", "/services/layer-2-development"),
  t("MPC wallet", "Blockchain & Web3", "A wallet where the private key is never assembled in one place; instead several parties hold key shares and jointly sign using multi-party computation.", "/services/multi-party-custody"),
  t("Multisig", "Blockchain & Web3", "A wallet or contract that requires several of a defined set of keys to approve a transaction, commonly used for treasuries and admin controls.", "/services/multisig-wallet-development"),
  t("Oracle", "Blockchain & Web3", "A service that brings off-chain data, such as prices or reserves, onto a blockchain for smart contracts to use.", "/technologies/chainlink"),
  t("RWA tokenization", "Blockchain & Web3", "Representing ownership of real-world assets — real estate, funds, bonds, invoices or commodities — as tokens on a blockchain, usually with transfer restrictions for compliance.", "/services/rwa-tokenization"),
  t("Smart contract", "Blockchain & Web3", "A program deployed on a blockchain that executes exactly as written when called. Because deployed code is hard to change and often holds value, it needs specification, testing and independent audit.", "/services/smart-contract-development"),
  t("Stablecoin", "Blockchain & Web3", "A token designed to hold a stable value, usually pegged to a fiat currency and backed by reserves.", "/services/stablecoin-platform-development"),
  t("Travel Rule", "Blockchain & Web3", "A regulatory requirement for virtual asset service providers to share originator and beneficiary information for transfers above set thresholds.", "/services/travel-rule-infrastructure"),
  // FinTech
  t("BaaS (banking-as-a-service)", "FinTech", "A model where a licensed bank exposes accounts, cards and payments through APIs so non-bank companies can offer financial products.", "/services/banking-as-a-service"),
  t("Core banking", "FinTech", "The system of record for accounts, balances, transactions and interest at a bank or neobank.", "/services/core-banking-platform"),
  t("Double-entry ledger", "FinTech", "An accounting model where every movement of money is recorded as equal debits and credits, so the books always balance and every change is traceable.", "/services/fintech-development"),
  t("Embedded finance", "FinTech", "Financial services — payments, lending, accounts or insurance — offered inside a non-financial company's product.", "/services/embedded-finance"),
  t("Idempotency", "FinTech", "The property that repeating an operation has the same effect as doing it once. Essential for payments, where network retries must never charge a customer twice.", "/services/payment-processing"),
  t("KYC / AML", "FinTech", "Know Your Customer and Anti-Money Laundering: verifying customer identity and monitoring activity to prevent financial crime.", "/services/kyc-blockchain-integration"),
  t("Neobank", "FinTech", "A digital-first bank or banking app, often built on a partner bank's licence and banking-as-a-service infrastructure.", "/services/neobank-development"),
  t("Open banking", "FinTech", "Regulated APIs that let customers share bank data and initiate payments through third-party apps with their consent.", "/services/open-banking"),
  t("Payment orchestration", "FinTech", "A layer that routes payments across several processors and methods to improve approval rates, cost and resilience.", "/services/payment-orchestration"),
  t("PCI DSS", "FinTech", "The Payment Card Industry Data Security Standard, which sets security requirements for systems that store, process or transmit card data.", "/services/card-payment-platform"),
  t("Reconciliation", "FinTech", "Matching internal records against bank, processor and partner statements to confirm every transaction is accounted for.", "/services/payment-reconciliation"),
  // AI
  t("AI agent", "AI", "Software that uses a language model to plan and take actions through tools and APIs — for example, updating a CRM or drafting a refund — typically with guardrails and human approval for consequential steps.", "/services/ai-agents"),
  t("Embeddings", "AI", "Numeric representations of text or images that place similar meanings close together, used for semantic search and retrieval.", "/services/rag-development"),
  t("Evaluation set", "AI", "A collection of representative questions or tasks with expected answers used to measure an AI system's quality automatically on every change.", "/services/ai-development"),
  t("Fine-tuning", "AI", "Further training a pre-trained model on specific examples to change its style or behaviour. Often less necessary than good retrieval and prompting.", "/services/llm-development"),
  t("Guardrails", "AI", "Checks around an AI system — input filtering, output validation, tool allow-lists and approvals — that keep it within intended behaviour.", "/services/ai-agents"),
  t("Hallucination", "AI", "When a language model produces fluent but false or unsupported output. Reduced with grounding in retrieved sources, evaluation and refusal behaviour.", "/services/rag-development"),
  t("LLM", "AI", "Large language model: a neural network trained on large text corpora that can generate and transform language, write code and follow instructions.", "/services/llm-development"),
  t("RAG (retrieval-augmented generation)", "AI", "A pattern where relevant documents are retrieved and given to a language model so it answers from your sources rather than from memory alone.", "/services/rag-development"),
  // Software & Cloud
  t("CI/CD", "Software & Cloud", "Continuous integration and delivery: automatically building, testing and deploying every change so releases are frequent and low-risk.", "/services/ci-cd"),
  t("Infrastructure as code", "Software & Cloud", "Defining servers, networks and cloud services in version-controlled code (e.g. Terraform) so environments are reproducible and reviewed.", "/services/infrastructure-automation"),
  t("Microservices", "Software & Cloud", "An architecture where an application is split into small, independently deployable services. Useful at scale; often unnecessary for early products.", "/services/microservices-development"),
  t("MVP", "Software & Cloud", "Minimum viable product: the smallest version of a product that delivers real value to early users and tests the riskiest assumptions.", "/services/mvp-development"),
  t("Multi-tenancy", "Software & Cloud", "A SaaS architecture where one deployment serves many customers (tenants) with strict data isolation between them.", "/services/saas-development"),
  t("SRE", "Software & Cloud", "Site reliability engineering: applying software engineering to operations, using service-level objectives, automation and incident practice to keep systems reliable.", "/services/site-reliability-engineering"),
  t("Zero trust", "Software & Cloud", "A security model that verifies every user, device and request explicitly instead of trusting anything inside a network perimeter.", "/services/zero-trust"),
];

export const glossaryCategories = ["Blockchain & Web3", "FinTech", "AI", "Software & Cloud"] as const;
