"use client";

import { useSyncExternalStore } from "react";

// One shared ticker for all clocks on the page; updates every 30 seconds.
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
let now = 0;
function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      listeners.forEach((l) => l());
    }, 30_000);
  }
  return () => {
    listeners.delete(cb);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}
// Cached so repeated reads between ticks return the same value, as useSyncExternalStore requires.
const getSnapshot = () => {
  if (!now) now = Date.now();
  return now;
};
const getServerSnapshot = () => 0;

/** Current local time for an office; renders nothing on the server to avoid hydration mismatches. */
export function OfficeClock({ timeZone }: { timeZone: string }) {
  const t = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (!t) return <span className="inline-block h-4 w-14" aria-hidden />;
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone }).format(t);
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-xs text-muted tabular-nums">
      <span className="size-1.5 rounded-full bg-emerald-400" aria-hidden />
      {time} <span className="sr-only">local time</span>
    </span>
  );
}
