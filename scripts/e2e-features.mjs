// Feature E2E — drives the NEW B+C features with REAL user interactions (Playwright over
// system Chrome), both HAPPY and WRONG paths, the way a user/judge would exercise them:
//   - deny-list demo: a sanctioned source makes the compliance proof unsatisfiable
//   - receipt re-verify: garbage rejected; a real exported receipt re-verifies in-browser + on-chain
//   - threshold (range) disclosure via the pool: ≤ threshold verifies on-chain; a false claim is unprovable
//   - aggregate (portfolio) disclosure via the pool: sum ≤ cap verifies on-chain; over-cap is unprovable
//   - oracle depth readout (B4) appears after an off-ramp reveal
//
//   node scripts/e2e-features.mjs [baseUrl]   (default http://localhost:8000)
// Run with the embedded demo key IDLE (no concurrent submitter): on-chain deposits share
// the key's sequence, so this spaces them with a settle delay.
import { chromium } from "playwright-core";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.argv[2] || "http://localhost:8000";
const results = [];
const ok = (name) => { results.push([true, name]); console.log(`  ✅ ${name}`); };
const bad = (name, why) => { results.push([false, `${name} — ${why}`]); console.log(`  ❌ ${name} — ${why}`); };
async function tc(name, fn) { try { await fn(); ok(name); } catch (e) { bad(name, e.message.split("\n")[0]); } }
const assert = (c, m) => { if (!c) throw new Error(m); };
const settleKey = () => new Promise((r) => setTimeout(r, 30000));

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
const page = await ctx.newPage();
page.setDefaultTimeout(60000);
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));
page.on("dialog", (d) => d.accept().catch(() => {}));

