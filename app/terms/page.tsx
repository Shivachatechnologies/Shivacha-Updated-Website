import { getLegalPage } from "@/data/legal";
import { buildMetadata } from "@/lib/seo";
import { LegalPageView } from "@/components/sections/LegalPage";

const page = getLegalPage("terms");
export const metadata = buildMetadata({ title: page.title, description: page.description, path: "/terms" });

export default function Page() {
  return <LegalPageView slug="terms" />;
}
