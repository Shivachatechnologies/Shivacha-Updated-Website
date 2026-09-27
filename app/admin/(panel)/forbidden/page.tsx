import Link from "next/link";
import { ShieldAlert } from "lucide-react";

export const metadata = { title: "Access denied" };

export default function Forbidden() {
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <ShieldAlert className="mx-auto size-8 text-dim" aria-hidden />
      <h1 className="mt-4 text-xl font-semibold text-fg">You don&apos;t have access to this area</h1>
      <p className="mt-2 text-sm text-muted">Your role does not include this permission. Ask a Super Admin or Admin if you need it.</p>
      <Link href="/admin/dashboard" className="btn-secondary mt-6 h-9 px-3.5 text-[13px]">Back to dashboard</Link>
    </div>
  );
}
