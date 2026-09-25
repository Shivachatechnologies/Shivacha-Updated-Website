import type { TechCategory, Technology } from "./types";
import { frontendTech, backendTech, mobileTech } from "./technologies/app";
import { aiTech, blockchainTech, web3StackTech, tokenStandards } from "./technologies/ai-web3";
import {
  cloudTech,
  devopsTech,
  databaseTech,
  dataTech,
  fintechTech,
  securityTech,
  apiTech,
} from "./technologies/infra";

export const technologies: Technology[] = [
  ...frontendTech,
  ...backendTech,
  ...mobileTech,
  ...aiTech,
  ...blockchainTech,
  ...web3StackTech,
  ...tokenStandards,
  ...cloudTech,
  ...devopsTech,
  ...databaseTech,
  ...dataTech,
  ...fintechTech,
  ...securityTech,
  ...apiTech,
];

const bySlug = new Map(technologies.map((t) => [t.slug, t]));
export const getTechnology = (slug: string) => bySlug.get(slug);

export const techCategories: { id: TechCategory; name: string; description: string }[] = [
  { id: "frontend", name: "Frontend", description: "Frameworks and languages for fast, accessible interfaces." },
  { id: "backend", name: "Backend", description: "Languages and frameworks for APIs, services and business logic." },
  { id: "mobile", name: "Mobile", description: "Native and cross-platform mobile development." },
  { id: "ai", name: "Artificial Intelligence", description: "Models, retrieval, agents and ML operations." },
  { id: "blockchain", name: "Blockchain Networks", description: "Public and permissioned networks we build on." },
  { id: "web3-stack", name: "Web3 Development Stack", description: "Languages, tooling and libraries for smart contracts and dApps." },
  { id: "token-standards", name: "Token Standards", description: "ERC standards for fungible, non-fungible, vault and permissioned tokens." },
  { id: "fintech", name: "FinTech Standards", description: "Messaging, security and accounting standards for financial systems." },
  { id: "cloud", name: "Cloud & Infrastructure", description: "Cloud platforms, edge and operating systems." },
  { id: "devops", name: "DevOps", description: "Containers, orchestration, IaC, CI/CD and observability." },
  { id: "databases", name: "Databases", description: "Relational, document, search and analytical data stores." },
  { id: "data", name: "Data Engineering & Streaming", description: "Pipelines, streaming, warehousing and real-time analytics." },
  { id: "security", name: "Cybersecurity", description: "Identity, secrets, cryptography and security frameworks." },
  { id: "apis", name: "APIs & Integration", description: "Protocols and standards for connecting systems." },
];
