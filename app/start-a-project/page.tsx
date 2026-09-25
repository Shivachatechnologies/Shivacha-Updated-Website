import { buildMetadata } from "@/lib/seo";
import { ContactLayout } from "@/components/sections/ContactLayout";
import { LeadForm } from "@/components/forms/LeadForm";

export const metadata = buildMetadata({ title: "Start a Project", description: "Tell Shivacha about your AI, software, fintech, Web3 or cloud project. Share goals, budget, timeline and documents — we reply within two business days.", path: "/start-a-project" });

export default function StartProjectPage() {
  return (
    <ContactLayout crumbs={[{ name: "Start a Project", href: "/start-a-project" }]} eyebrow="Start a project" title="Start the conversation." lede="The more context you share, the more useful our first conversation will be. Everything you send is treated as confidential.">
      <LeadForm type="project" />
    </ContactLayout>
  );
}
