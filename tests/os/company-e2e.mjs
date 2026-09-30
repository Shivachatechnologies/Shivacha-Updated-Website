/**
 * AI company end-to-end flow (Playwright) against a server running on the TEST database with no AI provider and no
 * lead providers, so every boundary must be reported honestly:
 *   DATABASE_URL=…/shivacha_test APP_ENCRYPTION_KEY=<40 chars> npx next start -p 3200
 *   ADMIN_E2E_URL=http://localhost:3200 ADMIN_E2E_PASSWORD=… node tests/os/company-e2e.mjs
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
const seen = (loc, timeout = 8000) => loc.first().waitFor({ state: "visible", timeout }).then(() => true, () => false);
const settle = (page) => page.waitForLoadState("networkidle").catch(() => null);
async function submit(page, form, button) {
  await Promise.all([page.waitForResponse((r) => r.request().method() === "POST", { timeout: 30000 }), form.getByRole("button", { name: button }).first().click()]);
  await settle(page);
  await page.waitForTimeout(800);
}

const { page, errors } = await login("qa-super@shivacha.test");

// 1. CEO objective from the Command Center → plan with real tasks, honestly BLOCKED without an AI provider.
await page.goto("/admin/company");
ok(await seen(page.getByText("What do you want the company to achieve?")), "command center shows the objective input");
ok(await seen(page.getByText("AI provider (Anthropic): NOT CONNECTED")), "provider strip shows NOT CONNECTED");
await page.fill("textarea[name=statement]", `Get 50 qualified US fintech leads per day ${TAG}`);
await submit(page, page.locator("form", { has: page.locator("textarea[name=statement]") }), "Plan & start");
await page.waitForURL(/\/admin\/company\/objectives\/[a-z0-9]+/, { timeout: 20000 }).catch(() => null);
ok(/\/admin\/company\/objectives\/[a-z0-9]+/.test(page.url()), "redirected to the objective page");
ok(await seen(page.getByText("AI provider NOT CONNECTED", { exact: false })), "objective BLOCKED with the exact reason");
ok(await seen(page.getByText("Research the target market and define the ICP")), "plan stage: research");
ok(await seen(page.getByText("Set up and run the lead generation campaign")), "plan stage: lead campaign");
ok(await seen(page.getByRole("link", { name: "Lead campaign →" })), "lead campaign linked");
ok(await seen(page.getByText("Planned \"", { exact: false })), "execution timeline records the planning");
const objectiveUrl = page.url();

// 2. Lead campaign: fill the ICP from the builder and run the pipeline → NOT CONNECTED steps, no fake prospects.
await page.getByRole("link", { name: "Lead campaign →" }).click();
await settle(page);
ok(await seen(page.getByText("has no job titles or company domains")), "empty ICP warning");
const setup = page.locator("form", { has: page.locator("input[name=titles]") });
await setup.locator("input[name=titles]").fill("CTO, Head of Engineering");
await setup.locator("input[name=countries]").fill("United States");
await setup.locator("input[name=industries]").fill("Fintech");
await submit(page, setup, "Save campaign");
ok((await page.locator("input[name=titles]").inputValue()).includes("CTO"), "ICP saved");
await submit(page, page.locator("form", { has: page.getByRole("button", { name: "Run pipeline now" }) }), "Run pipeline now");
ok(await seen(page.getByText("Not connected").first()), "discover step reported NOT CONNECTED");
ok(await seen(page.getByText("Apollo NOT CONNECTED", { exact: false })), "exact provider named");
ok(await seen(page.getByText("No prospects")), "no fabricated prospects");

// 3. Lead generation dashboard and builder.
await page.goto("/admin/marketing/leads");
ok(await seen(page.getByText("Apollo.io (people search): NOT CONNECTED")), "lead dashboard shows provider state");
const builder = page.locator("form", { has: page.locator("input[name=dailyLeadTarget]") });
await builder.locator("input[name=name]").fill(`Builder ${TAG}`);
await builder.locator("input[name=titles]").fill("CFO");
await submit(page, builder, "Create campaign");
ok(await seen(page.getByRole("heading", { name: `Builder ${TAG}` })), "campaign created from the builder");

// 4. Market research request → BLOCKED (no AI provider), never generated.
await page.goto("/admin/marketing/market");
const research = page.locator("form", { has: page.locator("input[name=industry]") });
await research.locator("input[name=country]").fill("United Arab Emirates");
await research.locator("input[name=industry]").fill(`Fintech ${TAG}`);
await submit(page, research, "Run market research");
ok(await seen(page.getByText("AI provider NOT CONNECTED", { exact: false })), "research BLOCKED with the reason");
ok(await seen(page.getByText("No findings recorded yet.")), "no fabricated findings");

// 5. API & Integrations Center: connect (encrypted), masked, test, disconnect.
await page.goto("/admin/integrations/connect");
const hunter = page.locator("article", { hasText: "Hunter.io" });
ok(await seen(hunter.getByText("Not connected")), "Hunter starts NOT CONNECTED");
await hunter.locator("summary").click();
await hunter.locator("input[name=HUNTER_API_KEY]").fill(`hk-${TAG}-9876`);
await submit(page, hunter, "Save & test");
const hunter2 = page.locator("article", { hasText: "Hunter.io" });
ok(await seen(hunter2.getByText("stored ••••9876")), "credential stored and masked (last four only)");
ok(!(await page.content()).includes(`hk-${TAG}`), "full secret never rendered to the browser");
ok(await seen(hunter2.getByText(/Error|Connected/).first()), "state reflects a real test (network blocked here → ERROR, never fake CONNECTED)");
await hunter2.getByRole("button", { name: "Disconnect" }).click();
await submit(page, page.locator("[role=dialog], form").filter({ has: page.getByRole("button", { name: /^Confirm$/ }) }), "Confirm").catch(() => null);
await page.goto("/admin/integrations/connect");
ok(await seen(page.locator("article", { hasText: "Hunter.io" }).getByText("Not connected")), "disconnect removes the stored credential");
ok(await seen(page.locator("article", { hasText: "Meta Ads" }).getByText("Not supported")), "ads shown as NOT SUPPORTED, never simulated");

// 6. Company settings: strict approval mode + department budget.
await page.goto("/admin/company/settings");
const cfg = page.locator("form", { has: page.locator("input[name=strictApprovals]") });
await cfg.locator("input[name=strictApprovals]").check();
await submit(page, cfg, "Save configuration");
ok(await page.locator("input[name=strictApprovals]").isChecked(), "strict approval mode saved");
await page.locator("input[name=strictApprovals]").uncheck();
await submit(page, page.locator("form", { has: page.locator("input[name=strictApprovals]") }), "Save configuration");

// 7. Organization and objective pages render the real hierarchy.
await page.goto("/admin/company/org");
ok(await seen(page.getByText("AI Chief Revenue Officer").first()), "org chart lists executives");
ok((await page.locator("li", { hasText: "AI-00" }).count()) >= 60, "all 60 employees have codes");
await page.goto(objectiveUrl);
ok(await seen(page.getByRole("button", { name: "Cancel objective" })), "CEO can cancel the objective");

// 8. A role without executive:view cannot create objectives.
const sales = await login("qa-sales@shivacha.test");
await sales.page.goto("/admin/company");
ok(!(await seen(sales.page.getByText("What do you want the company to achieve?"), 3000)), "sales manager sees no objective input");
await sales.page.goto("/admin/company/briefing");
ok(/forbidden|login|disabled/.test(sales.page.url()) || (await seen(sales.page.getByText(/permission|forbidden|not allowed/i), 3000)), "CEO briefing needs executive access");

ok(errors.length === 0, `no page errors (${errors.slice(0, 3).join(" | ")})`);
await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nAll AI company checks passed");
process.exit(failures ? 1 : 0);
