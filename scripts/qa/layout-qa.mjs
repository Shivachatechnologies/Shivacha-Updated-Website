/**
 * Visual / layout QA sweep against a running server (production build recommended).
 *
 *   BASE_URL=http://localhost:3100 node scripts/qa/layout-qa.mjs [--full] [--routes=/a,/b]
 *
 * For every route × viewport it checks:
 *   - horizontal overflow (and names the element that causes it)
 *   - overlapping text / buttons / form controls (ignores aria-hidden decoration and intentional overlays)
 *   - floating widgets overlapping each other
 *   - broken images, images without alt, images escaping their container
 *   - exactly one <h1>
 *   - console errors, page errors and failed same-origin requests
 *
 * Default: every route at 1440×900, 768×1024 and 390×844; one representative route per template at all
 * 12 viewports. --full runs every route at every viewport.
 */
import { chromium } from "playwright-core";
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")).map(([k, v]) => [k, v ?? true]));

const VIEWPORTS = {
  "1920": [1920, 1080], "1440": [1440, 900], "1366": [1366, 768], "1280": [1280, 800],
  "1024t": [1024, 1366], "834t": [834, 1194], "768t": [768, 1024],
  "430m": [430, 932], "414m": [414, 896], "390m": [390, 844], "375m": [375, 812], "360m": [360, 800],
};
const CORE = ["1440", "768t", "390m"];

const allRoutes = args.routes ? String(args.routes).split(",") : JSON.parse(execSync("npx tsx scripts/qa/list-routes.ts", { encoding: "utf8" }));
// One route per template family, tested at every viewport.
const families = new Map();
for (const r of allRoutes) {
  const key = r === "/" ? "/" : r.split("/").length > 2 ? r.split("/").slice(0, 2).join("/") + "/*" : r.startsWith("/hire-") ? "/hire-*" : r;
  if (!families.has(key)) families.set(key, r);
}
const reps = new Set(families.values());

const jobs = [];
for (const r of allRoutes) {
  const vps = args.full || reps.has(r) ? Object.keys(VIEWPORTS) : CORE;
  for (const v of vps) jobs.push([r, v]);
}

/** Runs inside the page. */
function audit() {
  const vw = document.documentElement.clientWidth;
  const out = { overflow: null, overlaps: [], images: [], h1: document.querySelectorAll("h1").length, floating: [] };
  const hidden = (el) => {
    if (el.closest('[aria-hidden="true"],.sr-only,[data-overlay],[role="dialog"],nav[aria-label="Quick actions"]')) return true;
    const d = el.closest("details:not([open])");
    return !!d && !el.closest("summary");
  };
  const clipped = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (/(hidden|clip|auto|scroll)/.test(s.overflowX)) return true;
    }
    return false;
  };
  const sel = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += "#" + el.id;
    const c = (el.getAttribute("class") || "").trim().split(/\s+/).slice(0, 4).join(".");
    if (c) s += "." + c;
    const txt = (el.innerText || el.getAttribute("alt") || "").trim().slice(0, 40);
    return txt ? `${s} "${txt}"` : s;
  };

  // Horizontal overflow: page scrolls sideways → find the widest unclipped culprit.
  if (document.documentElement.scrollWidth > vw + 1) {
    let worst = null;
    for (const el of document.body.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.right <= vw + 1 || clipped(el)) continue;
      if (!worst || r.right > worst.r) worst = { r: r.right, el };
    }
    out.overflow = { scrollWidth: document.documentElement.scrollWidth, culprit: worst ? sel(worst.el) : "unknown" };
  }

  // Overlap: leaf text blocks and controls that intersect each other (per line box for wrapped inline text).
  const inFixed = (el) => {
    for (let p = el; p && p !== document.body; p = p.parentElement) if (getComputedStyle(p).position === "fixed") return true;
    return false;
  };
  const nodes = [];
  for (const el of document.body.querySelectorAll("h1,h2,h3,h4,p,li,a,button,label,input,select,textarea,dt,dd,figcaption,time,span")) {
    if (hidden(el) || inFixed(el)) continue;
    if (el.tagName === "SPAN" && !([...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))) continue;
    const s = getComputedStyle(el);
    if (s.visibility === "hidden" || s.opacity === "0" || s.display === "contents") continue;
    const rects = [...el.getClientRects()].filter((r) => r.width >= 2 && r.height >= 2).map((r) => ({ l: r.left, t: r.top + scrollY, rr: r.right, b: r.bottom + scrollY }));
    if (!rects.length) continue;
    nodes.push({ el, rects });
    if (nodes.length > 1500) break;
  }
  const hit = (a, b) => {
    for (const x of a) for (const y of b) {
      const w = Math.min(x.rr, y.rr) - Math.max(x.l, y.l);
      const h = Math.min(x.b, y.b) - Math.max(x.t, y.t);
      if (w > 4 && h > 4 && w * h > 60) return [w, h];
    }
    return null;
  };
  for (let i = 0; i < nodes.length && out.overlaps.length <= 5; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const o = hit(a.rects, b.rects);
      if (o) {
        out.overlaps.push(`${sel(a.el)}  ×  ${sel(b.el)} (${Math.round(o[0])}×${Math.round(o[1])})`);
        if (out.overlaps.length > 5) break;
      }
    }
  }

  // Images
  for (const img of document.images) {
    if (!img.hasAttribute("alt")) out.images.push(`missing alt: ${img.currentSrc || img.src}`);
    out.srcs = out.srcs || [];
    const src = img.getAttribute("src");
    if (src) out.srcs.push(src);
    for (const part of (img.getAttribute("srcset") || "").split(",")) {
      const u = part.trim().split(/\s+/)[0];
      if (u) out.srcs.push(u);
    }
    const r = img.getBoundingClientRect();
    if (!clipped(img) && r.right > vw + 1) out.images.push(`escapes viewport: ${img.currentSrc || img.src}`);
  }

  // Floating widgets must not overlap each other.
  const floats = [...document.querySelectorAll("body *")].filter((el) => getComputedStyle(el).position === "fixed" && el.getBoundingClientRect().height > 20 && !el.closest('[role="dialog"]'));
  for (let i = 0; i < floats.length; i++)
    for (let j = i + 1; j < floats.length; j++) {
      if (floats[i].contains(floats[j]) || floats[j].contains(floats[i])) continue;
      const a = floats[i].getBoundingClientRect(), b = floats[j].getBoundingClientRect();
      if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) out.floating.push(`${sel(floats[i])} × ${sel(floats[j])}`);
    }
  return out;
}

