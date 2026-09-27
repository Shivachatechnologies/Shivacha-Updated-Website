import "server-only";

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

/** Approximate location from the hosting provider's IP geolocation headers (country/region/city level only). */
export function geoFromHeaders(h: Headers) {
  const code = (h.get("x-vercel-ip-country") || h.get("cf-ipcountry") || "").toUpperCase();
  let country: string | null = null;
  if (/^[A-Z]{2}$/.test(code) && code !== "XX") {
    try {
      country = regionNames.of(code) ?? code;
    } catch {
      country = code;
    }
  }
  const dec = (v: string | null) => {
    if (!v) return null;
    try {
      return decodeURIComponent(v).slice(0, 100) || null;
    } catch {
      return null;
    }
  };
  return { country, region: dec(h.get("x-vercel-ip-country-region")), city: dec(h.get("x-vercel-ip-city")) };
}

export const clientIp = (h: Headers) => (h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || null)?.slice(0, 64) ?? null;

/** Same-origin check for the public collector (the browser always sends Origin on POST/fetch). */
export function sameOrigin(h: Headers) {
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const origin = h.get("origin");
  if (!origin) return h.get("sec-fetch-site") === "same-origin";
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
