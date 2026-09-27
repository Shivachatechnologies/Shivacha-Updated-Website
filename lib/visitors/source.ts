/** Channel attribution from UTM parameters and the referrer (pure). */
const SEARCH = /(^|\.)(google|bing|duckduckgo|yahoo|yandex|baidu|ecosia)\./i;
const SOCIAL = /(^|\.)(facebook|fb|instagram|linkedin|lnkd|twitter|x|t|youtube|reddit|pinterest|quora)\.(com|co|in)$/i;

export function deriveSource(input: { utmSource?: string | null; utmMedium?: string | null; referrer?: string | null; host?: string | null }): { source: string; medium: string } {
  if (input.utmSource) return { source: input.utmSource.toLowerCase().slice(0, 80), medium: (input.utmMedium ?? "referral").toLowerCase().slice(0, 80) };
  let ref: URL | null = null;
  try {
    ref = input.referrer ? new URL(input.referrer) : null;
  } catch {
    ref = null;
  }
  if (!ref || (input.host && ref.host === input.host)) return { source: "direct", medium: "none" };
  const h = ref.hostname.replace(/^www\./, "");
  if (SEARCH.test(h)) return { source: h.split(".")[0], medium: "organic" };
  if (SOCIAL.test(h)) return { source: h.split(".")[0] === "lnkd" ? "linkedin" : h.split(".")[0] === "t" ? "twitter" : h.split(".")[0], medium: "social" };
  return { source: h.slice(0, 80), medium: "referral" };
}
