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
    const gate = await cp.goto("/client/dashboard");
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
    const adminFromPortal = await cp.goto("/admin/dashboard");
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
} catch (e) {
  check(false, `unexpected error: ${e.message.split("\n")[0]}`);
} finally {
  await browser.close();
}
writeFileSync(path.join(tmpdir(), "shivacha-flow-state.json"), JSON.stringify(state));
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exitCode = failed ? 1 : 0;
