import { z } from "zod";

/**
 * Workforce policy (Setting key "workforce"). Location is never collected unless an administrator chooses a policy
 * that needs it, and retention is never chosen for you: until a period is set, nothing is purged automatically.
 */
export const LOCATION_POLICIES = {
  NONE: "No location tracking",
  ATTENDANCE_ONLY: "Location at check-in / check-out only",
  PERIODIC: "Periodic work-location updates while checked in (visible to the employee)",
} as const;
export type LocationPolicy = keyof typeof LOCATION_POLICIES;

export const RETENTION_CHOICES = [30, 90, 180, 365] as const;

const bool = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());
const retention = z.preprocess((v) => (v == null || v === "" ? null : Number(v)), z.number().int().min(7).max(3650).nullable());

export const workforceSchema = z.object({
  locationPolicy: z.enum(Object.keys(LOCATION_POLICIES) as [LocationPolicy, ...LocationPolicy[]]),
  /** Minutes between periodic updates (PERIODIC policy only). */
  periodicMinutes: z.preprocess((v) => (v == null || v === "" ? 15 : Number(v)), z.number().int().min(5).max(240)),
  /** BLOCK: an office check-in outside the geofence is refused. FLAG: it is recorded and flagged for review. */
  geofenceEnforcement: z.enum(["BLOCK", "FLAG"]),
  /** Ask remote employees for location too. */
  remoteLocation: bool,
  /** Days to keep raw location points (null = not configured, nothing is purged). */
  locationRetentionDays: retention,
  /** Purpose shown to employees before the browser asks for location. */
  locationPurpose: z.preprocess((v) => (v == null ? "" : v), z.string().trim().max(300)),
  /** Minutes without activity before a checked-in employee shows as "Away" on the live board. */
  awayAfterMinutes: z.preprocess((v) => (v == null || v === "" ? 60 : Number(v)), z.number().int().min(10).max(480)),
});
export type WorkforcePolicy = z.infer<typeof workforceSchema>;

export const WORKFORCE_DEFAULTS: WorkforcePolicy = {
  locationPolicy: "ATTENDANCE_ONLY",
  periodicMinutes: 15,
  geofenceEnforcement: "FLAG",
  remoteLocation: false,
  locationRetentionDays: null,
  locationPurpose: "Your location is checked only when you check in or out, to confirm attendance at your assigned office.",
  awayAfterMinutes: 60,
};

export const parseWorkforce = (v: unknown): WorkforcePolicy => {
  const r = workforceSchema.safeParse({ ...WORKFORCE_DEFAULTS, ...(v && typeof v === "object" ? v : {}) });
  return r.success ? r.data : WORKFORCE_DEFAULTS;
};

/** Whether this check-in should ask the browser for location. */
export function needsLocation(policy: WorkforcePolicy, workMode: "OFFICE" | "REMOTE" | "HYBRID") {
  if (policy.locationPolicy === "NONE") return false;
  if (workMode === "REMOTE") return policy.remoteLocation;
  return true;
}
