/**
 * Geofence diagram (SVG, no map tiles): the office at the centre, its radius as a ring, and each point placed at its
 * real bearing and distance. Scale is shown; this is a relative diagram, not a street map.
 */
export interface GeoPoint {
  id: string;
  label: string;
  /** metres east / north of the office */
  dx: number;
  dy: number;
  accuracyM?: number | null;
  inside: boolean;
}

export function GeofenceDiagram({ radiusM, points, size = 220 }: { radiusM: number; points: GeoPoint[]; size?: number }) {
  const extent = Math.max(radiusM * 1.6, ...points.map((p) => Math.hypot(p.dx, p.dy) * 1.15), 50);
  const c = size / 2;
  const k = (size / 2 - 6) / extent;
  const small = size < 100;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={`Geofence radius ${radiusM} metres${points.length ? ` with ${points.length} location(s)` : ""}`} className="max-w-full">
      <rect width={size} height={size} rx={8} className="fill-ink-850" />
      <circle cx={c} cy={c} r={radiusM * k} className="fill-brand-blue/10 stroke-brand-blue" strokeWidth={1.2} strokeDasharray="4 3" />
      <circle cx={c} cy={c} r={small ? 2 : 3.5} className="fill-brand-blue" />
      {points.map((p) => (
        <g key={p.id}>
          {p.accuracyM ? <circle cx={c + p.dx * k} cy={c - p.dy * k} r={Math.max(2, p.accuracyM * k)} className={p.inside ? "fill-emerald-500/10" : "fill-red-500/10"} /> : null}
          <circle cx={c + p.dx * k} cy={c - p.dy * k} r={4} className={p.inside ? "fill-emerald-600" : "fill-red-600"}>
            <title>{p.label}</title>
          </circle>
        </g>
      ))}
      {!small && (
        <text x={8} y={size - 8} className="fill-dim" fontSize={10}>
          ring = {radiusM} m · width ≈ {Math.round(extent * 2)} m
        </text>
      )}
    </svg>
  );
}

/** Metres east/north of `origin` for a point (equirectangular; fine at geofence scale). */
export function offsetM(origin: { lat: number; lng: number }, p: { lat: number; lng: number }) {
  const R = 6_371_000;
  const dy = ((p.lat - origin.lat) * Math.PI * R) / 180;
  const dx = ((p.lng - origin.lng) * Math.PI * R * Math.cos((origin.lat * Math.PI) / 180)) / 180;
  return { dx, dy };
}
