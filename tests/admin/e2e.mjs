/**
 * Admin panel end-to-end test (Playwright). Runs against a server started with a TEST database:
 *
 *   DATABASE_URL=postgresql://…/shivacha_test npx next dev -p 3100
 *   ADMIN_E2E_URL=http://localhost:3100 ADMIN_E2E_PASSWORD=… node tests/admin/e2e.mjs
 *
 * Requires users qa-super@, qa-admin@, qa-sales@ and qa-content@shivacha.test (npm run admin:create)
 * sharing ADMIN_E2E_PASSWORD. Never point this at production: it creates and deletes content.
 */
import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const BASE = process.env.ADMIN_E2E_URL ?? "http://localhost:3100";
const PW = process.env.ADMIN_E2E_PASSWORD;
if (!PW) throw new Error("Set ADMIN_E2E_PASSWORD");
const RUN = Date.now().toString(36);
const results = [];
let failed = 0;
const check = (ok, name) => {
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failed++;
};

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/opt/pw-browsers/chromium" });
const ctxFor = () => browser.newContext({ viewport: { width: 1440, height: 900 }, baseURL: BASE });

async function login(page, email) {
  await page.goto("/admin/login");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", PW);
  await Promise.all([page.waitForURL(/\/admin\/dashboard/, { timeout: 30000 }), page.click("button[type=submit]")]);
}
const toast = async (page, text) => {
  try {
    await page.locator('[role=status]', { hasText: text }).first().waitFor({ timeout: 15000 });
    return true;
  } catch {
    return false;
  }
};

