import { EmptyState } from "./ui";

/** Vertical bars for a time series (server-rendered SVG, no client JS). */
export function ColumnChart({ data, label }: { data: { label: string; value: number }[]; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (!data.some((d) => d.value)) return <EmptyState title="No leads in this period" />;
  return (
    <figure aria-label={label}>
      <div className="flex h-44 items-end gap-1.5">
        {data.map((d) => (
          <div key={d.label} className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
            <span className="max-w-full truncate text-[10.5px] text-dim tabular-nums opacity-0 transition-opacity group-hover:opacity-100">{d.value}</span>
            <div className="w-full rounded-t-sm bg-brand-blue/80" style={{ height: `${Math.max(2, (d.value / max) * 100)}%` }} title={`${d.label}: ${d.value}`} />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-1.5">
        {data.map((d, i) => (
          <span key={d.label} className="min-w-0 flex-1 truncate text-center font-mono text-[9.5px] text-dim">{i % 2 === 0 ? d.label : ""}</span>
        ))}
      </div>
      <figcaption className="sr-only">{data.map((d) => `${d.label}: ${d.value}`).join(", ")}</figcaption>
    </figure>
  );
}

/** Horizontal bars for a ranked breakdown. */
export function BarList({ data, empty = "No data yet" }: { data: { label: string; value: number }[]; empty?: string }) {
  if (!data.length) return <p className="py-6 text-center text-sm text-dim">{empty}</p>;
  const max = Math.max(...data.map((d) => d.value));
  return (
    <ul className="space-y-2">
      {data.map((d) => (
        <li key={d.label} className="text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-fg">{d.label}</span>
            <span className="shrink-0 font-mono text-xs text-muted tabular-nums">{d.value}</span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-ink-800">
            <div className="h-full rounded-full bg-brand-blue/70" style={{ width: `${(d.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
