import { buildMetadata } from "@/lib/seo";
import { ContactLayout } from "@/components/sections/ContactLayout";
import { LeadForm } from "@/components/forms/LeadForm";

export const metadata = buildMetadata({ title: "Book a Meeting", description: "Book a meeting with a Shivacha solution architect or engineering advisor to discuss your AI, digital, fintech, Web3 or cloud initiative.", path: "/book-a-meeting" });

export default function BookMeetingPage() {
  return (
    <ContactLayout crumbs={[{ name: "Book a Meeting", href: "/book-a-meeting" }]} eyebrow="Book a meeting" title="Talk to an architect or engineering advisor." lede="Share your preferred times and topic. We will send calendar options — typically a 30–45 minute video call.">
      <LeadForm type="meeting" />
    </ContactLayout>
  );
}
