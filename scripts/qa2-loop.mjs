// QA2 — DEEP cross-actor end-to-end loop (ONE real deposit, everything serialized on one tab
// so the demo-key sequence is never contended). Flow:
//   sender real deposit -> copy tukar1: bearer note -> receiver claim -> reveal (on-chain read)
//   -> for EACH disclosure {exact, threshold, range, aggregate}: generate proof (browser + on-chain),
//      export the receipt JSON -> collect it.
//   -> regulator: for EACH exported receipt, paste + verify (expect VALID in browser & on-chain),
//      then tamper one char and re-verify (expect INVALID).
// Records reached-submit vs confirmed per disclosure. Evidence to scripts/qa-shots/qa2-*.
import { chromium } from "playwright-core";
import { readFileSync, writeFileSync } from "node:fs";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://localhost:3000";
const SHOTS = "scripts/qa-shots";
const log = (s) => console.log(s);
const step = (s) => console.log("\n=== " + s + " ===");

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errs.push("console.error: " + m.text().slice(0, 300)); });
page.on("requestfailed", (r) => { const u = r.url(); if (!/er-api|onramper|reflector|stellar\.expert/.test(u)) errs.push("reqfailed: " + u + " " + (r.failure()?.errorText || "")); });
page.on("dialog", (d) => d.accept().catch(() => {}));
page.setDefaultTimeout(60000);

const summary = { deposit: "?", claim: "?", reveal: "?", disclosures: {}, regulator: {} };

async function connectDemo() {
  const btn = page.getByRole("button", { name: "Use testnet key" }).first();
  if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) { await btn.click(); await page.waitForTimeout(1500); }
}

let bearer = null;
const receipts = {}; // type -> json string