const DEMO = "/demo";
const statusText = () => page.locator("#status").innerText();
const waitStatus = (re, ms = 120000) => page.locator("#status").filter({ hasText: re }).waitFor({ timeout: ms });
const goStep = async (i) => {
  await page.locator("#fn" + i).click();
  await page.locator("#panel" + i).waitFor({ state: "visible", timeout: 15000 });
  await page.locator("#status").filter({ hasText: /Ready/ }).waitFor({ timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(200);
};
const connect = async () => {
  if (await page.locator("#sendBtn").isEnabled().catch(() => false)) return;
  await page.getByRole("button", { name: /Use testnet key/i }).click();
  await page.locator("#sendBtn:not([disabled])").waitFor({ timeout: 10000 });
};
const deposit = async (amt) => {
  await goStep(0); await connect();
  await page.locator("#corridor").selectOption("MX");
  await page.locator("#amount").fill(String(amt));
  await page.locator("#sendBtn").click();
  await waitStatus(/registered on-chain ✓|registration failed|deposit failed/i);
  assert(/registered on-chain ✓/i.test(await statusText()), `deposit ${amt} didn't register: "${await statusText()}"`);
};

console.log(`Feature E2E (Playwright real-click) against ${BASE}${DEMO}\n`);
await page.goto(BASE + DEMO, { waitUntil: "domcontentloaded" });
await page.locator("#status").filter({ hasText: /Ready/ }).waitFor({ timeout: 45000 });

// ---- WRONG-PATH cases that fail client-side (no on-chain tx, no key contention) ----

// Deny-list demo: a sanctioned (deny-listed) source can't produce a compliance proof.
await tc("deny-list demo: sanctioned source is BLOCKED (proof unsatisfiable)", async () => {
  await goStep(0); await connect();
  await page.locator("#amount").fill("120");
  await page.locator("#denyTamperLabel").click();
  await page.locator("#sendBtn").click();
  await waitStatus(/BLOCKED — source on the sanctions deny-list|deny-list|failed/i, 120000);
  assert(/deny-list/i.test(await statusText()), `expected deny-list block, got: "${await statusText()}"`);
  assert(!(await page.locator("#denyTamper").isChecked()), "deny toggle should auto-clear after the block");
});

// Receipt re-verify — wrong paths: junk and an incomplete object are rejected without crash.
await tc("receipt verify: garbage + incomplete receipt rejected (no crash)", async () => {
  await goStep(3);
  const before = pageErrors.length;
  await page.locator(".verify-receipt").evaluate((el) => { el.open = true; }); // expand the collapsible section
  await page.locator("#receiptInput").fill("not json {{{");
  await page.locator("#verifyReceiptBtn").click();
  await page.locator("#receiptResult").filter({ hasText: /Not valid JSON/i }).waitFor({ timeout: 8000 });
  await page.locator("#receiptInput").fill('{"kind":"tukar-audit-receipt"}');
  await page.locator("#verifyReceiptBtn").click();
  await page.locator("#receiptResult").filter({ hasText: /Missing/i }).waitFor({ timeout: 8000 });
  assert(pageErrors.length === before, `uncaught: ${pageErrors.slice(before).join("; ")}`);
});

// ---- ON-CHAIN cases: 3 real deposits (spaced), then read-only disclosure simulations ----
await settleKey();
await tc("deposit 3 payments on-chain (for aggregate + threshold)", async () => {
  await deposit(20); await settleKey();
  await deposit(20); await settleKey();
  await deposit(20);
});

// B4: the off-ramp reveal surfaces the Reflector oracle DEPTH (records + freshness).
await tc("oracle depth readout appears after reveal (B4)", async () => {
  await goStep(2);
  await page.locator("#incoming [data-reveal]").first().click();
  await page.locator(".oracle-depth").first().waitFor({ timeout: 30000 });
  assert(/Reflector depth/i.test(await page.locator(".oracle-depth").first().innerText()), "no oracle-depth readout");
});

// Threshold (range) disclosure via the pool — HAPPY: amount ≤ threshold verifies on-chain.
await tc("threshold disclosure ≤ threshold verified on-chain (via pool)", async () => {
  await goStep(3);
  await page.locator("#auditSelect").selectOption({ index: 1 }).catch(() => {});
  await page.locator("#discThresh").click();
  await page.locator("#threshVal").fill("1000");
  await page.locator("#proveBtn").click();
  await page.locator("#result [data-onchain]").filter({ hasText: /Verified on-chain/i }).waitFor({ timeout: 60000 });
});

// Threshold — WRONG: claiming a threshold below the real amount is unprovable (soundness).
await tc("threshold wrong path: claim below the amount is unprovable", async () => {
  await goStep(3);
  await page.locator("#auditSelect").selectOption({ index: 1 }).catch(() => {});
  await page.locator("#discThresh").click();
  await page.locator("#tamperLabel").click();
  await page.locator("#proveBtn").click();
  await page.locator("#result").filter({ hasText: /cannot be proven|not satisfiable|below the real|Threshold not satisfiable/i }).waitFor({ timeout: 60000 });
  await page.locator("#tamperLabel").click(); // reset the toggle
});

// Aggregate (portfolio) disclosure via the pool — HAPPY: sum ≤ cap verifies on-chain.
await tc("aggregate disclosure sum ≤ cap verified on-chain (via pool)", async () => {
  await goStep(3);
  await page.locator("#discAgg").click();
  await page.locator("#aggCap").fill("5000");
  await page.locator("#proveBtn").click();
  await page.locator("#result [data-onchain]").filter({ hasText: /Verified on-chain/i }).waitFor({ timeout: 60000 });
});

// Aggregate — WRONG: a cap below the real total can't be proven (soundness).
await tc("aggregate wrong path: sum over cap is unprovable", async () => {
  await goStep(3);
  await page.locator("#discAgg").click();
  await page.locator("#aggCap").fill("1"); // 1 USDC << 60 USDC total
  await page.locator("#proveBtn").click();
  await page.locator("#result").filter({ hasText: /above|cannot be proven|over cap/i }).waitFor({ timeout: 45000 });
});

// C2 range (band) disclosure via the pool — HAPPY: amount inside [1, 5000] verifies on-chain.
await tc("range disclosure in-band verified on-chain (via pool)", async () => {
  await goStep(3);
  await page.locator("#auditSelect").selectOption({ index: 1 }).catch(() => {});
  await page.locator("#discRange").click();
  await page.locator("#rangeLo").fill("1");
  await page.locator("#rangeHi").fill("5000");
  await page.locator("#proveBtn").click();
  await page.locator("#result [data-onchain]").filter({ hasText: /Verified on-chain/i }).waitFor({ timeout: 60000 });
});

// Range — WRONG: an amount outside the band can't be proven (soundness).
await tc("range wrong path: amount outside the band is unprovable", async () => {
  await goStep(3);
  await page.locator("#auditSelect").selectOption({ index: 1 }).catch(() => {});
  await page.locator("#discRange").click();
  await page.locator("#rangeLo").fill("1000"); // 20 USDC note is below 1000
  await page.locator("#rangeHi").fill("5000");
  await page.locator("#proveBtn").click();
  await page.locator("#result").filter({ hasText: /outside|cannot be proven|no false proof/i }).waitFor({ timeout: 45000 });
});

// Receipt re-verify — HAPPY: export a REAL receipt from an exact disclosure, paste it back,
// and confirm it re-verifies both in-browser and on the live Stellar verifier.
await tc("receipt verify: real exported receipt re-verifies in-browser + on-chain", async () => {
  await goStep(3);
  await page.locator("#auditSelect").selectOption({ index: 1 }).catch(() => {});
  await page.locator("#discExact").click();
  await page.locator("#proveBtn").click();
  await page.locator("#result [data-onchain]").filter({ hasText: /Verified on-chain/i }).waitFor({ timeout: 60000 });
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    page.locator("[data-receipt]").click(),
  ]);
  const stream = await download.createReadStream();
  let content = ""; for await (const chunk of stream) content += chunk.toString();
  await page.locator(".verify-receipt").evaluate((el) => { el.open = true; });
  await page.locator("#receiptInput").fill(content);
  await page.locator("#verifyReceiptBtn").click();
  await page.locator("#receiptResult").filter({ hasText: /valid/i }).waitFor({ timeout: 30000 });
  const txt = await page.locator("#receiptResult").innerText();
  assert(/browser:[\s\S]*valid/i.test(txt) && /Stellar[\s\S]*valid/i.test(txt), `receipt not both-valid: "${txt}"`);
});

