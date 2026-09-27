import { ResourceListPage } from "@/components/admin/resource-views";

export const metadata = { title: "FAQs" };

export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <ResourceListPage k="faqs" searchParams={searchParams} />;
}
