import { buildMetadata } from "@/lib/seo";
import { withSeo } from "@/lib/cms/seo";
import { PageHero } from "@/components/sections/PageHero";
import { ProjectEstimator } from "@/components/leads/ProjectEstimator";
import { FAQ } from "@/components/sections/FAQ";
import { Section } from "@/components/ui/primitives";

export const generateMetadata = () => withSeo(buildMetadata({
  title: "Project Estimator — Indicative Timeline & Team",
  description: "Answer four quick questions about your blockchain, FinTech, AI, SaaS, mobile or web project and get an indicative timeline, team shape and phase plan. No email required.",
  path: "/project-estimator",
}));

const faqs = [
  { q: "Why doesn't the estimator show a price?", a: "Because a responsible price depends on details a short form cannot capture — integrations, compliance, existing code and your team. The estimator shows timeline and team shape; we provide a written estimate after a short discovery call." },
  { q: "How accurate is the timeline?", a: "It reflects typical projects of the same shape and is meant for early planning. Real timelines depend on scope decisions, third-party partners and feedback cycles." },
  { q: "What happens when I click Get Detailed Estimate?", a: "Your answers are copied into our project form as a brief. Add your contact details and a senior engineer will reply within one business day." },
];

export default function EstimatorPage() {
  return (
    <>
      <PageHero
        crumbs={[{ name: "Project Estimator", href: "/project-estimator" }]}
        eyebrow={<span className="eyebrow">Planning tool</span>}
        title={
          <>
            How long will it take — <span className="accent-word">and who do you need?</span>
          </>
        }
        lede="Four quick questions give you an indicative timeline, team shape and phase plan. Indicative only — no email required to see the result."
      />
      <Section tone="plain" className="pt-0 sm:pt-0 lg:pt-0">
        <ProjectEstimator />
      </Section>
      <FAQ items={faqs} />
    </>
  );
}
