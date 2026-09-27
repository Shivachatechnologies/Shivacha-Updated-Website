import { ResourceListPage } from "@/components/admin/resource-views";

export const metadata = { title: "Industries" };

export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <ResourceListPage k="industries" searchParams={searchParams} />;
}
