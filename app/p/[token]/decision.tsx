"use client";

import { useActionState, useState } from "react";

type S = { ok?: string; error?: string } | undefined;

export function PublicDecision({ accept, decline }: { accept: (s: S, f: FormData) => Promise<S>; decline: (s: S, f: FormData) => Promise<S> }) {
  const [a, runA, pa] = useActionState(accept, undefined);
  const [d, runD, pd] = useActionState(decline, undefined);
  const [mode, setMode] = useState<"accept" | "decline">("accept");
  const done = a?.ok || d?.ok;
  if (done) return <p role="status" className="rounded-md bg-emerald-50 p-4 text-sm text-emerald-800">{done}</p>;
  const input = "mt-1 h-10 w-full rounded-md border border-[#cfd6e1] px-3 text-sm focus:border-[#2a5ce8] focus:outline-none";
  return (
    <div>
      <div className="mb-4 flex gap-2 text-sm">
        <button type="button" onClick={() => setMode("accept")} className={`rounded-md px-3 py-1.5 ${mode === "accept" ? "bg-[#0b1424] text-white" : "border border-[#cfd6e1]"}`}>Accept</button>
        <button type="button" onClick={() => setMode("decline")} className={`rounded-md px-3 py-1.5 ${mode === "decline" ? "bg-[#0b1424] text-white" : "border border-[#cfd6e1]"}`}>Decline</button>
      </div>
      {mode === "accept" ? (
        <form action={runA} className="space-y-3">
          <label className="block text-sm font-medium">Full name<input name="name" required maxLength={200} autoComplete="name" className={input} /></label>
          <label className="block text-sm font-medium">Title / role (optional)<input name="title" maxLength={120} className={input} /></label>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="confirm" required className="mt-1" /> I confirm I am authorised to accept this proposal on behalf of my organisation.</label>
          {a?.error && <p role="alert" className="text-sm text-red-700">{a.error}</p>}
          <button type="submit" disabled={pa} className="h-10 rounded-md bg-[#2a5ce8] px-4 text-sm font-semibold text-white disabled:opacity-60">{pa ? "Submitting…" : "Accept proposal"}</button>
        </form>
      ) : (
        <form action={runD} className="space-y-3">
          <label className="block text-sm font-medium">Anything we should know? (optional)<textarea name="reason" rows={3} maxLength={1000} className={`${input} h-auto py-2`} /></label>
          {d?.error && <p role="alert" className="text-sm text-red-700">{d.error}</p>}
          <button type="submit" disabled={pd} className="h-10 rounded-md border border-[#cfd6e1] px-4 text-sm font-semibold disabled:opacity-60">{pd ? "Submitting…" : "Decline proposal"}</button>
        </form>
      )}
    </div>
  );
}
