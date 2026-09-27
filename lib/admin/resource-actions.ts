"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { authorize, AuthError } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { hireRoles } from "@/data/hire";
import { refreshPublic } from "./revalidate";
import { RESOURCES, SLUG_RE, fromFormValue, isResourceKey, slugify, type Resource } from "./resources";

export type ResourceState = { ok?: string; error?: string; fieldErrors?: Record<string, string>; redirect?: string } | undefined;

/** Top-level paths already used by the site; CMS pages cannot take them. */
const RESERVED = new Set(["admin", "api", "accessibility", "book-a-meeting", "capabilities", "careers", "company", "contact", "cookie-policy", "dedicated-teams", "disclaimer", "glossary", "hire-developers", "industries", "insights", "lp", "markets", "privacy-policy", "products", "project-estimator", "request-demo", "resources", "security", "services", "solutions", "start-a-project", "technologies", "terms", "white-label-development", "work", "robots.txt", "sitemap.xml", "llms.txt", "search-index.json", "uploads", ...hireRoles.map((r) => r.slug)]);

// Prisma delegates share the same method shapes; this keeps the generic code readable.
type Delegate = {
  findUnique: (a: object) => Promise<Record<string, unknown> | null>;
  create: (a: object) => Promise<Record<string, unknown>>;
  update: (a: object) => Promise<Record<string, unknown>>;
  delete: (a: object) => Promise<Record<string, unknown>>;
  findFirst: (a: object) => Promise<Record<string, unknown> | null>;
};
const delegate = (r: Resource) => (db as unknown as Record<string, Delegate>)[r.model];

function resource(key: string) {
  if (!isResourceKey(key)) throw new Error("Unknown resource");
  return RESOURCES[key];
}

function refresh(r: Resource, slug?: string | null, oldSlug?: string | null) {
  const paths = ["/sitemap.xml"];
  if (r.listPath) paths.push(r.listPath);
  if (r.publicPath) for (const s of [slug, oldSlug]) if (s) paths.push(r.publicPath(s));
  refreshPublic([...r.tags, "cms:seo"], paths);
  revalidatePath(`/admin/${r.key}`);
}

function parse(r: Resource, form: FormData) {
  const data: Record<string, unknown> = {};
  const fieldErrors: Record<string, string> = {};
  for (const f of r.fields) {
    const [v, err] = fromFormValue(f, String(form.get(f.name) ?? ""));
    if (err) fieldErrors[f.name] = err;
    else data[f.name] = v;
  }
  if (r.slug) {
    const slug = String(data.slug ?? "") || slugify(String(data[r.titleField] ?? ""));
    if (!slug || !SLUG_RE.test(slug)) fieldErrors.slug = "Use lowercase letters, numbers and single hyphens";
    else if (r.key === "pages" && RESERVED.has(slug)) fieldErrors.slug = "This URL is already used by the website";
    data.slug = slug;
  }
  if (r.status && !data.status) data.status = "DRAFT";
  if (data.status === "PUBLISHED" && !data.publishedAt && "publishedAt" in data) data.publishedAt = new Date();
  if (r.key === "blog" && !data.readingTime && typeof data.content === "string") data.readingTime = Math.max(1, Math.round(data.content.split(/\s+/).length / 220));
  if (r.key === "blog" && !data.tags) data.tags = [];
  return { data, fieldErrors };
}

const isUniqueError = (e: unknown) => (e as { code?: string })?.code === "P2002";

