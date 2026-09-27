"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { authorize } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { FLAG_KEYS, getFlags } from "./flags";
import { fail, type ActionState } from "./action";
import { NOTIFICATION_TYPES } from "./notify";

export async function saveFeatureFlagsAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorize("settings:manage");
    const before = await getFlags();
    const value = Object.fromEntries(FLAG_KEYS.map((k) => [k, form.get(k) === "on"]));
    await db.setting.upsert({ where: { key: "features" }, create: { key: "features", value }, update: { value } });
    const changed = FLAG_KEYS.filter((k) => before[k] !== value[k]);
    await audit({ userId: user.id, action: "settings.features", entity: "Setting", entityId: "features", metadata: { changed: Object.fromEntries(changed.map((k) => [k, value[k]])) } });
    revalidatePath("/admin", "layout");
    return { ok: changed.length ? `Saved — ${changed.length} flag${changed.length === 1 ? "" : "s"} changed.` : "No changes." };
  } catch (e) {
    return fail(e);
  }
}

export async function markNotificationsReadAction(ids?: string[]) {
  const user = await authorize();
  const where = { userId: user.id, readAt: null, ...(ids?.length ? { id: { in: ids.slice(0, 200) } } : {}) };
  await db.notification.updateMany({ where, data: { readAt: new Date() } });
  revalidatePath("/admin", "layout");
}

export async function openNotificationAction(id: string) {
  const user = await authorize();
  const n = await db.notification.findFirst({ where: { id, userId: user.id } });
  if (!n) return null;
  if (!n.readAt) await db.notification.update({ where: { id }, data: { readAt: new Date() } });
  return n.href && n.href.startsWith("/admin") ? n.href : "/admin/notifications";
}

const prefSchema = z.object({ type: z.enum(Object.keys(NOTIFICATION_TYPES) as [keyof typeof NOTIFICATION_TYPES]), inApp: z.boolean(), email: z.boolean() });

export async function saveNotificationPrefsAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorize();
    const rows = Object.keys(NOTIFICATION_TYPES).map((type) => prefSchema.parse({ type, inApp: form.get(`${type}:inApp`) === "on", email: form.get(`${type}:email`) === "on" }));
    await db.$transaction(rows.map((r) => db.notificationPreference.upsert({ where: { userId_type: { userId: user.id, type: r.type } }, create: { userId: user.id, ...r }, update: { inApp: r.inApp, email: r.email } })));
    return { ok: "Notification preferences saved." };
  } catch (e) {
    return fail(e);
  }
}
