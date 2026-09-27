import { ResetForm } from "@/components/admin/AuthForms";

export const metadata = { title: "Choose a new password" };
export const dynamic = "force-dynamic";

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <ResetForm token={token ?? ""} />;
}
