import { getLegalPage } from "@/data/legal";
import { buildMetadata } from "@/lib/seo";
import { withSeo } from "@/lib/cms/seo";
import { LegalPageView } from "@/components/sections/LegalPage";

const page = getLegalPage("security");
export const generateMetadata = () => withSeo(buildMetadata({ title: page.title, description: page.description, path: "/security" }));

export default function Page() {
  return <LegalPageView slug="security" />;
}
