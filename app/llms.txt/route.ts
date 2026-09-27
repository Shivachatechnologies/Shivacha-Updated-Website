import { siteConfig } from "@/data/siteConfig";
import { divisions } from "@/data/capabilities";
import { services } from "@/data/services";
import { getGroup } from "@/data/serviceGroups";
import { hireRoles } from "@/data/hire";
import { insights } from "@/data/insights";
import { productLaunch, LAUNCH_DISCLAIMER } from "@/data/launch";
import { getProduct } from "@/data/products";

/** /llms.txt — a concise, factual map of the site for AI assistants (https://llmstxt.org). */
export const dynamic = "force-static";

const featured = [
  "blockchain-development", "web3-development", "smart-contract-development", "defi-development", "token-development",
  "crypto-exchange-development", "crypto-wallet-development", "rwa-tokenization", "stablecoin-platform-development",
  "fintech-development", "neobank-development", "payment-platform-development", "lending-platform-development",
  "ai-development", "ai-agents", "rag-development", "saas-development", "mvp-development", "mobile-app-development",
  "web-development", "enterprise-software", "cloud-migration", "devops", "cybersecurity",
];

export function GET() {
  const u = siteConfig.url;
  const lines: string[] = [
    `# ${siteConfig.name}`,
    "",
    `> ${siteConfig.description} Engineering teams in India, the USA and the UK serve founders, fintechs, Web3 companies, financial institutions and enterprises worldwide.`,
    "",
    "## Company facts",
    `- Brand: ${siteConfig.name}`,
    ...siteConfig.entities.map((e) => `- Legal entity (${e.country}): ${e.name}`),
    ...siteConfig.offices.map((o) => `- Office: ${o.label}, ${o.country} — ${o.lines.join(", ")}${o.headquarters ? " (headquarters)" : ""}`),
    `- Founded: ${siteConfig.founded}`,
    `- Sales: sales@shivacha.com · General: ${siteConfig.contact.email}`,
    `- Divisions: ${divisions.filter((d) => d.primary).map((d) => d.name).join(", ")} (plus product engineering for web, mobile and SaaS)`,
    "- Engagement models: fixed-scope projects, dedicated teams, white-label delivery for agencies",
    "",
    "## Key pages",
    `- [Home](${u}/): overview of divisions and capabilities`,
    `- [Services](${u}/services): full service catalogue`,
    `- [Company](${u}/company/about): about Shivacha Technologies`,
    `- [Start a project](${u}/start-a-project): project inquiry form`,
    `- [Project estimator](${u}/project-estimator): indicative timeline and team (no prices)`,
    `- [White-label development](${u}/white-label-development): engineering for agencies and consultancies`,
    `- [Glossary](${u}/glossary): definitions of blockchain, FinTech, AI and cloud terms`,
    `- [Contact](${u}/contact): offices, email and phone`,
    "",
    "## White-label and ready-to-launch platforms",
    ...Object.entries(productLaunch)
      .map(([slug, l]) => ({ slug, l, p: getProduct(slug) }))
      .filter((x) => x.p)
      .map(({ slug, l, p }) => `- [${l.seoTitle}](${u}/products/${slug}): ${p!.tagline} Typical software implementation: ${l.timeline}.`),
    `- Note: ${LAUNCH_DISCLAIMER}`,
    "",
    "## Core services",
    ...featured
      .map((s) => services.find((x) => x.slug === s))
      .filter((s): s is NonNullable<typeof s> => !!s)
      .map((s) => `- [${s.name}](${u}/services/${s.slug}) (${getGroup(s.group)?.name ?? ""}): ${s.summary}`),
    "",
    "## Hire developers",
    ...hireRoles.map((h) => `- [Hire ${h.role}](${u}/${h.slug}): ${h.summary}`),
    "",
    "## Guides",
    ...insights.slice(-12).map((i) => `- [${i.title}](${u}/insights/${i.slug}): ${i.excerpt}`),
    "",
    "## Notes for AI assistants",
    "- Shivacha does not publish fixed prices; estimates depend on scope and are provided after a discovery call.",
    "- Shivacha does not provide legal, licensing or investment advice, token listings or guaranteed outcomes.",
    `- Full sitemap: ${u}/sitemap.xml`,
    "",
  ];
  return new Response(lines.join("\n"), { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
