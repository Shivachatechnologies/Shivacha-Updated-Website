"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorize } from "@/lib/auth/session";
import type { Permission } from "@/lib/auth/permissions";
import { fail, type ActionState } from "./action";
import { logActivity } from "./activity";

export type NoteTarget = { kind: "deal" | "client" | "project" | "proposal" | "quote" | "contract" | "invoice"; id: string };

const PERM: Record<NoteTarget["kind"], Permission> = { deal: "deals:manage", client: "clients:manage", project: "projects:manage", proposal: "proposals:manage", quote: "proposals:manage", contract: "contracts:manage", invoice: "finance:manage" };
const PATHS: Record<NoteTarget["kind"], string> = { deal: "deals", client: "clients", project: "projects", proposal: "proposals", quote: "quotes", contract: "contracts", invoice: "finance/invoices" };

/** Internal note on any business record (stored in the unified timeline). */
export async function addNoteAction(target: NoteTarget, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorize(PERM[target.kind]);
    const body = z.string().trim().min(1, "Write a note").max(5000).parse(form.get("body"));
    await logActivity({ type: "NOTE", summary: body, actorId: user.id, [`${target.kind}Id`]: target.id });
    revalidatePath(`/admin/${PATHS[target.kind]}/${target.id}`);
    return { ok: "Note added." };
  } catch (e) {
    return fail(e, "notes");
  }
}