const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64");
const imageUrls = new Set();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/opt/pw-browsers/chromium" });
const results = [];
let done = 0;
const queue = [...jobs];
const CONCURRENCY = Number(args.c ?? 6);
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    const contexts = {};
    while (queue.length) {
      const [route, vpKey] = queue.shift();
      const [w, h] = VIEWPORTS[vpKey];
      const mobile = vpKey.endsWith("m");
      const key = `${vpKey}`;
      contexts[key] ??= await browser.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile || vpKey.endsWith("t"), reducedMotion: "reduce" });
      const page = await contexts[key].newPage();
      // Layout pass: image bytes are not needed (next/image reserves dimensions); image URLs are verified over HTTP below.
      await page.route("**/*", (r) => {
        const req = r.request();
        if (!req.url().startsWith(BASE)) return r.abort();
        if (req.resourceType() === "image" || req.resourceType() === "media") return r.fulfill({ status: 200, contentType: "image/gif", body: GIF });
        return r.continue();
      });
      const errors = [];
      page.on("console", (m) => m.type() === "error" && !/net::ERR_FAILED|ERR_BLOCKED/.test(m.text()) && errors.push(m.text().slice(0, 200)));
      page.on("pageerror", (e) => errors.push("pageerror: " + e.message.slice(0, 200)));
      page.on("response", (r) => r.url().startsWith(BASE) && r.status() >= 400 && !r.url().includes("404-check") && errors.push(`HTTP ${r.status()} ${r.url().replace(BASE, "")}`));
      const started = Date.now();
      const guard = setTimeout(() => page.close().catch(() => {}), 60000); // hard cap per check
      try {
        const res = await page.goto(BASE + route, { waitUntil: "load", timeout: 45000 });
        await page.waitForTimeout(150);
        const a = await page.evaluate(audit);
        for (const u of a.srcs ?? []) imageUrls.add(new URL(u, BASE).href);
        const expect404 = route.includes("404-check");
        const issues = [];
        if (!expect404 && res.status() !== 200) issues.push(`HTTP ${res.status()}`);
        if (a.overflow) issues.push(`overflow ${a.overflow.scrollWidth}px: ${a.overflow.culprit}`);
        for (const o of a.overlaps) issues.push(`overlap: ${o}`);
        for (const i of a.images) issues.push(`image ${i}`);
        if (a.h1 !== 1) issues.push(`${a.h1} h1`);
        for (const f of a.floating) issues.push(`floating overlap: ${f}`);
        for (const e of errors.filter((e) => !(expect404 && /404/.test(e)))) issues.push(`console: ${e}`);
        results.push({ route, vp: vpKey, issues });
        if (Date.now() - started > 10000) console.error(`slow: ${route}@${vpKey} ${Date.now() - started}ms`);
      } catch (e) {
        results.push({ route, vp: vpKey, issues: [`load failed: ${e.message.slice(0, 120)}`] });
      }
      clearTimeout(guard);
      await page.close().catch(() => {});
      if (++done % 100 === 0) console.error(`${done}/${jobs.length}`);
    }
  }),
);
await browser.close();

// Every image URL seen on any page must return an image.
const brokenImages = [];
const imgQueue = [...imageUrls].filter((u) => u.startsWith(BASE));
await Promise.all(
  Array.from({ length: 8 }, async () => {
    while (imgQueue.length) {
      const u = imgQueue.shift();
      const r = await fetch(u).catch(() => null);
      const ok = r && r.ok && /^image\//.test(r.headers.get("content-type") ?? "");
      if (!ok) brokenImages.push(`${r?.status ?? "ERR"} ${u.replace(BASE, "")}`);
      await r?.arrayBuffer().catch(() => {});
    }
  }),
);
if (brokenImages.length) results.push({ route: "(images)", vp: "http", issues: brokenImages.map((b) => `image broken: ${b}`) });
console.error(`Image URLs verified: ${imageUrls.size}, broken: ${brokenImages.length}`);

const failing = results.filter((r) => r.issues.length);
// Group identical issues so one shared-component defect reads as one line.
const byIssue = new Map();
for (const r of failing) for (const i of r.issues) {
  const k = i.replace(/\(\d+×\d+\)/, "");
  byIssue.set(k, [...(byIssue.get(k) ?? []), `${r.route}@${r.vp}`]);
}
const lines = [...byIssue.entries()].sort((a, b) => b[1].length - a[1].length).map(([i, where]) => `[${where.length}] ${i}\n      e.g. ${where.slice(0, 4).join(", ")}`);
writeFileSync(process.env.QA_OUT ?? "qa-report.txt", lines.join("\n"));
console.log(`Routes: ${allRoutes.length} · checks: ${jobs.length} · failing checks: ${failing.length} · distinct issues: ${byIssue.size}`);
console.log(lines.slice(0, Number(args.top ?? 40)).join("\n"));
process.exit(failing.length ? 1 : 0);
