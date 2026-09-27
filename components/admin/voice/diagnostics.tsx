"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { runVoiceDiagnostics, type DiagRow } from "@/lib/voice/mic";
import { voiceReadinessAction } from "@/lib/voice/actions";

const TONE: Record<DiagRow["status"], string> = { PASS: "text-emerald-700", FAIL: "text-red-700", WARN: "text-amber-700", SKIP: "text-dim" };

/**
 * Step-by-step voice check: browser context, site policy, permission, device, audio, recorder, speech, then the voice
 * provider and AI employee on the server. It only runs when the user clicks, and briefly opens the microphone.
 */
export function VoiceDiagnostics({ agent, provider, serverAudio, open = false }: { agent: string; provider: string; serverAudio: boolean; open?: boolean }) {
  const [rows, setRows] = useState<DiagRow[] | null>(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    try {
      setRows(
        await runVoiceDiagnostics({
          serverAudio,
          checkServer: async () => {
            const r = await voiceReadinessAction(agent, provider);
            if ("error" in r) return { provider: { label: "Voice provider", status: "FAIL", value: r.error }, employee: { label: "AI employee", status: "FAIL", value: r.error } };
            return {
              provider: { label: "Voice provider", status: r.provider.ok ? "PASS" : "FAIL", value: r.provider.detail },
              employee: { label: "AI employee", status: r.employee.ok ? (r.aiConnected ? "PASS" : "WARN") : "FAIL", value: r.employee.ok && !r.aiConnected ? `${r.employee.detail}; AI provider not connected` : r.employee.detail },
            };
          },
        }),
      );
    } finally {
      setRunning(false);
    }
  };

  return (
    <details open={open} className="rounded-md border border-line px-3 py-2 text-xs">
      <summary className="cursor-pointer select-none font-medium">Voice diagnostics</summary>
      <div className="mt-2 space-y-2">
        <button type="button" onClick={() => void run()} disabled={running} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-2.5 disabled:opacity-50">
          {running && <Loader2 className="size-3.5 animate-spin" aria-hidden />} {rows ? "Run again" : "Run check"}
        </button>
        <p className="text-dim">This opens the microphone for a moment to test it, then releases it. Nothing is recorded.</p>
        {rows && (
          <table className="w-full">
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="border-t border-line align-top">
                  <td className="py-1 pr-2">{r.label}</td>
                  <td className={cn("py-1 pr-2 font-semibold", TONE[r.status])}>{r.status}</td>
                  <td className="break-all py-1 text-muted">{r.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </details>
  );
}
