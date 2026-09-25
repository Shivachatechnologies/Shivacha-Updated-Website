import { siteConfig } from "@/data/siteConfig";
import type { FAQ } from "@/data/types";

const abs = (path: string) => `${siteConfig.url}${path}`;

export const organizationSchema = () => ({
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": `${siteConfig.url}/#organization`,
  name: siteConfig.name,
  legalName: siteConfig.legalName,
  url: siteConfig.url,
  logo: abs("/icon.svg"),
  description: siteConfig.description,
  foundingDate: siteConfig.founded,
  email: siteConfig.contact.email,
  telephone: siteConfig.contact.phone,
  sameAs: [siteConfig.social.linkedin],
  founder: { "@type": "Person", name: "Chandrakant Singh", jobTitle: "CEO & Founder" },
  address: { "@type": "PostalAddress", addressLocality: "Gurugram", addressRegion: "Haryana", addressCountry: "IN" },
});

export const websiteSchema = () => ({
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${siteConfig.url}/#website`,
  name: siteConfig.name,
  url: siteConfig.url,
  publisher: { "@id": `${siteConfig.url}/#organization` },
});

export const breadcrumbSchema = (items: { name: string; href: string }[]) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: abs(it.href) })),
});

export const faqSchema = (faqs: FAQ[]) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
});

export const serviceSchema = (s: { name: string; description: string; path: string; category?: string }) => ({
  "@context": "https://schema.org",
  "@type": "Service",
  name: s.name,
  description: s.description,
  url: abs(s.path),
  serviceType: s.category ?? s.name,
  provider: { "@id": `${siteConfig.url}/#organization` },
  areaServed: "Worldwide",
});

export const productSchema = (p: { name: string; description: string; path: string; category: string }) => ({
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: p.name,
  description: p.description,
  url: abs(p.path),
  applicationCategory: "BusinessApplication",
  applicationSubCategory: p.category,
  operatingSystem: "Web, iOS, Android",
  publisher: { "@id": `${siteConfig.url}/#organization` },
});

export const articleSchema = (a: { title: string; description: string; path: string; date: string; author: string }) => ({
  "@context": "https://schema.org",
  "@type": "Article",
  headline: a.title,
  description: a.description,
  url: abs(a.path),
  datePublished: a.date,
  dateModified: a.date,
  author: { "@type": "Organization", name: a.author },
  publisher: { "@id": `${siteConfig.url}/#organization` },
  mainEntityOfPage: abs(a.path),
});
