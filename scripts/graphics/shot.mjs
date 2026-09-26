import { chromium } from "playwright-core";
const [,, page, out, w = "400", h = "300"] = process.argv;
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
p.on("console", (m) => console.log("console:", m.text())); p.on("pageerror", (e) => console.log("err:", e.message));
await p.goto(`http://localhost:4567/${page}`); await p.waitForFunction(() => window.done === true, null, { timeout: 120000 });
console.log("pins", JSON.stringify(await p.evaluate(() => window.pins || null)));
await p.locator("canvas").screenshot({ path: out, omitBackground: true }); await b.close(); console.log("ok", out);
