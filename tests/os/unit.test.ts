/** Shivacha OS unit tests (pure logic, no database): npm run test:os */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { documentTotals, lineAmounts, parseMoney, byCurrency, round2 } from "../../lib/os/money";
import { hmacHex, verifyRazorpaySignature, verifyStripeSignature } from "../../lib/payments/signature";
import { allMatch, isPublicHttpsUrl, matches, render, rulesSchema } from "../../lib/automation/rules";
import { ROLES, can } from "../../lib/auth/permissions";
import { base32Decode, base32Encode, totpAt, verifyTotp } from "../../lib/auth/totp";
import { resolveRange } from "../../lib/os/range";
import { AGENTS } from "../../lib/ai/catalog";
import { costOf, priceFor } from "../../lib/ai/provider";
import { migrationUrl } from "../../scripts/db/migration-url.mjs";

test("money: Decimal line and document totals (no float drift)", () => {
  const l = lineAmounts({ quantity: "3", unitPrice: "0.10", discountPct: "0", taxPct: "0" });
  assert.equal(l.net.toFixed(2), "0.30");
  const t = documentTotals([{ quantity: "1", unitPrice: "48000", discountPct: "10", taxPct: "5" }]);
  assert.deepEqual([t.subtotal.toFixed(2), t.discountTotal.toFixed(2), t.taxTotal.toFixed(2), t.total.toFixed(2)], ["48000.00", "4800.00", "2160.00", "45360.00"]);
  const x = documentTotals([{ quantity: "1", unitPrice: "100", taxPct: "10" }, { quantity: "1", unitPrice: "100", taxPct: "0" }], "50");
  assert.equal(x.taxTotal.toFixed(2), "7.50", "document discount pro-rated before tax");
  assert.equal(x.total.toFixed(2), "157.50");
  assert.equal(round2("2.345").toFixed(2), "2.35", "half-up rounding");
});

test("money: parsing rejects invalid input and never mixes currencies", () => {
  assert.equal(parseMoney("1,234.50")?.toFixed(2), "1234.50");
  assert.equal(parseMoney(""), null, "blank → null");
  assert.throws(() => parseMoney("abc"), /INVALID_AMOUNT/);
  assert.throws(() => parseMoney("-5"), /INVALID_AMOUNT/);
  assert.throws(() => parseMoney("1.234"), /INVALID_AMOUNT/, "max two decimals");
  const g = byCurrency([{ c: "USD", a: "10" }, { c: "INR", a: "500" }, { c: "USD", a: "5.55" }], (r) => r.c, (r) => r.a);
  assert.deepEqual(g.map((x) => [x.currency, x.amount.toFixed(2)]).sort(), [["INR", "500.00"], ["USD", "15.55"]]);
});

test("webhook signatures: Stripe (t=,v1=) with replay window, Razorpay HMAC", () => {
  const secret = "whsec_test";
  const body = '{"id":"evt_1"}';
  const now = 1_800_000_000_000;
  const t = Math.floor(now / 1000);
  const sig = hmacHex("sha256", secret, `${t}.${body}`);
  assert.ok(verifyStripeSignature(body, `t=${t},v1=${sig}`, secret, now));
  assert.ok(!verifyStripeSignature(body, `t=${t},v1=${sig}`, "wrong", now));
  assert.ok(!verifyStripeSignature(body + " ", `t=${t},v1=${sig}`, secret, now), "tampered body");
  assert.ok(!verifyStripeSignature(body, `t=${t},v1=${sig}`, secret, now + 10 * 60_000), "outside tolerance");
  assert.ok(!verifyStripeSignature(body, null, secret, now));
  const r = createHmac("sha256", "rzp").update(body).digest("hex");
  assert.ok(verifyRazorpaySignature(body, r, "rzp"));
  assert.ok(!verifyRazorpaySignature(body, r, "other-secret"));
  assert.ok(!verifyRazorpaySignature(body, null, "rzp"));
});

test("automation rules: conditions, templates and SSRF protection", () => {
  const p = { lead: { country: "UAE", score: 82, services: ["AI Development", "Web3"], name: "A <b>" } };
  assert.ok(matches({ field: "lead.country", op: "eq", value: "uae" }, p));
  assert.ok(matches({ field: "lead.score", op: "gte", value: "80" }, p));
  assert.ok(!matches({ field: "lead.score", op: "lt", value: "abc" }, p));
  assert.ok(matches({ field: "lead.services", op: "in", value: "web3, cloud" }, p));
  assert.ok(allMatch([], p));
  assert.equal(render("Hi {{lead.name}}", p, (s) => s.replace(/</g, "&lt;")), "Hi A &lt;b>");
  assert.ok(isPublicHttpsUrl("https://hooks.example.com/x"));
  for (const bad of ["http://example.com", "https://localhost/x", "https://10.0.0.5/x", "https://192.168.1.1", "https://169.254.169.254/latest", "https://user:pw@example.com", "https://intranet"]) assert.ok(!isPublicHttpsUrl(bad), bad);
  assert.ok(!rulesSchema.safeParse({ conditions: [], actions: [] }).success, "at least one action");
});

