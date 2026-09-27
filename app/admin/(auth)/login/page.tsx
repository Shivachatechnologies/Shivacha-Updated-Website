import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { databaseEnvDiagnostics, hasDatabase } from "@/lib/db/client";
import { LoginForm } from "@/components/admin/AuthForms";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (!hasDatabase()) return <DatabaseMissing />;
  if (await getSessionUser()) redirect("/admin/dashboard");
  const { next } = await searchParams;
  return <LoginForm next={next} />;
}

/** Shown when this server process has no DATABASE_URL. Reports booleans and the deployment environment only. */
function DatabaseMissing() {
  const d = databaseEnvDiagnostics();
  console.error("[admin] DATABASE_URL is not available to this server process", d);
  return (
    <div className="space-y-2 text-sm text-muted">
      <p>The admin database is not configured (DATABASE_URL).</p>
      <ul className="list-disc space-y-0.5 pl-5 text-xs">
        <li>DATABASE_URL present at runtime: {String(d.databaseUrlPresent)}{d.databaseUrlDefinedButEmpty ? " (defined but empty)" : ""}</li>
        <li>Deployment environment: {d.vercelEnv ?? "not on Vercel"}{d.gitBranch ? ` · branch ${d.gitBranch}` : ""}{d.commit ? ` · ${d.commit}` : ""}</li>
        {d.otherDatabaseVarsPresent.length > 0 && <li>Other database variables present: {d.otherDatabaseVarsPresent.join(", ")}</li>}
      </ul>
      {d.vercelEnv && d.vercelEnv !== "production" && <p className="text-xs">This is a {d.vercelEnv} deployment. Variables scoped only to Production are not available here — enable DATABASE_URL for this environment in Vercel and redeploy.</p>}
    </div>
  );
}
