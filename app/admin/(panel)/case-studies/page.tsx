import { ResourceListPage } from "@/components/admin/resource-views";

export const metadata = { title: "Case Studies" };

export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <ResourceListPage k="case-studies" searchParams={searchParams} />;
}
