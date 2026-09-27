import { db } from "@/lib/db/client";
import { ResourceEditPage } from "@/components/admin/resource-views";
import { SectionBuilder } from "@/components/admin/SectionBuilder";
import { savePageSectionsAction } from "@/lib/admin/page-actions";
import type { SectionInput } from "@/lib/admin/sections";

export const metadata = { title: "Edit · Pages" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sections = await db.pageSection.findMany({ where: { pageId: id }, orderBy: { order: "asc" } });
  return (
    <>
      <ResourceEditPage k="pages" id={id} />
      <SectionBuilder initial={sections.map((s) => ({ id: s.id, type: s.type as SectionInput["type"], hidden: s.hidden, data: (s.data ?? {}) as Record<string, string> }))} save={savePageSectionsAction.bind(null, id)} />
    </>
  );
}