// C3: anchor the receipt hash on-chain (MemoHash tx), then confirm a re-exported receipt
// carries the anchor and its content matches the timestamped hash.
await tc("receipt anchoring: on-chain timestamp + content-match re-verify", async () => {
  await goStep(3);
  await page.locator("[data-anchor]").click();
  await page.locator("[data-anchor]").filter({ hasText: /Anchored/i }).waitFor({ timeout: 90000 });
  const [dl] = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    page.locator("[data-receipt]").click(),
  ]);
  const stream = await dl.createReadStream();
  let content = ""; for await (const chunk of stream) content += chunk.toString();
  assert(/"anchor"/.test(content), "re-exported receipt is missing the anchor field");
  await page.locator(".verify-receipt").evaluate((el) => { el.open = true; });
  await page.locator("#receiptInput").fill(content);
  await page.locator("#verifyReceiptBtn").click();
  await page.locator("#receiptResult").filter({ hasText: /content matches/i }).waitFor({ timeout: 60000 });
});

// C5: real off-ramp — the SEP-24 WITHDRAW button runs SEP-10 auth + opens a genuine hosted
// withdraw session against the reference anchor (or surfaces a handled error). Real external
// call, so assert the handler reached a definitive outcome without crashing.
await tc("real anchor off-ramp (SEP-24 withdraw) reaches a definitive outcome", async () => {
  await goStep(2); await connect();
  const before = pageErrors.length;
  await page.locator("#offrampBtn").click();
  await page.locator("#status").filter({ hasText: /off-ramp opened|withdraw ↗|SEP-24 withdraw|off-ramp failed/i }).waitFor({ timeout: 45000 });
  assert(pageErrors.length === before, `uncaught: ${pageErrors.slice(before).join("; ")}`);
});

// L2: receipts are portable across disclosure TYPES — a RANGE receipt exports and re-verifies
// (in-browser + on-chain) via the per-type verifier routing, not just exact disclosures.
await tc("range receipt exports + re-verifies (per-type routing)", async () => {
  await goStep(3);
  await page.locator("#auditSelect").selectOption({ index: 1 }).catch(() => {});
  await page.locator("#discRange").click();
  await page.locator("#rangeLo").fill("1");
  await page.locator("#rangeHi").fill("5000");
  await page.locator("#proveBtn").click();
  await page.locator("#result [data-onchain]").filter({ hasText: /Verified on-chain/i }).waitFor({ timeout: 60000 });
  const [dl] = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    page.locator("[data-receipt]").click(),
  ]);
  const stream = await dl.createReadStream();
  let content = ""; for await (const chunk of stream) content += chunk.toString();
  assert(/"type"\s*:\s*"range"/.test(content), "range receipt missing type:range");
  await page.locator(".verify-receipt").evaluate((el) => { el.open = true; });
  await page.locator("#receiptInput").fill(content);
  await page.locator("#verifyReceiptBtn").click();
  await page.locator("#receiptResult").filter({ hasText: /range[\s\S]*disclosure/i }).waitFor({ timeout: 30000 });
  const txt = await page.locator("#receiptResult").innerText();
  assert(/browser:[\s\S]*valid/i.test(txt) && /Stellar[\s\S]*valid/i.test(txt), `range receipt not both-valid: "${txt}"`);
});

// C5 Path B: Onramper — fetch a REAL live sell quote from licensed providers + open the widget.
await tc("Onramper off-ramp fetches a live quote / opens the widget", async () => {
  await goStep(2); await connect();
  const before = pageErrors.length;
  await page.locator("#onramperBtn").click();
  await page.locator("#status").filter({ hasText: /Onramper off-ramp opened|Onramper ready|via <b|off-ramp failed|no live/i }).waitFor({ timeout: 45000 });
  assert(pageErrors.length === before, `uncaught: ${pageErrors.slice(before).join("; ")}`);
});

console.log(`\nUncaught page errors during run: ${pageErrors.length ? JSON.stringify(pageErrors) : "none"}`);
const passed = results.filter((r) => r[0]).length;
console.log(`\n=== ${passed}/${results.length} feature cases passed ===`);
results.filter((r) => !r[0]).forEach((r) => console.log("FAIL:", r[1]));
await browser.close();
process.exit(passed === results.length ? 0 : 1);
