import { ResourceEditPage } from "@/components/admin/resource-views";

export const metadata = { title: "Edit · Technologies" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ResourceEditPage k="technologies" id={id} />;
}
