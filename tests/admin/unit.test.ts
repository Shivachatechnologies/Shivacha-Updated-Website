/** Unit tests for admin security and CMS helpers: npm run test:admin */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ROLES, ROLE_PERMISSIONS, assignableRoles, can } from "../../lib/auth/permissions";
import { passwordProblem } from "../../lib/auth/password";
import { csvCell, toCsvRow } from "../../lib/admin/csv";
import { RESOURCES, SLUG_RE, fromFormValue, slugify, toFormValue } from "../../lib/admin/resources";
import { sectionsSchema } from "../../lib/admin/sections";
import { SETTING_SCHEMAS } from "../../lib/admin/settings";
import { markdownToSections, toInsight } from "../../lib/cms/mappers";

test("RBAC matrix matches the specification", () => {
  for (const p of Object.values(ROLE_PERMISSIONS.SUPER_ADMIN)) assert.ok(can("ADMIN", p), `admin has ${p}`);
  assert.ok(can("SALES_MANAGER", "leads:edit") && can("SALES_MANAGER", "followups:manage"));
  assert.ok(!can("SALES_MANAGER", "services:manage") && !can("SALES_MANAGER", "users:manage"));
  assert.ok(can("CONTENT_MANAGER", "blog:manage") && !can("CONTENT_MANAGER", "leads:view") && !can("CONTENT_MANAGER", "seo:manage"));
  assert.ok(can("SEO_MANAGER", "seo:manage") && can("SEO_MANAGER", "redirects:manage") && !can("SEO_MANAGER", "leads:view"));
  assert.ok(can("MARKETING_MANAGER", "leads:view") && !can("MARKETING_MANAGER", "leads:edit") && !can("MARKETING_MANAGER", "users:manage"));
  assert.ok(!can(undefined, "dashboard:view") && !can(null, "leads:view"));
  for (const r of ROLES) if (r !== "SUPER_ADMIN" && r !== "ADMIN") assert.ok(!can(r, "users:manage") && !can(r, "settings:manage") && !can(r, "audit:view"), `${r} has no system access`);
});

test("only a Super Admin can grant the Super Admin role", () => {
  assert.ok(assignableRoles("SUPER_ADMIN").includes("SUPER_ADMIN"));
  for (const r of ROLES.filter((x) => x !== "SUPER_ADMIN")) assert.ok(!assignableRoles(r).includes("SUPER_ADMIN"));
});

test("password policy", () => {
  assert.match(passwordProblem("short", "a@b.c")!, /12/);
  assert.match(passwordProblem("alllowercaseletters", "a@b.c")!, /mix/);
  assert.match(passwordProblem("Rajesh-Secure-2026", "rajesh@shivacha.com")!, /email/);
  assert.match(passwordProblem("Password-Long-2026", "x@y.z")!, /predictable/);
  assert.equal(passwordProblem("Blue-Harbour-Lamp-7", "x@y.z"), null);
});

test("CSV escaping and formula-injection protection", () => {
  assert.equal(csvCell('He said "hi", then left'), '"He said ""hi"", then left"');
  assert.equal(csvCell("=HYPERLINK(1)"), "'=HYPERLINK(1)");
  assert.equal(csvCell("+1 555"), "'+1 555");
  assert.equal(csvCell("-2"), "'-2");
  assert.equal(csvCell("@SUM(A1)"), "'@SUM(A1)");
  assert.equal(csvCell(null), "");
  assert.equal(csvCell(new Date("2026-01-02T03:04:05Z")), "2026-01-02T03:04:05.000Z");
  assert.equal(toCsvRow(["a", "b\nc"]), 'a,"b\nc"\r\n');
});

