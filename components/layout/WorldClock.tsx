"use client";

import { useSyncExternalStore } from "react";

/**
 * Five analog + digital clocks for the footer. Times come from the browser's IANA time-zone database
 * (Intl.DateTimeFormat), so daylight saving in New York and London is applied automatically.
 * Nothing time-dependent is rendered on the server, which keeps hydration deterministic.
 */
export const WORLD_CLOCKS = [
  { city: "New York", country: "USA", timeZone: "America/New_York" },
  { city: "London", country: "UK", timeZone: "Europe/London" },
  { city: "New Delhi", country: "India", timeZone: "Asia/Kolkata" },
  { city: "Dubai", country: "UAE", timeZone: "Asia/Dubai" },
  { city: "Riyadh", country: "KSA", timeZone: "Asia/Riyadh" },
] as const;

/** Zones without daylight saving use their common abbreviation; the others ask Intl (EST/EDT, GMT/BST). */
const FIXED_ABBR: Record<string, string> = { "Asia/Kolkata": "IST", "Asia/Dubai": "GST", "Asia/Riyadh": "AST" };

// One shared one-second ticker for every clock on the page.
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;
let now = 0;
function schedule() {
  // Align ticks to the start of each second so all hands move together.
  timer = setTimeout(() => {
    now = Date.now();
    listeners.forEach((l) => l());
    schedule();
  }, 1000 - (Date.now() % 1000));
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!timer) {
    now = Date.now();
    schedule();
  }
  return () => {
    listeners.delete(cb);
    if (!listeners.size && timer) {
      clearTimeout(timer);
      timer = undefined;
    }
  };
}
const getSnapshot = () => (now ||= Date.now());
const getServerSnapshot = () => 0;

const formatters = new Map<string, Intl.DateTimeFormat[]>();
function fmt(timeZone: string) {
  let f = formatters.get(timeZone);
  if (!f) {
    f = [
      new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", weekday: "short" }),
      new Intl.DateTimeFormat(timeZone === "America/New_York" ? "en-US" : "en-GB", { timeZone, timeZoneName: "short" }),
    ];
    formatters.set(timeZone, f);
  }
  return f;
}

export function zoneTime(timeZone: string, t: number) {
  const [main, zone] = fmt(timeZone);
  const parts = Object.fromEntries(main.formatToParts(t).map((p) => [p.type, p.value]));
  const abbr = FIXED_ABBR[timeZone] ?? zone.formatToParts(t).find((p) => p.type === "timeZoneName")?.value ?? "";
  return { h: Number(parts.hour), m: Number(parts.minute), s: Number(parts.second), weekday: parts.weekday, abbr };
}

function Face({ h, m, s, ready }: { h: number; m: number; s: number; ready: boolean }) {
  const hourDeg = (h % 12) * 30 + m * 0.5;
  const minDeg = m * 6 + s * 0.1;
  const secDeg = s * 6;
  return (
    <svg viewBox="0 0 100 100" className="size-full" aria-hidden>
      <defs>
        <radialGradient id="wc-face" cx="50%" cy="38%" r="65%">
          <stop offset="0%" stopColor="rgb(255 255 255 / 0.10)" />
          <stop offset="100%" stopColor="rgb(255 255 255 / 0.02)" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill="url(#wc-face)" stroke="rgb(255 255 255 / 0.14)" strokeWidth="1" />
      <circle cx="50" cy="50" r="44.5" fill="none" stroke="rgb(255 255 255 / 0.05)" strokeWidth="0.6" />
      {Array.from({ length: 60 }, (_, i) => {
        const major = i % 5 === 0;
        return <line key={i} x1="50" y1={major ? 7.5 : 8.5} x2="50" y2={major ? 13 : 10.5} stroke={major ? "rgb(255 255 255 / 0.7)" : "rgb(255 255 255 / 0.22)"} strokeWidth={major ? 1.6 : 0.7} strokeLinecap="round" transform={`rotate(${i * 6} 50 50)`} />;
      })}
      {ready && (
        <g strokeLinecap="round">
          <line x1="50" y1="54" x2="50" y2="28" stroke="#ffffff" strokeWidth="3.2" transform={`rotate(${hourDeg} 50 50)`} />
          <line x1="50" y1="56" x2="50" y2="17" stroke="rgb(255 255 255 / 0.85)" strokeWidth="2" transform={`rotate(${minDeg} 50 50)`} />
          <line x1="50" y1="60" x2="50" y2="14" stroke="#0195ff" strokeWidth="0.9" transform={`rotate(${secDeg} 50 50)`} />
        </g>
      )}
      <circle cx="50" cy="50" r="2.6" fill="#0195ff" stroke="#06101c" strokeWidth="1" />
    </svg>
  );
}

export function WorldClock() {
  const t = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return (
    <ul className="flex flex-wrap justify-center gap-3 sm:gap-4 lg:flex-nowrap">
      {WORLD_CLOCKS.map((c) => {
        const z = t ? zoneTime(c.timeZone, t) : null;
        const digital = z ? `${String(z.h).padStart(2, "0")}:${String(z.m).padStart(2, "0")}` : "--:--";
        const day = z ? z.h >= 6 && z.h < 18 : true;
        return (
          <li key={c.timeZone} data-timezone={c.timeZone} className="flex min-w-0 basis-[calc(50%-6px)] flex-col items-center rounded-2xl border border-line bg-white/[0.03] px-3 py-5 text-center shadow-[inset_0_1px_0_rgb(255_255_255/0.04)] sm:basis-[calc(33.333%-11px)] lg:flex-1 lg:basis-0">
            <div className="size-[88px] sm:size-24">
              <Face h={z?.h ?? 10} m={z?.m ?? 10} s={z?.s ?? 0} ready={!!z} />
            </div>
            <p className="mt-4 text-sm font-semibold text-fg">{c.city}</p>
            <p className="text-[11px] tracking-wide text-dim uppercase">{c.country}</p>
            <p className="mt-2 flex items-center gap-1.5 font-mono text-[13px] text-muted tabular-nums">
              <span className={`size-1.5 rounded-full ${day ? "bg-amber-300" : "bg-indigo-300"}`} aria-hidden />
              <time data-clock-digital suppressHydrationWarning>{digital}</time>
              <span className="text-dim">{z ? `${z.abbr} · ${z.weekday}` : ""}</span>
            </p>
          </li>
        );
      })}
    </ul>
  );
}
