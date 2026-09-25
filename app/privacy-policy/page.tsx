import { getLegalPage } from "@/data/legal";
import { buildMetadata } from "@/lib/seo";
import { LegalPageView } from "@/components/sections/LegalPage";

const page = getLegalPage("privacy-policy");
export const metadata = buildMetadata({ title: page.title, description: page.description, path: "/privacy-policy" });

export default function Page() {
  return <LegalPageView slug="privacy-policy" />;
}
