"use client";

import { useTransition } from "react";
import { cn } from "@/lib/cn";
import { useToast } from "@/components/admin/client";
import { setRolePermissionAction } from "@/lib/workforce/permission-actions";

/** One matrix cell: cycles default → grant/revoke. Server re-validates every change. */
export function PermissionCell({ role, permission, value, isDefault, locked }: { role: string; permission: string; value: boolean; isDefault: boolean; locked: boolean }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const set = (v: "default" | "grant" | "revoke") =>
    start(async () => {
      const r = await setRolePermissionAction(role, permission, v);
      toast(r?.error ? "error" : "ok", r?.error ?? "Permission updated.");
    });
  if (locked) return <span title="Always granted" className="text-emerald-700">✓</span>;
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => set(isDefault ? (value ? "revoke" : "grant") : "default")}
      aria-label={`${permission} for ${role}: ${value ? "granted" : "not granted"}${isDefault ? "" : " (override)"}`}
      title={isDefault ? "Default — click to override" : "Override — click to restore default"}
      className={cn("inline-flex size-6 items-center justify-center rounded text-xs", value ? "bg-emerald-500/15 text-emerald-700" : "bg-ink-800 text-dim", !isDefault && "ring-2 ring-indigo-500/60", pending && "opacity-50")}
    >
      {value ? "✓" : "·"}
    </button>
  );
}