// ---------- 1) SENDER deposit ----------
step("SENDER — real deposit ($15)");
try {
  await page.goto(BASE + "/sender", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await page.locator("#amount").fill("15");
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByText(/Confirm and send/i).waitFor({ timeout: 8000 });
  await connectDemo();
  await page.getByRole("button", { name: /^Send \$15/ }).click();
  await page.getByText(/Sent and shielded/i).waitFor({ timeout: 200000 });
  const pre = page.locator("pre").filter({ hasText: /tukar1:/ }).first();
  await pre.waitFor({ timeout: 8000 });
  bearer = (await pre.innerText()).trim();
  const regOk = await page.getByText(/spendable/i).first().isVisible().catch(() => false);
  await page.screenshot({ path: `${SHOTS}/qa2-sender-success.png` });
  summary.deposit = "confirmed" + (regOk ? " (tree registered)" : " (deposit landed, tree reg unconfirmed)");
  log("  deposit " + summary.deposit + " · bearer len " + bearer.length);
} catch (e) {
  summary.deposit = "FAIL: " + (e.message || e).split("\n")[0];
  await page.screenshot({ path: `${SHOTS}/qa2-sender-fail.png` }).catch(() => {});
  log("  " + summary.deposit);
}

// ---------- 2) RECEIVER claim + reveal ----------
if (bearer) {
  step("RECEIVER — claim the exact bearer note");
  try {
    await page.goto(BASE + "/receiver", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    await connectDemo();
    // ensure on Claim tab
    await page.getByRole("tab", { name: /claim/i }).click().catch(() => {});
    await page.locator("textarea").first().fill(bearer);
    await page.getByRole("button", { name: "Claim payment" }).click();
    await page.getByText(/shielded arrival/i).waitFor({ timeout: 12000 });
    summary.claim = "confirmed";
    log("  claim confirmed (card shows shielded arrival)");
  } catch (e) { summary.claim = "FAIL: " + (e.message || e).split("\n")[0]; log("  " + summary.claim); }

  step("RECEIVER — reveal local figure (on-chain read)");
  try {
    await page.getByRole("button", { name: /Reveal in/ }).first().click();
    await page.waitForTimeout(6000);
    const revealed = await page.getByText(/converted|Reflector|live FX/i).first().isVisible().catch(() => false);
    summary.reveal = revealed ? "confirmed (figure shown)" : "no figure (oracle/FX unavailable)";
    log("  reveal: " + summary.reveal);
  } catch (e) { summary.reveal = "FAIL: " + (e.message || e).split("\n")[0]; log("  " + summary.reveal); }

  // open the Prove-to-regulator expander (native <details>)
  const discSelect = () => page.locator('select:has(option[value="exact"])').first();
  async function openProveExpander() {
    const details = page.locator('details:has(summary:has-text("Prove to a regulator"))').first();
    await details.scrollIntoViewIfNeeded();
    const isOpen = await details.evaluate((d) => d.open).catch(() => false);
    if (!isOpen) await details.locator("summary").first().click();
    await page.waitForTimeout(300);
  }

  async function runDisclosure(mode, label) {
    step(`RECEIVER — disclosure: ${label}`);
    const rec = { proof: "?", onchain: "?", export: "?" };
    try {
      await openProveExpander();
      await discSelect().selectOption(mode);
      await page.waitForTimeout(250);
      await page.getByRole("button", { name: /Generate proof/ }).click();
      // wait for either the fact box (Export receipt) or a rejection status
      const exportBtn = page.getByRole("button", { name: /Export receipt/ }).first();
      await exportBtn.waitFor({ timeout: 150000 });
      rec.proof = "generated";
      const onchain = await page.getByText(/Verified on-chain/i).first().isVisible().catch(() => false);
      rec.onchain = onchain ? "verified on-chain (submit confirmed)" : "browser-only (on-chain read unavailable)";
      const [dl] = await Promise.all([
        page.waitForEvent("download", { timeout: 15000 }),
        exportBtn.click(),
      ]);
      const p = await dl.path();
      const json = readFileSync(p, "utf8");
      const obj = JSON.parse(json);
      if (obj.type !== mode) throw new Error(`receipt type ${obj.type} != ${mode}`);
      receipts[mode] = json;
      writeFileSync(`${SHOTS}/qa2-receipt-${mode}.json`, json);
      rec.export = "exported (type=" + obj.type + ")";
      await page.screenshot({ path: `${SHOTS}/qa2-disc-${mode}.png` });
    } catch (e) {
      rec.proof = rec.proof === "?" ? "FAIL: " + (e.message || e).split("\n")[0] : rec.proof;
      rec.export = rec.export === "?" ? "not reached" : rec.export;
      // capture the status bar text for evidence
      const st = await page.locator(".fixed.inset-x-0.bottom-0").innerText().catch(() => "");
      log("  status bar: " + st.replace(/\s+/g, " ").slice(0, 200));
    }
    summary.disclosures[mode] = rec;
    log(`  ${label}: proof=${rec.proof} · onchain=${rec.onchain} · export=${rec.export}`);
  }

  await runDisclosure("exact", "Exact amount");
  await runDisclosure("threshold", "Threshold (<= figure)");
  await runDisclosure("range", "Range (band)");
  await runDisclosure("aggregate", "Aggregate (sum <= cap)");
}

// ---------- 3) REGULATOR verify each receipt: valid then tampered ----------
step("REGULATOR — re-verify each receipt (valid + tampered)");
try {
  await page.goto(BASE + "/regulator", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Verify disclosure", exact: true }).click();
  await page.locator("textarea#receipt").waitFor({ state: "visible", timeout: 10000 });
} catch (e) { log("  could not open Verify tab: " + (e.message || e).split("\n")[0]); }

for (const type of ["exact", "threshold", "range", "aggregate"]) {
  const json = receipts[type];
  const r = { valid: "no receipt", tampered: "n/a" };
  if (json) {
    // valid
    try {
      await page.locator("textarea#receipt").fill(json);
      await page.getByRole("button", { name: /Re-verify in browser and on-chain/i }).click();
      await page.getByText(/In your browser:/i).waitFor({ timeout: 120000 });
      const txt = await page.locator("div").filter({ hasText: /In your browser:/i }).last().innerText();
      const localValid = /✓ valid/.test(txt.split("On the live")[0]);
      const onchainValid = /On the live Stellar[\s\S]*✓ valid/.test(txt);
      r.valid = (localValid ? "browser ✓" : "browser ✗") + " · " + (onchainValid ? "on-chain ✓" : "on-chain ✗/unavail");
      await page.screenshot({ path: `${SHOTS}/qa2-reg-${type}-valid.png` });
    } catch (e) { r.valid = "FAIL: " + (e.message || e).split("\n")[0]; }
    // tampered
    try {
      const obj = JSON.parse(json);
      if (Array.isArray(obj.publicSignals) && obj.publicSignals.length > 1) {
        const i = obj.publicSignals.length - 1;
        obj.publicSignals[i] = (BigInt(obj.publicSignals[i] || "1") + 1n).toString();
      } else if (obj.proof?.pi_a) obj.proof.pi_a[0] = (BigInt(obj.proof.pi_a[0]) + 1n).toString();
      await page.locator("textarea#receipt").fill(JSON.stringify(obj));
      await page.getByRole("button", { name: /Re-verify in browser and on-chain/i }).click();
      await page.getByText(/In your browser:/i).waitFor({ timeout: 120000 });
      const txt = await page.locator("div").filter({ hasText: /In your browser:/i }).last().innerText();
      r.tampered = /✗ invalid/.test(txt) ? "correctly INVALID" : "NOT rejected: " + txt.replace(/\s+/g, " ").slice(0, 120);
      await page.screenshot({ path: `${SHOTS}/qa2-reg-${type}-tampered.png` });
    } catch (e) { r.tampered = "FAIL: " + (e.message || e).split("\n")[0]; }
  }
  summary.regulator[type] = r;
  log(`  ${type}: valid=${r.valid} · tampered=${r.tampered}`);
}

step("SUMMARY");
console.log(JSON.stringify(summary, null, 2));
console.log("\nConsole/page errors captured (" + errs.length + "):");
errs.slice(0, 40).forEach((e) => console.log("  - " + e));
await browser.close();
