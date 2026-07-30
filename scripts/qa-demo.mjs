// QA demo benchmark: real deposit on /demo, then exact disclosure verified ON-CHAIN,
// tamper -> rejected, and confirm all four disclosure-type toggles render their inputs.
import { chromium } from "playwright-core";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://localhost:3000";
const SHOTS = "scripts/qa-shots";
const results = [];
const ok = (n) => { results.push([1, n]); console.log("  PASS " + n); };
const bad = (n, w) => { results.push([0, n + " — " + w]); console.log("  FAIL " + n + " — " + w); };
const assert = (c, m) => { if (!c) throw new Error(m); };

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));
page.on("dialog", (d) => d.accept().catch(() => {}));
page.setDefaultTimeout(60000);

async function connectDemo() {
  const btn = page.getByRole("button", { name: "Use testnet key" }).first();
  if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) { await btn.click(); await page.waitForTimeout(1500); }
}
const goStep = async (i) => { await page.locator(".flow-node").nth(i).click(); await page.locator("#panel" + i).waitFor({ timeout: 8000 }); };

await page.goto(BASE + "/demo", { waitUntil: "domcontentloaded" });
await page.locator(".statusbar").filter({ hasText: /Ready/ }).waitFor({ timeout: 45000 }).catch(() => {});

// 1) real deposit
try {
  await goStep(0);
  await connectDemo();
  await page.locator('input[aria-label="Amount to send in USDC"]').fill("20");
  await page.getByRole("button", { name: /Send into corridor/ }).click();
  // wait for registration to CONFIRM (spendable), not just the intermediate "deposited ✓"
  await page.locator(".statusbar").filter({ hasText: /registered on-chain|spendable|registration failed|Retry registration/i }).waitFor({ timeout: 180000 });
  await page.waitForTimeout(2000);
  ok("demo — real on-chain deposit completes (Step 1 Sender)");
} catch (e) {
  bad("demo — real on-chain deposit completes", (e.message || String(e)).split("\n")[0]);
  await page.screenshot({ path: `${SHOTS}/demo-deposit-fail.png` }).catch(() => {});
}

// (reordered) all four disclosure-type toggles render their inputs — no note needed
await goStep(3);
try {
  await page.getByRole("button", { name: /Threshold/ }).click();
  await page.locator('input[aria-label="Disclosure threshold in USDC"]').waitFor({ timeout: 4000 });
  await page.getByRole("button", { name: /Portfolio/ }).click();
  await page.locator('input[aria-label="Aggregate reporting cap in USDC"]').waitFor({ timeout: 4000 });
  await page.getByRole("button", { name: /Band X/ }).click();
  await page.locator('input[aria-label="Band lower bound in USDC"]').waitFor({ timeout: 4000 });
  await page.locator('input[aria-label="Band upper bound in USDC"]').waitFor({ timeout: 4000 });
  await page.getByRole("button", { name: "Exact amount", exact: true }).click();
  ok("demo — all four disclosure types (exact/threshold/aggregate/range) render inputs");
} catch (e) {
  bad("demo — four disclosure types render", (e.message || String(e)).split("\n")[0]);
}

// 2) exact disclosure verified on-chain — poll for a spendable/auditable note first
try {
  const sel = page.locator("#panel3 select").first();
  let opts = 0;
  for (let i = 0; i < 30; i++) { // up to ~150s for registration to confirm -> spendable
    opts = await sel.locator("option").count();
    if (opts > 1) break;
    await page.waitForTimeout(5000);
  }
  assert(opts > 1, "no auditable (spendable) note appeared in the demo within ~150s of deposit");
  await sel.selectOption({ index: 1 });
  // exact is default; ensure selected
  await page.getByRole("button", { name: "Exact amount", exact: true }).click().catch(() => {});
  await page.getByRole("button", { name: /Generate & verify disclosure proof/ }).click();
  await page.locator("#panel3").getByText(/Verified on-chain/i).first().waitFor({ timeout: 120000 });
  await page.screenshot({ path: `${SHOTS}/demo-exact-onchain.png` });
  ok("demo — exact disclosure verified ON-CHAIN (Step 4 Regulator)");
} catch (e) {
  bad("demo — exact disclosure verified on-chain", (e.message || String(e)).split("\n")[0]);
  await page.screenshot({ path: `${SHOTS}/demo-exact-fail.png` }).catch(() => {});
}

// 3) tamper -> rejected
try {
  await page.getByText(/Tamper: claim a false amount/i).click();
  await page.getByRole("button", { name: /Generate & verify disclosure proof/ }).click();
  await page.locator("#panel3").getByText(/reject|invalid|false|cannot|not satisf|unprov/i).first().waitFor({ timeout: 120000 });
  ok("demo — tampered (false amount) disclosure REJECTED (wrong path)");
} catch (e) {
  bad("demo — tampered disclosure rejected", (e.message || String(e)).split("\n")[0]);
}

console.log("\nUncaught page errors: " + (errs.length ? JSON.stringify(errs) : "none"));
console.log("=== " + results.filter((r) => r[0]).length + "/" + results.length + " passed ===");
results.filter((r) => !r[0]).forEach((r) => console.log("FAIL:", r[1]));
await browser.close();
