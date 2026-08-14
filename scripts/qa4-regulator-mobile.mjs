// QA4 — Regulator console, mobile 390. Drawer nav a11y: open, focus-in, ESC closes + returns
// focus, focus-trap (Tab wrap), overlay-click close, nav selection. Plus one verify on mobile.
import { chromium } from "playwright-core";
import fs from "fs";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://localhost:3000";
const SHOTS = "scripts/qa-shots";
let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log("  PASS " + n); };
const bad = (n, e) => { fail++; console.log("  FAIL " + n + (e ? " :: " + e : "")); };

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const errs = [];
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errs.push("console.error: " + m.text().slice(0, 200)); });
page.setDefaultTimeout(30000);

const activeText = () => page.evaluate(() => document.activeElement?.textContent?.trim().slice(0, 40) || document.activeElement?.getAttribute("aria-label") || "");

try {
  console.log("\n=== LOAD /regulator (mobile 390) ===");
  await page.goto(BASE + "/regulator", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const ham = page.getByRole("button", { name: "Open navigation" });
  (await ham.count()) ? ok("mobile top bar hamburger present") : bad("hamburger missing (desktop rail not collapsed?)");
  // desktop sidebar should be hidden at 390
  const railVisible = await page.locator("aside .flex.h-full").first().isVisible().catch(() => false);
  !railVisible ? ok("desktop rail hidden on mobile") : bad("desktop rail visible on mobile");
  await page.screenshot({ path: SHOTS + "/qa4-reg-mobile-closed.png", fullPage: true });

  console.log("\n=== DRAWER · open + focus-in ===");
  await ham.click();
  await page.waitForTimeout(500);
  const dialog = page.getByRole("dialog");
  (await dialog.count()) ? ok("drawer dialog opens (role=dialog, aria-modal)") : bad("drawer did not open");
  (await dialog.getAttribute("aria-modal")) === "true" ? ok("drawer aria-modal=true") : bad("drawer not aria-modal");
  const af = await activeText();
  /report|Pool/i.test(af) ? ok("focus moved into drawer (first nav item): " + af) : bad("focus not in drawer", af);
  await page.screenshot({ path: SHOTS + "/qa4-reg-mobile-drawer.png", fullPage: true });

  console.log("\n=== DRAWER · focus-trap (Tab wrap) ===");
  // Tab through all focusables; focus must stay within the dialog (never escape to body).
  let escaped = false;
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    const inDialog = await page.evaluate(() => {
      const d = document.querySelector('[role=dialog]');
      return d ? d.contains(document.activeElement) : false;
    });
    if (!inDialog) { escaped = true; break; }
  }
  !escaped ? ok("focus stays trapped within drawer across 12 Tabs") : bad("focus escaped the drawer (trap broken)");

  console.log("\n=== DRAWER · ESC closes + returns focus to hamburger ===");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  (await page.getByRole("dialog").count()) === 0 ? ok("ESC closes drawer") : bad("ESC did not close drawer");
  const afterEsc = await activeText();
  /Open navigation/i.test(afterEsc) ? ok("focus returned to hamburger after ESC") : bad("focus not returned to hamburger", afterEsc);

  console.log("\n=== DRAWER · nav selection closes + switches section ===");
  await ham.click();
  await page.waitForTimeout(400);
  await page.getByRole("dialog").getByRole("button", { name: "Verify disclosure" }).click();
  await page.waitForTimeout(500);
  (await page.getByRole("dialog").count()) === 0 ? ok("selecting a nav item closes the drawer") : bad("drawer stayed open after selection");
  (await page.locator("#receipt").count()) ? ok("switched to Verify section (textarea present)") : bad("did not switch section");

  console.log("\n=== DRAWER · overlay click closes ===");
  await ham.click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Close navigation" }).click();
  await page.waitForTimeout(400);
  (await page.getByRole("dialog").count()) === 0 ? ok("overlay/close-button closes drawer") : bad("overlay close failed");

  console.log("\n=== MOBILE VERIFY · F1 fabricated still gates ===");
  {
    const obj = JSON.parse(fs.readFileSync(SHOTS + "/qa4-fabricated-threshold.json", "utf8"));
    await page.locator("#receipt").fill(JSON.stringify(obj));
    await page.getByRole("button", { name: /Re-verify in browser and on-chain/ }).click();
    await page.waitForFunction(() => /valid but NOT bound|In your browser/.test(document.querySelector("#receipt")?.closest("section")?.innerText || ""), { timeout: 120000 }).catch(() => {});
    const t = await page.locator("#receipt").locator("xpath=ancestor::section[1]").innerText();
    /valid but NOT bound to on-chain state/.test(t) && !/Verified and bound to real on-chain state/.test(t)
      ? ok("F1 holds on mobile: fabricated => amber not-bound, no plain-green")
      : bad("F1 mobile regression", t.replace(/\s+/g, " ").slice(0, 160));
    await page.screenshot({ path: SHOTS + "/qa4-reg-mobile-verify.png", fullPage: true });
  }
} catch (e) {
  bad("UNCAUGHT", e.message);
} finally {
  console.log("\n=== CONSOLE / PAGEERROR ===");
  const cErr = [...new Set(errs)].filter((s) => !/favicon|manifest|DevTools|hydrat/i.test(s));
  cErr.length ? cErr.forEach((e) => console.log("  " + e)) : console.log("  (no console errors / pageerrors)");
  console.log(`\nRESULT mobile: ${pass} pass / ${fail} fail`);
  await browser.close();
}
