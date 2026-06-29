// End-to-end test driving REAL user interactions (genuine clicks/typing/selects,
// not evaluate-injection) with Playwright over the system Chrome. Covers UI gating,
// input validation, corridor switching, then one full on-chain happy path.
//
//   node scripts/e2e-playwright.mjs [baseUrl]   (default http://localhost:8000)
// Run with the embedded demo key IDLE (no concurrent submitter) for the on-chain case.
import { chromium } from "playwright-core";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.argv[2] || "http://localhost:8000";
const results = [];
const ok = (name) => { results.push([true, name]); console.log(`  ✅ ${name}`); };
const bad = (name, why) => { results.push([false, `${name} — ${why}`]); console.log(`  ❌ ${name} — ${why}`); };
async function tc(name, fn) { try { await fn(); ok(name); } catch (e) { bad(name, e.message); } }
const assert = (c, m) => { if (!c) throw new Error(m); };

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));

// Local static server needs the .html; Vercel rewrites /demo -> /demo.html.
const DEMO = BASE.includes("localhost") ? "/demo.html" : "/demo";
console.log(`E2E (Playwright real-click) against ${BASE}${DEMO}\n`);
await page.goto(BASE + DEMO, { waitUntil: "domcontentloaded" });

// 1) prover initializes
await tc("prover loads to Ready", async () => {
  await page.locator("#status").filter({ hasText: /Ready/ }).waitFor({ timeout: 45000 });
});

// 2) Send is gated before connecting
await tc("Send disabled before connecting", async () => {
  assert(await page.locator("#sendBtn").isDisabled(), "#sendBtn should be disabled pre-connect");
});

// 3) connecting the testnet key enables Send (real click)
await tc("Use testnet key enables Send", async () => {
  await page.getByRole("button", { name: /Use testnet key/i }).click();
  await page.locator("#sendBtn:not([disabled])").waitFor({ timeout: 10000 });
});

// 4) invalid amounts never crash and never start a send
await tc("invalid amounts rejected, no crash", async () => {
  const before = pageErrors.length;
  // ponytail: non-numeric ("abc") is blocked natively by input[type=number] — no JS
  // needed, so we only test numeric-representable invalids the JS guard must catch.
  for (const v of ["0", "-5", "1e308", "99999999999", ""]) {
    await page.locator("#amount").fill(v);
    await page.locator("#sendBtn").click();
    await page.waitForTimeout(500);
    const st = await page.locator("#status").innerText();
    // none of these should kick off proof-building / on-chain deposit
    assert(!/building|depositing|registering/i.test(st), `amount "${v}" started a send: "${st}"`);
  }
  assert(pageErrors.length === before, `uncaught error(s): ${pageErrors.slice(before).join("; ")}`);
});

// 5) all 7 corridors switch; MXN/BRL/ARS read on-chain, others on the FX-API fallback
await tc("corridor switching + labels (3 on-chain, 4 fallback)", async () => {
  await page.waitForTimeout(4000); // let loadFxRates settle the labels
  const want = { MX: /Reflector oracle \(on-chain\)/, BR: /Reflector oracle \(on-chain\)/, AR: /Reflector oracle \(on-chain\)/, PH: /· live/, IN: /· live/, NG: /· live/, CO: /· live/ };
  for (const [code, re] of Object.entries(want)) {
    await page.locator("#corridor").selectOption(code);
    await page.waitForTimeout(150);
    const txt = await page.locator("#rcvRate").innerText();
    assert(re.test(txt), `${code} label "${txt}" !~ ${re}`);
  }
});

// 6) full on-chain happy path: send -> reveal(on-chain quote) -> withdraw -> disclose -> tamper
await tc("FULL on-chain flow: deposit→reveal→withdraw→disclose→tamper", async () => {
  await page.locator("#corridor").selectOption("MX");
  await page.locator("#amount").fill("500");
  await page.locator("#sendBtn").click();
  await page.locator("#status").filter({ hasText: /registered on-chain ✓|registration failed|deposit failed/i }).waitFor({ timeout: 120000 });
  const dep = await page.locator("#status").innerText();
  assert(/registered on-chain ✓/i.test(dep), `deposit didn't register: "${dep}"`);

  // reveal -> off-ramp figure (computed on-chain by the pool reading Reflector)
  await page.locator("#incoming [data-reveal]").first().click();
  await page.locator("#incoming .mxn .amt").first().waitFor({ timeout: 15000 });
  const amt = await page.locator("#incoming .mxn .amt").first().innerText();
  assert(/MXN/.test(amt) && /\d/.test(amt), `off-ramp reveal odd: "${amt}"`);

  // withdraw on-chain
  await page.locator("#incoming [data-withdraw]").first().click();
  await page.locator("#status").filter({ hasText: /withdrawn on-chain ✓|withdraw failed/i }).waitFor({ timeout: 120000 });
  const wd = await page.locator("#status").innerText();
  assert(/withdrawn on-chain ✓/i.test(wd), `withdraw failed: "${wd}"`);

  // disclosure proof, verified on-chain
  await page.locator("#auditSelect").selectOption("1").catch(() => {});
  await page.locator("#proveBtn").click();
  await page.locator("#result [data-onchain]").filter({ hasText: /Verified on-chain/i }).waitFor({ timeout: 40000 });

  // tamper -> rejected in-browser AND on-chain (click the visible styled label,
  // as a user would — the real #tamper checkbox is display:none behind it)
  await page.locator("#tamperLabel").click();
  await page.locator("#proveBtn").click();
  await page.locator("#result [data-onchain]").filter({ hasText: /rejected/i }).waitFor({ timeout: 40000 });
});

// 7) disconnect re-gates Send
await tc("disconnect re-gates Send", async () => {
  await page.getByRole("button", { name: /Disconnect|Use testnet key/i }).first().click();
  await page.waitForTimeout(500);
  // after disconnect the button should be disabled again
  await page.locator("#sendBtn[disabled]").waitFor({ timeout: 5000 });
});

console.log(`\nUncaught page errors during run: ${pageErrors.length ? JSON.stringify(pageErrors) : "none"}`);
const passed = results.filter((r) => r[0]).length;
console.log(`\n=== ${passed}/${results.length} cases passed ===`);
results.filter((r) => !r[0]).forEach((r) => console.log("FAIL:", r[1]));
await browser.close();
process.exit(passed === results.length ? 0 : 1);
