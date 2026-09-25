import type { CareerDepartment, Job } from "./types";

export const careerDepartments: CareerDepartment[] = [
  { slug: "engineering", name: "Engineering", description: "Software, fintech, blockchain, cloud and security engineers who build production systems for clients worldwide.", disciplines: ["Full-stack & backend", "Mobile", "FinTech & payments", "Blockchain & smart contracts", "DevOps, SRE & security", "QA & test automation"] },
  { slug: "ai", name: "AI", description: "Engineers and scientists building LLM applications, agents, retrieval systems and machine learning in production.", disciplines: ["LLM & AI engineering", "Machine learning", "Data engineering", "Evaluation & AI quality"] },
  { slug: "product", name: "Product", description: "Product managers and analysts who turn client goals into roadmaps and measurable outcomes.", disciplines: ["Product management", "Business analysis", "Delivery management"] },
  { slug: "design", name: "Design", description: "Product and UX designers who make complex financial, AI and Web3 products clear.", disciplines: ["Product design", "UX research", "Design systems"] },
  { slug: "sales", name: "Sales & Partnerships", description: "Consultative sellers and solution architects who help clients find the right engagement.", disciplines: ["Business development", "Solution consulting", "Partnerships"] },
  { slug: "operations", name: "Operations", description: "People, finance and operations professionals who keep a distributed company running smoothly.", disciplines: ["Talent & people", "Finance", "Operations"] },
];

/**
 * Open application tracks. These are standing talent pools, not specific vacancies.
 * Add dated, specific vacancies here when they are genuinely open.
 */
export const jobs: Job[] = [
  {
    slug: "senior-full-stack-engineer",
    title: "Senior Full-Stack Engineer",
    department: "engineering",
    location: "Remote",
    type: "Full-time · Talent pool",
    summary: "Build client products end-to-end with TypeScript, React/Next.js and Node.js on modern cloud infrastructure.",
    responsibilities: ["Design and deliver features across frontend, backend and data", "Write tested, typed, maintainable code", "Contribute to architecture decisions and code reviews", "Collaborate directly with client stakeholders"],
    requirements: ["Significant professional experience with TypeScript, React and Node.js", "Strong relational database and API design skills", "Experience with CI/CD, testing and cloud deployment", "Clear written and spoken English"],
    niceToHave: ["Next.js App Router experience", "Fintech or SaaS product experience", "Experience mentoring engineers"],
  },
  {
    slug: "ai-engineer",
    title: "AI / LLM Engineer",
    department: "ai",
    location: "Remote",
    type: "Full-time · Talent pool",
    summary: "Build production LLM applications, RAG systems and AI agents with evaluation, security and cost discipline.",
    responsibilities: ["Build retrieval pipelines, prompts and agent tools", "Design and run evaluation suites", "Integrate AI into client systems via APIs", "Monitor quality, cost and latency in production"],
    requirements: ["Strong Python engineering skills", "Hands-on experience shipping LLM applications", "Understanding of retrieval, embeddings and vector search", "Software engineering fundamentals: testing, APIs, deployment"],
    niceToHave: ["Fine-tuning or model serving experience", "TypeScript experience", "Background in ML or data engineering"],
  },
  {
    slug: "smart-contract-engineer",
    title: "Smart Contract Engineer",
    department: "engineering",
    location: "Remote",
    type: "Full-time · Talent pool",
    summary: "Specify, build and test audit-ready smart contracts for tokenization, DeFi and digital asset platforms.",
    responsibilities: ["Write specifications and secure Solidity contracts", "Build fuzz, invariant and fork test suites", "Prepare documentation for independent audits", "Collaborate with backend and product teams"],
    requirements: ["Production Solidity experience", "Proficiency with Foundry or Hardhat", "Deep understanding of EVM security patterns", "Experience with upgradeability and access control design"],
    niceToHave: ["Rust / Solana experience", "Experience with permissioned token standards", "DeFi mechanism design"],
  },
  {
    slug: "fintech-backend-engineer",
    title: "FinTech Backend Engineer",
    department: "engineering",
    location: "Remote",
    type: "Full-time · Talent pool",
    summary: "Build ledgers, payment flows and partner integrations for banking, payments and hybrid fintech platforms.",
    responsibilities: ["Design ledger and money movement services", "Integrate banks, processors and providers", "Build reconciliation and settlement systems", "Ensure idempotency, correctness and auditability"],
    requirements: ["Strong backend experience in Go, Java, Kotlin or Node.js", "Experience with financial or payment systems", "Solid PostgreSQL and event-driven architecture skills"],
    niceToHave: ["ISO 20022 or ISO 8583 experience", "Card program or BaaS integration experience", "Digital asset experience"],
  },
  {
    slug: "devops-platform-engineer",
    title: "DevOps / Platform Engineer",
    department: "engineering",
    location: "Remote",
    type: "Full-time · Talent pool",
    summary: "Build cloud foundations, Kubernetes platforms, CI/CD and observability for client systems.",
    responsibilities: ["Build infrastructure as code with Terraform", "Operate Kubernetes and GitOps delivery", "Implement observability and SLOs", "Harden security across cloud environments"],
    requirements: ["Hands-on AWS, Azure or Google Cloud experience", "Kubernetes and Terraform in production", "CI/CD pipeline design", "Linux and networking fundamentals"],
    niceToHave: ["Blockchain node operations", "Security certifications or experience", "SRE practice experience"],
  },
  {
    slug: "product-designer",
    title: "Product Designer",
    department: "design",
    location: "Remote",
    type: "Full-time · Talent pool",
    summary: "Design clear, trustworthy experiences for fintech, AI and Web3 products.",
    responsibilities: ["Research, flows, prototypes and interfaces", "Maintain design systems", "Collaborate closely with engineers", "Test designs with users"],
    requirements: ["A portfolio of shipped digital products", "Strong interaction and visual design skills", "Experience with design systems"],
    niceToHave: ["Fintech or data-dense product experience", "Accessibility expertise"],
  },
  {
    slug: "product-manager",
    title: "Technical Product Manager",
    department: "product",
    location: "Remote",
    type: "Full-time · Talent pool",
    summary: "Lead discovery and delivery for client products with engineering and design squads.",
    responsibilities: ["Own product roadmaps with client stakeholders", "Run discovery and prioritisation", "Define outcome metrics", "Coordinate delivery across disciplines"],
    requirements: ["Product management experience on digital products", "Comfort with technical discussions", "Strong communication and facilitation skills"],
    niceToHave: ["Fintech, AI or Web3 domain experience", "Agency or consulting experience"],
  },
  {
    slug: "solution-consultant",
    title: "Solution Consultant",
    department: "sales",
    location: "Remote",
    type: "Full-time · Talent pool",
    summary: "Help prospective clients shape requirements and choose the right Shivacha engagement.",
    responsibilities: ["Run discovery calls with prospective clients", "Shape proposals with engineering leads", "Explain architecture and delivery approaches", "Maintain long-term client relationships"],
    requirements: ["Experience in technical sales or consulting", "Ability to discuss technology with executives and engineers", "Excellent written communication"],
    niceToHave: ["Background in fintech, AI or cloud", "International market experience"],
  },
];

export const getJob = (slug: string) => jobs.find((j) => j.slug === slug);
export const getDepartment = (slug: string) => careerDepartments.find((d) => d.slug === slug);
