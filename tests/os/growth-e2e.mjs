/**
 * Growth department end-to-end flow (Playwright) against a server running on the TEST database:
 *   DATABASE_URL=…/shivacha_test GROWTH_UNSUBSCRIBE_SECRET=… npx next start -p 3200
 *   ADMIN_E2E_URL=http://localhost:3200 ADMIN_E2E_PASSWORD=… node tests/os/growth-e2e.mjs
 */
import { chromium } from "playwright-core";

const BASE = process.env.ADMIN_E2E_URL ?? "http://localhost:3200";
const PW = process.env.ADMIN_E2E_PASSWORD;
if (!PW) throw new Error("Set ADMIN_E2E_PASSWORD");
const TAG = `e2e${Date.now().toString(36)}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/opt/pw-browsers/chromium" });
let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) failures++;
};

async function login(email) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, baseURL: BASE });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/admin/login");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", PW);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/admin/login"), { timeout: 20000 }), page.click("button[type=submit]")]);
  return { ctx, page, errors };
}
/** Waits for the element (pages stream in), unlike isVisible() which checks once. */
const seen = (loc, timeout = 8000) => loc.first().waitFor({ state: "visible", timeout }).then(() => true, () => false);
const settle = (page) => page.waitForLoadState("networkidle").catch(() => null);
async function submitIn(page, locator, button) {
  await Promise.all([page.waitForResponse((r) => r.request().method() === "POST", { timeout: 20000 }), locator.getByRole("button", { name: button }).first().click()]);
  await settle(page);
  await page.waitForTimeout(600);
}

const { page, errors } = await login("qa-super@shivacha.test");

// 1. Kill switch: stop and resume STOP ALL.
await page.goto("/admin/marketing/autonomous");
const allRow = page.locator("li", { hasText: "STOP ALL (every growth action" });
await submitIn(page, allRow, "Stop");
ok(await seen(page.locator("li", { hasText: "STOP ALL (every growth action" }).getByText("Stopped", { exact: true })), "STOP ALL can be switched on");
ok(await seen(page.getByText("Stopped", { exact: true }).first()), "kill-switch banner shows Stopped");
await submitIn(page, page.locator("li", { hasText: "STOP ALL (every growth action" }), "Resume");
ok(await seen(page.locator("li", { hasText: "STOP ALL (every growth action" }).getByText("Not stopped")), "STOP ALL can be resumed by growth:control");

// 2. Save controls (autonomous + lead gen + budgets).
await page.check("input[name=autonomousMode]");
await page.check("input[name=ch_leadGen]");
await page.fill("input[name=budget_emailDaily]", "50");
// High enough that repeated runs on the same UTC day still reach the provider (the step under test).
await page.fill("input[name=budget_socialDaily]", "100000");
await submitIn(page, page.locator("form", { has: page.locator("input[name=autonomousMode]") }), "Save growth controls");
ok(await page.locator("input[name=autonomousMode]").isChecked(), "autonomous mode saved");
ok((await page.locator("input[name=budget_emailDaily]").inputValue()) === "50", "email budget saved");

// 3. Run the loop now.
await submitIn(page, page.locator("section, div", { hasText: "Daily loop" }).last(), "Run now");
ok(await seen(page.getByText("leads.qualify").first()), "loop run is logged with its steps");

// 4. Social: draft → approve → publish now (not connected) stays approved.
await page.goto("/admin/marketing/social");
const compose = page.locator("form", { has: page.locator("textarea[name=body]") });
await compose.locator("textarea[name=body]").fill(`Secure exchange launch checklist ${TAG}`);
await submitIn(page, compose, "Save for approval");
await page.goto("/admin/marketing/social?q=PENDING_APPROVAL");
const card = page.locator("article", { hasText: TAG });
ok(await seen(card), "new post waits for approval");
await submitIn(page, card, "Approve");
await page.goto("/admin/marketing/social?q=APPROVED");
const approved = page.locator("article", { hasText: TAG });
ok(await seen(approved), "approved post listed as Approved");
await submitIn(page, approved, "Publish now");
await page.goto("/admin/marketing/social?q=APPROVED");
const still = page.locator("article", { hasText: TAG });
ok(await seen(still), "publishing without a connected platform does not mark it published");
ok(await seen(still.getByText(/not connected/i)), "the not-connected reason is shown on the post");

// 5. Content: create → approve → repurpose into post drafts.
await page.goto("/admin/marketing/content");
const newAsset = page.locator("form", { has: page.locator("input[name=title]") });
await newAsset.locator("input[name=title]").fill(`Case study ${TAG}`);
await newAsset.locator("textarea[name=body]").fill(`How a regulated fintech launched in 12 weeks.\n\nArchitecture, compliance and launch plan. ${TAG}`);
await submitIn(page, newAsset, "Save for review");
const asset = page.locator("article", { hasText: `Case study ${TAG}` });
await submitIn(page, asset, "Approve");
await page.goto("/admin/marketing/content?s=APPROVED");
const approvedAsset = page.locator("article", { hasText: `Case study ${TAG}` });
await approvedAsset.locator("input[name=path]").fill("/work/fintech");
await approvedAsset.locator("input[name=campaign]").fill(`cs-${TAG}`);
await submitIn(page, approvedAsset, /Repurpose/);
await page.goto("/admin/marketing/social?q=PENDING_APPROVAL");
ok((await page.locator("article", { hasText: `utm_campaign=cs-${TAG}` }).count()) >= 2, "repurposing created UTM-tagged post drafts for approval");

// 6. Prospect → replied → converted into (deduplicated) CRM lead.
await page.goto("/admin/marketing/prospects");
const add = page.locator("form", { has: page.locator("input[name=company]") });
await add.locator("input[name=company]").fill(`Prospect Co ${TAG}`);
await add.locator("input[name=email]").fill(`buyer.${TAG}@prospectco.com`);
await add.locator("input[name=contactName]").fill("Buyer Person");
await submitIn(page, add, "Add prospect");
const row = page.locator("tr", { hasText: `Prospect Co ${TAG}` });
await submitIn(page, row, "Replied");
await page.goto("/admin/marketing/prospects?s=REPLIED");
await Promise.all([page.waitForURL(/\/admin\/leads\//, { timeout: 20000 }), page.locator("tr", { hasText: `Prospect Co ${TAG}` }).getByRole("button", { name: "Convert to lead" }).click()]);
await settle(page);
ok(/\/admin\/leads\//.test(page.url()), "converted prospect opens the CRM lead");
ok(await seen(page.getByText("Growth qualification")), "lead page shows the growth qualification panel");

// 7. Email: sequence → enroll → negative reply suppresses.
await page.goto("/admin/marketing/email");
const seq = page.locator("form", { has: page.locator("textarea[name=steps]") });
await seq.locator("input[name=name]").fill(`Seq ${TAG}`);
await submitIn(page, seq, "Create sequence");
const seqItem = page.locator("li", { hasText: `Seq ${TAG}` });
await seqItem.locator("input[name=email]").fill(`reader.${TAG}@example.org`);
await submitIn(page, seqItem, "Enroll");
const reply = page.locator("form", { has: page.locator("textarea[name=text]") });
await reply.locator("input[name=email]").fill(`reader.${TAG}@example.org`);
await reply.locator("textarea[name=text]").fill("Not interested, please remove me");
await submitIn(page, reply, "Classify & stop sequence");
ok(await seen(page.getByText(`reader.${TAG}@example.org`).last()), "address appears on the suppression list");

// 8. UTM builder.
await page.goto(`/admin/marketing/demand?path=/services&channel=LINKEDIN&campaign=q4-${TAG}`);
ok(await seen(page.getByText(`utm_source=linkedin&utm_medium=social&utm_campaign=q4-${TAG}`)), "UTM builder produces a tagged link");
ok(errors.length === 0, `no page errors for super admin (${errors.join("; ")})`);

// 9. Reset autonomous mode for later runs.
await page.goto("/admin/marketing/autonomous");
await page.uncheck("input[name=autonomousMode]");
await submitIn(page, page.locator("form", { has: page.locator("input[name=autonomousMode]") }), "Save growth controls");

// 10. RBAC: sales manager can view but not control; content manager cannot see growth.
const sales = await login("qa-sales@shivacha.test");
await sales.page.goto("/admin/marketing/autonomous");
ok((await sales.page.getByRole("button", { name: "Stop" }).count()) === 0 && (await sales.page.locator("input[name=autonomousMode]").count()) === 0, "sales manager (growth:view) sees no controls");
await sales.page.goto("/admin/marketing/social");
ok((await sales.page.locator("textarea[name=body]").count()) === 0, "sales manager cannot draft posts");
const content = await login("qa-content@shivacha.test");
await content.page.goto("/admin/marketing/growth");
await settle(content.page);
ok(!(await seen(content.page.getByRole("heading", { name: "Growth dashboard" }), 3000)), `content manager cannot open the growth dashboard (landed on ${new URL(content.page.url()).pathname})`);
ok((await content.page.locator('a[href="/admin/marketing/growth"]').count()) === 0, "growth nav hidden from content manager");

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nAll growth e2e checks passed");
process.exit(failures ? 1 : 0);
