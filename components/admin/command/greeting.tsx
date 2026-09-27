"use client";

import { useSyncExternalStore } from "react";

const subscribe = (cb: () => void) => {
  const t = setInterval(cb, 60_000);
  return () => clearInterval(t);
};
const snap = () => Math.floor(Date.now() / 60_000);

/** "Good morning, …" and today's date in the viewer's own time zone (the server cannot know it). */
export function Greeting({ firstName }: { firstName: string }) {
  const minute = useSyncExternalStore(subscribe, snap, () => 0);
  const d = minute ? new Date(minute * 60_000) : null;
  const h = d?.getHours();
  const part = h == null ? "Welcome back" : h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  return (
    <>
      <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.025em] text-white sm:text-[30px]">
        {part}, {firstName}
      </h1>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[13px] text-[#9fb4cf]">
        <span className="font-medium text-[#dfe6f1]">Shivacha Global Operations</span>
        {d && (
          <>
            <span aria-hidden className="text-[#35507a]">/</span>
            <time dateTime={d.toISOString()}>{new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d)}</time>
          </>
        )}
      </p>
    </>
  );
}
