// QA3 regression sweep: 6 surfaces load clean (desktop+mobile), no horizontal overflow,
// new a11y (freighter toast, dashboard mobile drawer focus-trap/ESC/return, tabs aria,
// labels), and wrong-path rejections. No on-chain writes.
import { chromium } from "playwright-core";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://localhost:3000";
const SHOTS = "scripts/qa-shots";
let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log("  PASS " + n); };
const bad = (n, e) => { fail++; console.log("  FAIL " + n + (e ? " :: " + e : "")); };
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });

const IGN = /er-api|Failed to load resource|favicon|reflector|manifest|getUserMedia|Permissions|net::ERR_ABORTED|freighter|Freighter/i;
function collect(page, errs) {
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errs.push("console.error: " + m.text().slice(0, 160)); });
  page.on("response", (r) => { if (r.status() === 404 && !/favicon|reflector/i.test(r.url())) errs.push("404: " + r.url()); });
  page.setDefaultTimeout(30000);
}
const ROUTES = ["/", "/demo", "/sender", "/receiver", "/regulator", "/operator"];

// ============ SURFACES LOAD CLEAN (desktop + mobile) + NO H-OVERFLOW ============
for (const [w, h, label] of [[1440, 900, "desktop"], [390, 844, "mobile"]]) {
  console.log(`\n=== SURFACES · ${label} (${w}x${h}) ===`);
  for (const route of ROUTES) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage(); const errs = []; collect(page, errs);
    await page.goto(BASE + route, { waitUntil: "domcontentloaded" }).catch((e) => errs.push("nav: " + e.message));
    await page.waitForTimeout(1600);
    const nz = errs.filter((e) => !IGN.test(e));
    nz.length === 0 ? ok(`${route} loads clean (no console errors / 404s)`) : bad(`${route} had errors`, nz.slice(0, 3).join(" | "));
    // horizontal overflow check
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    overflow <= 1 ? ok(`${route} no horizontal overflow (${overflow}px)`) : bad(`${route} H-OVERFLOW ${overflow}px`);
    await ctx.close();
  }
}

// ============ NO H-OVERFLOW at the extra widths ============
console.log("\n=== H-OVERFLOW at 360/414/768 ===");
for (const w of [360, 414, 768]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 800 } });
  const page = await ctx.newPage(); collect(page, []);
  for (const route of ["/", "/receiver", "/regulator"]) {
    await page.goto(BASE + route, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);
    const of = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    of <= 1 ? ok(`${route} @${w} no overflow`) : bad(`${route} @${w} overflow ${of}px`);
  }
  await ctx.close();
}

// ============ A11y · Freighter connect toast (no extension) ============
console.log("\n=== A11y · Freighter 'Connect wallet' surfaces a toast (no ext) ===");
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage(); collect(page, []);
  await page.goto(BASE + "/sender", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: "Connect wallet" }).first().click();
  await page.waitForTimeout(2500);
  const body = await page.locator("body").innerText();
  /not detected|Install it|Freighter/i.test(body) ? ok("Connect wallet (no ext) surfaces a toast, not silent") : bad("no Freighter toast surfaced", body.slice(0, 120));
  await ctx.close();
}

// ============ A11y · dashboard mobile drawer (regulator < lg) ============
console.log("\n=== A11y · dashboard mobile drawer focus-trap/ESC/return ===");
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage(); collect(page, []);
  await page.goto(BASE + "/regulator", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  const ham = page.getByRole("button", { name: "Open navigation" });
  (await ham.count()) ? ok("mobile hamburger present (< lg)") : bad("no hamburger on mobile");
  await ham.click();
  await page.waitForTimeout(300);
  const dialog = page.locator('[role="dialog"][aria-modal="true"]');
  (await dialog.isVisible()) ? ok("drawer opens as role=dialog aria-modal") : bad("drawer did not open as modal");
  const inDialog = await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') != null);
  inDialog ? ok("focus moves INTO the drawer on open") : bad("focus not moved into drawer");
  // focus trap: tab many times, stay inside
  for (let i = 0; i < 8; i++) await page.keyboard.press("Tab");
  const stillIn = await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') != null);
  stillIn ? ok("focus TRAPPED in drawer (8x Tab stays inside)") : bad("focus escaped drawer");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  (await dialog.isHidden().catch(() => true)) ? ok("ESC closes the drawer") : bad("ESC did not close drawer");
  const backToHam = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") === "Open navigation");
  backToHam ? ok("focus RETURNS to hamburger on close") : bad("focus not returned to hamburger");
  await ctx.close();
}

// ============ A11y · receiver tabs aria-controls/tabpanel + labels ============
console.log("\n=== A11y · receiver tabs aria-controls/tabpanel ===");
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage(); collect(page, []);
  await page.goto(BASE + "/receiver", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  const tabs = page.locator('[role="tab"]');
  const n = await tabs.count();
  let withControls = 0;
  for (let i = 0; i < n; i++) if (await tabs.nth(i).getAttribute("aria-controls")) withControls++;
  withControls === n && n > 0 ? ok(`all ${n} receiver tabs expose aria-controls`) : bad("receiver tabs missing aria-controls", `${withControls}/${n}`);
  const panels = await page.locator('[role="tabpanel"]').count();
  panels >= 1 ? ok(`receiver has role=tabpanel (${panels})`) : bad("no tabpanel on receiver");
  await ctx.close();
}

