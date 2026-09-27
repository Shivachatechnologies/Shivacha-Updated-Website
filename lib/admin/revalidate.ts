import "server-only";
import { revalidatePath, revalidateTag } from "next/cache";

/** Immediately invalidates cached CMS data and the affected public pages after an admin change. */
export function refreshPublic(tags: string[], paths: string[] = []) {
  for (const t of tags) revalidateTag(t, { expire: 0 });
  for (const p of paths) revalidatePath(p);
}
