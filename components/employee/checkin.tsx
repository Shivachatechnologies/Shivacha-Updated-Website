"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Coffee, LogIn, LogOut, MapPin, MapPinOff, Play } from "lucide-react";
import { cn } from "@/lib/cn";
import { locationPingAction, punchAction, type PunchState } from "@/lib/workforce/attendance-actions";

type Action = "CHECK_IN" | "BREAK_START" | "BREAK_END" | "CHECK_OUT";

interface Props {
  status: string;
  askLocation: boolean;
  purpose: string;
  hybrid: boolean;
  periodic: { enabled: boolean; minutes: number };
}

type Coords = { latitude: number; longitude: number; accuracy: number | null };

function locate(): Promise<{ coords: Coords | null; denied: boolean; error?: string }> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve({ coords: null, denied: false, error: "This browser cannot share location." });
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ coords: { latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: Number.isFinite(p.coords.accuracy) ? p.coords.accuracy : null }, denied: false }),
      (e) => resolve({ coords: null, denied: e.code === e.PERMISSION_DENIED, error: e.code === e.PERMISSION_DENIED ? "Location permission was denied." : "Location unavailable." }),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  });
}

/** Check-in / break / check-out. Location is requested only when policy requires it, after telling the employee why. */
export function CheckInPanel({ status, askLocation, purpose, hybrid, periodic }: Props) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<PunchState | null>(null);
  const [mode, setMode] = useState<"OFFICE" | "REMOTE">("OFFICE");
  const [locStep, setLocStep] = useState<string | null>(null);
  const checkedIn = status === "WORKING" || status === "ON_BREAK" || status === "AWAY";

  const run = (action: Action) =>
    start(async () => {
      setResult(null);
      let loc: Awaited<ReturnType<typeof locate>> = { coords: null, denied: false };
      if (askLocation && (action === "CHECK_IN" || action === "CHECK_OUT") && !(hybrid && mode === "REMOTE" && action === "CHECK_IN")) {
        setLocStep("Requesting your location…");
        loc = await locate();
        setLocStep(loc.coords ? `Location received (±${Math.round(loc.coords.accuracy ?? 0)} m).` : loc.error ?? null);
      }
      const r = await punchAction({ action, coords: loc.coords, locationDenied: loc.denied, workMode: hybrid ? mode : undefined });
      setResult(r);
    });

  const btn = "inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors disabled:opacity-50";
  return (
    <div className="space-y-3">
      {askLocation && !checkedIn && status !== "CHECKED_OUT" && (
        <p className="flex items-start gap-2 rounded-lg border border-line bg-ink-850 p-3 text-xs text-muted">
          <MapPin className="mt-0.5 size-4 shrink-0 text-brand-blue" aria-hidden />
          <span>
            <strong className="text-fg">Location is requested when you check in or out.</strong> {purpose} Your browser will ask for permission; you can decline.
          </span>
        </p>
      )}
      {hybrid && !checkedIn && status !== "CHECKED_OUT" && (
        <div className="flex gap-2" role="radiogroup" aria-label="Where are you working today?">
          {(["OFFICE", "REMOTE"] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={cn("h-9 flex-1 rounded-md border text-sm", mode === m ? "border-brand-blue bg-brand-blue/10 text-fg" : "border-line text-muted")}>
              {m === "OFFICE" ? "Office today" : "Remote today"}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {!checkedIn && status !== "CHECKED_OUT" && status !== "ON_LEAVE" && (
          <button type="button" disabled={pending} onClick={() => run("CHECK_IN")} className={cn(btn, "bg-brand-blue text-white hover:bg-brand-blue/90")}>
            <LogIn className="size-4" aria-hidden /> Check in
          </button>
        )}
        {(status === "WORKING" || status === "AWAY") && (
          <button type="button" disabled={pending} onClick={() => run("BREAK_START")} className={cn(btn, "border border-line-strong text-fg hover:bg-ink-850")}>
            <Coffee className="size-4" aria-hidden /> Start break
          </button>
        )}
        {status === "ON_BREAK" && (
          <button type="button" disabled={pending} onClick={() => run("BREAK_END")} className={cn(btn, "border border-line-strong text-fg hover:bg-ink-850")}>
            <Play className="size-4" aria-hidden /> End break
          </button>
        )}
        {checkedIn && (
          <button type="button" disabled={pending} onClick={() => run("CHECK_OUT")} className={cn(btn, "bg-ink-800 text-fg hover:bg-ink-700")}>
            <LogOut className="size-4" aria-hidden /> Check out
          </button>
        )}
      </div>
      {pending && locStep && <p className="text-xs text-muted" aria-live="polite">{locStep}</p>}
      {result && (
        <p role="status" className={cn("rounded-md px-3 py-2 text-sm", result.error ? "bg-red-500/10 text-red-700" : "bg-emerald-500/10 text-emerald-700")}>
          {result.error ?? result.ok}
        </p>
      )}
      {periodic.enabled && checkedIn && <PeriodicSharing minutes={periodic.minutes} />}
    </div>
  );
}

/** Opt-in, visible, stoppable periodic location sharing. Runs only while this page is open and the employee is checked in. */
function PeriodicSharing({ minutes }: { minutes: number }) {
  const [on, setOn] = useState(false);
  const [last, setLast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!on) return;
    const send = async () => {
      const r = await locate();
      if (!r.coords) {
        setLast(r.error ?? "Location unavailable.");
        if (r.denied) setOn(false);
        return;
      }
      const res = await locationPingAction(r.coords);
      setLast(res.error ?? `Shared at ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
    };
    void send();
    timer.current = setInterval(send, minutes * 60_000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [on, minutes]);
  return (
    <div className={cn("flex items-center justify-between gap-3 rounded-lg border p-3 text-xs", on ? "border-emerald-500/40 bg-emerald-500/5" : "border-line")}>
      <span className="flex items-center gap-2 text-muted">
        {on ? <MapPin className="size-4 text-emerald-600" aria-hidden /> : <MapPinOff className="size-4" aria-hidden />}
        {on ? <span><strong className="text-fg">Sharing work location</strong> every {minutes} min while this page is open. {last}</span> : <span>Your employer asks for periodic work-location updates while you are checked in. Nothing is shared until you turn it on.</span>}
      </span>
      <button type="button" onClick={() => setOn((v) => !v)} className="btn-secondary h-8 shrink-0 px-3 text-xs">
        {on ? "Stop sharing" : "Start sharing"}
      </button>
    </div>
  );
}
