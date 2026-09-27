import { EyeOff, FileSignature, Handshake, Layers, ShieldCheck, Users } from "lucide-react";
import { buildMetadata } from "@/lib/seo";
import { withSeo } from "@/lib/cms/seo";
import { serviceSchema } from "@/lib/jsonld";
import { PageHero } from "@/components/sections/PageHero";
import { ProductBuildVisual } from "@/components/visuals/SystemVisuals";
import { CheckList, PointsGrid } from "@/components/sections/blocks";
import { FAQ } from "@/components/sections/FAQ";
import { LeadPanel } from "@/components/leads/LeadPanel";
import { BookCallButton } from "@/components/leads/BookCall";
import { JsonLd, LinkButton, Section, SectionHeader } from "@/components/ui/primitives";

const path = "/white-label-development";

export const generateMetadata = () => withSeo(buildMetadata({
  title: "White-Label Development for Agencies & Consultancies",
  description: "White-label software development for agencies, consultancies and product studios: Web3, blockchain, FinTech, AI, web and mobile engineering delivered under your brand, with NDAs and no client contact unless you want it.",
  path,
}));

const who = [
  { title: "Digital agencies", description: "Win bigger builds — apps, platforms and integrations — without hiring a full engineering bench." },
  { title: "Consultancies", description: "Turn strategy engagements into delivery, with specialist Web3, FinTech and AI engineers behind you." },
  { title: "Product studios", description: "Add capacity during peaks, or specialist skills you do not keep in-house." },
  { title: "Technology vendors", description: "Offer implementation and custom integration services to your customers." },
];

const services = [
  { title: "Blockchain & Web3", description: "Smart contracts, dApps, wallets, token systems and exchange components." },
  { title: "FinTech", description: "Payment integrations, ledgers, onboarding and banking-as-a-service builds." },
  { title: "AI", description: "Assistants, RAG search, document automation and AI features inside existing products." },
  { title: "Web & mobile", description: "Next.js web apps, React Native and native mobile, dashboards and portals." },
  { title: "SaaS & MVPs", description: "Multi-tenant SaaS, billing, admin tools and fast MVPs for your clients." },
  { title: "Cloud & DevOps", description: "Infrastructure as code, CI/CD, monitoring and managed operations." },
];

const how = [
  { title: "Confidential by default", description: "Mutual NDA before any client detail is shared. We never contact or market to your clients." },
  { title: "Your brand, your process", description: "We work in your tools and under your brand — email aliases, your tracker and your reporting templates." },
  { title: "Clear commercial terms", description: "Fixed-scope or monthly team pricing agreed with you. You set the margin and own the client relationship." },
  { title: "IP assigned to you", description: "Work product is assigned to you (and onward to your client) under the agreement." },
];

const faqs = [
  { q: "Will you ever contact our clients directly?", a: "Only if you ask us to — for example, a technical workshop presented as part of your team. Otherwise all communication runs through you." },
  { q: "Can your engineers use our company email and name?", a: "Yes. Engineers can work under your brand with your email aliases, following your communication guidelines." },
  { q: "How do you price white-label work?", a: "Either a fixed price for a defined scope or a monthly rate per engineer. We agree the model before work begins; you set your own pricing to your client." },
  { q: "Do you sign non-solicitation agreements?", a: "Yes. Non-solicitation of your clients and staff is standard in our partner agreements." },
  { q: "Who handles project management?", a: "Your choice: your PM leads and we supply engineers, or we provide a delivery manager who reports to you." },
];

export default function WhiteLabelPage() {
  return (
    <>
      <JsonLd data={serviceSchema({ name: "White-Label Software Development", description: "Engineering delivered under your brand for agencies, consultancies and product studios.", path, category: "White-label development" })} />
      <PageHero
        crumbs={[{ name: "Services", href: "/services" }, { name: "White-Label Development", href: path }]}
        eyebrow={<span className="eyebrow">For agencies & consultancies</span>}
        title={
          <>
            Your clients. <span className="accent-word">Our engineering team.</span>
          </>
        }
        lede="White-label Web3, FinTech, AI, web and mobile engineering delivered under your brand. You keep the relationship and the margin; we deliver the code — quietly and to a high standard."
        aside={<ProductBuildVisual />}
      >
        <LinkButton href="#enquire" track="cta:white-label">
          Become a Partner
        </LinkButton>
        <BookCallButton label="Book a Partner Call" variant="secondary" source="white_label" />
      </PageHero>

      <Section>
        <SectionHeader eyebrow="Who it's for" title="Built for teams that sell technology" />
        <PointsGrid points={who} columns={4} />
      </Section>

      <Section>
        <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr] lg:items-start">
          <div>
            <SectionHeader eyebrow="What we deliver" title="Specialist engineering you can resell" lede="Take on projects outside your core skills without the risk of hiring for them." className="mb-6" />
            <ul className="grid gap-3 text-sm text-muted">
              {[
                [EyeOff, "Invisible to your clients unless you choose otherwise"],
                [FileSignature, "NDA, non-solicitation and IP assignment as standard"],
                [Users, "Engineers who can join client calls as part of your team"],
                [ShieldCheck, "Security and code-quality practices you can put your name to"],
              ].map(([I, t]) => {
                const Ico = I as typeof EyeOff;
                return (
                  <li key={t as string} className="flex items-center gap-3">
                    <Ico className="size-4 shrink-0 text-brand-blue" aria-hidden /> {t as string}
                  </li>
                );
              })}
            </ul>
          </div>
          <PointsGrid points={services} columns={2} />
        </div>
      </Section>

      <Section>
        <SectionHeader eyebrow="How it works" title="A partnership, not a black box" />
        <PointsGrid points={how} columns={4} numbered />
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {[
            [Handshake, "1. Partner call", "We learn how you sell and deliver, and agree terms."],
            [Layers, "2. First project", "A scoped first project, often a discovery or MVP, to prove the fit."],
            [Users, "3. Ongoing capacity", "A stable team you can rely on for future client work."],
          ].map(([I, t, d]) => {
            const Ico = I as typeof Handshake;
            return (
              <div key={t as string} className="card p-6">
                <Ico className="size-5 text-brand-blue" aria-hidden />
                <p className="mt-4 font-semibold text-fg">{t as string}</p>
                <p className="mt-1 text-sm text-muted">{d as string}</p>
              </div>
            );
          })}
        </div>
      </Section>

      <Section>
        <SectionHeader eyebrow="Fit check" title="White-label works best when" />
        <CheckList items={["You own the client relationship and account management", "Projects need specialist skills you do not keep in-house", "You want predictable capacity rather than freelancers", "Quality and confidentiality matter to your reputation"]} />
      </Section>

      <FAQ items={faqs} />
      <LeadPanel
        title="Become a white-label partner."
        lede="Tell us about your agency or consultancy, the clients you serve and the skills you need. We will set up a partner call."
        service="Dedicated Development Team"
        source="white_label"
        whatsappText="Hi Shivacha, I'd like to discuss a white-label partnership."
        points={["NDA before any client details", "No contact with your clients", "Fixed-scope or monthly team pricing"]}
      />
    </>
  );
}
