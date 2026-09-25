/**
 * Editable legal content. These pages are templates written in plain language and must be
 * reviewed by qualified counsel before publication. They make no regulatory claims.
 */
export interface LegalPage {
  slug: string;
  title: string;
  description: string;
  updated: string;
  sections: { heading: string; body: string[] }[];
}

const updated = "2026-09-25";

export const legalPages: LegalPage[] = [
  {
    slug: "privacy-policy",
    title: "Privacy Policy",
    description: "How Shivacha Technologies collects, uses and protects personal information.",
    updated,
    sections: [
      { heading: "Who we are", body: ["This website is operated by Shivacha Technologies Private Limited (\"Shivacha\", \"we\"). Questions about this policy can be sent to contact@shivacha.com."] },
      { heading: "Information we collect", body: ["Information you provide through forms — such as your name, business email, company, country, role and project details — and any documents you choose to upload.", "Technical information such as device, browser and usage data collected through cookies and analytics tools where you have consented to them."] },
      { heading: "How we use information", body: ["To respond to enquiries, provide requested resources, arrange meetings, evaluate job applications, improve our website and — with consent where required — send relevant communications."] },
      { heading: "Legal bases and consent", body: ["We process personal information on the basis of your consent, our legitimate interests in responding to business enquiries, or to take steps before entering a contract. You may withdraw consent at any time."] },
      { heading: "Sharing", body: ["We use service providers for hosting, analytics, customer relationship management and communications. They process data on our behalf under appropriate agreements. We do not sell personal information."] },
      { heading: "International transfers", body: ["Our team works remotely across countries. Where personal data is transferred internationally, we apply appropriate safeguards."] },
      { heading: "Retention", body: ["We keep personal information only as long as necessary for the purposes described or as required by law."] },
      { heading: "Your rights", body: ["Depending on your location, you may have rights to access, correct, delete, restrict or port your personal information, and to object to processing. Contact us to exercise these rights."] },
      { heading: "Changes", body: ["We may update this policy. The date above shows when it was last revised."] },
    ],
  },
  {
    slug: "terms",
    title: "Terms of Use",
    description: "Terms governing use of the Shivacha website.",
    updated,
    sections: [
      { heading: "Acceptance", body: ["By using this website you agree to these terms. If you do not agree, please do not use the website."] },
      { heading: "Information only", body: ["Content on this website is provided for general information. It does not constitute legal, financial, investment, tax or regulatory advice, and does not create a client relationship. Services are provided only under a signed agreement."] },
      { heading: "Intellectual property", body: ["Website content, branding and design are owned by Shivacha or its licensors. You may not reproduce them without permission, except for personal, non-commercial reference."] },
      { heading: "Acceptable use", body: ["You agree not to misuse the website, attempt unauthorised access, interfere with its operation or submit unlawful content through forms."] },
      { heading: "Third-party links", body: ["Links to third-party sites are provided for convenience. We are not responsible for their content or practices."] },
      { heading: "Limitation of liability", body: ["To the extent permitted by law, Shivacha is not liable for losses arising from use of this website or reliance on its content."] },
      { heading: "Governing law", body: ["These terms are governed by the laws applicable at Shivacha's registered location, unless otherwise required by law."] },
    ],
  },
  {
    slug: "cookie-policy",
    title: "Cookie Policy",
    description: "How the Shivacha website uses cookies and similar technologies.",
    updated,
    sections: [
      { heading: "What cookies are", body: ["Cookies are small files stored on your device that help websites function and understand usage."] },
      { heading: "Cookies we use", body: ["Strictly necessary cookies for security and core functionality.", "Analytics and marketing cookies (for example Google Analytics, Meta Pixel and LinkedIn Insight Tag) — only when configured and, where required, with your consent."] },
      { heading: "Managing cookies", body: ["You can control cookies through your browser settings and any consent controls presented on the website."] },
    ],
  },
  {
    slug: "disclaimer",
    title: "Disclaimer",
    description: "Important information about the nature of Shivacha's services and website content.",
    updated,
    sections: [
      { heading: "Technology services only", body: ["Shivacha is a technology company. We do not hold banking, payment, e-money, custody, securities, lending or virtual asset licences. Regulated activities described on this website are performed by clients or licensed third parties."] },
      { heading: "No advice", body: ["Nothing on this website is legal, regulatory, tax, investment or financial advice. References to tokenization, digital assets, stablecoins or financial products describe technology capabilities only. Consult qualified advisors for your circumstances."] },
      { heading: "Security work", body: ["Our smart contract and security services are engineering services and internal reviews. They are not independent audits or certifications unless explicitly stated in a signed agreement."] },
      { heading: "Reference architectures", body: ["Case studies labelled as reference architectures describe Shivacha's approach to a class of system and do not describe specific client engagements or results."] },
      { heading: "Third-party names", body: ["Technology names and trademarks belong to their respective owners. Their mention does not imply partnership or endorsement."] },
    ],
  },
  {
    slug: "security",
    title: "Security",
    description: "How Shivacha approaches security in our operations and in the systems we build.",
    updated,
    sections: [
      { heading: "Our approach", body: ["Security is built into our engineering practices: threat modelling, least-privilege access, secrets management, dependency scanning, encryption and code review are defaults on client work."] },
      { heading: "Operational security", body: ["Engineers work on company-managed devices with access granted per project on a least-privilege basis and revoked at project end. Confidentiality agreements apply to all team members."] },
      { heading: "Certifications", body: ["Shivacha does not currently claim formal security certifications. When certifications are obtained, they will be listed here with verification details."] },
      { heading: "Responsible disclosure", body: ["If you believe you have found a security vulnerability in our website or services, please email contact@shivacha.com with details. Please do not access data that is not yours or disrupt services. We will acknowledge and investigate reports promptly."] },
    ],
  },
  {
    slug: "accessibility",
    title: "Accessibility",
    description: "Our commitment to an accessible website.",
    updated,
    sections: [
      { heading: "Commitment", body: ["We aim for this website to be usable by everyone and design towards the Web Content Accessibility Guidelines (WCAG) 2.2 Level AA."] },
      { heading: "Measures", body: ["Semantic HTML, keyboard navigation, visible focus states, sufficient colour contrast, reduced-motion support, text alternatives and accessible forms."] },
      { heading: "Feedback", body: ["If you encounter an accessibility barrier, please contact contact@shivacha.com and we will work to address it."] },
    ],
  },
];

export const getLegalPage = (slug: string) => legalPages.find((p) => p.slug === slug)!;
