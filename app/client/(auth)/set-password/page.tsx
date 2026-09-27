import { PortalSetPasswordForm } from "@/components/portal-forms";

export const metadata = { title: "Set password" };
export const dynamic = "force-dynamic";

export default async function SetPassword({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token) return <p className="text-sm text-muted">This link is incomplete. Open the full link from your email.</p>;
  return <PortalSetPasswordForm token={token} />;
}
