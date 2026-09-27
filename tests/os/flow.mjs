/**
 * Shivacha OS business-flow end-to-end test (Playwright) — TEST database only.
 * Lead → deal → proposal (review, approve, send) → client accepts via secret link → deal won → client + project →
 * contract → signed copy → invoice → payment (pending → confirmed) → portal isolation → support → AI approvals.
 *
 *   ADMIN_E2E_URL=http://localhost:3100 ADMIN_E2E_PASSWORD=… node tests/os/flow.mjs [section…]
 */
import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const BASE = process.env.ADMIN_E2E_URL ?? "http://localhost:3100";
const PW = process.env.ADMIN_E2E_PASSWORD;
if (!PW) throw new Error("Set ADMIN_E2E_PASSWORD");
const RUN = Date.now().toString(36);
const only = process.argv.slice(2);
const results = [];
let failed = 0;
const check = (ok, name) => {
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
};
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/opt/pw-browsers/chromium" });
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
const ctxFor = () => browser.newContext({ viewport: { width: 1440, height: 900 }, baseURL: BASE, userAgent: UA });
async function login(page, email) {
  await page.goto("/admin/login");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", PW);
  await Promise.all([page.waitForURL(/\/admin\/dashboard/, { timeout: 60000 }), page.click("button[type=submit]")]);
}
const toast = async (page, text) => page.locator("[role=status]", { hasText: text }).first().waitFor({ timeout: 20000 }).then(() => true, () => false);
const state = {};

