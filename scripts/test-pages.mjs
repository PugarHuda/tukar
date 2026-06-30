// Per-page routing test (Playwright, no on-chain): the demo is now one corridor step
// per URL (/demo/send · /demo/corridor · /demo/receive · /demo/audit). Verifies that
// only the active step's panel shows, the flow strip + pager navigate (pushState),
// the browser Back button works (popstate), and a DIRECT load of a deep route renders
// the right panel (Vercel/serve rewrites + boot-from-URL).
//
//   node scripts/test-pages.mjs [baseUrl]   (default http://localhost:8000)
import { chromium } from "playwright-core";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = (process.argv[2] || "http://localhost:8000").replace(/\/$/, "");
const results = [];
const chk = (c, n) => { results.push([c, n]); console.log(`  ${c ? "✅" : "❌"} ${n}`); };

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
page.setDefaultTimeout(20000);
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));
const vis = (sel) => page.locator(sel).isVisible();
const pathOf = () => new URL(page.url()).pathname;
const ready = () => page.locator("#status").filter({ hasText: /Ready/ }).waitFor({ timeout: 45000 });

console.log(`Per-page routing test against ${BASE}/demo\n`);

await page.goto(BASE + "/demo", { waitUntil: "domcontentloaded" });
await ready();
chk(await vis("#panel0") && !(await vis("#panel1")) && !(await vis("#panel2")) && !(await vis("#panel3")),
  "load /demo → only the Sender panel is shown");

await page.locator("#fn2").click();
await page.waitForTimeout(300);
chk(/\/demo\/receive$/.test(pathOf()), "click the Receiver flow node → URL /demo/receive");
chk(await vis("#panel2") && !(await vis("#panel0")), "→ Receiver panel shown, Sender hidden");

await page.locator("#navPrev").click();
await page.waitForTimeout(300);
chk(/\/demo\/corridor$/.test(pathOf()), "pager Back → URL /demo/corridor");
chk(await vis("#panel1"), "→ Corridor panel shown");

await page.goBack();
await page.waitForTimeout(300);
chk(/\/demo\/receive$/.test(pathOf()), "browser Back button → /demo/receive (popstate)");

await page.goto(BASE + "/demo/audit", { waitUntil: "domcontentloaded" });
await ready();
chk(await vis("#panel3") && !(await vis("#panel0")), "direct load /demo/audit → Regulator panel shown");

chk(errs.length === 0, `no uncaught page errors${errs.length ? " (" + errs.join("; ") + ")" : ""}`);

const passed = results.filter((r) => r[0]).length;
console.log(`\n=== ${passed}/${results.length} routing checks passed ===`);
results.filter((r) => !r[0]).forEach((r) => console.log("FAIL:", r[1]));
await browser.close();
process.exit(passed === results.length ? 0 : 1);
