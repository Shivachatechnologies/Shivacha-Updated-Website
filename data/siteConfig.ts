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
    email: "info@shivacha.com",
    phone: "+91 81711 33917",
    phoneHref: "tel:+918171133917",
    whatsapp: "https://wa.me/918171133917",
  },
  /** Enquiry desks shown in the footer and on the contact page. */
  enquiries: [
    { id: "sales", label: "Sales enquiry", description: "Projects, products and partnerships", email: "sales@shivacha.com", phone: "+91 81711 33917", phoneHref: "tel:+918171133917" },
    { id: "hr", label: "HR enquiry", description: "Careers and hiring", email: "hr@shivacha.com", phone: "+91 81711 33917", phoneHref: "tel:+918171133917" },
    { id: "general", label: "General enquiry", description: "Everything else", email: "info@shivacha.com", phone: "+91 81711 33917", phoneHref: "tel:+918171133917" },
  ],
  /**
   * Offices confirmed by Shivacha. `market` links an office to its market page.
   */
  offices: [
    {
      city: "Gurugram",
      label: "Gurgaon",
      country: "India",
      countryCode: "IN",
      timeZone: "Asia/Kolkata",
      lines: ["8th Floor, Tower-B4, Spaze Itech Park", "Sector-49, Gurgaon", "Haryana 122018"],
      region: "Haryana",
      postalCode: "122018",
      street: "8th Floor, Tower-B4, Spaze Itech Park, Sector-49",
      phone: "+91 81711 33917",
      phoneHref: "tel:+918171133917",
      headquarters: true,
      market: undefined,
    },
    {
      city: "Mohali",
      label: "Mohali",
      country: "India",
      countryCode: "IN",
      timeZone: "Asia/Kolkata",
      lines: ["E-299, 8th Floor, Corporate Green Tower", "Sector 75, Mohali", "Punjab"],
      region: "Punjab",
      postalCode: undefined,
      street: "E-299, 8th Floor, Corporate Green Tower, Sector 75",
      phone: "+91 81711 33917",
      phoneHref: "tel:+918171133917",
      headquarters: false,
      market: undefined,
    },
    {
      city: "Dallas",
      label: "Dallas, Texas",
      country: "United States",
      countryCode: "US",
      timeZone: "America/Chicago",
      lines: ["3699 McKinney Ave", "Dallas, Texas 75204"],
      region: "TX",
      postalCode: "75204",
      street: "3699 McKinney Ave",
      phone: "+1 (334) 846-9075",
      phoneHref: "tel:+13348469075",
      headquarters: false,
      market: "usa",
    },
    {
      city: "London",
      label: "London",
      country: "United Kingdom",
      countryCode: "GB",
      timeZone: "Europe/London",
      lines: ["71-75 Shelton Street", "London WC2H 9JQ", "United Kingdom"],
      region: undefined,
      postalCode: "WC2H 9JQ",
      street: "71-75 Shelton Street",
      phone: "+44 7446 971836",
      phoneHref: "tel:+447446971836",
      headquarters: false,
      market: "uk",
    },
  ],
  /** Registered office from public company records. */
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
