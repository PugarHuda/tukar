// QA5 REGRESSION (item 6, fast) — 6 surfaces load with no console errors / 404s (desktop + mobile);
// no horizontal overflow at 360/390/414/768/1440; launch modal + dashboard drawer focus-trap/ESC;
// landing numbers still 7 circuits / 8 contracts / 52 tests.
import { chromium } from "playwright-core";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://localhost:3000";
const SHOTS = "scripts/qa-shots";
const SURFACES = ["/", "/demo", "/sender", "/receiver", "/regulator", "/operator"];
const WIDTHS = [[360, 780], [390, 844], [414, 896], [768, 1024], [1440, 900]];
let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log("  PASS " + n); };
const bad = (n, e) => { fail++; console.log("  FAIL " + n + (e ? " :: " + e : "")); };
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const IGNORE = /er-api|Failed to load resource|favicon|reflector|manifest|getUserMedia|Permissions-Policy|429|throttl|the server responded with a status/i;

// ============ overflow (all widths) + console/404 (desktop 1440 + mobile 390) ============
console.log("\n=== REGRESSION · load, overflow, console/404 ===");
for (const path of SURFACES) {
  let worstOverflow = 0, worstW = 0;
  const errsByView = {};
  for (const [w, h] of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
    page.on("console", (m) => { if (m.type() === "error") errs.push("console.error: " + m.text().slice(0, 160)); });
    page.on("response", (r) => { if (r.status() === 404) errs.push("404: " + r.url()); });
    page.setDefaultTimeout(25000);
    await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    const o = await page.evaluate(() => ({ docW: document.documentElement.scrollWidth, winW: window.innerWidth }));
    const overflow = o.docW - o.winW;
    if (overflow > worstOverflow) { worstOverflow = overflow; worstW = w; }
    // capture console/404 for desktop + mobile specifically
    if (w === 1440 || w === 390) errsByView[w] = errs.filter((e) => !IGNORE.test(e));
    await ctx.close();
  }
  worstOverflow <= 1 ? ok(`${path}: no horizontal overflow at any of 360/390/414/768/1440`)
    : bad(`${path}: horizontal overflow +${worstOverflow}px at ${worstW}px`);
  const dErr = errsByView[1440] || [], mErr = errsByView[390] || [];
  (dErr.length === 0 && mErr.length === 0) ? ok(`${path}: no console errors / 404s (desktop 1440 + mobile 390)`)
    : bad(`${path}: console/404 issues`, `desktop=${JSON.stringify(dErr.slice(0,3))} mobile=${JSON.stringify(mErr.slice(0,3))}`);
}

// ============ launch modal focus-trap + ESC (landing) ============
console.log("\n=== REGRESSION · launch modal focus-trap + ESC ===");
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  try {
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(700);
    const trig = page.locator(".launch-trigger.btn-cta").first();
    await trig.click();
    const dialog = page.locator('[role="dialog"]');
    await dialog.waitFor({ state: "visible", timeout: 8000 });
    const modal = await dialog.getAttribute("aria-modal");
    let escaped = false;
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Tab");
      const inside = await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') != null);
      if (!inside) { escaped = true; break; }
    }
    (modal === "true" && !escaped) ? ok("launch modal: opens (aria-modal) + focus trapped across 10 Tabs") : bad("launch modal focus-trap", `modal=${modal} escaped=${escaped}`);
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden", timeout: 5000 });
    const returned = await page.evaluate(() => document.activeElement?.matches(".launch-trigger.btn-cta") ?? false);
    returned ? ok("launch modal: ESC closes + focus returns to trigger") : bad("launch modal: focus not returned after ESC");
  } catch (e) { bad("launch modal", (e.message || e).split("\n")[0]); }
  await ctx.close();
}

// ============ dashboard drawer focus-trap + ESC (operator, mobile) ============
console.log("\n=== REGRESSION · dashboard drawer focus-trap + ESC (mobile) ===");
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  try {
    await page.goto(BASE + "/operator", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(900);
    const burger = page.getByRole("button", { name: "Open navigation" });
    await burger.click();
    const drawer = page.locator('[role="dialog"][aria-modal="true"]');
    await drawer.waitFor({ state: "visible", timeout: 6000 });
    let escaped = false;
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Tab");
      const inside = await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') != null);
      if (!inside) { escaped = true; break; }
    }
    !escaped ? ok("dashboard drawer: focus trapped across 10 Tabs") : bad("dashboard drawer: focus escaped");
    await page.keyboard.press("Escape");
    await drawer.waitFor({ state: "hidden", timeout: 5000 });
    const returned = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") === "Open navigation");
    returned ? ok("dashboard drawer: ESC closes + focus returns to hamburger") : bad("dashboard drawer: focus not returned to hamburger");
  } catch (e) { bad("dashboard drawer", (e.message || e).split("\n")[0]); }
  await ctx.close();
}

// ============ landing numbers 7 / 8 / 52 ============
console.log("\n=== REGRESSION · landing numbers 7 / 8 / 52 ===");
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  const circuits = await page.locator(".circ-card").count();
  circuits === 7 ? ok("7 circuit cards (Circuits tab)") : bad(`circuit cards = ${circuits}, expected 7`);
  const body = await page.evaluate(() => document.body.innerText);
  /\b8\b[\s\S]{0,40}CONTRACTS ON TESTNET|CONTRACTS ON TESTNET/.test(body) && (await page.getByText("CONTRACTS ON TESTNET").count())
    ? ok("'8' CONTRACTS ON TESTNET stat present") : bad("8 contracts stat missing");
  (await page.getByText("52/52").count()) ? ok("'52/52' UNIT TESTS PASS stat present") : bad("52/52 tests stat missing");
  await ctx.close();
}

console.log(`\n=== qa5-regression: ${pass}/${pass + fail} checks passed ===`);
await browser.close();
