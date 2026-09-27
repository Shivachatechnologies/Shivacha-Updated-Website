import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { WorkforceStatusBanner } from "@/components/admin/ai/emergency-banner";

export default async function AILayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <>
      {can(user.role, "ai:view") && <WorkforceStatusBanner canConfigure={can(user.role, "ai:configure")} />}
      {children}
    </>
  );
}
