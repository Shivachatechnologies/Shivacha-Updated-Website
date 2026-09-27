/**
 * Shivacha's strategic operating markets and a matcher from the free-text `country` stored on leads, clients and
 * deals. Matching accepts ISO-2/ISO-3 codes, English country names and common aliases; anything else is "unmapped".
 */

export type MarketKey = "usa" | "canada" | "uk" | "europe" | "uae" | "saudi" | "africa" | "india" | "singapore" | "australia";

export interface MarketDef {
  key: MarketKey;
  name: string;
  /** Hub coordinates for the map marker [lat, lon]. */
  at: [number, number];
  /** One-letter code used by the generated world grid. */
  code: string;
  /** Local time zone of the hub, for the market clock. */
  tz: string;
}

export const MARKETS: MarketDef[] = [
  { key: "usa", name: "USA", at: [39, -98], code: "u", tz: "America/New_York" },
  { key: "canada", name: "Canada", at: [56, -106], code: "c", tz: "America/Toronto" },
  { key: "uk", name: "United Kingdom", at: [53.5, -2], code: "k", tz: "Europe/London" },
  { key: "europe", name: "Europe", at: [49, 12], code: "e", tz: "Europe/Berlin" },
  { key: "uae", name: "UAE", at: [24.2, 54.4], code: "a", tz: "Asia/Dubai" },
  { key: "saudi", name: "Saudi Arabia", at: [24.5, 45], code: "s", tz: "Asia/Riyadh" },
  { key: "africa", name: "Africa", at: [3, 21], code: "f", tz: "Africa/Nairobi" },
  { key: "india", name: "India", at: [21, 78.5], code: "i", tz: "Asia/Kolkata" },
  { key: "singapore", name: "Singapore", at: [1.35, 103.8], code: "g", tz: "Asia/Singapore" },
  { key: "australia", name: "Australia", at: [-25, 134], code: "o", tz: "Australia/Sydney" },
];

const EUROPE = "AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE NO CH IS AL BA ME MK RS MD UA BY AD LI MC SM VA XK GI".split(" ");
const AFRICA = "DZ AO BJ BW BF BI CM CV CF TD KM CG CD CI DJ EG GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG MW ML MR MU MA MZ NA NE NG RW ST SN SC SL SO ZA SS SD TZ TG TN UG EH ZM ZW".split(" ");
const DIRECT: Record<string, MarketKey> = { US: "usa", CA: "canada", GB: "uk", AE: "uae", SA: "saudi", IN: "india", SG: "singapore", AU: "australia" };

const ISO2: Record<string, MarketKey> = { ...DIRECT };
for (const c of EUROPE) ISO2[c] = "europe";
for (const c of AFRICA) ISO2[c] = "africa";

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, "");

const ALIASES: Record<string, MarketKey> = {
  usa: "usa", us: "usa", unitedstates: "usa", unitedstatesofamerica: "usa", america: "usa",
  uk: "uk", gb: "uk", gbr: "uk", greatbritain: "uk", britain: "uk", england: "uk", scotland: "uk", wales: "uk", northernireland: "uk", unitedkingdom: "uk",
  uae: "uae", are: "uae", emirates: "uae", unitedarabemirates: "uae", dubai: "uae", abudhabi: "uae",
  ksa: "saudi", sau: "saudi", saudi: "saudi", saudiarabia: "saudi", kingdomofsaudiarabia: "saudi", riyadh: "saudi",
  ind: "india", bharat: "india", sgp: "singapore", aus: "australia", can: "canada",
  europe: "europe", eu: "europe", europeanunion: "europe", africa: "africa", holland: "europe",
  ivorycoast: "africa", cotedivoire: "africa", drc: "africa", congo: "africa", democraticrepublicofthecongo: "africa",
};

let byName: Map<string, MarketKey> | null = null;
function names() {
  if (byName) return byName;
  byName = new Map();
  try {
    const dn = new Intl.DisplayNames(["en"], { type: "region" });
    for (const [iso, k] of Object.entries(ISO2)) {
      const n = dn.of(iso);
      if (n) byName.set(norm(n), k);
    }
  } catch {
    /* Intl without region names: codes and aliases still match. */
  }
  return byName;
}

/** Maps a stored country value to a Shivacha market, or null when it is outside the ten markets / unrecognised. */
export function marketOf(country: string | null | undefined): MarketKey | null {
  if (!country) return null;
  const raw = country.trim();
  if (!raw) return null;
  if (/^[A-Za-z]{2}$/.test(raw) && ISO2[raw.toUpperCase()]) return ISO2[raw.toUpperCase()];
  const n = norm(raw);
  return ALIASES[n] ?? names().get(n) ?? null;
}
