// QA recon: visit all 6 surfaces at desktop + mobile. Capture console errors, pageerrors,
// failed requests / 404s, button inventory, and screenshots. Read-only (no on-chain writes).
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.argv[2] || "http://localhost:3000";
const SHOTS = "scripts/qa-shots";
mkdirSync(SHOTS, { recursive: true });

const SURFACES = ["/", "/demo", "/sender", "/receiver", "/regulator", "/operator"];
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });

for (const vp of VIEWPORTS) {
  for (const path of SURFACES) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    const failedReqs = [];
    page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
    page.on("pageerror", (e) => pageErrors.push(e.message));
    page.on("requestfailed", (r) => failedReqs.push(`${r.url()} — ${r.failure()?.errorText}`));
    page.on("response", (r) => { if (r.status() >= 400) failedReqs.push(`${r.status()} ${r.url()}`); });

    const label = `${path === "/" ? "landing" : path.slice(1)}-${vp.name}`;
    try {
      await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 45000 });
    } catch (e) {
      console.log(`\n### ${label}: GOTO ERROR ${e.message.split("\n")[0]}`);
    }
    await page.waitForTimeout(2500); // let canvases/animations + async reads settle

    // horizontal overflow check
    const overflow = await page.evaluate(() => {
      const de = document.documentElement;
      return { scrollW: de.scrollWidth, clientW: de.clientWidth, overflow: de.scrollWidth - de.clientWidth };
    });

    // button/link inventory
    const inv = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button")).map((b) => ({
        text: (b.innerText || b.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 50),
        disabled: b.disabled,
      }));
      const links = Array.from(document.querySelectorAll("a[href]")).map((a) => ({
        text: (a.innerText || a.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 40),
        href: a.getAttribute("href"),
      }));
      return { nBtns: btns.length, btns, nLinks: links.length, links };
    });

    await page.screenshot({ path: `${SHOTS}/${label}.png`, fullPage: false });

    console.log(`\n### ${label}  (vp ${vp.width}x${vp.height})`);
    console.log(`  overflow: ${overflow.overflow}px (scrollW ${overflow.scrollW} / clientW ${overflow.clientW})`);
    console.log(`  consoleErrors(${consoleErrors.length}): ${JSON.stringify(consoleErrors.slice(0, 8))}`);
    console.log(`  pageErrors(${pageErrors.length}): ${JSON.stringify(pageErrors.slice(0, 8))}`);
    const relevantFails = failedReqs.filter((f) => !/er-api\.com|onramper|reflector|horizon|soroban|stellar\.org|moonpay|transak|favicon|fonts|analytics/i.test(f));
    console.log(`  failedReqs total ${failedReqs.length}, non-external(${relevantFails.length}): ${JSON.stringify(relevantFails.slice(0, 10))}`);
    console.log(`  allFailedReqs sample: ${JSON.stringify(failedReqs.slice(0, 6))}`);
    console.log(`  buttons(${inv.nBtns}): ${JSON.stringify(inv.btns)}`);
    console.log(`  links(${inv.nLinks}): ${JSON.stringify(inv.links.map((l) => l.text + "→" + l.href))}`);

    await ctx.close();
  }
}

await browser.close();
console.log("\n=== recon done ===");
