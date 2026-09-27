import { requireAccess } from "@/lib/os/guard";
import { createProjectAction } from "@/lib/projects/actions";
import { PageHeader, Panel } from "@/components/admin/ui";
import { ProjectForm } from "@/components/admin/projects/project-form";
import { str, type SP } from "@/components/admin/os";

export const metadata = { title: "New project" };

export default async function NewProjectPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAccess("projects:manage", "PROJECTS");
  const sp = await searchParams;
  return (
    <>
      <PageHeader title="New project" crumbs={[{ label: "Projects", href: "/admin/projects" }, { label: "New" }]} />
      <Panel><ProjectForm action={createProjectAction} submit="Create project" defaults={{ clientId: str(sp, "clientId", 40), dealId: str(sp, "dealId", 40) }} /></Panel>
    </>
  );
}
