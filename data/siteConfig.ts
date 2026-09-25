export const siteConfig = {
  name: "Shivacha Technologies",
  shortName: "Shivacha",
  legalName: "Shivacha Technologies Private Limited",
  url: (process.env.NEXT_PUBLIC_SITE_URL || "https://shivacha.com").replace(/\/$/, ""),
  tagline: "Technology for companies building what comes next.",
  description:
    "Shivacha builds AI systems, digital products, financial technology, Web3 infrastructure and cloud platforms for ambitious companies worldwide.",
  shortDescription: "AI. Digital. FinTech. Web3. Cloud.",
  founded: "2024",
  contact: {
    email: "contact@shivacha.com",
    phone: "+91 81711 33917",
    phoneHref: "tel:+918171133917",
    whatsapp: "https://wa.me/918171133917",
  },
  /** Registered office from public company records. Shown in legal contexts only; no other offices are claimed. */
  registeredOffice: {
    lines: ["Gurugram, Haryana", "India"],
    country: "India",
  },
  social: {
    linkedin: "https://www.linkedin.com/company/shivachatech",
  },
  delivery: "Remote-first global delivery across North America, Europe, the Middle East, Africa and Asia-Pacific time zones.",
  /**
   * Trust signals. Leave arrays empty until each item is verified and approved for publication.
   * Components render these sections only when entries exist.
   */
  trust: {
    clientLogos: [] as { name: string; logo: string }[],
    testimonials: [] as { quote: string; name: string; role: string; company: string }[],
    certifications: [] as string[],
    awards: [] as string[],
    metrics: [] as { value: string; label: string }[],
  },
} as const;

export type SiteConfig = typeof siteConfig;
