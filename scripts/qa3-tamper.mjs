// QA3 — tamper a genuine receipt -> INVALID (closes the happy-path chain).
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://localhost:3000";
let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log("  PASS " + n); };
const bad = (n, e) => { fail++; console.log("  FAIL " + n + (e ? " :: " + e : "")); };
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.setDefaultTimeout(60000);

const genuine = JSON.parse(readFileSync("scripts/qa-shots/last-receipt.json", "utf8"));
// tamper: bump the disclosed-amount public signal (the proof no longer matches)
const tampered = JSON.parse(JSON.stringify(genuine));
tampered.publicSignals[1] = (BigInt(tampered.publicSignals[1]) + 1n).toString();

await page.goto(BASE + "/regulator", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);
await page.getByRole("button", { name: "Verify disclosure" }).first().click();
await page.waitForTimeout(300);
await page.locator("#receipt").fill(JSON.stringify(tampered));
await page.getByRole("button", { name: /Re-verify/ }).click();
await page.waitForTimeout(4000);
const box = await page.locator("div.mt-4.rounded-tile").first().innerText().catch(() => "");
console.log("  [box] " + box.replace(/\s+/g, " ").slice(0, 300));
const invalid = /✗ invalid/i.test(box) || /Not valid/i.test(box) || /proof was rejected/i.test(box);
const notBoundGreen = !/bound to real on-chain state/i.test(box);
(invalid && notBoundGreen) ? ok("tampered genuine receipt -> INVALID (proof rejected, not green)") : bad("tampered receipt not shown invalid", box.replace(/\s+/g, " ").slice(0, 200));
console.log(`\n=== qa3-tamper: ${pass}/${pass + fail} checks passed ===`);
await browser.close();
