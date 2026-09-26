/* Server-only module. */
import { promises as dns } from "node:dns";

const cache = new Map<string, boolean>();

/**
 * True unless the email's domain definitively cannot receive mail (no MX and no A record).
 * Network errors or timeouts count as valid, so a DNS hiccup never rejects a real lead.
 */
export async function emailDomainAcceptsMail(email: string) {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return false;
  if (cache.has(domain)) return cache.get(domain)!;
  const timeout = new Promise<"timeout">((r) => setTimeout(() => r("timeout"), 2000));
  const check = (async () => {
    try {
      const mx = await dns.resolveMx(domain);
      if (mx.length) return true;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== "ENOTFOUND" && code !== "ENODATA") return true;
    }
    try {
      await dns.resolve4(domain);
      return true;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      return !(code === "ENOTFOUND" || code === "ENODATA");
    }
  })();
  const result = await Promise.race([check, timeout]);
  const ok = result === "timeout" ? true : result;
  if (result !== "timeout") cache.set(domain, ok);
  if (cache.size > 2000) cache.clear();
  return ok;
}