export async function saveResourceAction(key: string, id: string | null, _: ResourceState, form: FormData): Promise<ResourceState> {
  try {
    const r = resource(key);
    const user = await authorize(r.permission);
    const { data, fieldErrors } = parse(r, form);
    if (Object.keys(fieldErrors).length) return { error: "Please check the highlighted fields.", fieldErrors };
    const model = delegate(r);
    if (id) {
      const before = await model.findUnique({ where: { id } });
      if (!before) return { error: "This item no longer exists." };
      await model.update({ where: { id }, data });
      await audit({ userId: user.id, action: before.status !== data.status && data.status ? `${r.model}.status_${String(data.status).toLowerCase()}` : `${r.model}.updated`, entity: r.model, entityId: id, metadata: { title: data[r.titleField], slug: data.slug } });
      refresh(r, data.slug as string, before.slug as string);
      return { ok: `${r.singular} saved.` };
    }
    const created = await model.create({ data });
    await audit({ userId: user.id, action: `${r.model}.created`, entity: r.model, entityId: String(created.id), metadata: { title: data[r.titleField], slug: data.slug } });
    refresh(r, data.slug as string);
    return { ok: `${r.singular} created.`, redirect: `/admin/${r.key}/${created.id}?toast=${encodeURIComponent(`${r.singular} created.`)}` };
  } catch (e) {
    if (isUniqueError(e)) return { error: "That slug is already in use.", fieldErrors: { slug: "Already in use — choose another" } };
    if (e instanceof AuthError) return { error: e.message };
    console.error("[admin] save failed", (e as Error).message);
    return { error: "Could not save. Please try again." };
  }
}

export async function setResourceStatusAction(key: string, id: string, status: "DRAFT" | "PUBLISHED" | "ARCHIVED") {
  const r = resource(key);
  const user = await authorize(r.permission);
  const model = delegate(r);
  const before = await model.findUnique({ where: { id } });
  if (!before) redirect(`/admin/${r.key}?toast=Not+found&toastKind=error`);
  await model.update({ where: { id }, data: { status, ...(status === "PUBLISHED" && "publishedAt" in before && !before.publishedAt && { publishedAt: new Date() }) } });
  await audit({ userId: user.id, action: `${r.model}.status_${status.toLowerCase()}`, entity: r.model, entityId: id, metadata: { title: before[r.titleField] } });
  refresh(r, before.slug as string);
  redirect(`/admin/${r.key}/${id}?toast=${encodeURIComponent(status === "PUBLISHED" ? "Published." : status === "DRAFT" ? "Moved to draft." : "Archived.")}`);
}

export async function deleteResourceAction(key: string, id: string) {
  const r = resource(key);
  const user = await authorize(r.permission);
  const model = delegate(r);
  const before = await model.findUnique({ where: { id } });
  if (before) {
    await model.delete({ where: { id } });
    await audit({ userId: user.id, action: `${r.model}.deleted`, entity: r.model, entityId: id, metadata: { title: before[r.titleField], slug: before.slug } });
    refresh(r, before.slug as string);
  }
  redirect(`/admin/${r.key}?toast=${encodeURIComponent(`${r.singular} deleted.`)}`);
}

export async function duplicateResourceAction(key: string, id: string) {
  const r = resource(key);
  const user = await authorize(r.permission);
  const model = delegate(r);
  const src = await model.findUnique({ where: { id } });
  if (!src) redirect(`/admin/${r.key}?toast=Not+found&toastKind=error`);
  const data: Record<string, unknown> = { ...src, [r.titleField]: `${src[r.titleField]} (copy)` };
  for (const k of ["id", "createdAt", "updatedAt"]) delete data[k];
  if (r.status) Object.assign(data, { status: "DRAFT", ...("publishedAt" in src && { publishedAt: null }) });
  if (r.slug) {
    let n = 1;
    let slug = `${src.slug}-copy`;
    while (await model.findFirst({ where: { slug }, select: { id: true } })) slug = `${src.slug}-copy-${++n}`;
    data.slug = slug;
  }
  for (const [k, v] of Object.entries(data)) if (v === null && k !== "publishedAt") delete data[k];
  let copy: Record<string, unknown>;
  if (r.key === "pages") {
    const sections = await db.pageSection.findMany({ where: { pageId: id }, orderBy: { order: "asc" } });
    copy = await model.create({ data: { ...data, sections: { create: sections.map((s) => ({ type: s.type, data: s.data ?? {}, order: s.order, hidden: s.hidden })) } } });
  } else copy = await model.create({ data });
  await audit({ userId: user.id, action: `${r.model}.duplicated`, entity: r.model, entityId: String(copy.id), metadata: { from: id } });
  revalidatePath(`/admin/${r.key}`);
  redirect(`/admin/${r.key}/${copy.id}?toast=${encodeURIComponent("Duplicated as a draft.")}`);
}
