/** Coarse user-agent classification (pure). Used for attendance device info and visitor analytics; no fingerprinting. */
export function parseUserAgent(ua: string | null | undefined) {
  const s = ua ?? "";
  const device = /iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(s) ? "Tablet" : /Mobi|iPhone|iPod|Android.*Mobile|Windows Phone/i.test(s) ? "Mobile" : s ? "Desktop" : "Unknown";
  const browser = /Edg\//.test(s) ? "Edge" : /OPR\/|Opera/.test(s) ? "Opera" : /SamsungBrowser/.test(s) ? "Samsung Internet" : /Firefox\/|FxiOS/.test(s) ? "Firefox" : /Chrome\/|CriOS/.test(s) ? "Chrome" : /Safari\//.test(s) ? "Safari" : s ? "Other" : "Unknown";
  const os = /Windows NT/.test(s) ? "Windows" : /iPhone|iPad|iPod/.test(s) ? "iOS" : /Mac OS X|Macintosh/.test(s) ? "macOS" : /Android/.test(s) ? "Android" : /CrOS/.test(s) ? "ChromeOS" : /Linux/.test(s) ? "Linux" : s ? "Other" : "Unknown";
  return { device, browser, os };
}

const BOT = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|quora link|whatsapp|telegrambot|discordbot|linkedinbot|pinterest|vkshare|w3c_validator|lighthouse|pagespeed|headless|phantomjs|puppeteer|playwright|selenium|curl\/|wget\/|python-requests|go-http-client|axios\/|node-fetch|httpclient|monitor|uptime|preview/i;

/** Self-declared automation (never a behavioural fingerprint). */
export const isBotUserAgent = (ua: string | null | undefined) => !ua || ua.length < 12 || BOT.test(ua);
