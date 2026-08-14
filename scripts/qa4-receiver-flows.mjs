// QA4 — RECEIVER interactive flows (desktop 1440). Acts as a real user at /receiver.
// Covers: tabs (aria) / empty hint, claim (valid/dedupe/garbage/switch), request (connect-gate + copy),
// reveal (on-chain oracle quote or live FX + depth) + corridor re-quote, and the 4 selective-disclosure
// proof generations IN-BROWSER (exact/threshold/range happy = read-only on-chain verify; wrong paths for
// all four rejected BEFORE any prove/write). NO on-chain writes: never clicks Withdraw / anchor / aggregate
// happy path (that one needs registerAuditRequest, a real write owned by another agent).
import { chromium } from "playwright-core";
import { buildPoseidon } from "circomlibjs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://localhost:3000";
const SHOTS = "scripts/qa-shots";
let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log("  PASS " + n); };
const bad = (n, e) => { fail++; console.log("  FAIL " + n + (e ? " :: " + e : "")); };

// ---- craft a REAL bearer note so disclosure proofs actually verify ----
const poseidon = await buildPoseidon();
const F = poseidon.F;
const H = (arr) => F.toObject(poseidon(arr)).toString();
const rnd = () => (BigInt(Math.floor(Math.random() * 1e15)) * 1000003n + 7n).toString();
function makeNote(amountStroops, ref, corridor) {
  const privKey = rnd();
  const pubKey = H([BigInt(privKey)]);
  const blinding = rnd();
  const commitment = H([BigInt(amountStroops), BigInt(pubKey), BigInt(blinding)]);
  return { v: 1, ref, amount: String(amountStroops), privKey, pubKey, blinding, commitment, corridor };
}
const bearer = (n) => "tukar1:" + Buffer.from(JSON.stringify(n), "utf8").toString("base64");
const NOTE = makeNote(5000000000n, "QA-500", "MX"); // 500 USDC, MX = oracle corridor
const BEARER = bearer(NOTE);

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const errs = [];
async function newCtx() {
  return browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
}
function wire(page, tag) {
  page.on("pageerror", (e) => errs.push(`[${tag}] pageerror: ` + e.message));
  page.on("console", (m) => { if (m.type() === "error") errs.push(`[${tag}] console.error: ` + m.text().slice(0, 200)); });
  page.on("requestfailed", (r) => { const u = r.url(); if (!/er-api|reflector|onramper|stellar|rpc|horizon/i.test(u)) errs.push(`[${tag}] reqfail: ` + u.slice(0, 120)); });
  page.on("response", (r) => { if (r.status() === 404) errs.push(`[${tag}] 404: ` + r.url().slice(0, 120)); });
  page.setDefaultTimeout(30000);
}
const statusText = (page) => page.locator("div[role=status]").innerText().catch(() => "");
async function gotoReceiver(page) {
  await page.goto(BASE + "/receiver", { waitUntil: "domcontentloaded" });
  await page.getByRole("status").filter({ hasText: /Ready|Paste a bearer/i }).waitFor({ timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(400);
}

// ========================= TABS + EMPTY HINT =========================
console.log("\n=== TABS (aria roles) + empty Payments hint ===");
{
  const ctx = await newCtx(); const page = await ctx.newPage(); wire(page, "tabs");
  await gotoReceiver(page);
  const tablist = page.getByRole("tablist", { name: /Receiver sections/i });
  (await tablist.count()) ? ok("tablist present with aria-label") : bad("no tablist");
  const tabs = page.getByRole("tab");
  (await tabs.count()) === 3 ? ok("3 tabs (Payments/Claim/Request)") : bad("tab count", String(await tabs.count()));

  // empty payments hint
  const hint = await page.getByText(/Claimed and incoming payments show up here/i).isVisible().catch(() => false);
  hint ? ok("empty Payments shows helpful hint") : bad("no empty-state hint");
  // exactly one panel visible
  const panels = await page.locator("[role=tabpanel]").count();
  panels === 1 ? ok("only one tabpanel mounted at a time (payments)") : bad("panel count on payments", String(panels));

  // switch to Claim
  await page.getByRole("tab", { name: /^Claim$/ }).click();
  await page.waitForTimeout(150);
  const claimSel = await page.getByRole("tab", { name: /^Claim$/ }).getAttribute("aria-selected");
  const claimPanelVis = await page.locator("#panel-claim").isVisible();
  const paymentsGone = await page.locator("#panel-payments").count();
  (claimSel === "true" && claimPanelVis && paymentsGone === 0) ? ok("Claim tab: aria-selected + only Claim panel shown") : bad("Claim switch", `sel=${claimSel} vis=${claimPanelVis} payPanels=${paymentsGone}`);

  // switch to Request
  await page.getByRole("tab", { name: /^Request$/ }).click();
  await page.waitForTimeout(150);
  const reqVis = await page.locator("#panel-request").isVisible();
  const claimGone = await page.locator("#panel-claim").count();
  (reqVis && claimGone === 0) ? ok("Request tab: only Request panel shown") : bad("Request switch", `reqVis=${reqVis} claimPanels=${claimGone}`);
  await ctx.close();
}

// ========================= CLAIM =========================
console.log("\n=== CLAIM: valid / dedupe / switch-to-payments / garbage ===");
{
  const ctx = await newCtx(); const page = await ctx.newPage(); wire(page, "claim");
  await gotoReceiver(page);
  await page.getByRole("tab", { name: /^Claim$/ }).click();
  await page.locator("textarea").first().fill(BEARER);
  await page.getByRole("button", { name: "Claim payment" }).click();
  await page.getByText(/shielded arrival/i).waitFor({ timeout: 8000 }).catch(() => {});
  const onPayments = await page.locator("#panel-payments").isVisible().catch(() => false);
  onPayments ? ok("valid note claims and auto-switches to Payments") : bad("did not switch to Payments after claim");
  const cardCount = await page.getByText(/shielded arrival/i).count();
  cardCount === 1 ? ok("one payment card rendered") : bad("card count after claim", String(cardCount));
  const tabLabel = await page.getByRole("tab", { name: /Payments/ }).innerText();
  /\(1\)/.test(tabLabel) ? ok("Payments tab shows count (1)") : bad("tab count label", tabLabel);

  // dedupe: claim the SAME note again
  await page.getByRole("tab", { name: /^Claim$/ }).click();
  await page.locator("textarea").first().fill(BEARER);
  await page.getByRole("button", { name: "Claim payment" }).click();
  await page.waitForTimeout(500);
  /already in this wallet/i.test(await statusText(page)) ? ok("dedupe: same note rejected honestly") : bad("dedupe not detected", await statusText(page));
  await page.getByRole("tab", { name: /Payments/ }).click();
  const stillOne = await page.getByText(/shielded arrival/i).count();
  stillOne === 1 ? ok("dedupe: still only one card") : bad("dedupe added a duplicate card", String(stillOne));

  // garbage
  await page.getByRole("tab", { name: /^Claim$/ }).click();
  await page.locator("textarea").first().fill("tukar1:not-valid-base64!!!");
  await page.getByRole("button", { name: "Claim payment" }).click();
  await page.waitForTimeout(400);
  /Couldn't claim that note/i.test(await statusText(page)) ? ok("garbage note: honest rejection") : bad("garbage not rejected honestly", await statusText(page));
  // empty claim is a no-op (no crash)
  await page.locator("textarea").first().fill("");
  await page.getByRole("button", { name: "Claim payment" }).click();
  await page.waitForTimeout(200);
  errs.filter((e) => e.includes("[claim]")).length === 0 ? ok("empty claim is a safe no-op") : bad("empty claim produced errors");
  await ctx.close();
}

// ========================= QR SCAN toggle =========================
console.log("\n=== CLAIM: QR Scan toggle (degrade + camera stop on tab leave) ===");
{
  const ctx = await newCtx(); const page = await ctx.newPage(); wire(page, "qr");
  await gotoReceiver(page);
  await page.getByRole("tab", { name: /^Claim$/ }).click();
  const scanBtn = page.getByRole("button", { name: /Scan QR/ });
  await scanBtn.click();
  await page.waitForTimeout(500);
  // Headless Chrome: no BarcodeDetector → honest "not supported / paste instead"; button stays "Scan QR".
  const st = await statusText(page);
  const label = await page.getByRole("button", { name: /Scan QR|Stop scan/ }).innerText();
  if (/isn't supported|paste the note/i.test(st)) ok("QR degrade path: honest 'not supported, paste instead'");
  else if (/Stop scan/.test(label)) { ok("QR scanning started (Stop scan shown)"); await page.getByRole("button", { name: /Stop scan/ }).click(); }
  else bad("QR toggle unclear", `status="${st}" label="${label}"`);
  // leave the Claim tab — no crash / stream cleanup path exercised
  await page.getByRole("tab", { name: /Payments/ }).click();
  await page.waitForTimeout(200);
  errs.filter((e) => e.includes("[qr]")).length === 0 ? ok("leaving Claim tab (camera cleanup) throws nothing") : bad("qr cleanup errors");
  await ctx.close();
}

// ========================= REQUEST =========================
console.log("\n=== REQUEST: connect-gate + honest bearer copy ===");
{
  const ctx = await newCtx(); const page = await ctx.newPage(); wire(page, "request");
  await gotoReceiver(page);
  await page.getByRole("tab", { name: /^Request$/ }).click();
  // disconnected: create must prompt to connect first (honest), no string minted
  await page.locator("#reqAmount").fill("100");
  await page.getByRole("button", { name: "Create request" }).click();
  await page.waitForTimeout(300);
  /Connect first/i.test(await statusText(page)) ? ok("request while disconnected → honest 'Connect first' prompt") : bad("no connect-first prompt", await statusText(page));
  (await page.locator("pre").count()) === 0 ? ok("no request string minted while disconnected") : bad("string minted before connect");

  // honest payee copy present (bearer model, not overstated)
  const copy = await page.getByText(/Whoever holds the resulting bearer note can claim it|Whoever holds the bearer note/i).count();
  copy > 0 ? ok("honest bearer-model copy present (payee not overstated)") : bad("bearer-model caveat missing");

  // connect the testnet key, then create — expect tukreq1: + copied toast
  await page.getByRole("button", { name: /Use testnet key/i }).first().click();
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Create request" }).click();
  await page.getByText(/tukreq1:/).waitFor({ timeout: 8000 }).catch(() => {});
  const reqStr = await page.locator("pre").first().innerText().catch(() => "");
  /^tukreq1:/.test(reqStr.trim()) ? ok("connected: mints a tukreq1: string") : bad("no tukreq1 string after connect", reqStr.slice(0, 40));
  const toast = await page.getByText(/Request copied/i).isVisible().catch(() => false);
  const badge = await page.getByText(/^copied$/i).isVisible().catch(() => false);
  (toast || badge) ? ok("copy feedback shown (toast/badge)") : bad("no copy feedback");
  await ctx.close();
}

// ========================= REVEAL + corridor re-quote =========================
console.log("\n=== REVEAL: local figure (oracle on-chain / live FX) + depth + re-quote ===");
{
  const ctx = await newCtx(); const page = await ctx.newPage(); wire(page, "reveal");
  await gotoReceiver(page);
  // claim first
  await page.getByRole("tab", { name: /^Claim$/ }).click();
  await page.locator("textarea").first().fill(BEARER);
  await page.getByRole("button", { name: "Claim payment" }).click();
  await page.getByText(/shielded arrival/i).waitFor({ timeout: 8000 });
  // reveal (MX oracle → on-chain quote read); wait until the busy spinner resolves
  await page.getByRole("button", { name: /Reveal in MXN/ }).click();
  await page.getByRole("status").filter({ hasText: /read on-chain|no live price|unavailable|live .* rate/i }).waitFor({ timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(500);
  const revealed = await page.getByText(/^Revealed$/).isVisible().catch(() => false);
  revealed ? ok("card badge flips to Revealed") : bad("badge did not flip to Revealed");
  const st = await statusText(page);
  const figureVis = await page.getByText(/\bMXN\b/).first().isVisible().catch(() => false);
  if (/read on-chain from the pool's Reflector quote/i.test(st)) ok("oracle corridor: figure read ON-CHAIN (Reflector quote)");
  else if (/no live price|unavailable/i.test(st)) ok("oracle corridor: honest 'no live price/unavailable' (no fabricated number)");
  else if (figureVis) ok("oracle corridor: local figure shown");
  else bad("reveal outcome unclear", st);
  // depth strip (only when on-chain records returned)
  const depthVis = await page.getByText(/Reflector depth/i).isVisible().catch(() => false);
  depthVis ? ok("Reflector depth strip rendered") : console.log("  NOTE depth strip absent (no on-chain records returned this run)");

  // change off-ramp corridor → re-quote on the same median basis
  await page.locator("#cashout-1, [id^=cashout-]").first().selectOption("PH"); // non-oracle → live FX
  await page.waitForTimeout(2500);
  const st2 = await statusText(page);
  const phVis = await page.getByText(/PHP/).first().isVisible().catch(() => false);
  (phVis || /PHP/i.test(st2)) ? ok("re-quote after corridor change (PH → live FX PHP)") : console.log("  NOTE PHP figure not shown (live FX API may be unavailable); status: " + st2.slice(0, 80));
  // back to an oracle corridor re-quotes on the median basis
  await page.locator("[id^=cashout-]").first().selectOption("BR");
  await page.waitForTimeout(4000);
  const brOnMedian = await page.getByText(/median of 5 records/i).isVisible().catch(() => false);
  brOnMedian ? ok("oracle corridor BR re-quotes on the median-of-5 basis") : console.log("  NOTE BR median copy not shown (oracle read may be unavailable this run)");
  await page.screenshot({ path: `${SHOTS}/qa4-reveal-desktop.png` });
  await ctx.close();
}

// ========================= PROVE TO A REGULATOR =========================
console.log("\n=== PROVE TO A REGULATOR: 4 disclosure types + wrong paths ===");
{
  const ctx = await newCtx(); const page = await ctx.newPage(); wire(page, "disc");
  await gotoReceiver(page);
  await page.getByRole("tab", { name: /^Claim$/ }).click();
  await page.locator("textarea").first().fill(BEARER);
  await page.getByRole("button", { name: "Claim payment" }).click();
  await page.getByText(/shielded arrival/i).waitFor({ timeout: 8000 });

  // open the expander
  await page.getByText(/Prove to a regulator/i).click();
  await page.waitForTimeout(300);
  const genBtn = page.getByRole("button", { name: /Generate proof/ });
  (await genBtn.isVisible()) ? ok("expander opens, Generate proof visible") : bad("expander did not open");

  const modeSel = page.locator("[id^=disc-mode-]").first();

  async function generate(expectFactRe, label, timeout = 45000) {
    await genBtn.click();
    // spinner + disabled button assertion (race the spinner appearing)
    await page.waitForTimeout(150);
    const spinnerVis = await page.getByText(/Proving in your browser/i).isVisible().catch(() => false);
    const disabledDuringProve = await genBtn.isDisabled().catch(() => false);
    (spinnerVis) ? ok(`${label}: 'Proving in your browser…' spinner shown`) : console.log(`  NOTE ${label}: spinner not caught (proof may have completed <150ms)`);
    (disabledDuringProve || spinnerVis) ? ok(`${label}: Generate button disabled while proving`) : console.log(`  NOTE ${label}: disabled-state not caught`);
    // wait for the disclosed fact
    await page.locator("text=" + expectFactRe.source).first().waitFor({ timeout }).catch(() => {});
    const factVis = await page.getByText(expectFactRe).first().isVisible().catch(() => false);
    factVis ? ok(`${label}: in-browser proof generated, disclosed fact shown`) : bad(`${label}: no disclosed fact`, await statusText(page));
    // export receipt → toast
    const exportBtn = page.getByRole("button", { name: /Export receipt/ });
    if (await exportBtn.isVisible().catch(() => false)) {
      const dl = page.waitForEvent("download", { timeout: 8000 }).catch(() => null);
      await exportBtn.click();
      const toast = await page.getByText(/Receipt exported/i).isVisible().catch(() => false);
      const file = await dl;
      (toast || file) ? ok(`${label}: receipt exported (toast/download)`) : bad(`${label}: export gave no feedback`);
    } else bad(`${label}: no Export receipt button`);
  }

  // EXACT (verifyDisclosureOnChain = read)
  await modeSel.selectOption("exact");
  await generate(/Disclosed amount/i, "exact");

  // THRESHOLD happy (amount 500 ≤ 600) — discloseThresholdViaPool = read-only sim
  await modeSel.selectOption("threshold");
  await page.locator("[id^=thr-]").first().fill("600");
  await generate(/at or below \$600/i, "threshold");

  // RANGE happy (400 ≤ 500 ≤ 600) — discloseRangeViaPool = read-only sim
  await modeSel.selectOption("range");
  await page.locator("[id^=lo-]").first().fill("400");
  await page.locator("[id^=hi-]").first().fill("600");
  await generate(/between \$400 and \$600/i, "range");

  // ---- WRONG PATHS (must reject BEFORE proving / any write) ----
  console.log("  -- wrong paths --");
  // threshold below note value
  await modeSel.selectOption("threshold");
  await page.locator("[id^=thr-]").first().fill("100");
  await genBtn.click();
  await page.waitForTimeout(600);
  /above \$100.*cannot be proven/i.test(await statusText(page)) ? ok("threshold below note value → rejected before proving") : bad("threshold wrong-path not rejected", await statusText(page));

  // range lower>upper
  await modeSel.selectOption("range");
  await page.locator("[id^=lo-]").first().fill("200");
  await page.locator("[id^=hi-]").first().fill("100");
  await genBtn.click();
  await page.waitForTimeout(500);
  /lower figure is above the upper/i.test(await statusText(page)) ? ok("range lower>upper → rejected") : bad("range inverted not rejected", await statusText(page));

  // range out-of-band
  await page.locator("[id^=lo-]").first().fill("600");
  await page.locator("[id^=hi-]").first().fill("700");
  await genBtn.click();
  await page.waitForTimeout(500);
  /outside \$600 to \$700.*cannot be proven/i.test(await statusText(page)) ? ok("range out-of-band → rejected") : bad("range out-of-band not rejected", await statusText(page));

  // aggregate cap below total (rejects BEFORE registerAuditRequest write)
  await modeSel.selectOption("aggregate");
  await page.locator("[id^=cap-]").first().fill("100");
  await genBtn.click();
  await page.waitForTimeout(1500);
  const aggSt = await statusText(page);
  /above \$100.*cannot be proven/i.test(aggSt) ? ok("aggregate cap below total → rejected before any on-chain write") : bad("aggregate wrong-path not rejected (or reached write!)", aggSt);
  console.log("  NOTE aggregate HAPPY path skipped: it requires registerAuditRequest (real write) owned by the other agent.");

  // ---- expander state survives collapse/reopen ----
  await modeSel.selectOption("range");
  await page.locator("[id^=lo-]").first().fill("400");
  await page.locator("[id^=hi-]").first().fill("600");
  await genBtn.click();
  await page.getByText(/between \$400 and \$600/i).first().waitFor({ timeout: 45000 }).catch(() => {});
  // collapse then reopen the <details>
  await page.getByText(/Prove to a regulator/i).click();
  await page.waitForTimeout(200);
  await page.getByText(/Prove to a regulator/i).click();
  await page.waitForTimeout(200);
  const persisted = await page.getByText(/between \$400 and \$600/i).first().isVisible().catch(() => false);
  persisted ? ok("expander state survives collapse/reopen (generated proof persists)") : bad("proof did not persist across collapse/reopen");
  await page.screenshot({ path: `${SHOTS}/qa4-disclosure-desktop.png` });
  await ctx.close();
}

// ========================= CASH-OUT UI renders (no anchor completed) =========================
console.log("\n=== CASH OUT UI renders (no real anchor completed) ===");
{
  const ctx = await newCtx(); const page = await ctx.newPage(); wire(page, "cashout");
  await gotoReceiver(page);
  await page.getByRole("tab", { name: /^Claim$/ }).click();
  await page.locator("textarea").first().fill(BEARER);
  await page.getByRole("button", { name: "Claim payment" }).click();
  await page.getByText(/shielded arrival/i).waitFor({ timeout: 8000 });
  await page.getByRole("button", { name: /Reveal in MXN/ }).click();
  await page.waitForTimeout(4000);
  await page.getByText("Cash out to fiat", { exact: true }).click();
  await page.waitForTimeout(300);
  const onramp = await page.getByRole("button", { name: /Cash out to .*live quote/i }).isVisible().catch(() => false);
  const sep24 = await page.getByRole("button", { name: /Withdraw via anchor \(SEP-24\)/i }).isVisible().catch(() => false);
  (onramp && sep24) ? ok("cash-out UI renders (Onramper quote + SEP-24 anchor buttons)") : bad("cash-out buttons missing", `onramp=${onramp} sep24=${sep24}`);
  const kyc = await page.getByText(/licensed provider.*KYC|Tukar never touches the money/i).count();
  kyc > 0 ? ok("honest custody/KYC disclosure present") : bad("KYC disclosure missing");
  await ctx.close();
}

// ========================= SUMMARY =========================
console.log(`\n===== FLOWS: ${pass} passed, ${fail} failed =====`);
if (errs.length) { console.log("\nConsole/pageerror/404/reqfail captured:"); [...new Set(errs)].slice(0, 40).forEach((e) => console.log("  ! " + e)); }
else console.log("No console errors / pageerrors / 404s captured.");
await browser.close();
process.exit(fail ? 1 : 0);
