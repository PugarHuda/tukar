// QA5 RECEIVER (item 5) — on reveal, SPOT vs MEDIAN shown side by side for oracle corridors;
// switching to a NON-oracle corridor no longer shows an on-chain-worded spinner (shows an FX
// figure or an honest "prices from a live FX API, not on-chain" message). Reads only, no writes.
import { chromium } from "playwright-core";
import { readFileSync } from "fs";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://localhost:3000";
const SHOTS = "scripts/qa-shots";
const POOL = "CBIYQACYOKDBPYDGU7DMSHPGJEWP2ZRETXDVOTC5HTU5RJBGDK2MHTWJ";
const STORE_KEY = `tukar:rcv:notes:${POOL}`;
// A seeded claimed note (MX = MXN oracle corridor). Fields are dummies; reveal only reads a live
// Reflector off-ramp quote for the amount, so no real deposit is required for the read.
const SEED = { seq: 1, notes: [{ id: 1, ref: "PAY-QA5", amount: "5000000000", privKey: "1", pubKey: "2", blinding: "3", commitment: "12345", corridor: "MX", revealed: false }] };
let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log("  PASS " + n); };
const bad = (n, e) => { fail++; console.log("  FAIL " + n + (e ? " :: " + e : "")); };
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const errs = [];
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errs.push("console.error: " + m.text().slice(0, 160)); });
page.on("response", (r) => { if (r.status() === 404) errs.push("404: " + r.url()); });
page.setDefaultTimeout(30000);
await page.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch {} }, [STORE_KEY, JSON.stringify(SEED)]);

console.log("\n=== RECEIVER · reveal spot vs median (oracle) + non-oracle switch ===");
await page.goto(BASE + "/receiver", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500); // let prover + fxRates settle
// the seeded note should render a PaymentCard on the Payments tab
const card = page.getByText(/PAY-QA5|shielded arrival/).first();
(await card.count()) ? ok("seeded claimed note renders a PaymentCard on Payments tab") : bad("seeded note did not render (store key / load path?)");

// REVEAL (oracle MXN)
const revealBtn = page.getByRole("button", { name: /Reveal in MXN/i }).first();
if (!(await revealBtn.count())) bad("Reveal button (MXN) not found on the seeded card");
else {
  await revealBtn.click();
  // reveal does a live on-chain read (median + spot); poll for the spot/median block
  let shown = "", found = false;
  for (let i = 0; i < 16; i++) {
    await page.waitForTimeout(1200);
    const body = await page.evaluate(() => document.body.innerText);
    if (/Spot/.test(body) && /Median of 5/.test(body)) { found = true; shown = (body.match(/Spot[^\n]{0,120}Median of 5[^\n]{0,120}/) || [""])[0]; break; }
    if (/no live price|On-chain quote unavailable|has no live price/i.test(body)) { shown = "oracle returned no live MXN price"; break; }
  }
  found ? ok(`reveal shows SPOT and MEDIAN side by side for the oracle corridor: "${shown.slice(0, 110)}"`)
    : bad(`spot/median block not shown after reveal (${shown || "timed out"})`);
  await page.screenshot({ path: `${SHOTS}/qa5-receiver-reveal.png`, fullPage: true }).catch(() => {});

  // SWITCH to a NON-oracle corridor (Indonesia · IDR — no oracle) via the cash-out select
  const sel = page.locator("#cashout-1");
  if (await sel.count()) {
    await sel.selectOption("ID");
    await page.waitForTimeout(2500);
    const body = await page.evaluate(() => document.body.innerText);
    // must NOT show the on-chain-worded spinner text
    const spinnerOnChain = /Reading the IDR figure on-chain/i.test(body);
    // should show either a live FX figure or the honest FX-API unavailable line (never an on-chain spin)
    const honest = /prices from a live FX API, not on-chain|live IDR rate|at the live IDR rate|Shown at the live IDR/i.test(body);
    // also confirm there is no visible Spinner element with on-chain wording
    const spinnerEl = await page.evaluate(() => {
      return [...document.querySelectorAll("*")].some((e) => e.children.length === 0 && /Reading the .* figure on-chain/i.test(e.textContent || ""));
    });
    (!spinnerOnChain && !spinnerEl) ? ok("switching to non-oracle IDR shows NO on-chain-worded spinner")
      : bad("non-oracle switch still shows an on-chain-worded spinner", `text=${spinnerOnChain} el=${spinnerEl}`);
    honest ? ok("non-oracle IDR shows an honest FX figure / 'live FX API, not on-chain' message")
      : bad("non-oracle IDR did not surface an FX rate or honest unavailable message", body.slice(0, 200));
    await page.screenshot({ path: `${SHOTS}/qa5-receiver-nonoracle.png`, fullPage: true }).catch(() => {});
  } else bad("cash-out select #cashout-1 not found");
}

// source parity: PaymentCard shows spot beside median and never spins on a non-oracle re-quote
const src = readFileSync("webapp/components/receiver/PaymentCard.tsx", "utf8");
/Spot<\/span>.*Median of 5/s.test(src) && /prices from a live FX API, not on-chain/.test(src)
  ? ok("source: spot/median block + non-oracle 'live FX API, not on-chain' branch present")
  : bad("source parity check failed");

console.log("\n=== ERRORS (filtered) ===");
const note = errs.filter((e) => !/er-api|Failed to load resource|favicon|reflector|manifest|getUserMedia|Permissions-Policy|429|throttl/i.test(e));
console.log(note.length ? note.slice(0, 20).map((e) => "  - " + e).join("\n") : "  none");
console.log(`\n=== qa5-receiver: ${pass}/${pass + fail} checks passed ===`);
await browser.close();