test("CMS field parsing and validation", () => {
  const f = (type: string, extra = {}) => ({ name: "x", label: "X", type, ...extra }) as Parameters<typeof fromFormValue>[0];
  assert.deepEqual(fromFormValue(f("pairs"), "A | one\nB|two\n\n"), [[{ title: "A", description: "one" }, { title: "B", description: "two" }]]);
  assert.deepEqual(fromFormValue(f("faqs"), "Q? | A."), [[{ q: "Q?", a: "A." }]]);
  assert.deepEqual(fromFormValue(f("tags"), "ai, web3 ,"), [["ai", "web3"]]);
  assert.equal(fromFormValue(f("url"), "javascript:alert(1)")[1] !== undefined, true, "javascript: URLs rejected");
  assert.equal(fromFormValue(f("image"), "//evil.example/x.png")[1] !== undefined, true, "protocol-relative URLs rejected");
  assert.equal(fromFormValue(f("image"), "/uploads/a.png")[0], "/uploads/a.png");
  assert.equal(fromFormValue(f("select", { options: [["A", "A"]] }), "B")[1], "Choose a valid option");
  assert.equal(fromFormValue(f("text", { required: true }), "  ")[1], "Required");
  assert.equal(fromFormValue(f("text", { max: 3 }), "abcd")[1], "Keep it under 3 characters");
  assert.equal(fromFormValue(f("number"), "1.5")[1], "Enter a whole number");
  const d = fromFormValue(f("datetime"), "2026-10-01T09:30")[0] as Date;
  assert.equal(d.toISOString(), "2026-10-01T09:30:00.000Z");
  const pairs = f("pairs");
  assert.equal(toFormValue(pairs, fromFormValue(pairs, "A | one")[0]), "A | one");
});

test("slugs", () => {
  assert.equal(slugify("Crypto Exchange — Développement!"), "crypto-exchange-developpement");
  assert.ok(SLUG_RE.test("ai-agents") && !SLUG_RE.test("AI Agents") && !SLUG_RE.test("a--b") && !SLUG_RE.test("../x"));
});

test("every resource has a title field, permission and valid field groups", () => {
  for (const r of Object.values(RESOURCES)) {
    assert.ok(r.fields.some((f) => f.name === r.titleField), `${r.key} title field`);
    if (r.slug) assert.ok(r.fields.some((f) => f.name === "slug"), `${r.key} slug field`);
    assert.ok(r.permission.endsWith(":manage"));
  }
  assert.ok(RESOURCES["case-studies"].description.includes("verified"), "case studies warn against unverified claims");
});

test("page sections schema rejects unsafe links and unknown types", () => {
  assert.ok(sectionsSchema.safeParse([{ type: "cta", hidden: false, data: { ctaHref: "/contact" } }]).success);
  assert.ok(!sectionsSchema.safeParse([{ type: "cta", hidden: false, data: { ctaHref: "javascript:alert(1)" } }]).success);
  assert.ok(!sectionsSchema.safeParse([{ type: "script", hidden: false, data: {} }]).success);
  assert.ok(!sectionsSchema.safeParse(Array.from({ length: 61 }, () => ({ type: "text", hidden: false, data: {} }))).success);
});

test("settings never accept unsafe links and ignore unknown (secret) keys", () => {
  const r = SETTING_SCHEMAS.site.safeParse({ announcementEnabled: "on", announcementText: "Hi", announcementHref: "javascript:x", contactEmail: "", contactPhone: "" });
  assert.ok(!r.success);
  const ok = SETTING_SCHEMAS.site.parse({ announcementEnabled: "on", announcementText: "Hi", announcementHref: "/x", contactEmail: "sales@shivacha.com", contactPhone: "+91 81711 33917", SMTP_PASS: "nope" });
  assert.ok(!("SMTP_PASS" in ok));
  assert.equal(ok.announcementEnabled, true);
});

test("markdown → sections (rendered as text, never HTML)", () => {
  const s = markdownToSections("Intro line\n\n## Heading\n\nPara one\ncontinues\n\n- a\n- b\n\n<script>x</script>");
  assert.equal(s[0].heading, "Overview");
  assert.deepEqual(s[1], { heading: "Heading", body: ["Para one continues", "<script>x</script>"], bullets: ["a", "b"] });
  const i = toInsight({ slug: "s", title: "T", excerpt: null, content: "word ".repeat(440), authorName: null, category: null, tags: [], readingTime: null, publishedAt: new Date("2026-05-01T00:00:00Z"), createdAt: new Date() });
  assert.equal(i.readingTime, "2 min");
  assert.equal(i.date, "2026-05-01");
  assert.equal(i.category, "software-engineering");
});
