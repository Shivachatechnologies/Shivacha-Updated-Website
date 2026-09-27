import "server-only";
import bcrypt from "bcryptjs";

const COST = 12;

export const hashPassword = (plain: string) => bcrypt.hash(plain, COST);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

/** A real bcrypt hash of a random value, compared when the email does not exist so timing stays uniform. */
let dummy: Promise<string> | null = null;
export const dummyHash = () => (dummy ??= bcrypt.hash(crypto.randomUUID(), COST));

/** Server-side password policy. Returns an error message or null. */
export function passwordProblem(pw: string, email?: string): string | null {
  if (pw.length < 12) return "Use at least 12 characters.";
  if (pw.length > 128) return "Use at most 128 characters.";
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (classes < 3) return "Use a mix of upper and lower case letters, numbers and symbols.";
  if (email && pw.toLowerCase().includes(email.split("@")[0].toLowerCase())) return "Do not include your email name in the password.";
  if (/^(password|shivacha|admin|qwerty|letmein)/i.test(pw)) return "Choose a less predictable password.";
  return null;
}
