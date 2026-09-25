import type { Point } from "./types";
import { pts } from "./_helpers";

export const engagementWays = [
  { n: "01", title: "Custom Engineering", description: "Build technology from scratch — designed around your business, owned by you.", href: "/services" },
  { n: "02", title: "Product Engineering", description: "Design, build and scale digital products with cross-functional product squads.", href: "/solutions/product-engineering" },
  { n: "03", title: "Ready-to-Launch Products", description: "Start from configurable Shivacha platforms for fintech, Web3, AI and digital.", href: "/products" },
  { n: "04", title: "Dedicated Engineering Teams", description: "Extend or build an engineering organisation with dedicated specialists and pods.", href: "/dedicated-teams" },
  { n: "05", title: "Technology Transformation", description: "Architecture, modernisation, AI, cloud, fintech and enterprise transformation.", href: "/solutions/digital-transformation" },
];

export interface CompanyPage {
  slug: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  h1: string;
  lede: string;
  sections: { heading: string; body: string[]; points?: Point[] }[];
}

export const companyPages: CompanyPage[] = [
  {
    slug: "about",
    title: "About",
    metaTitle: "About Shivacha Technologies",
    metaDescription: "Shivacha Technologies is a global technology company building AI systems, digital products, fintech, Web3 infrastructure and cloud platforms.",
    h1: "A technology company for companies building what comes next.",
    lede: "Shivacha brings AI, digital engineering, financial technology, Web3 and cloud together — so ambitious companies can build, transform and scale with one partner.",
    sections: [
      {
        heading: "Who we are",
        body: [
          "Shivacha Technologies Private Limited was incorporated in 2024. The company began with a focus on blockchain engineering and has grown into a technology company organised around five divisions: Shivacha AI, Shivacha Digital, Shivacha FinTech, Shivacha Web3 and Shivacha Cloud.",
          "We work remotely with companies worldwide — startups, scaleups and enterprises — across financial services, SaaS, commerce, real estate, logistics, healthcare and the public sector.",
        ],
      },
      {
        heading: "Why five divisions",
        body: [
          "The most valuable technology problems no longer fit in one discipline. A payment platform adding stablecoin settlement needs fintech and Web3 engineers. An AI agent that reconciles transactions needs AI and fintech depth. A tokenization platform needs Web3, cloud security and product engineering.",
          "Organising around five divisions — and delivering across them as one team — lets us take on those problems without handoffs between vendors.",
        ],
      },
      {
        heading: "How clients work with us",
        body: ["Clients engage Shivacha in five ways, often combining them over time."],
        points: pts([
          "Custom engineering|Bespoke systems built around your business.",
          "Product engineering|Cross-functional squads that build and grow products.",
          "Ready-to-launch products|Configurable Shivacha platforms as a starting point.",
          "Dedicated teams|Engineers, pods and teams working inside your organisation.",
          "Technology transformation|Architecture, modernisation and adoption programmes.",
        ]),
      },
      {
        heading: "What we will not do",
        body: [
          "We do not publish client names, testimonials, metrics or certifications we cannot verify. We do not present internal reviews as independent audits. We do not provide legal, regulatory or investment advice. Where our work touches regulated activity, licensed partners and your advisors play their proper roles.",
        ],
      },
    ],
  },
  {
    slug: "vision",
    title: "Vision",
    metaTitle: "Our Vision",
    metaDescription: "Shivacha's vision: a world where every ambitious company can build with AI, digital, financial and decentralised technology as easily as the largest technology firms.",
    h1: "Advanced technology, accessible to every ambitious company.",
    lede: "We believe the capabilities that once belonged only to the largest technology companies — AI, programmable finance, global-scale infrastructure — should be within reach of any company with the ambition to use them.",
    sections: [
      {
        heading: "The convergence we see",
        body: [
          "AI is becoming part of every workflow. Money is becoming programmable. Assets are moving on-chain. Infrastructure is becoming software. These shifts are converging, and the companies that combine them well will define their industries.",
        ],
      },
      {
        heading: "Our role",
        body: [
          "Shivacha exists to make that convergence practical: engineering systems that are secure, reliable and understandable, and building the products and teams that let clients move faster than they could alone.",
        ],
      },
    ],
  },
  {
    slug: "mission",
    title: "Mission",
    metaTitle: "Our Mission",
    metaDescription: "Shivacha's mission: engineer technology around our clients' businesses — AI, digital, fintech, Web3 and cloud — with integrity and rigour.",
    h1: "Technology engineered around your business.",
    lede: "Our mission is to design, build and operate technology that creates measurable value for our clients — with engineering rigour, honesty about trade-offs and ownership of outcomes.",
    sections: [
      {
        heading: "What guides us",
        body: ["Four commitments shape how we work with every client."],
        points: pts([
          "Engineering rigour|Tested, documented, observable systems built to last.",
          "Honest advice|We say when something is not needed or not ready.",
          "Client ownership|Your code, your IP, your capability.",
          "Security by design|Controls built in, not bolted on.",
        ]),
      },
    ],
  },
  {
    slug: "engineering",
    title: "Engineering",
    metaTitle: "How Shivacha Engineers",
    metaDescription: "The engineering standards behind Shivacha's work: specifications, typed code, automated testing, CI/CD, observability, security and documentation.",
    h1: "How we engineer.",
    lede: "Our standards are the same whether we are building an MVP or a core banking integration: typed code, automated tests, continuous delivery, observability and documentation.",
    sections: [
      {
        heading: "Standards on every project",
        body: ["These practices are defaults, not upsells."],
        points: pts([
          "Specifications before code|Architecture decision records, API contracts and, for smart contracts, formal specifications.",
          "Typed, reviewed code|TypeScript, typed Python, Go, Kotlin and Rust, with mandatory code review.",
          "Automated testing|Unit, integration and end-to-end tests; fuzz and invariant tests for smart contracts.",
          "CI/CD from day one|Automated builds, tests, security scans and deployments.",
          "Infrastructure as code|Reproducible environments with Terraform and GitOps.",
          "Observability|Metrics, logs and traces with alerting on user-facing impact.",
          "Security by design|Threat modelling, least privilege, secrets management and dependency scanning.",
          "Documentation|Runbooks, architecture docs and onboarding guides delivered with the code.",
        ]),
      },
      {
        heading: "Delivery",
        body: [
          "We work in short iterations with working software in a staging environment, regular demos and transparent reporting. Risks are raised early, and estimates carry explicit assumptions.",
        ],
      },
    ],
  },
  {
    slug: "technology",
    title: "Technology",
    metaTitle: "Our Technology Stack",
    metaDescription: "The technologies Shivacha builds with across frontend, backend, mobile, AI, blockchain, fintech standards, cloud, DevOps and data.",
    h1: "A broad stack, chosen deliberately.",
    lede: "We work across more than a hundred technologies — and choose the simplest combination that meets each system's requirements.",
    sections: [
      {
        heading: "Our defaults",
        body: [
          "For web products: TypeScript, React and Next.js with Node.js or Python backends and PostgreSQL. For AI: Python, hosted and open-weight LLMs behind a model gateway, hybrid retrieval and evaluation suites. For fintech: double-entry ledgers, event-driven services in Go or Java, and ISO 20022-aware integrations. For Web3: Solidity with Foundry and OpenZeppelin on EVM networks, Rust for Solana, and institutional key management. For cloud: Terraform, Kubernetes, GitOps and open observability standards.",
          "Defaults are a starting point. We adapt to your existing stack, team skills and constraints.",
        ],
      },
    ],
  },
  {
    slug: "culture",
    title: "Culture",
    metaTitle: "Culture at Shivacha",
    metaDescription: "How Shivacha works: ownership, clear writing, continuous learning and respect for clients' time and trust.",
    h1: "A culture of ownership and craft.",
    lede: "We are a distributed team of engineers, designers and product people who care about building things properly and treating clients' problems as our own.",
    sections: [
      {
        heading: "What we value",
        body: ["The behaviours we hire for and reward."],
        points: pts([
          "Ownership|We finish what we start and raise problems early.",
          "Clear writing|Decisions, designs and handovers are written down.",
          "Learning|Technology moves fast; so do we.",
          "Candour|Honest, respectful disagreement produces better systems.",
          "Craft|We are proud of work that is reliable, readable and secure.",
        ]),
      },
      {
        heading: "Remote by design",
        body: [
          "We work remotely and asynchronously by default, with deliberate overlap for collaboration with clients across time zones.",
        ],
      },
    ],
  },
  {
    slug: "global-presence",
    title: "Global Presence",
    metaTitle: "Global Delivery",
    metaDescription: "Shivacha serves companies across North America, Europe, the Middle East, Africa and Asia-Pacific through remote-first global delivery.",
    h1: "Global delivery, remote by design.",
    lede: "We work with companies across North America, Europe, the Middle East, Africa and Asia-Pacific — collaborating in your time zone and your tools.",
    sections: [
      {
        heading: "How global delivery works",
        body: [
          "Teams are structured with agreed working-hour overlap for each client, asynchronous handoffs documented in shared tools and regular synchronous rituals. Security practices — company-managed devices, least-privilege access and confidentiality agreements — apply wherever engineers work.",
          "Shivacha Technologies Private Limited is registered in India. We do not claim physical offices in other markets; market pages describe how we serve companies there remotely.",
        ],
      },
    ],
  },
  {
    slug: "partners",
    title: "Partners",
    metaTitle: "Partner Program",
    metaDescription: "Partner with Shivacha: technology, referral and delivery partnerships for companies that serve ambitious clients.",
    h1: "Partner with Shivacha.",
    lede: "We work with technology providers, consultancies and agencies whose clients need AI, fintech, Web3 or cloud engineering capacity.",
    sections: [
      {
        heading: "Partnership types",
        body: ["We are building our partner ecosystem and welcome conversations about the following models."],
        points: pts([
          "Technology partners|Platforms and infrastructure providers whose clients need implementation expertise.",
          "Delivery partners|Consultancies and agencies that need specialised engineering capacity.",
          "Referral partners|Advisors who introduce clients with relevant technology needs.",
        ]),
      },
      {
        heading: "A note on listed partners",
        body: [
          "We only list partners with a formal, verified partnership. The technologies we work with are shown in our technology directory; appearing there does not imply a partnership.",
        ],
      },
    ],
  },
];

export const getCompanyPage = (slug: string) => companyPages.find((p) => p.slug === slug);
