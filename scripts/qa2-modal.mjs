// QA2 — clean isolated LANDING modal / circuits / nav / a11y diagnostic.
// Each Launch trigger tested on a FRESH page (no cross-open backdrop leakage), generous timeouts.
import { chromium } from "playwright-core";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://localhost:3000";
const SHOTS = "scripts/qa-shots";
let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log("  PASS " + n); };
const bad = (n, e) => { fail++; console.log("  FAIL " + n + (e ? " :: " + e : "")); };

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const errs = [];

const TRIGGERS = [
  { sel: ".launch-trigger.btn-cta", where: "header CTA" },
  { sel: ".launch-trigger.btn-primary", where: "hero CTA" },
  { sel: ".launch-trigger.apps-demo", where: "apps-section card" },
];

for (const [w, h, label] of [[1440, 900, "desktop"], [390, 844, "mobile"]]) {
  console.log(`\n=== LANDING MODAL · ${label} (${w}px) — each trigger isolated ===`);
  for (const t of TRIGGERS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
    page.setDefaultTimeout(20000);
    try {
      await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(700);
      const trig = page.locator(t.sel).first();
      const visible = await trig.isVisible().catch(() => false);
      if (!visible) { console.log(`  (skip) ${t.where}: trigger not visible at ${label}`); await ctx.close(); continue; }
      await trig.scrollIntoViewIfNeeded();
      await trig.click();
      const dialog = page.locator('[role="dialog"]');
      await dialog.waitFor({ state: "visible", timeout: 8000 });
      const modal = await dialog.getAttribute("aria-modal");
      const labelled = await dialog.getAttribute("aria-labelledby");
      const box = await dialog.boundingBox();
      const clipped = !(box && box.width <= w + 1 && box.x >= -1 && box.y >= -1);
      (modal === "true" && labelled) ? ok(`${label} · ${t.where}: opens dialog (aria-modal + labelledby)`) : bad(`${label} · ${t.where}: dialog aria`, `modal=${modal} labelledby=${labelled}`);
      if (clipped) bad(`${label} · ${t.where}: dialog clipped`, JSON.stringify(box));
      // ESC closes + focus returns to the trigger
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden", timeout: 5000 });
      const returned = await page.evaluate((sel) => document.activeElement?.matches(sel) ?? false, t.sel);
      returned ? ok(`${label} · ${t.where}: ESC closes + focus returns to trigger`) : bad(`${label} · ${t.where}: focus not returned`);
    } catch (e) { bad(`${label} · ${t.where}`, (e.message || e).split("\n")[0]); }
    await ctx.close();
  }
}

// focus trap + backdrop close (single fresh page, header trigger)
console.log("\n=== LANDING MODAL · focus trap + backdrop close ===");
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  try {
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(700);
    await page.locator(".launch-trigger.btn-cta").first().click();
    const dialog = page.locator('[role="dialog"]');
    await dialog.waitFor({ state: "visible", timeout: 8000 });
    const inBefore = await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') != null);
    // Tab through all focusables several times; focus must never escape the dialog
    let escaped = false;
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Tab");
      const inside = await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') != null);
      if (!inside) { escaped = true; break; }
    }
    (inBefore && !escaped) ? ok("focus trapped inside dialog across 10 Tabs") : bad("focus escaped dialog", `inBefore=${inBefore} escaped=${escaped}`);
    await page.keyboard.press("Shift+Tab");
    const stillInside = await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') != null);
    stillInside ? ok("shift+Tab keeps focus inside dialog") : bad("shift+Tab escaped dialog");
    await page.locator(".launch-backdrop").click({ position: { x: 4, y: 4 } });
    const closed = await dialog.isHidden({ timeout: 4000 }).catch(() => false);
    closed ? ok("backdrop click closes dialog") : bad("backdrop click did not close");
    await page.screenshot({ path: `${SHOTS}/qa2-modal.png` });
  } catch (e) { bad("focus-trap/backdrop", (e.message || e).split("\n")[0]); }
  await ctx.close();
}

// circuits(7) + nav anchors + tablist a11y + first-Tab reaches control
console.log("\n=== LANDING · circuits / nav / a11y ===");
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  try {
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(700);
    (await page.locator(".circ-card").count()) === 7 ? ok("Circuits tab shows 7 circuit cards") : bad("circuit cards != 7");
    const tabs = page.locator('.tabs [role="tab"]');
    const tn = await tabs.count();
    const sel = await tabs.evaluateAll((els) => els.filter((e) => e.getAttribute("aria-selected") === "true").length);
    (tn >= 4 && sel === 1) ? ok(`landing tablist ${tn} tabs, exactly 1 aria-selected`) : bad("tablist a11y", `tabs=${tn} sel=${sel}`);
    await page.getByRole("tab", { name: "Contracts" }).click();
    await page.waitForTimeout(200);
    (await page.getByRole("tab", { name: "Contracts" }).getAttribute("aria-selected")) === "true" ? ok("Contracts tab selects (aria-selected flips)") : bad("Contracts tab not selected");
    const anchors = await page.locator(".nav a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    ["#apps", "#corridor", "#circuits", "#contracts"].every((h) => anchors.includes(h)) ? ok("header nav anchors present") : bad("nav anchors", JSON.stringify(anchors));
    await page.getByRole("link", { name: "Corridor", exact: true }).click();
    await page.waitForTimeout(200);
    (await page.evaluate(() => location.hash)) === "#corridor" ? ok("nav anchor updates hash (#corridor)") : bad("nav hash not set");
  } catch (e) { bad("landing circuits/nav", (e.message || e).split("\n")[0]); }
  await ctx.close();
}

console.log("\n=== ERRORS ===");
console.log(errs.length ? errs.slice(0, 20).map((e) => "  - " + e).join("\n") : "  none");
console.log(`\n=== qa2-modal: ${pass}/${pass + fail} checks passed ===`);
await browser.close();
