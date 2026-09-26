import { buildMetadata } from "@/lib/seo";
import { contactFaqs } from "@/data/faqs";
import { ContactLayout } from "@/components/sections/ContactLayout";
import { LeadForm } from "@/components/forms/LeadForm";
import { FAQ } from "@/components/sections/FAQ";
import { JsonLd, LinkCard } from "@/components/ui/primitives";
import { webPageSchema } from "@/lib/jsonld";

export const metadata = buildMetadata({ title: "Contact Shivacha", description: "Contact Shivacha Technologies about AI, digital, fintech, Web3 or cloud projects, product demos, dedicated teams or partnerships.", path: "/contact" });

export default function ContactPage() {
  return (
    <>
      <JsonLd data={webPageSchema({ type: "ContactPage", name: "Contact Shivacha Technologies", description: "Contact Shivacha Technologies — sales, HR and general enquiries, offices in Gurgaon, Dallas and London.", path: "/contact" })} />
      <ContactLayout
        crumbs={[{ name: "Contact", href: "/contact" }]}
        eyebrow="Contact"
        title="Let's talk about what you're building."
        lede="Questions, partnerships or general enquiries. For project briefs, use Discuss Your Project."
        side={
          <div className="grid gap-3">
            <h2 className="sr-only">Other ways to work with us</h2>
            <LinkCard href="/start-a-project" title="Discuss Your Project" description="Two quick steps. We reply within one business day." />
            <LinkCard href="/request-demo" title="Request a Demo" description="See a ready-to-launch product." />
          </div>
        }
      >
        <LeadForm type="contact" />
      </ContactLayout>
      <FAQ items={contactFaqs} />
    </>
  );
}
