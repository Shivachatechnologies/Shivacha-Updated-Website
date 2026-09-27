"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AudioLines, X } from "lucide-react";
import { AGENT_FOR_ENTITY, entityFromPath as contextFrom } from "@/lib/voice/paths";
import { VoiceConsole, type VoiceAgent, type VoiceProfileLite } from "./console";

/** Global "Talk to AI Employee" button. On a lead, deal, project, invoice, ticket or client page the call starts with that record as context. */
export function TalkButton({ agents, providers, profiles }: { agents: VoiceAgent[]; providers: { id: string; label: string; serverAudio: boolean }[]; profiles: Record<string, VoiceProfileLite> }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  // The record in view when the call opened stays the context for that call, even if the page changes.
  const [pinned, setPinned] = useState<ReturnType<typeof contextFrom>>(null);
  const ctx = open ? pinned : contextFrom(path);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  if (!agents.length || path.startsWith("/admin/ai/voice")) return null;
  const preferred = ctx ? AGENT_FOR_ENTITY[ctx.entity] : undefined;
  return (
    <>
      {!open && (
        <button type="button" onClick={() => {
            setPinned(contextFrom(path));
            setOpen(true);
          }} className="fixed bottom-5 right-5 z-40 inline-flex h-12 items-center gap-2 rounded-full bg-brand-blue px-4 text-sm font-semibold text-white shadow-lg hover:bg-brand-blue/90">
          <AudioLines className="size-5" aria-hidden /> Talk to AI Employee
        </button>
      )}
      {open && (
        <div role="dialog" aria-modal="true" aria-label="Talk to an AI employee" className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-line bg-ink-950 p-4 shadow-2xl">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">Talk to an AI employee</h2>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded-md p-1 hover:bg-ink-850"><X className="size-5" aria-hidden /></button>
          </div>
          <div className="min-h-0 flex-1">
            <VoiceConsole compact agents={agents} initialAgent={preferred && agents.some((a) => a.slug === preferred) ? preferred : undefined} context={ctx} contextLabel={ctx ? `this ${ctx.entity.toLowerCase()}` : undefined} providers={providers} profiles={profiles} />
          </div>
        </div>
      )}
    </>
  );
}
