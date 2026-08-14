// QA3 — SECURITY-CRITICAL Regulator verification (F1 bound/unbound, F2 anchor, F3 figure).
// Pastes prebuilt receipt fixtures into /regulator Verify tab and asserts the bound distinction.
// No on-chain writes. Fixtures produced by qa3-gen.mjs.
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://localhost:3000";
const SHOTS = "scripts/qa-shots";
const FX = process.argv[2] || "C:/Users/pc/AppData/Local/Temp/claude/C--Hackathons-Hackathon-Stellar-Real-World-ZK/6a6c9e80-bec9-4e56-9c6e-b0a3d0153a10/scratchpad";
let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log("  PASS " + n); };
const bad = (n, e) => { fail++; console.log("  FAIL " + n + (e ? " :: " + e : "")); };

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const errs = [];
function wire(page) {
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errs.push("console.error: " + m.text().slice(0, 200)); });
  page.on("requestfailed", (r) => { const u = r.url(); if (!/favicon|reflector|er-api|manifest/i.test(u)) errs.push("reqfail: " + u + " " + (r.failure()?.errorText || "")); });
  page.setDefaultTimeout(60000);
}

async function verifyReceipt(page, json, label) {
  await page.getByRole("button", { name: "Verify disclosure" }).first().click().catch(() => {});
  await page.waitForTimeout(400);
  const ta = page.locator("#receipt");
  await ta.fill(typeof json === "string" ? json : JSON.stringify(json));
  await page.getByRole("button", { name: /Re-verify in browser and on-chain/ }).click();
  // wait for the result box or an error
  await page.locator(".rounded-tile.border.border-line.bg-black\\/20, .text-red-t").first().waitFor({ timeout: 90000 }).catch(() => {});
  // give on-chain reads time to resolve (bound check reads leaves)
  await page.waitForTimeout(1500);
  const box = await page.locator("div.mt-4.rounded-tile").first().innerText().catch(() => "");
  await page.screenshot({ path: `${SHOTS}/qa3-${label}.png` });
  return box;
}

// ============ F1a — GENUINE receipt -> VALID + BOUND (green) ============
console.log("\n=== F1a · GENUINE deposited receipt -> bound (green) ===");
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage(); wire(page);
  await page.goto(BASE + "/regulator", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  let genuine;
  try { genuine = readFileSync("scripts/qa-shots/last-receipt.json", "utf8"); } catch { genuine = null; }
  if (!genuine) { bad("F1a: no saved genuine receipt found"); }
  else {
    const box = await verifyReceipt(page, genuine, "f1a-genuine");
    console.log("  [box] " + box.replace(/\s+/g, " ").slice(0, 400));
    /valid/i.test(box) && /bound to real on-chain state/i.test(box)
      ? ok("F1a genuine receipt shows VALID + bound (green)")
      : bad("F1a genuine receipt NOT shown as bound", box.replace(/\s+/g, " ").slice(0, 200));
    /Anchor on-chain/i.test(await page.locator("body").innerText())
      ? ok("F1a: anchor action offered for a bound receipt")
      : console.log("  NOTE: anchor button not shown (receipt may already carry an anchor)");
  }
  await ctx.close();
}

// ============ F1b — FABRICATED never-deposited receipt -> valid but NOT bound (amber) ============
console.log("\n=== F1b · FABRICATED never-deposited receipt -> NOT bound (amber) [SECURITY-CRITICAL] ===");
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage(); wire(page);
  await page.goto(BASE + "/regulator", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  const fab = readFileSync(`${FX}/fixture-fabricated.json`, "utf8");
  const box = await verifyReceipt(page, fab, "f1b-fabricated");
  console.log("  [box] " + box.replace(/\s+/g, " ").slice(0, 500));
  const notBound = /NOT bound to on-chain state/i.test(box);
  const notGreenValid = !/bound to real on-chain state/i.test(box); // must NOT show the green bound line
  const treatUnverified = /not a confirmed disclosure|treat it as unverified|not an on-chain deposit/i.test(box);
  (notBound && notGreenValid) ? ok("F1b fabricated receipt shows AMBER 'valid but NOT bound' (NOT green)") : bad("F1b fabricated receipt did NOT show unbound amber", box.replace(/\s+/g, " ").slice(0, 300));
  treatUnverified ? ok("F1b: console explains commitment is not an on-chain deposit / treat as unverified") : bad("F1b missing unverified explanation");
  // anchor action must be GATED on bound: for an unbound receipt there must be NO 'Anchor on-chain' button
  const anchorBtn = await page.getByRole("button", { name: /Anchor on-chain/ }).count();
  anchorBtn === 0 ? ok("F1b: anchor action is GATED OFF for an unbound receipt") : bad("F1b: anchor button present for unbound receipt (should be gated)");
  await ctx.close();
}

// ============ F2 — bogus anchor -> 'not confirmed on-chain' ============
console.log("\n=== F2 · bogus anchor {txHash,sha256} -> not confirmed on-chain ===");
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage(); wire(page);
  await page.goto(BASE + "/regulator", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  const bogus = readFileSync(`${FX}/fixture-bogusanchor.json`, "utf8");
  const box = await verifyReceipt(page, bogus, "f2-bogusanchor");
  console.log("  [box] " + box.replace(/\s+/g, " ").slice(0, 500));
  /On-chain anchor:.*not confirmed on-chain/is.test(box) || /not confirmed on-chain/i.test(box)
    ? ok("F2 bogus anchor -> 'not confirmed on-chain' (no false match)")
    : bad("F2 bogus anchor did not report not-confirmed", box.replace(/\s+/g, " ").slice(0, 300));
  await ctx.close();
}

// ============ F3 — metadata disagrees with proven signal -> show proven value + flag ============
console.log("\n=== F3 · receipt metadata (thresholdUsdc=999999) disagrees with proven signal ===");
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage(); wire(page);
  await page.goto(BASE + "/regulator", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  const mm = readFileSync(`${FX}/fixture-metamismatch.json`, "utf8");
  const proven = JSON.parse(mm).publicSignals[1]; // stroops
  const box = await verifyReceipt(page, mm, "f3-metamismatch");
  console.log("  [box] " + box.replace(/\s+/g, " ").slice(0, 500));
  // proven threshold is 100 USDC (from publicSignals[1]=1000000000), metadata claims 999999
  const showsProven = /≤ \$100 USDC/i.test(box) || /\$100 USDC/i.test(box);
  const flagsMismatch = /metadata disagreed/i.test(box);
  const hidesLie = !/999999/.test(box);
  showsProven ? ok("F3: shows the PROVEN figure ($100 from publicSignals), not the metadata") : bad("F3 did not show proven figure", box.replace(/\s+/g, " ").slice(0, 300));
  flagsMismatch ? ok("F3: flags 'receipt metadata disagreed; showing the proven value'") : bad("F3 did not flag metadata mismatch");
  hidesLie ? ok("F3: the lying metadata figure (999999) is NOT surfaced as the disclosed amount") : bad("F3: the metadata lie 999999 leaked into the display");
  await ctx.close();
}

console.log("\n=== ERRORS ===");
const nz = errs.filter((e) => !/er-api|Failed to load resource|favicon|reflector|manifest|getUserMedia|Permissions|net::ERR_ABORTED/i.test(e));
console.log(nz.length ? nz.slice(0, 30).map((e) => "  - " + e).join("\n") : "  none");
console.log(`\n=== qa3-sec: ${pass}/${pass + fail} checks passed ===`);
await browser.close();
