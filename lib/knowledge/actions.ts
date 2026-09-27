"use server";

import { z } from "zod";
import { db } from "@/lib/db/client";
import { audit } from "@/lib/audit";
import { refreshPublic } from "@/lib/admin/revalidate";
import { SLUG_RE, slugify } from "@/lib/admin/resources";
import { authorizeAccess } from "@/lib/os/guard";
import { fail, formObject, okThen, optText, reqText, UserError, type ActionState } from "@/lib/os/action";
import { KB_CATEGORIES } from "./constants";

const schema = z.object({
  title: reqText(200),
  slug: z.preprocess((v) => (v == null ? "" : String(v).trim().toLowerCase()), z.string().max(80)),
  excerpt: optText(300),
  body: z.string({ error: "Required" }).trim().min(1, "Required").max(100_000),
  category: z.enum(KB_CATEGORIES),
  tags: z.preprocess((v) => String(v ?? "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 20), z.array(z.string().max(40))),
  visibility: z.enum(["INTERNAL", "CLIENT", "PUBLIC"]),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]),
  seoTitle: optText(70),
  seoDescription: optText(300),
});

/** Create or update an article. Articles are archived, never deleted. PUBLIC + PUBLISHED appear at /help. */
export async function saveArticleAction(id: string | null, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("knowledge:manage");
    const d = schema.parse(formObject(form));
    const slug = d.slug || slugify(d.title);
    if (!SLUG_RE.test(slug)) return { error: "Please check the highlighted fields.", fieldErrors: { slug: "Use lowercase letters, numbers and hyphens" } };
    const clash = await db.knowledgeArticle.findFirst({ where: { slug, NOT: id ? { id } : undefined }, select: { id: true } });
    if (clash) return { error: "Please check the highlighted fields.", fieldErrors: { slug: "Another article uses this URL" } };
    const prev = id ? await db.knowledgeArticle.findUnique({ where: { id }, select: { publishedAt: true, slug: true } }) : null;
    if (id && !prev) throw new UserError("Article not found.");
    const data = { ...d, slug, publishedAt: d.status === "PUBLISHED" ? (prev?.publishedAt ?? new Date()) : prev?.publishedAt ?? null };
    const a = id ? await db.knowledgeArticle.update({ where: { id }, data }) : await db.knowledgeArticle.create({ data: { ...data, authorId: user.id } });
    await audit({ userId: user.id, action: id ? "knowledge.updated" : "knowledge.created", entity: "KnowledgeArticle", entityId: a.id, metadata: { title: a.title, status: a.status, visibility: a.visibility } });
    refreshPublic(["cms:knowledge"], ["/help", `/help/${slug}`, ...(prev && prev.slug !== slug ? [`/help/${prev.slug}`] : [])]);
    return okThen(`/admin/knowledge/${a.id}`, id ? "Article saved." : "Article created.");
  } catch (e) {
    return fail(e, "knowledge");
  }
}
