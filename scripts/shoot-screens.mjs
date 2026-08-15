// Capture current-UI screenshots for the Level 4 submission checklist (Product UI + mobile responsive
// + the live monitoring surface). Full-page shots against live production, waiting for on-chain reads.
// Usage: node scripts/shoot-screens.mjs   (override with QA_BASE=...)
import { chromium } from "playwright-core";
import { mkdirSync } from "fs";

const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.QA_BASE || "https://tukar-six.vercel.app";
const OUT = "docs/screenshots";
mkdirSync(OUT, { recursive: true });

const shots = [
  { path: "/", file: "01-landing-desktop.png", vp: { width: 1440, height: 900 }, wait: 3000, full: true },
  { path: "/sender", file: "02-sender-desktop.png", vp: { width: 1440, height: 900 }, wait: 4000, full: true },
  { path: "/operator", file: "03-operator-monitoring-desktop.png", vp: { width: 1440, height: 900 }, wait: 5000, full: true },
  { path: "/regulator", file: "04-regulator-desktop.png", vp: { width: 1440, height: 900 }, wait: 4000, full: true },
  { path: "/verify", file: "05-verify-desktop.png", vp: { width: 1440, height: 900 }, wait: 3000, full: true },
  { path: "/sender", file: "06-sender-mobile.png", vp: { width: 390, height: 844 }, wait: 4000, full: true },
  { path: "/receiver", file: "07-receiver-mobile.png", vp: { width: 390, height: 844 }, wait: 3500, full: true },
  { path: "/operator", file: "08-operator-mobile.png", vp: { width: 390, height: 844 }, wait: 5000, full: true },
];

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
for (const s of shots) {
  const ctx = await browser.newContext({ viewport: s.vp, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  try {
    await page.goto(BASE + s.path, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(s.wait);
    await page.screenshot({ path: OUT + "/" + s.file, fullPage: s.full });
    console.log("  shot " + s.file + "  (" + s.vp.width + "x" + s.vp.height + ")");
  } catch (e) { console.log("  FAIL " + s.file + " :: " + e.message); }
  await ctx.close();
}
await browser.close();
console.log("done -> " + OUT);