// ============ A11y · landing tabs aria-controls ============
console.log("\n=== A11y · landing tabs aria-controls/tabpanel ===");
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage(); collect(page, []);
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(900);
  const tabs = page.locator('.tabs [role="tab"]');
  const n = await tabs.count();
  let withControls = 0;
  for (let i = 0; i < n; i++) if (await tabs.nth(i).getAttribute("aria-controls")) withControls++;
  withControls === n && n > 0 ? ok(`all ${n} landing tabs expose aria-controls`) : bad("landing tabs missing aria-controls", `${withControls}/${n}`);
  (await page.locator('.tabs [role="tabpanel"]').count()) >= 1 ? ok("landing has role=tabpanel") : bad("no tabpanel on landing");
  await ctx.close();
}

// ============ A11y · labeled controls (demo audit select + operator admin inputs) ============
console.log("\n=== A11y · demo + operator form controls labeled ===");
for (const [route, sel, name] of [["/demo", "select", "demo select"], ["/operator", "input, select", "operator inputs"]]) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage(); collect(page, []);
  await page.goto(BASE + route, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1400);
  const unlabeled = await page.evaluate((s) => {
    const els = Array.from(document.querySelectorAll(s));
    let bad = 0;
    for (const el of els) {
      if (el.type === "hidden") continue;
      const id = el.id;
      const hasLabel = (id && document.querySelector(`label[for="${id}"]`)) || el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || el.closest("label");
      if (!hasLabel) bad++;
    }
    return { total: els.length, bad };
  }, sel);
  unlabeled.bad === 0 ? ok(`${name}: all ${unlabeled.total} controls labeled`) : bad(`${name}: ${unlabeled.bad}/${unlabeled.total} UNLABELED`);
  await ctx.close();
}

// ============ WRONG-PATH · garbage bearer note rejected ============
console.log("\n=== WRONG-PATH · garbage bearer note + amount bounds ===");
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage(); collect(page, []);
  await page.goto(BASE + "/receiver", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await page.getByRole("tab", { name: /claim/i }).click();
  await page.locator("textarea").first().fill("tukar1:not-valid-base64-@@@");
  await page.getByRole("button", { name: "Claim payment" }).click();
  await page.waitForTimeout(800);
  const st = await page.locator(".fixed.inset-x-0.bottom-0").innerText().catch(() => "");
  /couldn'?t|invalid|malformed|not a|unable|check the code/i.test(st) ? ok("garbage bearer note rejected with honest message") : bad("garbage bearer note not clearly rejected", st.slice(0, 120));
  await ctx.close();
}

// ============ WRONG-PATH · garbage receipt -> INVALID (regulator) ============
console.log("\n=== WRONG-PATH · garbage / non-JSON receipt rejected ===");
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage(); collect(page, []);
  await page.goto(BASE + "/regulator", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: "Verify disclosure" }).first().click();
  await page.waitForTimeout(300);
  await page.locator("#receipt").fill("this is not json");
  await page.getByRole("button", { name: /Re-verify/ }).click();
  await page.waitForTimeout(600);
  let body = await page.locator("body").innerText();
  /Not valid JSON/i.test(body) ? ok("non-JSON receipt -> 'Not valid JSON'") : bad("non-JSON not rejected");
  await page.locator("#receipt").fill('{"kind":"tukar-audit-receipt","type":"exact"}');
  await page.getByRole("button", { name: /Re-verify/ }).click();
  await page.waitForTimeout(600);
  body = await page.locator("body").innerText();
  /Missing proof or publicSignals/i.test(body) ? ok("receipt missing proof/publicSignals -> honest error") : bad("missing-fields receipt not rejected");
  await ctx.close();
}

// ============ WRONG-PATH · amount 0 and 1e9 rejected in sender ============
console.log("\n=== WRONG-PATH · sender amount bounds (0, 1e9) ===");
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage(); collect(page, []);
  await page.goto(BASE + "/sender", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  const amt = page.locator("#amount");
  const cont = page.getByRole("button", { name: /Continue/ });
  await amt.fill("0");
  await cont.click();
  await page.waitForTimeout(400);
  const afterZero = await page.getByText(/Confirm and send/i).count();
  afterZero === 0 ? ok("amount 0 does NOT advance to confirm") : bad("amount 0 advanced to confirm (should reject)");
  await amt.fill("1000000000");
  await cont.click();
  await page.waitForTimeout(400);
  const body = await page.locator("body").innerText();
  const advanced = await page.getByText(/Confirm and send/i).count();
  // acceptable either way IF a cap/validation message shows; flag only if it silently advances to a real send
  (advanced === 0 || /maximum|too (large|high)|limit|exceed/i.test(body)) ? ok("amount 1e9 gated or capped (no silent huge send)") : bad("amount 1e9 advanced with no cap message", body.slice(0, 100));
  await ctx.close();
}

console.log(`\n=== qa3-regression: ${pass}/${pass + fail} checks passed ===`);
await browser.close();
