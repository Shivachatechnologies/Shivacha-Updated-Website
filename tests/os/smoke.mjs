/**
 * Shivacha OS route smoke test (Playwright). Signs in and loads every admin route, failing on HTTP errors,
 * Next.js error overlays, error boundaries or console errors. Run against a TEST database only:
 *
 *   DATABASE_URL=postgresql://…/shivacha_test npx next dev -p 3100
 *   ADMIN_E2E_URL=http://localhost:3100 ADMIN_E2E_PASSWORD=… node tests/os/smoke.mjs
 */
import { chromium } from "playwright-core";

const BASE = process.env.ADMIN_E2E_URL ?? "http://localhost:3100";
const PW = process.env.ADMIN_E2E_PASSWORD;
const EMAIL = process.env.ADMIN_E2E_EMAIL ?? "qa-super@shivacha.test";
if (!PW) throw new Error("Set ADMIN_E2E_PASSWORD");
const ROUTES = (process.env.SMOKE_ROUTES ?? "").split(",").filter(Boolean);
const DEFAULT = [
  "/admin/dashboard", "/admin/executive", "/admin/notifications", "/admin/notifications?view=settings",
  "/admin/leads", "/admin/leads/new", "/admin/crm/pipeline", "/admin/crm/activities", "/admin/crm/duplicates", "/admin/crm/import", "/admin/follow-ups",
  "/admin/deals", "/admin/deals?view=board", "/admin/deals/new", "/admin/proposals", "/admin/proposals/new", "/admin/quotes", "/admin/quotes/new", "/admin/contracts", "/admin/contracts/new",
  "/admin/clients", "/admin/clients/new", "/admin/contacts", "/admin/documents", "/admin/portal-users",
  "/admin/projects", "/admin/projects/new", "/admin/tasks", "/admin/tasks?view=board", "/admin/milestones", "/admin/issues", "/admin/change-requests",
  "/admin/finance", "/admin/finance/invoices", "/admin/finance/invoices/new", "/admin/finance/payments", "/admin/finance/payments/new", "/admin/finance/credit-notes", "/admin/finance/expenses",
  "/admin/marketing", "/admin/marketing/campaigns", "/admin/marketing/campaigns/new", "/admin/marketing/landing-pages",
  "/admin/communication", "/admin/communication/email", "/admin/communication/whatsapp", "/admin/communication/calls", "/admin/communication/meetings",
  "/admin/support", "/admin/support/new", "/admin/knowledge", "/admin/knowledge/new",
  "/admin/ai", "/admin/ai/agents", "/admin/ai/approvals", "/admin/ai/tasks", "/admin/ai/insights", "/admin/ai/costs", "/admin/ai/logs",
  "/admin/automations", "/admin/automations/new", "/admin/automations/runs", "/admin/automations/failures",
  "/admin/reports", "/admin/performance", "/admin/integrations", "/admin/security", "/admin/system",
  "/admin/settings", "/admin/settings/features", "/admin/users", "/admin/audit-logs",
  "/admin/services", "/admin/products", "/admin/pages", "/admin/blog", "/admin/case-studies", "/admin/industries", "/admin/technologies", "/admin/faqs", "/admin/media", "/admin/navigation", "/admin/seo", "/admin/redirects",
];

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, baseURL: BASE });
const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => { if (m.type() === "error" && !/eval\(\) is not supported|favicon|Download the React DevTools|\[HMR\]|webpack-hmr|_next\/static/.test(m.text())) errors.push(m.text().slice(0, 300)); });
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 300)}`));

await page.goto("/admin/login");
await page.fill("input[name=email]", EMAIL);
await page.fill("input[name=password]", PW);
await Promise.all([page.waitForURL(/\/admin\/(dashboard|login\/verify)/, { timeout: 60000 }), page.click("button[type=submit]")]);

let failed = 0;
for (const r of ROUTES.length ? ROUTES : DEFAULT) {
  errors.length = 0;
  const t = Date.now();
  let status = 0;
  try {
    const res = await page.goto(r, { waitUntil: "load", timeout: 120000 });
    status = res?.status() ?? 0;
    await page.waitForTimeout(250);
  } catch (e) {
    errors.push(`navigation: ${e.message.split("\n")[0]}`);
  }
  const overlay = await page.locator("nextjs-portal, [data-nextjs-dialog], text=Unhandled Runtime Error, text=Application error").count().catch(() => 0);
  const boundary = await page.locator("text=Something went wrong").count().catch(() => 0);
  const hOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1).catch(() => false);
  const url = page.url().replace(BASE, "");
  const ok = status > 0 && status < 400 && !overlay && !boundary && errors.length === 0 && !url.includes("/forbidden") && !url.includes("/login");
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${String(status).padEnd(3)} ${String(Date.now() - t).padStart(5)}ms  ${r}${url !== r ? ` → ${url}` : ""}${hOverflow ? "  [h-overflow]" : ""}${overlay ? "  [error overlay]" : ""}${boundary ? "  [error boundary]" : ""}${errors.length ? `\n      ${errors.join("\n      ")}` : ""}`);
}
await browser.close();
console.log(`\n${failed ? `${failed} route(s) failed` : "All routes passed"}`);
process.exitCode = failed ? 1 : 0;
