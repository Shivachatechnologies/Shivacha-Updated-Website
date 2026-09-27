import Link from "next/link";
import { Badge } from "@/components/admin/ui";

export function IntentBadge({ label, score }: { label: string; score: number }) {
  const tone = label === "HIGH" ? "red" : label === "MEDIUM" ? "amber" : "gray";
  return <Badge tone={tone}>{label.toLowerCase()} · {score}</Badge>;
}

export function CompanyCell({ company }: { company: { name: string; domain: string | null } | null }) {
  return company ? (
    <span>
      {company.name}
      {company.domain && <span className="block text-xs text-dim">{company.domain}</span>}
    </span>
  ) : (
    <span className="text-dim">Company not identified</span>
  );
}

export function TrackingOff({ canManage }: { canManage: boolean }) {
  return (
    <p className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
      Visitor tracking is turned off, so no new website activity is being recorded.{" "}
      {canManage ? <Link href="/admin/settings/visitor-tracking" className="font-medium text-brand-blue">Review privacy settings and turn it on</Link> : "An administrator can turn it on in Visitor Tracking settings."}
    </p>
  );
}

export const place = (v: { city: string | null; region?: string | null; country: string | null }) => [v.city, v.country].filter(Boolean).join(", ") || "Unknown";
