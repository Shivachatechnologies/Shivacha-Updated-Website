import { requireAccess } from "@/lib/os/guard";
import { RunsList } from "@/components/admin/automation-runs";
import type { SP } from "@/components/admin/os";

export const metadata = { title: "Automation runs" };

export default async function RunsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAccess("automations:view", "AUTOMATIONS");
  return <RunsList sp={await searchParams} />;
}