test("RBAC: new roles and AI permissions", () => {
  assert.ok(can("FINANCE_MANAGER", "payments:confirm") && !can("FINANCE_MANAGER", "leads:edit"));
  assert.ok(can("PROJECT_MANAGER", "projects:manage") && !can("PROJECT_MANAGER", "finance:view"));
  assert.ok(can("SUPPORT_MANAGER", "support:manage") && !can("SUPPORT_MANAGER", "deals:view"));
  assert.ok(!can("SALES_MANAGER", "payments:confirm") && !can("SALES_MANAGER", "finance:view"));
  for (const r of ROLES) if (r !== "SUPER_ADMIN" && r !== "ADMIN") assert.ok(!can(r, "ai:configure") && !can(r, "security:manage") && !can(r, "executive:view"), `${r} lacks admin-only permissions`);
  for (const r of ROLES) assert.ok(can(r, "ai:view") === can(r, "ai:execute"), `${r}: AI view/execute paired`);
  // Every agent needs a real permission and only CEO-level roles can use the CEO agent.
  const ceo = AGENTS.find((a) => a.slug === "ceo")!;
  assert.deepEqual(ROLES.filter((r) => can(r, ceo.requires)), ["SUPER_ADMIN", "ADMIN"]);
  assert.equal(AGENTS.length, 12);
});

test("TOTP: RFC 6238 vectors, drift window and base32", () => {
  // RFC 6238 SHA-1 secret "12345678901234567890"; T=59s → 94287082 (8 digits) → last 6 digits 287082.
  const secret = base32Encode(Buffer.from("12345678901234567890"));
  assert.equal(totpAt(secret, 1), "287082");
  assert.equal(totpAt(secret, Math.floor(1111111109 / 30)), "081804");
  assert.equal(base32Decode(secret).toString(), "12345678901234567890");
  const now = 1_700_000_000_000;
  const step = Math.floor(now / 30000);
  assert.equal(verifyTotp(secret, totpAt(secret, step), now), step);
  assert.equal(verifyTotp(secret, totpAt(secret, step - 1), now), step - 1, "previous step accepted");
  assert.equal(verifyTotp(secret, totpAt(secret, step - 3), now), null, "old code rejected");
  assert.equal(verifyTotp(secret, "12345", now), null);
});

test("date ranges are UTC and bounded", () => {
  const now = new Date("2026-09-27T10:00:00Z");
  const r = resolveRange("7d", undefined, undefined, now);
  assert.equal(r.from!.toISOString(), "2026-09-21T00:00:00.000Z");
  assert.equal(resolveRange("custom", "2026-01-01", "2026-01-31", now).to!.toISOString(), "2026-01-31T23:59:59.999Z");
  assert.equal(resolveRange("bogus", undefined, undefined, now).key, "30d");
});

test("AI pricing: known models priced, unknown models priced at the safe maximum", () => {
  assert.deepEqual(priceFor("claude-opus-5"), [5, 25]);
  assert.deepEqual(priceFor("claude-sonnet-5"), [2, 10]);
  assert.deepEqual(priceFor("some-new-model"), [10, 50]);
  assert.equal(costOf("claude-opus-5", { input: 1_000_000, output: 100_000 }).toFixed(2), "7.50");
});

test("migrations use a direct (non-pooled) connection to the same database", () => {
  const pooled = "postgresql://u:p@ep-cool-name-123456-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require";
  const d = migrationUrl({ DATABASE_URL: pooled });
  assert.equal(d.source, "DATABASE_URL (Neon direct host)");
  assert.equal(new URL(d.url!).hostname, "ep-cool-name-123456.eu-central-1.aws.neon.tech", "same endpoint, pooler removed");
  assert.equal(new URL(d.url!).pathname + new URL(d.url!).search, "/neondb?sslmode=require", "same database and options");
  assert.equal(migrationUrl({ DATABASE_URL: pooled, DATABASE_URL_UNPOOLED: "postgresql://direct" }).source, "DATABASE_URL_UNPOOLED", "explicit direct URL wins");
  const local = "postgresql://postgres@localhost:5433/db";
  assert.deepEqual(migrationUrl({ DATABASE_URL: local }), { url: local, source: "DATABASE_URL" }, "non-pooled URLs are used as-is");
  assert.equal(migrationUrl({}).url, undefined);
});
