// QA end-to-end (ONE on-chain deposit, serialized): sender real send -> bearer note ->
// receiver claim -> reveal (on-chain read) -> exact disclosure receipt (browser + on-chain verify)
// -> export -> regulator verify (valid) -> tamper (invalid). Also reach withdraw-submit.
import { chromium } from "playwright-core";
import { readFileSync, writeFileSync } from "node:fs";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://localhost:3000";
const SHOTS = "scripts/qa-shots";
const TMP = process.env.TMP || ".";
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

let bearer = null;
let receiptJson = null;

// Connect the demo key only if not already connected (connection persists across navigations).
async function connectDemo() {
  const btn = page.getByRole("button", { name: "Use testnet key" }).first();
  if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await btn.click();
    await page.waitForTimeout(1500);
  }
}

// -------- 1) SENDER: real deposit --------
try {
  await page.goto(BASE + "/sender", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await page.locator("#amount").fill("20");
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByText(/Confirm and send/i).waitFor({ timeout: 8000 });
  await connectDemo();
  await page.getByRole("button", { name: /^Send \$20/ }).click();
  // progress -> success (or handled failure). Allow generous time for prove+deposit+register.
  await page.getByText(/Sent and shielded/i).waitFor({ timeout: 180000 });
  const pre = page.locator("pre").filter({ hasText: /tukar1:/ }).first();
  await pre.waitFor({ timeout: 8000 });
  bearer = (await pre.innerText()).trim();
  assert(/^tukar1:/.test(bearer), "no bearer note: " + bearer.slice(0, 30));
  await page.screenshot({ path: `${SHOTS}/sender-success.png` });
  ok("sender — real on-chain deposit reaches success + emits bearer note (tukar1:)");
} catch (e) {
  bad("sender — real on-chain deposit reaches success", (e.message || String(e)).split("\n")[0]);
  await page.screenshot({ path: `${SHOTS}/sender-fail.png` }).catch(() => {});
}

// -------- 2) RECEIVER: claim -> reveal -> exact disclosure receipt -> export --------
if (bearer) {
  try {
    await page.goto(BASE + "/receiver", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    await connectDemo();
    await page.locator("textarea").first().fill(bearer);
    await page.getByRole("button", { name: "Claim payment" }).click();
    await page.getByText(/shielded arrival/i).waitFor({ timeout: 10000 });
    ok("receiver — claims the sender's bearer note (happy path)");
  } catch (e) {
    bad("receiver — claims the sender's bearer note", (e.message || String(e)).split("\n")[0]);
  }

  try {
    // reveal (on-chain read: MX corridor is oracle-backed)
    await page.getByRole("button", { name: /Reveal in/ }).first().click();
    await page.waitForTimeout(6000);
    const revealed = await page.getByText(/Reflector|live FX rate|converted/i).first().isVisible().catch(() => false);
    assert(revealed, "no reveal figure shown");
    ok("receiver — reveal reads off-ramp figure on-chain (Reflector/FX)");
  } catch (e) {
    bad("receiver — reveal reads off-ramp figure on-chain", (e.message || String(e)).split("\n")[0]);
  }

  try {
    // disclosure: exact
    await page.getByRole("button", { name: /Prove a fact/ }).first().click();
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: /Generate proof/ }).click();
    // exact disclosure verifies in-browser then on-chain read
    await page.getByText(/verified in your browser|Verified on-chain|Exact disclosure verified/i).first().waitFor({ timeout: 90000 });
    const onchain = await page.getByText(/Verified on-chain/i).first().isVisible().catch(() => false);
    // export receipt
    const [dl] = await Promise.all([
      page.waitForEvent("download", { timeout: 15000 }),
      page.getByRole("button", { name: /Export receipt/ }).click(),
    ]);
    const path = await dl.path();
    receiptJson = readFileSync(path, "utf8");
    assert(/"proof"/.test(receiptJson) && /"publicSignals"/.test(receiptJson), "receipt missing proof/publicSignals");
    writeFileSync(`${SHOTS}/last-receipt.json`, receiptJson);
    await page.screenshot({ path: `${SHOTS}/receiver-disclosure.png` });
    ok(`receiver — exact disclosure proof generated${onchain ? " + verified ON-CHAIN" : " (browser-only, on-chain read unavailable)"} + receipt exported`);
  } catch (e) {
    bad("receiver — exact disclosure + receipt export", (e.message || String(e)).split("\n")[0]);
  }

  // reach withdraw-submit (do not require confirmation)
  try {
    await page.getByRole("button", { name: /Withdraw on-chain/ }).first().click();
    await page.getByText(/Building the shielded transfer proof|Releasing tokens|withdrawn on-chain|already spent|not registered/i).first().waitFor({ timeout: 60000 });
    ok("receiver — withdraw reaches proving/submit step");
  } catch (e) {
    bad("receiver — withdraw reaches proving/submit step", (e.message || String(e)).split("\n")[0]);
  }
}

// -------- 3) REGULATOR: verify valid, then tamper -> invalid --------
if (receiptJson) {
  try {
    await page.goto(BASE + "/regulator", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    await page.getByRole("button", { name: "Verify disclosure", exact: true }).click();
    await page.locator("textarea#receipt").waitFor({ state: "visible", timeout: 10000 });
    await page.locator("textarea#receipt").fill(receiptJson);
    await page.getByRole("button", { name: /Re-verify in browser and on-chain/i }).click();
    await page.getByText(/In your browser:/i).waitFor({ timeout: 90000 });
    const resultTxt = await page.locator("div").filter({ hasText: /In your browser:/i }).last().innerText();
    assert(/✓ valid/.test(resultTxt), "receipt not valid in browser: " + resultTxt.slice(0, 120));
    await page.screenshot({ path: `${SHOTS}/regulator-verify-valid.png` });
    ok("regulator — real exported receipt re-verifies VALID (browser" + (/On the live Stellar verifier:[\s\S]*valid/i.test(resultTxt) ? " + on-chain" : "") + ")");
  } catch (e) {
    bad("regulator — real receipt re-verifies valid", (e.message || String(e)).split("\n")[0]);
  }

  try {
    // tamper: corrupt a public signal so Groth16 fails
    const obj = JSON.parse(receiptJson);
    if (Array.isArray(obj.publicSignals) && obj.publicSignals.length > 1) {
      obj.publicSignals[1] = (BigInt(obj.publicSignals[1] || "1") + 1n).toString();
    } else if (obj.proof && obj.proof.pi_a) {
      obj.proof.pi_a[0] = (BigInt(obj.proof.pi_a[0]) + 1n).toString();
    }
    await page.locator("textarea#receipt").fill(JSON.stringify(obj));
    await page.getByRole("button", { name: /Re-verify in browser and on-chain/i }).click();
    await page.getByText(/In your browser:/i).waitFor({ timeout: 90000 });
    const t = await page.locator("div").filter({ hasText: /In your browser:/i }).last().innerText();
    assert(/✗ invalid/.test(t), "tampered receipt not marked invalid: " + t.slice(0, 120));
    await page.screenshot({ path: `${SHOTS}/regulator-verify-tampered.png` });
    ok("regulator — tampered receipt correctly rejected (INVALID)");
  } catch (e) {
    bad("regulator — tampered receipt rejected", (e.message || String(e)).split("\n")[0]);
  }
}

console.log("\nUncaught page errors: " + (errs.length ? JSON.stringify(errs) : "none"));
console.log("=== " + results.filter((r) => r[0]).length + "/" + results.length + " passed ===");
results.filter((r) => !r[0]).forEach((r) => console.log("FAIL:", r[1]));
await browser.close();