try {
  const sup = await ctxFor();
  const p = await sup.newPage();
  await login(p, "qa-super@shivacha.test");

  if (!only.length || only.includes("sales")) {
    /* ───── CRM: manual lead ───── */
    await p.goto("/admin/leads/new");
    await p.fill("#f-name", `Flow Lead ${RUN}`);
    await p.fill("#f-email", `flow-${RUN}@acme-flow.com`);
    await p.fill("#f-company", `Acme ${RUN}`);
    await p.fill("#f-country", "United Arab Emirates");
    await p.fill("#f-service", "Crypto Exchange Development");
    await p.fill("#f-estimatedValue", "48000");
    await p.fill("#f-tags", "fintech, enterprise");
    await p.click("button:has-text('Create lead')");
    await p.waitForURL(/\/admin\/leads\/c/, { timeout: 30000 });
    state.leadUrl = p.url();
    check(await p.locator("a[href='/admin/leads?tag=fintech']").first().waitFor({ timeout: 15000 }).then(() => true, () => false), "manual lead created with tags");

    /* ───── lead → deal ───── */
    await p.fill("input[aria-label='Deal name']", `Acme ${RUN} exchange`);
    await p.click("button:has-text('Convert to deal')");
    await p.waitForURL(/\/admin\/deals\/c/, { timeout: 30000 });
    state.dealUrl = p.url();
    check(await p.locator("h1", { hasText: `Acme ${RUN} exchange` }).waitFor({ timeout: 20000 }).then(() => true, () => false), "lead converted to a deal");
    check((await p.locator("text=$48,000.00").count()) > 0, "deal value carried from lead (Decimal)");

    /* ───── proposal from deal ───── */
    await p.locator("section", { hasText: "Proposals" }).getByRole("link", { name: "New" }).click();
    await p.waitForURL(/\/admin\/proposals\/new/);
    await p.click("button:has-text('Create draft')");
    await p.waitForURL(/\/admin\/proposals\/c/, { timeout: 30000 });
    state.proposalUrl = p.url();
    check(Number(await p.inputValue("input[aria-label='Line 1 unit price']")) === 48000, "proposal priced from the real deal value");
    await p.fill("#f-scope", "Design, build and launch a spot exchange.");
    await p.fill("input[aria-label='Line 1 discount']", "10");
    await p.fill("input[aria-label='Line 1 tax']", "5");
    await p.click("button:has-text('Save draft')");
    check(await toast(p, "Proposal saved"), "proposal draft saved");
    await p.reload();
    check((await p.locator("text=$45,360.00").count()) > 0, "server-side Decimal totals (48000 −10% +5% tax = 45,360.00)");
    await p.click("button:has-text('Submit for internal review')");
    check(await toast(p, "Submitted for review"), "submitted for internal review");
    await p.click("button:has-text('Approve')");
    check(await toast(p, "approved"), "proposal approved");
    await p.uncheck("input[name=sendEmail]");
    await p.click("button:has-text('Send proposal')");
    const linkInput = p.locator("input[aria-label='Share link']");
    await linkInput.waitFor({ timeout: 20000 });
    const link = await linkInput.inputValue();
    check(/\/p\/[\w-]{40,}$/.test(link), "secure share link generated");

    /* ───── client views + accepts ───── */
    const anon = await ctxFor();
    const cp = await anon.newPage();
    const shareRes = await cp.goto(link.replace(/^https?:\/\/[^/]+/, ""));
    check(shareRes.status() === 200 && (await cp.locator("h1", { hasText: "Proposal" }).count()) > 0, "client can open the proposal link");
    check((shareRes.headers()["x-robots-tag"] ?? "").includes("noindex"), "share link is noindex");
    await cp.fill("input[name=name]", "Jane Client");
    await cp.check("input[name=confirm]");
    await cp.click("button:has-text('Accept proposal')");
    check(await cp.locator("text=Accepted by Jane Client").or(cp.locator("text=has been accepted")).first().waitFor({ timeout: 20000 }).then(() => true, () => false), "client accepts online");
    const bad = await anon.request.get("/p/this-is-not-a-real-token-but-long-enough-xxxxxxxx");
    check(bad.status() === 404, "unknown share token returns 404");

    await p.goto(state.proposalUrl);
    check(await p.locator("text=Jane Client").first().waitFor({ timeout: 15000 }).then(() => true, () => false), "acceptance recorded on the proposal");
    check((await p.locator("text=Opened by the client").count()) > 0, "view tracked");
    const pdf = await sup.request.get(`${state.proposalUrl}/pdf`);
    check(pdf.status() === 200 && pdf.headers()["content-type"] === "application/pdf" && (await pdf.body()).subarray(0, 5).toString() === "%PDF-", "proposal PDF generated");

    /* ───── deal won → client + project (transaction) ───── */
    await p.goto(state.dealUrl);
    check((await p.locator("ol[aria-label='Deal stage'] li.font-semibold", { hasText: "Negotiation" }).count()) === 1, "acceptance moved the deal to negotiation");
    await p.click("button:has-text('Mark as won')");
    check(await toast(p, "client created"), "deal won creates client + project");
    await p.reload();
    const clientLink = p.locator("dd a[href^='/admin/clients/']").first();
    state.clientUrl = await clientLink.getAttribute("href");
    check(!!state.clientUrl, "deal linked to its new client");
    await p.goto(state.clientUrl);
    check(await p.locator("section", { hasText: "Contacts" }).getByText(`Flow Lead ${RUN}`).first().waitFor({ timeout: 15000 }).then(() => true, () => false), "client has the lead as primary contact");
    await p.goto(`${state.clientUrl}?tab=delivery`);
    check((await p.locator("a[href^='/admin/projects/']").count()) >= 1, "project created from won deal");

    /* ───── contract from accepted proposal ───── */
    await p.goto(state.proposalUrl);
    await p.click("a:has-text('Create contract')");
    await p.waitForURL(/\/admin\/contracts\/new/);
    await p.click("button:has-text('Create contract')");
    await p.waitForURL(/\/admin\/contracts\/c/, { timeout: 30000 });
    state.contractUrl = p.url();
    await p.click("button:has-text('Mark sent for signature')");
    check(await toast(p, "marked sent"), "contract sent for signature");
    await p.reload();
    check((await p.locator("text=Integration not connected").count()) > 0, "e-signature shows Not Connected (no fake signing)");
    await p.click("button:has-text('Record signature')");
    check(await toast(p, "check the highlighted fields") || await toast(p, "Choose the signed document") || await toast(p, "Upload the countersigned"), "signature without evidence is refused");
    const pdfFile = path.join(tmpdir(), `signed-${RUN}.pdf`);
    writeFileSync(pdfFile, "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
    await p.setInputFiles("input[name=files]", pdfFile);
    await p.locator("section", { hasText: "Documents" }).locator("button:has-text('Upload')").click();
    check(await toast(p, "1 file uploaded"), "countersigned PDF uploaded (content-sniffed)");
    await p.reload();
    await p.fill("input[name=signerName]", "Jane Client");
    await p.fill("input[name=signerEmail]", "jane@acme-flow.com");
    await p.selectOption("select[name=documentId]", { index: 1 });
    await p.click("button:has-text('Record signature')");
    check(await toast(p, "Signature recorded"), "signature recorded with evidence");
    const dl = await sup.request.get((await p.locator("a[href*='/download']").first().getAttribute("href")));
    check(dl.status() === 200 && dl.headers()["content-type"] === "application/pdf", "authenticated document download");
    const anonDl = await (await ctxFor()).request.get((await p.locator("a[href*='/download']").first().getAttribute("href")), { maxRedirects: 0 });
    check([302, 307, 401].includes(anonDl.status()), `document download blocked without session (${anonDl.status()})`);
  }

  if (!only.length || only.includes("portal")) {
    const fs = await import("node:fs");
    Object.assign(state, JSON.parse(fs.readFileSync(path.join(tmpdir(), "shivacha-flow-state.json"), "utf8")), state);
    /* ───── client B with a client-visible document (must never leak to client A) ───── */
    await p.goto("/admin/clients/new");
    await p.fill("#f-name", `Other Corp ${RUN}`);
    await p.click("button:has-text('Create client')");
    await p.waitForURL(/\/admin\/clients\/c/, { timeout: 30000 });
    state.clientB = p.url().replace(BASE, "").split("?")[0];
    const secret = path.join(tmpdir(), `secret-${RUN}.pdf`);
    writeFileSync(secret, "%PDF-1.4\n% client B confidential\n%%EOF\n");
    await p.goto(`${state.clientB}?tab=documents`);
    await p.setInputFiles("input[name=files]", secret);
    await p.selectOption("select[name=visibility]", "CLIENT");
    await p.click("button:has-text('Upload')");
    check(await toast(p, "1 file uploaded"), "client B document uploaded (client-visible)");
    await p.reload();
    state.docB = (await p.locator("a[href*='/download']").first().getAttribute("href")).split("/")[3];

    /* ───── client A: one internal + one shared document ───── */
    await p.goto(`${state.clientUrl}?tab=documents`);
    const internal = path.join(tmpdir(), `internal-${RUN}.pdf`);
    writeFileSync(internal, "%PDF-1.4\n% internal only\n%%EOF\n");
    await p.setInputFiles("input[name=files]", internal);
    await p.selectOption("select[name=visibility]", "INTERNAL");
    await p.click("button:has-text('Upload')");
    await toast(p, "1 file uploaded");
    await p.reload();
    state.docAInternal = (await p.locator("a[href*='/download']").first().getAttribute("href")).split("/")[3];

    /* ───── invite + set password ───── */
    await p.goto("/admin/portal-users");
    await p.selectOption("select[name=clientId]", { value: state.clientUrl.split("/").pop() });
    await p.fill("input[name=name]", "Jane Portal");
    await p.fill("input[name=email]", `jane-${RUN}@acme-flow.com`);
    await p.click("button:has-text('Send invitation')");
    const inv = p.locator("input[aria-label='Share link']");
    await inv.waitFor({ timeout: 20000 });
    const invite = (await inv.inputValue()).replace(/^https?:\/\/[^/]+/, "");
    check(invite.startsWith("/client/set-password?token="), "portal invitation link issued");

    const portal = await ctxFor();
    const cp = await portal.newPage();
    await cp.goto("/client/dashboard");
    check(cp.url().includes("/client/login"), "portal requires sign-in");
    await cp.goto(invite);
    await cp.fill("#password", "alllowercaseonly");
    await cp.fill("#confirm", "alllowercaseonly");
    await cp.click("button:has-text('Set password')");
    check(await cp.locator("[role=alert]", { hasText: "mix" }).waitFor({ timeout: 15000 }).then(() => true, () => false), "portal password policy enforced server-side");
    await cp.fill("#password", PW);
    await cp.fill("#confirm", PW);
    await cp.click("button:has-text('Set password')");
    check(await cp.locator("text=Password set").waitFor({ timeout: 15000 }).then(() => true, () => false), "portal password set from invitation");
    const reuse = await (await ctxFor()).newPage();
    await reuse.goto(invite);
    await reuse.fill("#password", PW);
    await reuse.fill("#confirm", PW);
    await reuse.click("button:has-text('Set password')");
    check(await reuse.locator("[role=alert]", { hasText: "invalid or has expired" }).waitFor({ timeout: 15000 }).then(() => true, () => false), "invitation link is single-use");

    await cp.goto("/client/login");
    await cp.fill("#email", `jane-${RUN}@acme-flow.com`);
    await cp.fill("#password", PW);
    await Promise.all([cp.waitForURL(/\/client\/dashboard/, { timeout: 30000 }), cp.click("button:has-text('Sign in')")]);
    check(await cp.locator("text=Welcome, Jane").isVisible(), "portal user signs in");
    await cp.goto("/admin/dashboard");
    check(cp.url().includes("/admin/login"), "portal session grants no admin access");

    /* ───── isolation ───── */
    const r1 = await portal.request.get(`/client/documents/${state.docB}/download`);
    check(r1.status() === 404, `client A cannot download client B's document (${r1.status()})`);
    const r2 = await portal.request.get(`/client/documents/${state.docAInternal}/download`);
    check(r2.status() === 404, `client A cannot download its own INTERNAL document (${r2.status()})`);
    await cp.goto("/client/documents");
    check((await cp.locator(`text=secret-${RUN}.pdf`).count()) === 0 && (await cp.locator(`text=internal-${RUN}.pdf`).count()) === 0, "document list shows neither B's nor internal files");
    await cp.goto("/client/proposals");
    check((await cp.locator("tbody tr").count()) >= 1, "client A sees its own sent proposal");
    const propId = state.proposalUrl.split("/").pop();
    const r3 = await portal.request.get(`/client/proposals/${propId}/pdf`);
    check(r3.status() === 200, "client A downloads its own proposal PDF");
    const other = await ctxFor();
    const r4 = await other.request.get(`/client/proposals/${propId}/pdf`, { maxRedirects: 0 });
    check([307, 401].includes(r4.status()), `proposal PDF needs a portal session (${r4.status()})`);

    /* ───── ticket + message ───── */
    await cp.goto("/client/support/new");
    await cp.fill("#subject", `Login issue ${RUN}`);
    await cp.fill("#description", "Users cannot log in to the admin dashboard since this morning.");
    await cp.selectOption("#priority", "HIGH");
    await cp.click("button:has-text('Create ticket')");
    await cp.waitForURL(/\/client\/support\/c/, { timeout: 30000 });
    state.portalTicket = cp.url().split("/").pop();
    check(await cp.locator("h1", { hasText: `Login issue ${RUN}` }).waitFor({ timeout: 15000 }).then(() => true, () => false), "client creates a support ticket");
    await cp.fill("textarea[name=body]", "Adding: it affects all users.");
    await cp.click("button:has-text('Send reply')");
    check(await cp.locator("text=Reply sent").waitFor({ timeout: 15000 }).then(() => true, () => false), "client replies on the ticket");
    await cp.goto("/client/messages");
    await cp.fill("textarea[name=body]", `Hello team ${RUN}`);
    await cp.click("button:has-text('Send')");
    check(await cp.locator("text=Message sent").waitFor({ timeout: 15000 }).then(() => true, () => false), "client messages the account team");
    await p.goto(`${state.clientUrl}?tab=messages`);
    check((await p.locator(`text=Hello team ${RUN}`).count()) === 1, "staff sees the portal message");
    await p.fill("textarea[name=body]", "Thanks — we are on it.");
    await p.click("button:has-text('Post to portal')");
    await toast(p, "Message posted");
    await p.locator("text=we are on it").first().waitFor({ timeout: 15000 }).catch(() => {});
    await cp.reload();
    check(await cp.locator("text=we are on it").first().waitFor({ timeout: 15000 }).then(() => true, () => false), "staff reply appears in the portal");

    /* ───── disabling revokes sessions ───── */
    await p.goto(`/admin/portal-users?q=jane-${RUN}`);
    await p.click("button:has-text('Disable')");
    await p.locator("button:has-text('Enable')").waitFor({ timeout: 20000 });
    await cp.goto("/client/dashboard");
    check(await cp.waitForURL(/\/client\/login/, { timeout: 15000 }).then(() => true, () => false), "disabling a portal user ends their session immediately");
  }

  if (!only.length || only.includes("ops")) {
    const fs = await import("node:fs");
    Object.assign(state, JSON.parse(fs.readFileSync(path.join(tmpdir(), "shivacha-flow-state.json"), "utf8")), state);
    const clientId = state.clientUrl.split("/").pop();
    /* ───── projects ───── */
    await p.goto(`${state.clientUrl}?tab=delivery`);
    await p.locator("main a[href^='/admin/projects/c']").first().click();
    await p.waitForURL(/\/admin\/projects\/c/);
    state.projectUrl = p.url().split("?")[0];
    await p.goto(`${state.projectUrl}?tab=tasks`);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    await p.fill("input[aria-label='Task title']", `Build matching engine ${RUN}`);
    await p.fill("input[aria-label='Due date']", yesterday);
    await p.click("button:has-text('Add task')");
    check(await toast(p, "Task added"), "task added to project");
    await p.fill("input[aria-label='Task title']", `Write API docs ${RUN}`);
    await p.click("button:has-text('Add task')");
    await toast(p, "Task added");
    await p.goto(`${state.projectUrl}?tab=tasks&view=board`);
    check((await p.locator("text=Overdue tasks").locator("..").locator("text=1").count()) >= 1, "overdue task detected");
    await p.locator(`select[aria-label='Move Build matching engine ${RUN}']`).selectOption("DONE");
    check(await toast(p, "Moved to Done"), "task moved on the board");
    await p.goto(state.projectUrl);
    check(await p.locator("text=50%").first().waitFor({ timeout: 15000 }).then(() => true, () => false), "project progress recalculated from tasks (1/2 = 50%)");
    await p.goto(`${state.projectUrl}?tab=milestones`);
    await p.fill("input[aria-label='Milestone name']", `Beta launch ${RUN}`);
    await p.click("button:has-text('Add milestone')");
    check(await toast(p, "Milestone added"), "milestone added");
    await p.goto(`${state.projectUrl}?tab=updates`);
    await p.fill("textarea[aria-label='Update']", `Sprint 1 complete ${RUN}`);
    await p.selectOption("select[aria-label='Visibility']", "CLIENT");
    await p.click("button:has-text('Post update')");
    check(await toast(p, "published to the client portal"), "client-visible project update posted");
    await p.goto(`${state.projectUrl}?tab=timeline`);
    check((await p.locator("text=Red line = today").count()) === 1, "timeline renders");

    /* ───── invoice → pending payment → confirm → refund ───── */
    await p.goto(`/admin/finance/invoices/new?clientId=${clientId}`);
    await p.click("button:has-text('Create draft invoice')");
    await p.waitForURL(/\/admin\/finance\/invoices\/c/, { timeout: 30000 });
    state.invoiceUrl = p.url();
    await p.fill("input[aria-label='Line 1 name']", "Development sprint");
    await p.fill("input[aria-label='Line 1 quantity']", "2");
    await p.fill("input[aria-label='Line 1 unit price']", "1500");
    await p.fill("input[aria-label='Line 1 tax']", "10");
    await p.click("button:has-text('Save draft')");
    check(await toast(p, "Invoice saved"), "invoice draft saved");
    await p.reload();
    await p.click("button:has-text('Issue invoice')");
    check(await toast(p, "Invoice issued"), "invoice issued");
    check((await p.locator("dd", { hasText: "$3,300.00" }).count()) >= 1, "invoice total 2×1500 +10% = 3,300.00");
    await p.click("a:has-text('Record payment')");
    await p.waitForURL(/payments\/new/);
    await p.click("button:has-text('Record pending payment')");
    await p.waitForURL(/\/admin\/finance\/payments\/c/, { timeout: 30000 });
    state.paymentUrl = p.url();
    await p.goto(state.invoiceUrl);
    check((await p.locator("text=Balance due").locator("..").locator("text=$3,300.00").count()) >= 1, "pending payment does NOT reduce the balance");
    await p.goto(state.paymentUrl);
    await p.fill("input[name=evidence]", "HSBC statement 12 Sep, ref 998877");
    await p.click("button:has-text('Confirm payment')");
    check(await toast(p, "Payment confirmed"), "finance confirms the payment with evidence");
    await p.goto(state.invoiceUrl);
    check(await p.locator("header, div").locator("text=Paid").first().waitFor({ timeout: 10000 }).then(() => true, () => false) && (await p.locator("text=Balance due").locator("..").locator("text=$0.00").count()) >= 1, "confirmed payment marks the invoice paid");
    await p.goto(state.paymentUrl);
    await p.fill("input[aria-label='Refund amount']", "300");
    await p.fill("input[aria-label='Refund reason']", "Goodwill credit");
    await p.click("button:has-text('Request refund')");
    check(await toast(p, "Refund requested"), "manual refund requested");
    await p.goto(state.invoiceUrl);
    check((await p.locator("text=Balance due").locator("..").locator("text=$0.00").count()) >= 1, "requested (not completed) refund does not change the balance");
    await p.goto(state.paymentUrl);
    await p.fill("input[aria-label='Refund reference']", "HSBC OUT 1234");
    await p.click("button:has-text('Mark completed')");
    check(await toast(p, "Refund marked completed"), "refund completed with reference");
    await p.goto(state.invoiceUrl);
    check((await p.locator("text=Balance due").locator("..").locator("text=$300.00").count()) >= 1, "completed refund reopens $300 on the invoice");
    const pdf = await sup.request.get(`${state.invoiceUrl}/pdf`);
    check(pdf.status() === 200 && (await pdf.body()).subarray(0, 5).toString() === "%PDF-", "invoice PDF generated");
    await p.goto("/admin/finance?range=all");
    const collected = await p.locator("p", { hasText: /^Collected$/ }).locator("xpath=following-sibling::p[1]").innerText();
    check(/\$\d/.test(collected) && collected !== "$0", `revenue dashboard shows confirmed collections net of refunds (${collected})`);

    /* ───── webhooks refuse unconfigured / unsigned requests ───── */
    const wh = await (await ctxFor()).request.post("/api/webhooks/stripe", { data: "{}", headers: { "content-type": "application/json" } });
    check(wh.status() === 503 || wh.status() === 400, `Stripe webhook without configuration/signature is refused (${wh.status()})`);

    /* ───── support: staff reply vs internal note ───── */
    await p.goto(`/admin/support/${state.portalTicket}`);
    await p.fill("textarea[aria-label='Reply']", `We have restored logins ${RUN}.`);
    await p.click("button:has-text('Send')");
    check(await toast(p, "Reply posted"), "staff replies to the portal ticket");
    await p.fill("textarea[aria-label='Reply']", `INTERNAL root cause: expired cert ${RUN}`);
    await p.check("input[name=internal]");
    await p.click("button:has-text('Send')");
    check(await toast(p, "Internal note added"), "internal note added");

    /* ───── a second portal user sees delivery + finance, never internal notes ───── */
    await p.goto("/admin/portal-users");
    await p.selectOption("select[name=clientId]", { value: clientId });
    await p.fill("input[name=name]", "Raj Portal");
    await p.fill("input[name=email]", `raj-${RUN}@acme-flow.com`);
    await p.click("button:has-text('Send invitation')");
    const inv = p.locator("input[aria-label='Share link']");
    await inv.waitFor({ timeout: 20000 });
    const invite = (await inv.inputValue()).replace(/^https?:\/\/[^/]+/, "");
    const portal = await ctxFor();
    const cp = await portal.newPage();
    await cp.goto(invite);
    await cp.fill("#password", PW);
    await cp.fill("#confirm", PW);
    await cp.click("button:has-text('Set password')");
    await cp.locator("text=Password set").waitFor({ timeout: 15000 });
    await cp.goto("/client/login");
    await cp.fill("#email", `raj-${RUN}@acme-flow.com`);
    await cp.fill("#password", PW);
    await Promise.all([cp.waitForURL(/\/client\/dashboard/, { timeout: 30000 }), cp.click("button:has-text('Sign in')")]);
    await cp.goto(`/client/projects/${state.projectUrl.split("/").pop()}`);
    check((await cp.locator(`text=Sprint 1 complete ${RUN}`).count()) === 1 && (await cp.locator(`text=Beta launch ${RUN}`).count()) === 1, "portal shows client-visible update and milestone");
    check((await cp.locator(`text=Build matching engine ${RUN}`).count()) === 0, "portal does not expose internal tasks");
    await cp.goto("/client/invoices");
    check((await cp.locator("tbody tr").count()) >= 1, "portal lists the invoice");
    await cp.goto("/client/payments");
    check((await cp.locator("text=Partially refunded").count()) >= 1, "portal lists the confirmed (partially refunded) payment");
    await cp.goto(`/client/support/${state.portalTicket}`);
    check((await cp.locator(`text=We have restored logins ${RUN}`).count()) === 1, "portal shows staff reply");
    check((await cp.locator(`text=INTERNAL root cause`).count()) === 0, "portal never shows internal notes");

    /* ───── RBAC across modules ───── */
    const fin = await ctxFor();
    const fp = await fin.newPage();
    await login(fp, "qa-finance@shivacha.test");
    const fr = await fp.goto("/admin/finance/invoices");
    check(fr.status() === 200 && !fp.url().includes("forbidden"), "finance manager can open invoices");
    await fp.goto("/admin/leads");
    check(await fp.waitForURL(/forbidden/, { timeout: 15000 }).then(() => true, () => false), "finance manager is blocked from leads");
    const sales = await ctxFor();
    const sp2 = await sales.newPage();
    await login(sp2, "qa-sales@shivacha.test");
    await sp2.goto("/admin/finance/payments");
    check(await sp2.waitForURL(/forbidden/, { timeout: 15000 }).then(() => true, () => false), "sales manager is blocked from payments");
    const pdfDenied = await sales.request.get(`${state.invoiceUrl}/pdf`);
    check(pdfDenied.status() === 403, `sales manager cannot download invoice PDFs (${pdfDenied.status()})`);
  }

  if (!only.length || only.includes("auto")) {
    /* ───── campaign ───── */
    await p.goto("/admin/marketing/campaigns/new");
    await p.fill("#f-name", `Flow campaign ${RUN}`);
    await p.fill("#f-utmCampaign", `flow-${RUN}`);
    await p.selectOption("#f-status", "ACTIVE");
    await p.click("button:has-text('Create campaign')");
    await p.waitForURL(/campaigns\/c/, { timeout: 30000 });
    state.campaignUrl = p.url();
    await p.fill("input[aria-label='Date']", new Date().toISOString().slice(0, 10));
    await p.fill("input[aria-label='Spend']", "250");
    await p.click("button:has-text('Save day')");
    check(await toast(p, "Metrics saved"), "campaign spend entered");

    /* ───── automation from template ───── */
    await p.goto("/admin/automations");
    await p.locator("li", { hasText: "New lead → assign, follow up, notify, AI analysis" }).locator("button:has-text('Add (disabled)')").click();
    await p.waitForTimeout(1500);
    await p.goto("/admin/automations");
    await p.locator("tbody a", { hasText: "New lead → assign" }).first().click();
    await p.waitForURL(/automations\/c/);
    state.automationUrl = p.url();
    await p.check("input[name=enabled]");
    await p.click("button:has-text('Save automation')");
    check(await toast(p, "Automation saved"), "automation enabled");

    /* ───── public website lead (existing lead API) ───── */
    const anon = await ctxFor();
    const email = `auto-${RUN}@shivacha.com`;
    const lr = await anon.request.post("/api/lead", { headers: { origin: BASE, "content-type": "application/json" }, data: { type: "project", name: `Auto Lead ${RUN}`, email, company: "Auto Co", country: "India", phone: "+91 98111 22333", service: "AI Development", budget: "$25K–$50K", message: "Automation test lead from the public form.", utm_campaign: `flow-${RUN}`, utm_source: "google", utm_medium: "cpc", _t: String(Date.now() - 15000) } });
    check(lr.status() === 200, `public lead form still works (${lr.status()})`);
    let ok = false;
    for (let i = 0; i < 10 && !ok; i++) {
      await p.waitForTimeout(1500);
      await p.goto(`/admin/leads?q=${encodeURIComponent(email)}`);
      ok = (await p.locator("tbody tr", { hasText: "QA Sales" }).count()) === 1;
    }
    check(ok, "NEW_LEAD automation assigned the website lead round-robin (QA Sales)");
    await p.locator("tbody a", { hasText: `Auto Lead ${RUN}` }).click();
    await p.waitForURL(/leads\/c/);
    check((await p.locator("text=First response to").count()) >= 1, "automation scheduled the first-response follow-up");
    await p.goto("/admin/automations/runs");
    check((await p.locator("tbody tr", { hasText: "New lead → assign" }).first().locator("text=Succeeded").count()) === 1, "automation run logged as succeeded");
    await p.goto(state.campaignUrl);
    const leadsKpi = await p.locator("p", { hasText: /^Leads$/ }).locator("xpath=following-sibling::p[1]").innerText();
    check(leadsKpi === "1", `lead attributed to its campaign via utm_campaign (${leadsKpi})`);
    check((await p.locator("text=$250.00").count()) >= 1, "CPL computed from real spend ($250 / 1 lead)");
    await p.goto("/admin/notifications");
    check((await p.locator(`text=New lead: Auto Lead ${RUN}`).count()) >= 1, "in-app notification for the new lead");

    /* ───── leave it disabled for other runs ───── */
    await p.goto(state.automationUrl);
    await p.uncheck("input[name=enabled]");
    await p.click("button:has-text('Save automation')");
    await toast(p, "Automation saved");
  }
} catch (e) {
  check(false, `unexpected error: ${e.message.split("\n")[0]}`);
} finally {
  await browser.close();
}
writeFileSync(path.join(tmpdir(), "shivacha-flow-state.json"), JSON.stringify(state));
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exitCode = failed ? 1 : 0;
