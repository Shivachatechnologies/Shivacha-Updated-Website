import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { hasDatabase } from "@/lib/db/client";
import { LoginForm } from "@/components/admin/AuthForms";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (!hasDatabase()) return <p className="text-sm text-muted">The admin database is not configured (DATABASE_URL).</p>;
  if (await getSessionUser()) redirect("/admin/dashboard");
  const { next } = await searchParams;
  return <LoginForm next={next} />;
}
