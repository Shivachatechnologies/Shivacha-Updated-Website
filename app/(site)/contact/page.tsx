import { buildMetadata } from "@/lib/seo";
import { withSeo } from "@/lib/cms/seo";
import { contactFaqs } from "@/data/faqs";
import { ContactLayout } from "@/components/sections/ContactLayout";
import { LeadForm } from "@/components/forms/LeadForm";
import { FAQ } from "@/components/sections/FAQ";
import { ContactPaths } from "@/components/sections/ContactPaths";
import { JsonLd } from "@/components/ui/primitives";
import { webPageSchema } from "@/lib/jsonld";

export const generateMetadata = () => withSeo(buildMetadata({ title: "Contact Shivacha", description: "Contact Shivacha Technologies about AI, digital, fintech, Web3 or cloud projects, product demos, dedicated teams or partnerships.", path: "/contact" }));

export default function ContactPage() {
  return (
    <>
      <JsonLd data={webPageSchema({ type: "ContactPage", name: "Contact Shivacha Technologies", description: "Contact Shivacha Technologies — sales, HR and general enquiries, offices in Gurgaon, Dallas and London.", path: "/contact" })} />
      <ContactLayout
        crumbs={[{ name: "Contact", href: "/contact" }]}
        eyebrow="Contact"
        title="Let's talk about what you're building."
        lede="Choose the path that fits — or send a message below for partnerships and general enquiries. Every enquiry is read by a senior engineer."
        intro={<ContactPaths />}
      >
        <LeadForm type="contact" />
      </ContactLayout>
      <FAQ items={contactFaqs} />
    </>
  );
}
