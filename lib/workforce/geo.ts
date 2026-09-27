/**
 * Geofence maths (pure). Location is only ever evaluated from coordinates the employee's browser shared after an
 * explicit permission prompt; nothing here collects anything.
 */
export type GeofenceResult = "INSIDE" | "OUTSIDE" | "NO_LOCATION" | "NOT_REQUIRED";

export interface Coords {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
}

export interface GeoOffice {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  radiusM: number;
  remote?: boolean;
}

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in metres. */
export function distanceM(a: Coords, b: Coords) {
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const validCoords = (c: Partial<Coords> | null | undefined): c is Coords =>
  !!c && Number.isFinite(c.latitude) && Number.isFinite(c.longitude) && Math.abs(c.latitude!) <= 90 && Math.abs(c.longitude!) <= 180;

/**
 * INSIDE when the reported position (widened by at most 100 m of its own accuracy radius) touches the office
 * geofence. A very imprecise fix never counts as inside on accuracy alone.
 */
export function evaluateGeofence(pos: Coords | null, office: GeoOffice | null): { result: GeofenceResult; distanceM: number | null; office: GeoOffice | null } {
  if (!office || office.remote || office.latitude == null || office.longitude == null) return { result: "NOT_REQUIRED", distanceM: null, office };
  if (!validCoords(pos)) return { result: "NO_LOCATION", distanceM: null, office };
  const d = distanceM(pos, { latitude: office.latitude, longitude: office.longitude });
  const slack = Math.min(Math.max(pos.accuracy ?? 0, 0), 100);
  return { result: d - slack <= office.radiusM ? "INSIDE" : "OUTSIDE", distanceM: Math.round(d), office };
}

/** Nearest office with a geofence (used when an employee has no assigned office). */
export function nearestOffice(pos: Coords, offices: GeoOffice[]) {
  let best: { office: GeoOffice; d: number } | null = null;
  for (const o of offices) {
    if (o.remote || o.latitude == null || o.longitude == null) continue;
    const d = distanceM(pos, { latitude: o.latitude, longitude: o.longitude });
    if (!best || d < best.d) best = { office: o, d };
  }
  return best?.office ?? null;
}
