/**
 * Data nature (pure). Every number shown to the CEO says where it comes from, and missing data is never shown as 0:
 *   REAL — from records or a provider answer · ESTIMATED — computed with an assumption (e.g. stage probability)
 *   MANUAL — typed in by a person · UNAVAILABLE — the data does not exist · NOT_CONNECTED — its provider is not connected
 *   STALE — real, but older than the refresh interval (the last sync failed or has not run).
 */
export type DataNature = "REAL" | "ESTIMATED" | "MANUAL" | "UNAVAILABLE" | "NOT_CONNECTED" | "STALE";

/** REAL when synced within `maxAgeHours`, STALE when older, UNAVAILABLE when never synced; NOT_CONNECTED wins. */
export function freshness(syncedAt: Date | null | undefined, maxAgeHours: number, connected = true, now = Date.now()): DataNature {
  if (!connected) return "NOT_CONNECTED";
  if (!syncedAt) return "UNAVAILABLE";
  return now - syncedAt.getTime() > maxAgeHours * 3600_000 ? "STALE" : "REAL";
}

export type AttributionQuality = "CAMPAIGN" | "SOURCE" | "UNATTRIBUTED";

/** How well a won deal can be attributed: to a campaign (UTM or campaign name), only to a source, or not at all. */
export function attributionOf(lead: { source?: string | null; campaign?: string | null; utmSource?: string | null; utmMedium?: string | null; utmCampaign?: string | null } | null): { quality: AttributionQuality; source: string; campaign: string | null; channel: string } {
  if (!lead) return { quality: "UNATTRIBUTED", source: "no lead linked", campaign: null, channel: "unknown" };
  const campaign = lead.utmCampaign || lead.campaign || null;
  const source = lead.utmSource || lead.source || "";
  const channel = (lead.utmMedium || (lead.utmSource ? "referral" : lead.source ? "direct / form" : "unknown")).toLowerCase();
  if (campaign) return { quality: "CAMPAIGN", source: source || "unknown", campaign, channel };
  if (source) return { quality: "SOURCE", source, campaign: null, channel };
  return { quality: "UNATTRIBUTED", source: "unknown", campaign: null, channel };
}
