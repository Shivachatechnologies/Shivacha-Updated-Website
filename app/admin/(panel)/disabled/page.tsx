import Link from "next/link";
import { PowerOff } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { FEATURE_FLAGS, type FeatureFlag } from "@/lib/os/flags";

export const metadata = { title: "Module switched off" };

export default async function Disabled({ searchParams }: { searchParams: Promise<{ feature?: string }> }) {
  const user = await requireUser();
  const { feature } = await searchParams;
  const name = feature && feature in FEATURE_FLAGS ? FEATURE_FLAGS[feature as FeatureFlag] : "This module";
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <PowerOff className="mx-auto size-8 text-dim" aria-hidden />
      <h1 className="mt-4 text-xl font-semibold text-fg">{name} is switched off</h1>
      <p className="mt-2 text-sm text-muted">A feature flag has disabled this module for everyone. Data is kept and nothing is deleted.</p>
      <div className="mt-6 flex justify-center gap-2">
        <Link href="/admin/dashboard" className="btn-secondary h-9 px-3.5 text-[13px]">Back to dashboard</Link>
        {can(user.role, "settings:manage") && <Link href="/admin/settings/features" className="btn-primary h-9 px-3.5 text-[13px]">Feature flags</Link>}
      </div>
    </div>
  );
}
