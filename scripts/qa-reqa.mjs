// Targeted re-QA after the polish batch: verifies the specific fixes.
//  1) no horizontal overflow at 390px on all 6 surfaces
//  2) landing shows the corrected numbers (7 circuits / 8 contracts / 52/52) + the 3 new circuit cards
//  3) receiver consumer tabs (Payments/Claim/Request) switch sections
// Run:  node scripts/qa-reqa.mjs
import { chromium } from "playwright-core";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://localhost:3000";
const SHOTS = "scripts/qa-shots";
let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log("  \u2705 " + n); };
const bad = (n, e) => { fail++; console.log("  \u274c " + n + (e ? " \u2014 " + e : "")); };

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });

const routes = ["/", "/demo", "/sender", "/receiver", "/regulator", "/operator"];

// 1) mobile overflow at 390px
console.log("Mobile overflow @390px (scrollWidth must be <= innerWidth):");
for (const r of routes) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    await page.goto(BASE + r, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(1200);
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    const over = m.sw - m.iw;
    await page.screenshot({ path: `${SHOTS}/reqa${r === "/" ? "-home" : r.replace(/\//g, "-")}-390.png` });
    if (over <= 1) ok(`${r} no overflow (scrollWidth ${m.sw} <= ${m.iw})`);
    else bad(`${r} overflow +${over}px`, `scrollWidth ${m.sw} > innerWidth ${m.iw}`);
  } catch (e) { bad(`${r} load`, e.message.split("\n")[0]); }
  await page.close();
}

// 2) landing corrected numbers + new circuit cards
console.log("\nLanding accuracy:");
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 60000 });
    const body = await page.evaluate(() => document.body.innerText);
    body.includes("7 ZK CIRCUITS") ? ok('hero "7 ZK CIRCUITS"') : bad("hero circuits", "not found");
    body.includes("Seven circuits") ? ok('heading "Seven circuits"') : bad("heading", "not found");
    /(^|\D)8(\D|$)/.test(body) && body.includes("CONTRACTS ON TESTNET") ? ok("CONTRACTS ON TESTNET present") : bad("contracts stat", "check");
    body.includes("52/52") ? ok('"52/52" unit tests') : bad("tests stat", "not found");
    body.includes("4 ZK CIRCUITS") || body.includes("36/36") ? bad("stale numbers remain", "found old 4/36") : ok("no stale 4/36 numbers");
    // click the Circuits tab and look for the 3 new circuit files
    try { await page.getByRole("button", { name: /circuits/i }).first().click({ timeout: 4000 }); await page.waitForTimeout(400); } catch {}
    const after = await page.evaluate(() => document.body.innerText.toLowerCase());
    ["thresholddisclosure", "aggregatedisclosure", "rangedisclosure"].every((c) => after.includes(c))
      ? ok("Circuits tab lists threshold/aggregate/range")
      : bad("new circuit cards", "one or more of threshold/aggregate/range missing from Circuits tab");
    await page.screenshot({ path: `${SHOTS}/reqa-landing-circuits.png`, fullPage: false });
  } catch (e) { bad("landing", e.message.split("\n")[0]); }
  await page.close();
}

// 3) receiver tabs switch
console.log("\nReceiver consumer tabs:");
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    await page.goto(BASE + "/receiver", { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(800);
    const tabs = await page.getByRole("tab").count().catch(() => 0);
    tabs >= 3 ? ok(`tablist has ${tabs} tabs`) : bad("tablist", `found ${tabs} tabs (expected >=3)`);
    // switch to Claim, expect the bearer-note input; then Request, expect an amount input
    try {
      await page.getByRole("tab", { name: /claim/i }).click({ timeout: 4000 });
      await page.waitForTimeout(300);
      const hasClaim = await page.getByPlaceholder(/tukar1:/i).count();
      hasClaim > 0 ? ok("Claim tab shows the bearer-note input") : bad("Claim tab", "no tukar1: input");
      await page.getByRole("tab", { name: /request/i }).click({ timeout: 4000 });
      await page.waitForTimeout(300);
      const reqInputs = await page.locator("input").count();
      reqInputs > 0 ? ok("Request tab shows an input") : bad("Request tab", "no input");
    } catch (e) { bad("tab switching", e.message.split("\n")[0]); }
  } catch (e) { bad("receiver", e.message.split("\n")[0]); }
  await page.close();
}

await browser.close();
console.log(`\n=== re-QA: ${pass}/${pass + fail} checks passed ===`);
process.exit(fail === 0 ? 0 : 1);
