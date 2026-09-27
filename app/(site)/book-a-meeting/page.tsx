import { buildMetadata } from "@/lib/seo";
import { withSeo } from "@/lib/cms/seo";
import { isCalendlyConfigured } from "@/lib/calendly";
import { ContactLayout } from "@/components/sections/ContactLayout";
import { LeadForm } from "@/components/forms/LeadForm";
import { CalendlyFrame } from "@/components/leads/BookCall";

export const generateMetadata = () => withSeo(buildMetadata({
  title: "Book a Call",
  description: "Book a call with a Shivacha solution architect or engineering expert to discuss your Web3, fintech, AI, software or cloud project.",
  path: "/book-a-meeting",
}));

export default function BookMeetingPage() {
  const calendly = isCalendlyConfigured();
  return (
    <ContactLayout
      crumbs={[{ name: "Book a Call", href: "/book-a-meeting" }]}
      eyebrow="Book a call"
      title="Talk to an expert."
      lede={calendly ? "Pick a time that suits you. Calls are 30 minutes on video, with a solution architect who knows your domain." : "Share your preferred times and topic and we will send calendar options — typically a 30-minute video call."}
    >
      {calendly ? <CalendlyFrame source="book_a_meeting_page" className="-m-6 h-[720px] sm:-m-8" /> : <LeadForm type="meeting" />}
    </ContactLayout>
  );
}
