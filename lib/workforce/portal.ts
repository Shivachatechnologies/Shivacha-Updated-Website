import "server-only";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { myEmployee } from "@/lib/workforce/access";

/** Employee portal pages: signed in, allowed self-service, and (optionally) linked to an employee record. */
export async function requireSelf() {
  const user = await requireUser();
  if (!can(user.role, "selfservice:use")) redirect("/admin/forbidden?need=selfservice%3Ause");
  const me = await myEmployee(user.id);
  return { user, me };
}
