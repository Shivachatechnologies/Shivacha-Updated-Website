import { requireAccess } from "@/lib/os/guard";
import { PageHeader } from "@/components/admin/ui";
import { KnowledgeForm } from "@/components/admin/knowledge-form";

export const metadata = { title: "New article" };

export default async function NewArticle() {
  await requireAccess("knowledge:manage");
  return (
    <>
      <PageHeader title="New article" crumbs={[{ label: "Knowledge Base", href: "/admin/knowledge" }, { label: "New" }]} />
      <KnowledgeForm />
    </>
  );
}
