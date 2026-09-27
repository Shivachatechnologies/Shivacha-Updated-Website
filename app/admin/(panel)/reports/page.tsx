import Link from "next/link";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { REPORTS } from "@/lib/reports/definitions";
import { PageHeader } from "@/components/admin/ui";

export const metadata = { title: "Reports" };

export default async function ReportsPage() {
  const user = await requireAccess("reports:view");
  const list = REPORTS.filter((r) => can(user.role, r.permission));
  return (
    <>
      <PageHeader title="Reports" description="Operational reports from live records, exportable to CSV and PDF. Money is reported per currency." crumbs={[{ label: "Reports" }]} />
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {list.map((r) => (
          <li key={r.key}>
            <Link href={`/admin/reports/${r.key}`} className="block h-full rounded-lg border border-line bg-ink-900 p-4 hover:border-line-strong">
              <p className="font-semibold text-fg">{r.title}</p>
              <p className="mt-1 text-xs text-muted">{r.description}</p>
            </Link>
          </li>
        ))}
      </ul>
      {list.length === 0 && <p className="text-sm text-muted">No reports are available for your role.</p>}
    </>
  );
}