try {
  /* ───── auth ───── */
  const anon = await ctxFor();
  const ap = await anon.newPage();
  const r0 = await ap.goto("/admin/leads");
  check(ap.url().includes("/admin/login?next=%2Fadmin%2Fleads"), "unauthenticated /admin/leads redirects to login");
  check(r0.headers()["x-robots-tag"]?.includes("noindex") || (await ap.locator('meta[name=robots][content*=noindex]').count()) > 0, "admin pages are noindex");
  const probe = `nobody-${RUN}@shivacha.test`;
  await ap.fill("input[name=email]", probe);
  await ap.fill("input[name=password]", "wrong-password-123");
  await ap.click("button[type=submit]");
  check(await ap.locator("[role=alert]", { hasText: "Invalid email or password" }).waitFor({ timeout: 20000 }).then(() => true, () => false), "wrong password shows generic error");
  check((await ap.inputValue("input[name=email]")) === probe, "email is kept after a failed sign-in");
  for (let i = 0; i < 5; i++) {
    await ap.click("button[type=submit]");
    await ap.waitForTimeout(700);
  }
  check(await ap.locator("[role=alert]", { hasText: "Too many attempts" }).waitFor({ timeout: 20000 }).then(() => true, () => false), "brute-force throttle after 5 failures");
  const exp = await anon.request.get("/admin/leads/export", { maxRedirects: 0 });
  check([302, 307, 401].includes(exp.status()), `CSV export blocked without session (${exp.status()})`);

  /* ───── public lead form → CRM ───── */
  const leadEmail = `e2e-${RUN}@shivacha.com`;
  const lr = await anon.request.post("/api/lead", { headers: { origin: BASE, "content-type": "application/json" }, data: { type: "project", name: `E2E Lead ${RUN}`, email: leadEmail, company: "=HYPERLINK(\"x\")", country: "India", phone: "+91 98765 43210", service: "Crypto Exchange Development", budget: "$50K+", message: "Testing the CRM pipeline.", _t: String(Date.now() - 15000) } });
  check(lr.status() === 200, `public lead API accepted (${lr.status()})`);

  const sup = await ctxFor();
  const p = await sup.newPage();
  await login(p, "qa-super@shivacha.test");
  check(await p.locator("h1", { hasText: "Welcome" }).isVisible(), "super admin reaches dashboard");
  check(await p.locator("text=Total leads").isVisible(), "dashboard KPIs render");

  let t = Date.now();
  await p.goto("/admin/leads");
  const listMs = Date.now() - t;
  check((await p.locator("tbody tr").count()) === 25, `lead list paginates 25 rows (${listMs}ms incl. compile)`);
  t = Date.now();
  await p.goto("/admin/leads?status=QUALIFIED&country=India&sort=score&page=3");
  check((await p.locator("tbody tr").count()) > 0, `filtered + sorted + paged list works on 10k leads (${Date.now() - t}ms)`);
  await p.goto(`/admin/leads?q=${encodeURIComponent(leadEmail)}`);
  const row = p.locator("tbody tr a", { hasText: `E2E Lead ${RUN}` });
  check((await row.count()) === 1, "lead from the public form appears in the CRM");
  await row.click();
  await p.waitForURL(/\/admin\/leads\/c/);
  const leadUrl = p.url();
  check(await p.locator("text=Lead received from the website").isVisible(), "lead activity timeline shows creation");
  check(await p.locator("a[href^='https://wa.me/919876543210']").isVisible(), "WhatsApp action uses the lead's number");

  await p.selectOption("#f-status", "QUALIFIED");
  await p.selectOption("#f-priority", "URGENT");
  await p.fill("#f-estimatedValue", "75000");
  await p.click("button:has-text('Save changes')");
  check(await toast(p, "Lead updated"), "lead status/priority update");
  await p.reload();
  check(await p.getByText("New → Qualified").first().waitFor({ timeout: 10000 }).then(() => true, () => false), "status change recorded in timeline");
  await p.fill("#note-body", "Called — wants a demo next week.");
  await p.click("button:has-text('Add note')");
  check(await toast(p, "Note added"), "note added");
  const due = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  await p.fill("#fu-date", due);
  await p.fill("#fu-note", "Send proposal");
  await p.click("button:has-text('Schedule follow-up')");
  check(await toast(p, "Follow-up scheduled"), "follow-up scheduled");
  await p.goto("/admin/follow-ups");
  check(await p.locator("section", { hasText: "Overdue (" }).getByText(`E2E Lead ${RUN}`).first().waitFor({ timeout: 10000 }).then(() => true, () => false), "overdue follow-up listed");
  await p.goto(leadUrl);
  await p.selectOption("select[name=assignedToId]", { label: "QA Sales" });
  await p.click("button:has-text('Assign')");
  check(await toast(p, "Lead assigned"), "lead assigned");

  const csv = await sup.request.get(`/admin/leads/export?q=${encodeURIComponent(leadEmail)}`);
  const body = await csv.text();
  check(csv.status() === 200 && body.includes(leadEmail) && body.split("\r\n")[0].includes("ref,createdAt,name"), "CSV export with filters");
  check(body.includes(`"'=HYPERLINK(""x"")"`), "CSV neutralises spreadsheet formulas");

  await p.goto(`/admin/leads?q=${encodeURIComponent("Perf Lead 99")}`);
  await p.locator("input[name=ids]").first().check();
  await p.locator("input[name=ids]").nth(1).check();
  await p.selectOption("select[name=op]", "priority");
  await p.selectOption("select[name=value]", "HIGH");
  await p.click("button:has-text('Apply')");
  check(await toast(p, "2 leads updated"), "bulk priority update");

  /* ───── CMS → public site ───── */
  const svcSlug = `e2e-service-${RUN}`;
  await p.goto("/admin/services/new");
  await p.fill("#f-name", `E2E Service ${RUN}`);
  await p.fill("#f-slug", svcSlug);
  await p.selectOption("#f-division", "AI");
  await p.fill("#f-shortDescription", "A CMS-created service used by the end-to-end test.");
  await p.fill("#f-features", "Evaluation | Offline and online evaluation\nGuardrails | Policy enforcement");
  await p.fill("#f-faqs", "Is this a test? | Yes, created by the e2e suite.");
  await p.selectOption("#f-status", "PUBLISHED");
  await p.click("button:has-text('Create service')");
  await p.waitForURL(/\/admin\/services\/c/);
  check(await toast(p, "Service created"), "service created");
  const pub = await anon.newPage();
  const sres = await pub.goto(`/services/${svcSlug}`);
  check(sres.status() === 200 && (await pub.locator("h1", { hasText: `E2E Service ${RUN}` }).count()) > 0, "CMS-only service renders on the public site");
  check((await pub.locator("text=Is this a test?").count()) > 0, "service FAQs render publicly");

  // duplicate slug is rejected
  await p.goto("/admin/services/new");
  await p.fill("#f-name", "Dup");
  await p.fill("#f-slug", svcSlug);
  await p.click("button:has-text('Create service')");
  check(await toast(p, "slug is already in use"), "duplicate slug rejected");

  // override a built-in service (imported as draft) by publishing it with a new summary
  await p.goto("/admin/services?q=ai-agents");
  await p.locator("tbody a").first().click();
  await p.waitForURL(/\/admin\/services\/c/);
  const oldSummary = await p.inputValue("#f-shortDescription");
  await p.fill("#f-shortDescription", `Edited in the CMS ${RUN}.`);
  await p.selectOption("#f-status", "PUBLISHED");
  await p.click("button:has-text('Save changes')");
  check(await toast(p, "Service saved"), "built-in service edited in CMS");
  const slugText = await p.inputValue("#f-slug");
  await pub.goto(`/services/${slugText}`);
  check((await pub.locator(`text=Edited in the CMS ${RUN}.`).count()) > 0, "CMS edit shows on the existing public service page");
  await p.fill("#f-shortDescription", oldSummary);
  await p.selectOption("#f-status", "DRAFT");
  await p.click("button:has-text('Save changes')");
  await toast(p, "Service saved");

  // blog post publish + schedule
  const postSlug = `e2e-post-${RUN}`;
  await p.goto("/admin/blog/new");
  await p.fill("#f-title", `E2E Post ${RUN}`);
  await p.fill("#f-slug", postSlug);
  await p.fill("#f-excerpt", "An article written by the admin e2e suite.");
  await p.fill("#f-content", "## Why it matters\n\nFirst paragraph.\n\n- Point one\n- Point two");
  await p.selectOption("#f-category", "ai");
  await p.selectOption("#f-status", "PUBLISHED");
  await p.click("button:has-text('Create post')");
  await p.waitForURL(/\/admin\/blog\/c/);
  await pub.goto(`/insights/${postSlug}`);
  check((await pub.locator("h1", { hasText: `E2E Post ${RUN}` }).count()) > 0 && (await pub.locator("text=Point two").count()) > 0, "published blog post renders at /insights/<slug>");
  await pub.goto("/insights");
  check((await pub.locator(`text=E2E Post ${RUN}`).count()) > 0, "published post listed on /insights");
  const future = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16);
  await p.fill("#f-publishedAt", future);
  await p.click("button:has-text('Save changes')");
  await toast(p, "Post saved");
  const sched = await anon.request.get(`/insights/${postSlug}`);
  check(sched.status() === 404, `scheduled (future) post is not public yet (${sched.status()})`);

  // page builder
  const pageSlug = `e2e-page-${RUN}`;
  await p.goto("/admin/pages/new");
  await p.fill("#f-title", `E2E Page ${RUN}`);
  await p.fill("#f-slug", pageSlug);
  await p.selectOption("#f-status", "PUBLISHED");
  await p.click("button:has-text('Create page')");
  await p.waitForURL(/\/admin\/pages\/c/);
  await p.selectOption("select[aria-label='Section type']", "features");
  await p.click("button:has-text('Add section')");
  await p.locator("li", { hasText: "Feature grid" }).locator("input").first().fill("What you get");
  await p.locator("li", { hasText: "Feature grid" }).locator("textarea").nth(1).fill("Speed | Launch in weeks\nControl | Your code, your cloud");
  await p.selectOption("select[aria-label='Section type']", "text");
  await p.click("button:has-text('Add section')");
  await p.locator("li", { hasText: "Rich text" }).locator("input").first().fill("Hidden block");
  await p.click("button[aria-label='Hide section 2']");
  await p.click("button[aria-label='Duplicate section 1']");
  await p.click("button:has-text('Save sections')");
  check(await toast(p, "Sections saved"), "page sections saved (add, hide, duplicate)");
  await pub.goto(`/${pageSlug}`);
  check((await pub.locator("h2", { hasText: "What you get" }).count()) === 2 && (await pub.locator("text=Hidden block").count()) === 0, "CMS page renders sections; hidden section omitted");
  const reserved = await (async () => {
    await p.goto("/admin/pages/new");
    await p.fill("#f-title", "Services clash");
    await p.fill("#f-slug", "services");
    await p.click("button:has-text('Create page')");
    return toast(p, "check the highlighted fields");
  })();
  check(reserved, "page slug that clashes with a site route is rejected");

  // SEO override
  await p.goto("/admin/seo");
  const addForm = p.locator("section", { hasText: "Add override" });
  await addForm.locator("input[name=path]").fill(`/services/${svcSlug}`);
  await addForm.locator("input[name=title]").fill(`SEO Title ${RUN}`);
  await addForm.locator("input[name=noindex]").check();
  await addForm.locator("button:has-text('Add override')").click();
  check(await toast(p, "SEO override saved"), "SEO override saved");
  await pub.goto(`/services/${svcSlug}`);
  check((await pub.title()).includes(`SEO Title ${RUN}`), "SEO override title applied to public page");
  check((await pub.locator("meta[name=robots]").getAttribute("content"))?.includes("noindex"), "SEO noindex applied");
  const sm = await (await anon.request.get("/sitemap.xml")).text();
  check(sm.includes(`/insights/${postSlug}`) === false && !sm.includes(`/services/${svcSlug}<`) && sm.includes(`/${pageSlug}<`), "sitemap includes CMS pages, excludes noindex and scheduled URLs");

  // redirects
  await p.goto("/admin/redirects");
  const rf = p.locator("section", { hasText: "Add redirect" });
  await rf.locator("input[name=source]").fill(`/old-${RUN}`);
  await rf.locator("input[name=destination]").fill(`/services/${svcSlug}`);
  await rf.locator("button:has-text('Add redirect')").click();
  check(await toast(p, "Redirect saved"), "redirect saved");
  // Redirect rules are cached per server instance for up to 60 s.
  let rr;
  for (let i = 0; i < 15; i++) {
    rr = await anon.request.get(`/old-${RUN}`, { maxRedirects: 0 });
    if (rr.status() === 308) break;
    await new Promise((r) => setTimeout(r, 5000));
  }
  check(rr.status() === 308 && rr.headers().location?.endsWith(`/services/${svcSlug}`), `CMS redirect served (${rr.status()})`);
  await rf.locator("input[name=source]").fill("/admin/x");
  await rf.locator("input[name=destination]").fill("/");
  await rf.locator("button:has-text('Add redirect')").click();
  check(await toast(p, "cannot be redirected"), "redirects on admin paths refused");

  // navigation
  await p.goto("/admin/navigation");
  if (await p.locator("button:has-text('Import current footer')").count()) {
    await p.click("button:has-text('Import current footer')");
    await p.waitForURL(/toast|navigation/);
  }
  const nf = p.locator("section", { hasText: "Add column or link" });
  await nf.locator("input[name=label]").fill(`E2E Link ${RUN}`);
  await nf.locator("input[name=url]").fill(`/${pageSlug}`);
  await nf.locator("select[name=parentId]").selectOption({ index: 1 });
  await nf.locator("button:has-text('Add')").click();
  check(await toast(p, "Menu item added"), "menu item added");
  await pub.goto("/contact");
  check((await pub.locator(`footer a:has-text("E2E Link ${RUN}")`).count()) === 1, "CMS footer link appears on the public site");

  // settings announcement
  await p.goto("/admin/settings");
  await p.check("input[name=announcementEnabled]");
  await p.fill("#at", `Announcement ${RUN}`);
  await p.click("button:has-text('Save settings')");
  check(await toast(p, "Settings saved"), "settings saved");
  await pub.goto("/");
  check(await pub.locator(`text=Announcement ${RUN}`).waitFor({ timeout: 8000 }).then(() => true, () => false), "announcement shows on the public site");
  await p.uncheck("input[name=announcementEnabled]");
  await p.click("button:has-text('Save settings')");
  await toast(p, "Settings saved");

  // media upload
  const png = path.join(tmpdir(), `e2e-${RUN}.png`);
  writeFileSync(png, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==", "base64"));
  const svg = path.join(tmpdir(), `e2e-${RUN}.svg`);
  writeFileSync(svg, '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>');
  await p.goto("/admin/media");
  await p.setInputFiles("#files", png);
  await p.fill("#alt", "E2E pixel");
  await p.click("button:has-text('Upload')");
  check(await toast(p, "1 file uploaded"), "image upload (validated + processed)");
  await p.setInputFiles("#files", svg);
  await p.click("button:has-text('Upload')");
  check(await toast(p, "only JPG, PNG, WebP, AVIF, GIF and PDF"), "SVG upload rejected");

  // audit log
  await p.goto("/admin/audit-logs?action=lead.");
  check((await p.locator("tbody tr").count()) > 0, "audit log records lead actions");
  await p.goto("/admin/audit-logs?action=login");
  const auditText = await p.locator("tbody").first().innerText();
  check(auditText.includes("login") && !/Qa-Test-Passw0rd|passwordHash/.test(auditText), "audit log has sign-ins and no secrets");

  /* ───── RBAC ───── */
  const content = await ctxFor();
  const cp = await content.newPage();
  await login(cp, "qa-content@shivacha.test");
  const navText = await cp.locator("nav[aria-label=Admin]").first().innerText();
  check(!navText.includes("Leads") && navText.includes("Services") && !navText.includes("Users"), "content manager sidebar hides CRM and system");
  await cp.goto("/admin/leads");
  check(await cp.waitForURL(/\/admin\/forbidden/, { timeout: 15000 }).then(() => true, () => false), "content manager blocked from leads page");
  const ce = await content.request.get("/admin/leads/export");
  check(ce.status() === 403, `content manager blocked from CSV export (${ce.status()})`);
  await cp.goto("/admin/users");
  check(await cp.waitForURL(/\/admin\/forbidden/, { timeout: 15000 }).then(() => true, () => false), "content manager blocked from users");

  const sales = await ctxFor();
  const sp = await sales.newPage();
  await login(sp, "qa-sales@shivacha.test");
  await sp.goto("/admin/services");
  check(await sp.waitForURL(/\/admin\/forbidden/, { timeout: 15000 }).then(() => true, () => false), "sales manager blocked from CMS");
  await sp.goto(leadUrl);
  check(await sp.locator("button:has-text('Save changes')").waitFor({ timeout: 15000 }).then(() => true, () => false), "sales manager can edit leads");

  const adm = await ctxFor();
  const dp = await adm.newPage();
  await login(dp, "qa-admin@shivacha.test");
  await dp.goto("/admin/users/new");
  const roles = await dp.locator("#u-role option").allInnerTexts();
  check(!roles.some((r) => r.includes("Super Admin")), "admin cannot grant the Super Admin role (UI)");
  await dp.goto("/admin/users");
  await dp.locator("tbody a", { hasText: "QA Super" }).click();
  check(await dp.locator("text=Only a Super Admin can edit a Super Admin account").waitFor({ timeout: 15000 }).then(() => true, () => false), "admin cannot edit a Super Admin");

  // user management by super admin: create, disable → sessions end
  await p.goto("/admin/users/new");
  await p.fill("#u-name", `Temp ${RUN}`);
  await p.fill("#u-email", `temp-${RUN}@shivacha.test`);
  await p.selectOption("#u-role", "SEO_MANAGER");
  await p.fill("#u-pw", "short");
  await p.click("button:has-text('Create user')");
  check(await toast(p, "at least 12"), "weak password rejected on user creation");
  await p.waitForTimeout(500);
  await p.fill("#u-pw", PW);
  await p.click("button:has-text('Create user')");
  check(await toast(p, "can now sign in"), "super admin creates a user");
  await p.goto("/admin/users");
  const seo = await ctxFor();
  const so = await seo.newPage();
  await login(so, `temp-${RUN}@shivacha.test`);
  await p.locator("tbody a", { hasText: `Temp ${RUN}` }).click();
  await p.waitForURL(/\/admin\/users\/c/);
  await p.uncheck("input[name=active]");
  await p.click("button:has-text('Save user')");
  check(await toast(p, "User saved"), "user disabled");
  await so.goto("/admin/seo");
  check(await so.waitForURL(/\/admin\/login/, { timeout: 15000 }).then(() => true, () => false), "disabled user's session is revoked immediately");

  /* ───── logout ───── */
  await p.click("button[aria-label='Sign out']");
  await p.waitForURL(/\/admin\/login/);
  check(!(await sup.cookies()).some((c) => c.name.includes("shv_admin") && c.value), "logout clears the session cookie");
  await p.goto("/admin/dashboard");
  check(await p.waitForURL(/\/admin\/login/, { timeout: 15000 }).then(() => true, () => false), "logout ends the session");
} catch (e) {
  check(false, `unexpected error: ${e.message.split("\n")[0]}`);
} finally {
  await browser.close();
}
console.log(results.join("\n"));
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exitCode = failed ? 1 : 0;
