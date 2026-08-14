// QA5 DEMO (item 4) — the "Verify an audit receipt" box now surfaces bound/unbound like the
// regulator. Paste a fabricated, never-deposited (but proof-valid) receipt -> expect the AMBER
// "valid but NOT bound to on-chain state" state (not green "verified and bound", not red invalid).
import { chromium } from "playwright-core";
import { readFileSync } from "fs";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://localhost:3000";
const SHOTS = "scripts/qa-shots";
let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log("  PASS " + n); };
const bad = (n, e) => { fail++; console.log("  FAIL " + n + (e ? " :: " + e : "")); };
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const errs = [];
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errs.push("console.error: " + m.text().slice(0, 160)); });
page.setDefaultTimeout(30000);

const fab = readFileSync("scripts/qa-shots/qa4-fabricated-threshold.json", "utf8");

console.log("\n=== DEMO · paste-verify bound/unbound ===");
await page.goto(BASE + "/demo", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
// The verify box is inside a <details> in the last demo step. Jump to the last step, open details.
// The step pager: click "Next →" until it disappears (reach final step), then open the details.
for (let i = 0; i < 8; i++) {
  const next = page.getByRole("button", { name: /Next →|Next/ }).first();
  if (await next.count() && await next.isVisible().catch(() => false)) { await next.click().catch(() => {}); await page.waitForTimeout(300); }
  else break;
}
// open the verify-receipt details (summary "Verify an audit receipt independently")
const summary = page.locator("details.verify-receipt summary, summary").filter({ hasText: /Verify an audit receipt/i }).first();
let opened = false;
if (await summary.count()) { await summary.scrollIntoViewIfNeeded().catch(() => {}); await summary.click().catch(() => {}); await page.waitForTimeout(300); opened = true; }
const ta = page.locator('textarea[aria-label="Audit receipt JSON"]');
if (!(await ta.count())) { bad("could not find the demo receipt textarea (details not open?)"); }
else {
  ok(`demo 'Verify an audit receipt' box present${opened ? " (details opened)" : ""}`);
  await ta.fill(fab);
  await page.getByRole("button", { name: /Verify receipt/i }).click();
  // verifyReceipt runs a real proof + on-chain check; give it time
  await page.waitForTimeout(9000);
  const res = await page.evaluate(() => document.body.innerText);
  const amber = /valid but NOT bound|NOT bound to on-chain state/i.test(res);
  const greenBound = /Verified and bound to real on-chain state/i.test(res);
  const invalid = /Not valid\.|proof was rejected|proof did not verify/i.test(res);
  if (amber && !greenBound) ok("fabricated never-deposited receipt shows the AMBER 'valid but NOT bound' state (matches regulator)");
  else if (greenBound) bad("fabricated receipt wrongly shows GREEN 'verified and bound'", "should be amber");
  else if (invalid) bad("fabricated receipt shows INVALID — expected amber valid-but-unbound (local proof should verify)");
  else bad("no bound/unbound verdict surfaced in the demo console", res.slice(res.indexOf("Verify an audit"), res.indexOf("Verify an audit") + 300));
  // capture the boundReason wording too
  const reason = await page.evaluate(() => {
    const m = document.body.innerText.match(/(valid but NOT bound[^\n]*)/i);
    return m ? m[1].slice(0, 160) : "";
  });
  if (reason) console.log("    verdict text: " + reason);
  await page.screenshot({ path: `${SHOTS}/qa5-demo-unbound.png`, fullPage: true }).catch(() => {});
}

// source parity check with the regulator wording
const src = readFileSync("webapp/app/demo/page.tsx", "utf8");
/valid but NOT bound to on-chain state/i.test(src) && /Verified and bound to real on-chain state/i.test(src)
  ? ok("demo source carries both green-bound and amber-unbound branches (parity with regulator)")
  : bad("demo source missing bound/unbound branches");

console.log("\n=== ERRORS (filtered) ===");
const note = errs.filter((e) => !/er-api|Failed to load resource|favicon|reflector|manifest|Permissions-Policy|429|throttl/i.test(e));
console.log(note.length ? note.slice(0, 20).map((e) => "  - " + e).join("\n") : "  none");
console.log(`\n=== qa5-demo: ${pass}/${pass + fail} checks passed ===`);
await browser.close();
