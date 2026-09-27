/** Country dialling codes for the inquiry form and E.164 normalisation. Dependency-free. */
export interface DialCountry {
  iso: string;
  name: string;
  dial: string;
}

export const DIAL_COUNTRIES: DialCountry[] = [
  { iso: "IN", name: "India", dial: "91" },
  { iso: "US", name: "United States", dial: "1" },
  { iso: "GB", name: "United Kingdom", dial: "44" },
  { iso: "AE", name: "United Arab Emirates", dial: "971" },
  { iso: "SA", name: "Saudi Arabia", dial: "966" },
  { iso: "QA", name: "Qatar", dial: "974" },
  { iso: "SG", name: "Singapore", dial: "65" },
  { iso: "AU", name: "Australia", dial: "61" },
  { iso: "CA", name: "Canada", dial: "1" },
  { iso: "DE", name: "Germany", dial: "49" },
  { iso: "FR", name: "France", dial: "33" },
  { iso: "NL", name: "Netherlands", dial: "31" },
  { iso: "CH", name: "Switzerland", dial: "41" },
  { iso: "IE", name: "Ireland", dial: "353" },
  { iso: "ES", name: "Spain", dial: "34" },
  { iso: "IT", name: "Italy", dial: "39" },
  { iso: "SE", name: "Sweden", dial: "46" },
  { iso: "PL", name: "Poland", dial: "48" },
  { iso: "EE", name: "Estonia", dial: "372" },
  { iso: "LT", name: "Lithuania", dial: "370" },
  { iso: "TR", name: "Türkiye", dial: "90" },
  { iso: "IL", name: "Israel", dial: "972" },
  { iso: "ZA", name: "South Africa", dial: "27" },
  { iso: "NG", name: "Nigeria", dial: "234" },
  { iso: "KE", name: "Kenya", dial: "254" },
  { iso: "EG", name: "Egypt", dial: "20" },
  { iso: "HK", name: "Hong Kong", dial: "852" },
  { iso: "JP", name: "Japan", dial: "81" },
  { iso: "KR", name: "South Korea", dial: "82" },
  { iso: "ID", name: "Indonesia", dial: "62" },
  { iso: "MY", name: "Malaysia", dial: "60" },
  { iso: "TH", name: "Thailand", dial: "66" },
  { iso: "VN", name: "Vietnam", dial: "84" },
  { iso: "PH", name: "Philippines", dial: "63" },
  { iso: "NZ", name: "New Zealand", dial: "64" },
  { iso: "BR", name: "Brazil", dial: "55" },
  { iso: "MX", name: "Mexico", dial: "52" },
  { iso: "AR", name: "Argentina", dial: "54" },
  { iso: "BD", name: "Bangladesh", dial: "880" },
  { iso: "PK", name: "Pakistan", dial: "92" },
  { iso: "LK", name: "Sri Lanka", dial: "94" },
  { iso: "NP", name: "Nepal", dial: "977" },
];

const TZ_TO_ISO: [RegExp, string][] = [
  [/^Asia\/(Kolkata|Calcutta)/, "IN"],
  [/^Europe\/London/, "GB"],
  [/^America\/(Toronto|Vancouver|Edmonton|Winnipeg|Halifax)/, "CA"],
  [/^America\//, "US"],
  [/^Asia\/Dubai/, "AE"],
  [/^Asia\/Riyadh/, "SA"],
  [/^Asia\/Qatar/, "QA"],
  [/^Asia\/Singapore/, "SG"],
  [/^Australia\//, "AU"],
  [/^Europe\/Berlin/, "DE"],
  [/^Europe\/Paris/, "FR"],
  [/^Europe\/Amsterdam/, "NL"],
  [/^Europe\/Zurich/, "CH"],
  [/^Europe\/Dublin/, "IE"],
  [/^Africa\/Johannesburg/, "ZA"],
  [/^Africa\/Lagos/, "NG"],
  [/^Africa\/Nairobi/, "KE"],
];

/** Best guess of the visitor's country from their time zone (no network lookup). */
export function guessDialCountry(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    for (const [re, iso] of TZ_TO_ISO) if (re.test(tz)) return iso;
  } catch {
    /* default below */
  }
  return "IN";
}

/**
 * Combine a country and a locally typed number into E.164 (+CCNNNN…). A number typed with a leading
 * "+" or "00" is treated as already international. Returns "" for an empty input.
 */
export function toE164(iso: string, input: string): string {
  const raw = input.trim();
  if (!raw) return "";
  if (/^(\+|00)/.test(raw)) return `+${raw.replace(/^00/, "").replace(/\D/g, "")}`;
  const c = DIAL_COUNTRIES.find((x) => x.iso === iso) ?? DIAL_COUNTRIES[0];
  const national = raw.replace(/\D/g, "").replace(/^0+/, "");
  return `+${c.dial}${national}`;
}
