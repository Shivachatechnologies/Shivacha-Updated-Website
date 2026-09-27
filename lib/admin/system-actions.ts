"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { authorize, AuthError } from "@/lib/auth/session";
import { assignableRoles, ROLES, type RoleName } from "@/lib/auth/permissions";
import { hashPassword, passwordProblem } from "@/lib/auth/password";
import { audit } from "@/lib/audit";
import { invalidateRedirectCache, normalise } from "@/lib/cms/redirects";
import { refreshPublic } from "./revalidate";
import { SETTING_SCHEMAS, type SettingKey } from "./settings";

export type SysState = { ok?: string; error?: string; fieldErrors?: Record<string, string>; redirect?: string } | undefined;

const fail = (e: unknown, fallback = "Could not save. Please try again."): SysState => {
  if (e instanceof AuthError) return { error: e.message };
  if (e instanceof z.ZodError) return { error: "Please check the highlighted fields.", fieldErrors: Object.fromEntries(e.issues.map((i) => [String(i.path[0]), i.message])) };
  if ((e as { code?: string })?.code === "P2002") return { error: "That value is already in use." };
  console.error("[admin] system action failed", (e as Error).message);
  return { error: fallback };
};

const path = z
  .string()
  .trim()
  .min(1, "Required")
  .max(500)
  .regex(/^\/[^\s?#]*$/, "Must be a site path starting with / (no query string)");
const destination = z
  .string()
  .trim()
  .min(1, "Required")
  .max(2000)
  .regex(/^(\/(?!\/)[^\s]*|https:\/\/[^\s]+)$/, "Use a path starting with / or an https:// URL");
const optStr = (max: number) => z.string().trim().max(max).transform((v) => v || null);
const bool = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

/* ───────── SEO entries ───────── */

const seoSchema = z.object({ path, title: optStr(70), description: optStr(300), canonical: z.string().trim().max(2000).refine((v) => !v || /^https:\/\//.test(v), "Use an https:// URL").transform((v) => v || null), ogImage: z.string().trim().max(2000).refine((v) => !v || /^(https:\/\/|\/(?!\/))/.test(v), "Use https:// or a site path").transform((v) => v || null), noindex: bool });

export async function saveSeoEntryAction(id: string | null, _: SysState, form: FormData): Promise<SysState> {
  try {
    const user = await authorize("seo:manage");
    const data = seoSchema.parse({ ...Object.fromEntries(form), noindex: form.get("noindex") });
    data.path = normalise(data.path);
    const row = id ? await db.seoEntry.update({ where: { id }, data }) : await db.seoEntry.create({ data });
    await audit({ userId: user.id, action: id ? "seo.updated" : "seo.created", entity: "seoEntry", entityId: row.id, metadata: { path: row.path, noindex: row.noindex } });
    refreshPublic(["cms:seo"], [row.path, "/sitemap.xml"]);
    revalidatePath("/admin/seo");
    return { ok: "SEO override saved.", ...(!id && { redirect: "/admin/seo?toast=SEO+override+saved." }) };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteSeoEntryAction(id: string) {
  const user = await authorize("seo:manage");
  const row = await db.seoEntry.delete({ where: { id } }).catch(() => null);
  if (row) {
    await audit({ userId: user.id, action: "seo.deleted", entity: "seoEntry", entityId: id, metadata: { path: row.path } });
    refreshPublic(["cms:seo"], [row.path, "/sitemap.xml"]);
  }
  redirect("/admin/seo?toast=Override+removed.");
}

/* ───────── settings (non-secret) ───────── */

export async function saveSettingAction(key: SettingKey, _: SysState, form: FormData): Promise<SysState> {
  try {
    const schema = SETTING_SCHEMAS[key];
    if (!schema) return { error: "Unknown setting." };
    const user = await authorize(key === "seo" ? "seo:manage" : "settings:manage");
    const raw: Record<string, unknown> = Object.fromEntries(form);
    for (const k of Object.keys(schema.shape)) if (!(k in raw)) raw[k] = undefined;
    const value = schema.parse(raw);
    await db.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
    await audit({ userId: user.id, action: `settings.${key}_updated`, entity: "setting", entityId: key, metadata: value });
    refreshPublic(["cms:settings", "cms:seo"], ["/", "/robots.txt", "/sitemap.xml"]);
    revalidatePath("/", "layout");
    return { ok: "Settings saved." };
  } catch (e) {
    return fail(e);
  }
}

/* ───────── redirects ───────── */

const redirectSchema = z.object({ source: path, destination, statusCode: z.coerce.number().refine((n) => [301, 302, 307, 308].includes(n), "Choose a status code"), active: bool });

export async function saveRedirectAction(id: string | null, _: SysState, form: FormData): Promise<SysState> {
  try {
    const user = await authorize("redirects:manage");
    const data = redirectSchema.parse({ ...Object.fromEntries(form), active: form.get("active") });
    data.source = normalise(data.source);
    if (data.source.startsWith("/admin") || data.source.startsWith("/api") || data.source.startsWith("/_next")) return { error: "Admin, API and system paths cannot be redirected.", fieldErrors: { source: "Not allowed" } };
    if (normalise(data.destination) === data.source) return { error: "A redirect cannot point to itself.", fieldErrors: { destination: "Same as source" } };
    const loop = data.destination.startsWith("/") ? await db.redirect.findFirst({ where: { source: normalise(data.destination), destination: data.source, active: true } }) : null;
    if (loop) return { error: "That would create a redirect loop.", fieldErrors: { destination: "Creates a loop" } };
    const row = id ? await db.redirect.update({ where: { id }, data }) : await db.redirect.create({ data });
    await audit({ userId: user.id, action: id ? "redirect.updated" : "redirect.created", entity: "redirect", entityId: row.id, metadata: data });
    invalidateRedirectCache();
    revalidatePath("/admin/redirects");
    return { ok: "Redirect saved. It takes effect within a minute.", ...(!id && { redirect: "/admin/redirects?toast=Redirect+saved." }) };
  } catch (e) {
    if ((e as { code?: string })?.code === "P2002") return { error: "A redirect for that source already exists.", fieldErrors: { source: "Already exists" } };
    return fail(e);
  }
}

export async function deleteRedirectAction(id: string) {
  const user = await authorize("redirects:manage");
  const row = await db.redirect.delete({ where: { id } }).catch(() => null);
  if (row) await audit({ userId: user.id, action: "redirect.deleted", entity: "redirect", entityId: id, metadata: { source: row.source } });
  invalidateRedirectCache();
  redirect("/admin/redirects?toast=Redirect+deleted.");
}

/* ───────── navigation ───────── */

const navSchema = z.object({ menu: z.enum(["HEADER", "FOOTER", "CTA"]), label: z.string().trim().min(1, "Required").max(80), url: destination.or(z.literal("#")), parentId: optStr(40), order: z.coerce.number().int().min(0).max(1000), active: bool });

export async function saveNavItemAction(id: string | null, _: SysState, form: FormData): Promise<SysState> {
  try {
    const user = await authorize("navigation:manage");
    const data = navSchema.parse({ ...Object.fromEntries(form), active: form.get("active") });
    if (data.parentId) {
      const parent = await db.navigationItem.findUnique({ where: { id: data.parentId } });
      if (!parent || parent.parentId || parent.menu !== data.menu || parent.id === id) return { error: "Choose a top-level item from the same menu as parent.", fieldErrors: { parentId: "Invalid parent" } };
    }
    const row = id ? await db.navigationItem.update({ where: { id }, data }) : await db.navigationItem.create({ data });
    await audit({ userId: user.id, action: id ? "navigation.updated" : "navigation.created", entity: "navigationItem", entityId: row.id, metadata: { label: row.label, menu: row.menu } });
    refreshPublic(["cms:navigation"], ["/"]);
    revalidatePath("/", "layout");
    return { ok: "Menu item saved.", ...(!id && { redirect: `/admin/navigation?menu=${data.menu}&toast=Menu+item+added.` }) };
  } catch (e) {
    return fail(e);
  }
}

export async function moveNavItemAction(id: string, dir: -1 | 1) {
  const user = await authorize("navigation:manage");
  const item = await db.navigationItem.findUnique({ where: { id } });
  if (!item) return;
  const siblings = await db.navigationItem.findMany({ where: { menu: item.menu, parentId: item.parentId }, orderBy: [{ order: "asc" }, { createdAt: "asc" }] });
  const i = siblings.findIndex((s) => s.id === id);
  const j = i + dir;
  if (j < 0 || j >= siblings.length) return;
  [siblings[i], siblings[j]] = [siblings[j], siblings[i]];
  await db.$transaction(siblings.map((s, k) => db.navigationItem.update({ where: { id: s.id }, data: { order: k } })));
  await audit({ userId: user.id, action: "navigation.reordered", entity: "navigationItem", entityId: id });
  refreshPublic(["cms:navigation"], ["/"]);
  revalidatePath("/", "layout");
  revalidatePath("/admin/navigation");
}

export async function deleteNavItemAction(id: string) {
  const user = await authorize("navigation:manage");
  const row = await db.navigationItem.delete({ where: { id } }).catch(() => null);
  if (row) await audit({ userId: user.id, action: "navigation.deleted", entity: "navigationItem", entityId: id, metadata: { label: row.label } });
  refreshPublic(["cms:navigation"], ["/"]);
  revalidatePath("/", "layout");
  redirect(`/admin/navigation?menu=${row?.menu ?? "FOOTER"}&toast=Menu+item+deleted.`);
}

/* ───────── users ───────── */

const userSchema = z.object({ name: z.string().trim().min(1, "Required").max(120), email: z.string().trim().toLowerCase().email("Invalid email").max(160), role: z.enum(ROLES), active: bool });

async function activeSuperAdmins(excludeId?: string) {
  return db.user.count({ where: { role: "SUPER_ADMIN", active: true, ...(excludeId && { id: { not: excludeId } }) } });
}

export async function saveUserAction(id: string | null, _: SysState, form: FormData): Promise<SysState> {
  try {
    const actor = await authorize("users:manage");
    const data = userSchema.parse({ ...Object.fromEntries(form), active: id ? form.get("active") : "on" });
    const allowed = assignableRoles(actor.role);
    const target = id ? await db.user.findUnique({ where: { id } }) : null;
    if (id && !target) return { error: "User not found." };
    // Only a Super Admin may create, edit or grant Super Admin accounts (no role escalation).
    if (!allowed.includes(data.role as RoleName) || (target?.role === "SUPER_ADMIN" && actor.role !== "SUPER_ADMIN")) return { error: "You cannot assign that role.", fieldErrors: { role: "Not allowed" } };
    if (target?.role === "SUPER_ADMIN" && (data.role !== "SUPER_ADMIN" || !data.active) && (await activeSuperAdmins(id!)) === 0) return { error: "You cannot demote or disable the last active Super Admin." };
    if (target && target.id === actor.id && !data.active) return { error: "You cannot disable your own account." };

    if (id) {
      await db.user.update({ where: { id }, data });
      if (!data.active) await db.session.deleteMany({ where: { userId: id } });
      await audit({ userId: actor.id, action: target!.role !== data.role ? "user.role_changed" : data.active !== target!.active ? (data.active ? "user.enabled" : "user.disabled") : "user.updated", entity: "user", entityId: id, metadata: { email: data.email, role: data.role, active: data.active } });
      revalidatePath("/admin/users");
      return { ok: "User saved." };
    }
    const password = String(form.get("password") ?? "");
    const problem = passwordProblem(password, data.email);
    if (problem) return { error: problem, fieldErrors: { password: problem } };
    const created = await db.user.create({ data: { ...data, passwordHash: await hashPassword(password) } });
    await audit({ userId: actor.id, action: "user.created", entity: "user", entityId: created.id, metadata: { email: created.email, role: created.role } });
    revalidatePath("/admin/users");
    return { ok: "User created.", redirect: `/admin/users?toast=${encodeURIComponent(`${created.name} can now sign in.`)}` };
  } catch (e) {
    if ((e as { code?: string })?.code === "P2002") return { error: "A user with that email already exists.", fieldErrors: { email: "Already registered" } };
    return fail(e);
  }
}

export async function setUserPasswordAction(id: string, _: SysState, form: FormData): Promise<SysState> {
  try {
    const actor = await authorize("users:manage");
    const target = await db.user.findUnique({ where: { id } });
    if (!target) return { error: "User not found." };
    if (target.role === "SUPER_ADMIN" && actor.role !== "SUPER_ADMIN") return { error: "Only a Super Admin can change a Super Admin's password." };
    const password = String(form.get("password") ?? "");
    const problem = passwordProblem(password, target.email);
    if (problem) return { error: problem, fieldErrors: { password: problem } };
    await db.$transaction([db.user.update({ where: { id }, data: { passwordHash: await hashPassword(password), passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null } }), db.session.deleteMany({ where: { userId: id } })]);
    await audit({ userId: actor.id, action: "user.password_reset_by_admin", entity: "user", entityId: id, metadata: { email: target.email } });
    return { ok: "Password updated. Existing sessions were signed out." };
  } catch (e) {
    return fail(e);
  }
}

export async function revokeSessionsAction(id: string) {
  const actor = await authorize("users:manage");
  const target = await db.user.findUnique({ where: { id }, select: { role: true, email: true } });
  if (target && !(target.role === "SUPER_ADMIN" && actor.role !== "SUPER_ADMIN")) {
    await db.session.deleteMany({ where: { userId: id } });
    await audit({ userId: actor.id, action: "user.sessions_revoked", entity: "user", entityId: id, metadata: { email: target.email } });
  }
  redirect(`/admin/users/${id}?toast=${encodeURIComponent("Sessions signed out.")}`);
}

export async function unlockUserAction(id: string) {
  const actor = await authorize("users:manage");
  await db.user.update({ where: { id }, data: { failedLoginCount: 0, lockedUntil: null } });
  await audit({ userId: actor.id, action: "user.unlocked", entity: "user", entityId: id });
  redirect(`/admin/users/${id}?toast=Account+unlocked.`);
}

/** Copies the built-in footer columns into the CMS so they can be edited (only when the CMS footer is empty). */
export async function importFooterNavAction() {
  const user = await authorize("navigation:manage");
  const { footerNav } = await import("@/data/navigation");
  if ((await db.navigationItem.count({ where: { menu: "FOOTER" } })) === 0) {
    for (const [i, col] of footerNav.entries()) {
      await db.navigationItem.create({ data: { menu: "FOOTER", label: col.title, url: "#", order: i, children: { create: col.links.map((l, j) => ({ menu: "FOOTER" as const, label: l.label, url: l.href, order: j })) } } });
    }
    await audit({ userId: user.id, action: "navigation.imported", entity: "navigationItem", metadata: { columns: footerNav.length } });
    refreshPublic(["cms:navigation"], ["/"]);
    revalidatePath("/", "layout");
  }
  redirect("/admin/navigation?toast=Footer+imported.");
}
