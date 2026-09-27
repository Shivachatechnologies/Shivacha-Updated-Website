import { redirect } from "next/navigation";
import { getPortalUser } from "@/lib/portal/session";
import { hasDatabase } from "@/lib/db/client";
import { PortalLoginForm } from "@/components/portal-forms";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function PortalLogin() {
  if (!hasDatabase()) return <p className="text-sm text-muted">The client portal is not available right now.</p>;
  if (await getPortalUser()) redirect("/client/dashboard");
  return <PortalLoginForm />;
}
