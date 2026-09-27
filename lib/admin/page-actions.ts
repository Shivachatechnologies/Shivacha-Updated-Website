"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { authorize, AuthError } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { refreshPublic } from "./revalidate";
import { sectionsSchema, type SectionInput } from "./sections";

/** Replaces a page's sections (order = array order) in one transaction. */
export async function savePageSectionsAction(pageId: string, sections: SectionInput[]): Promise<{ ok?: string; error?: string }> {
  try {
    const user = await authorize("pages:manage");
    const parsed = sectionsSchema.safeParse(sections);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid sections." };
    const page = await db.page.findUnique({ where: { id: pageId }, select: { slug: true } });
    if (!page) return { error: "Page not found." };
    await db.$transaction([
      db.pageSection.deleteMany({ where: { pageId } }),
      db.pageSection.createMany({ data: parsed.data.map((s, i) => ({ pageId, type: s.type, hidden: s.hidden, data: s.data, order: i })) }),
      db.page.update({ where: { id: pageId }, data: { updatedAt: new Date() } }),
    ]);
    await audit({ userId: user.id, action: "page.sections_saved", entity: "page", entityId: pageId, metadata: { count: parsed.data.length } });
    refreshPublic(["cms:pages"], [`/${page.slug}`]);
    revalidatePath(`/admin/pages/${pageId}`);
    return { ok: "Sections saved." };
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    console.error("[admin] sections save failed", (e as Error).message);
    return { error: "Could not save sections." };
  }
}
