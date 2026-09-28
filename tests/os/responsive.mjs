/**
 * Public-site responsive QA (Playwright). For each page × viewport: horizontal overflow (and the element causing it),
 * content-container width, side whitespace, hero heading size and tech-strip coverage.
 *   BASE=http://localhost:3200 node tests/os/responsive.mjs [path…]
 */
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:3200";
const WIDTHS = [[320, 568], [360, 800], [375, 812], [390, 844], [414, 896], [430, 932], [480, 900], [600, 800], [768, 1024], [834, 1194], [1024, 1366], [1280, 800], [1366, 768], [1440, 900], [1600, 900], [1920, 1080], [2560, 1440], [3440, 1440], [3840, 2160], [6000, 2000], [10000, 3000]];
const PAGES = process.argv.slice(2).length ? process.argv.slice(2) : ["/"];
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/opt/pw-browsers/chromium" });
let problems = 0;
for (const path of PAGES) {
  console.log(`\n=== ${path}`);
  console.log("viewport     overflow  content  side-gap  h1-px  notes");
  for (const [w, h] of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: "reduce" });
    const p = await ctx.newPage();
    await p.goto(BASE + path, { waitUntil: "load" });
    const r = await p.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const overflow = document.documentElement.scrollWidth - vw;
      const offenders = [];
      if (overflow > 0)
        for (const el of document.querySelectorAll("body *")) {
          const b = el.getBoundingClientRect();
          if (b.width && b.right > vw + 1 && !el.closest("[aria-hidden=true], .marquee")) {
            let clipped = false;
            for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
              const s = getComputedStyle(a);
              if (s.overflowX !== "visible" && s.overflowX !== "") { clipped = a.getBoundingClientRect().right <= vw + 1; if (clipped) break; }
            }
            if (!clipped) offenders.push(`${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 3).join(".")} →${Math.round(b.right - vw)}px`);
          }
        }
      const main = document.querySelector("main .container-x") ?? document.querySelector(".container-x");
      const cs = main ? getComputedStyle(main) : null;
      const content = main ? main.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) : 0;
      const h1 = document.querySelector("h1");
      const strip = document.querySelector(".marquee");
      const stripGap = strip ? strip.getBoundingClientRect().width / 2 < strip.parentElement.getBoundingClientRect().width : false;
      return { overflow, content: Math.round(content), gap: Math.round((vw - content) / 2), h1: h1 ? parseFloat(getComputedStyle(h1).fontSize) : 0, offenders: offenders.slice(0, 4), stripGap };
    });
    const notes = [r.overflow > 0 ? `OVERFLOW: ${r.offenders.join(", ")}` : "", r.stripGap ? "TECH-STRIP-GAP" : ""].filter(Boolean).join(" ");
    if (notes) problems++;
    console.log(`${String(w).padStart(5)}×${String(h).padEnd(5)} ${String(r.overflow).padStart(6)}  ${String(r.content).padStart(7)}  ${String(r.gap).padStart(7)}  ${String(r.h1).padStart(5)}  ${notes}`);
    await ctx.close();
  }
}
await browser.close();
console.log(`\n${problems} problem(s)`);
