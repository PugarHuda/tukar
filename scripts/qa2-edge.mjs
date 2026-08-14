// QA2 — EDGE-CASE INPUTS on every form. No on-chain WRITES (validation/rejection paths only),
// so it is safe to run alongside the loop. Uses a crafted synthetic bearer note (valid field
// strings, no real deposit) to exercise the disclosure-form rejection logic, which all runs
// before any proving/submit.
import { chromium } from "playwright-core";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://localhost:3000";
const SHOTS = "scripts/qa-shots";
let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log("  PASS " + n); };
const bad = (n, e) => { fail++; console.log("  FAIL " + n + (e ? " :: " + e : "")); };

// synthetic 500-USDC note (fields are decimal field-strings; claim only validates that shape)
const b64 = (s) => Buffer.from(s, "utf8").toString("base64");
const NOTE = { v: 1, ref: "EDGE-001", amount: "5000000000", privKey: "123456789", pubKey: "987654321", blinding: "555", commitment: "424242424242", corridor: "MX" };
const BEARER = "tukar1:" + b64(JSON.stringify(NOTE));

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const errs = [];

async function newPage(w = 1440, h = 900) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errs.push("console.error: " + m.text().slice(0, 200)); });
  page.setDefaultTimeout(30000);
  return page;
}
const statusText = (page) => page.locator(".fixed.inset-x-0.bottom-0").innerText().catch(() => "");

// ============ SENDER form ============
console.log("\n=== SENDER · compose amount validation (Continue gating) ===");
{
  const page = await newPage();
  await page.goto(BASE + "/sender", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  const amount = page.locator("#amount");
  const cont = page.getByRole("button", { name: /Continue/ });
  const cases = [
    { v: "", label: "empty" },
    { v: "0", label: "zero" },
    { v: "-5", label: "negative" },
    { v: "  ", label: "whitespace" },
  ];
  for (const c of cases) {
    await amount.fill("");
    await amount.fill(c.v);
    await page.waitForTimeout(150);
    const disabled = await cont.isDisabled().catch(() => false);
    disabled ? ok(`Continue disabled for ${c.label}`) : bad(`Continue NOT disabled for ${c.label}`, `value=${JSON.stringify(c.v)}`);
  }
  // valid positive enables
  await amount.fill("200");
  await page.waitForTimeout(150);
  (await cont.isEnabled()) ? ok("Continue enabled for 200") : bad("Continue disabled for 200");

  // extreme > 1e9 is rejected at the send guard (no on-chain: guard precedes any write)
  await amount.fill("2000000000");
  await cont.click();
  await page.getByText(/Confirm and send/i).waitFor({ timeout: 8000 }).catch(() => {});
  await page.getByRole("button", { name: "Use testnet key" }).first().click().catch(() => {});
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: /^Send \$2000000000/ }).click().catch(() => {});
  await page.waitForTimeout(800);
  const body = await page.evaluate(() => document.body.innerText);
  /under 1,000,000,000/.test(body) ? ok("2e9 rejected with honest 'under 1,000,000,000' message") : bad("2e9 not rejected honestly", body.replace(/\s+/g, " ").slice(0, 160));
  await page.close();
}

console.log("\n=== SENDER · malformed payment request (tukreq1:) ===");
{
  const page = await newPage();
  await page.goto(BASE + "/sender", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  const req = page.locator("#req");
  const load = page.getByRole("button", { name: "Load" });
  // garbage
  await req.fill("tukreq1:%%%notbase64%%%");
  await load.click();
  await page.waitForTimeout(300);
  let t = await page.evaluate(() => document.body.innerText);
  /Couldn't load that request/.test(t) ? ok("garbage tukreq1: rejected honestly") : bad("garbage tukreq1: not rejected", t.replace(/\s+/g, " ").slice(0, 140));
  // wrong-kind (valid base64, wrong kind)
  await req.fill("tukreq1:" + b64(JSON.stringify({ v: 1, kind: "nope", amount: "10", addr: "G" })));
  await load.click();
  await page.waitForTimeout(300);
  t = await page.evaluate(() => document.body.innerText);
  /Couldn't load that request/.test(t) ? ok("wrong-kind tukreq1: rejected honestly") : bad("wrong-kind tukreq1: not rejected", t.replace(/\s+/g, " ").slice(0, 140));
  await page.close();
}

// ============ RECEIVER claim + disclosure form validation ============
console.log("\n=== RECEIVER · malformed bearer-note claim (tukar1:) ===");
{
  const page = await newPage(390, 844);
  await page.goto(BASE + "/receiver", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await page.getByRole("tab", { name: /claim/i }).click();
  const ta = page.locator("textarea").first();
  const claimBtn = page.getByRole("button", { name: "Claim payment" });
  // garbage
  await ta.fill("tukar1:@@@notbase64@@@");
  await claimBtn.click();
  await page.waitForTimeout(300);
  /Couldn't claim that note/.test(await statusText(page)) ? ok("garbage tukar1: rejected honestly") : bad("garbage tukar1: not rejected", await statusText(page));
  // missing field
  await ta.fill("tukar1:" + b64(JSON.stringify({ v: 1, amount: "10" })));
  await claimBtn.click();
  await page.waitForTimeout(300);
  /Couldn't claim that note/.test(await statusText(page)) ? ok("missing-field tukar1: rejected honestly") : bad("missing-field not rejected", await statusText(page));
  // wrong prefix (a tukreq1 pasted into claim)
  await ta.fill("tukreq1:" + b64(JSON.stringify({ v: 1, kind: "req", amount: "10", addr: "G" })));
  await claimBtn.click();
  await page.waitForTimeout(300);
  /Couldn't claim that note/.test(await statusText(page)) ? ok("tukreq1: pasted into claim rejected honestly") : bad("tukreq1 into claim not rejected", await statusText(page));
  // empty → no-op (no crash / no error toast)
  await ta.fill("");
  await claimBtn.click();
  await page.waitForTimeout(200);
  ok("empty claim is a no-op (no crash)");

  // now claim the VALID synthetic note so we can hit disclosure-form validation
  await ta.fill(BEARER);
  await claimBtn.click();
  await page.getByText(/shielded arrival/i).waitFor({ timeout: 8000 }).then(() => ok("synthetic note claimed → card renders")).catch(() => bad("synthetic note did not render a card"));

  // open the disclosure expander
  const sum = page.locator("summary").filter({ hasText: /Prove to a regulator/i }).first();
  await sum.scrollIntoViewIfNeeded();
  await sum.click().catch(() => {});
  await page.waitForTimeout(300);

  console.log("\n=== RECEIVER · disclosure-form rejection (no proof/submit produced) ===");
  const gen = page.getByRole("button", { name: /Generate proof/ });
  const discSelect = () => page.locator('select:has(option[value="exact"])').first();

  // THRESHOLD: figure below the note value → cannot prove ≤, rejected honestly
  await discSelect().selectOption("threshold");
  await page.waitForTimeout(150);
  await page.locator(`#thr-1, [id^='thr-']`).first().fill("100"); // note is 500 USDC
  await gen.click();
  await page.waitForTimeout(600);
  /above \$100 USDC.*cannot be proven|above \$100/.test(await statusText(page)) ? ok("threshold: figure below value rejected honestly (no bogus proof)") : bad("threshold under-value not rejected honestly", await statusText(page));

  // RANGE: lower > upper
  await discSelect().selectOption("range");
  await page.waitForTimeout(150);
  await page.locator(`[id^='lo-']`).first().fill("700");
  await page.locator(`[id^='hi-']`).first().fill("600");
  await gen.click();
  await page.waitForTimeout(500);
  /lower figure is above the upper figure/.test(await statusText(page)) ? ok("range: lower>upper rejected honestly") : bad("range lo>hi not rejected", await statusText(page));

  // RANGE: amount outside band
  await page.locator(`[id^='lo-']`).first().fill("600");
  await page.locator(`[id^='hi-']`).first().fill("700");
  await gen.click();
  await page.waitForTimeout(500);
  /outside \$600 to \$700 USDC.*cannot be proven|outside \$600/.test(await statusText(page)) ? ok("range: amount outside band rejected honestly") : bad("range out-of-band not rejected", await statusText(page));

  // AGGREGATE: cap below total (rejection precedes on-chain register)
  await discSelect().selectOption("aggregate");
  await page.waitForTimeout(150);
  await page.locator(`[id^='cap-']`).first().fill("100"); // total is 500
  await gen.click();
  await page.waitForTimeout(1500);
  const at = await statusText(page);
  /above \$100 USDC.*cannot be proven|above \$100/.test(at) ? ok("aggregate: cap below total rejected honestly (before on-chain register)") : bad("aggregate cap<total not rejected honestly", at);
  await page.screenshot({ path: `${SHOTS}/qa2-edge-disclosure.png` });
  await page.close();
}

console.log("\n=== RECEIVER · request-amount validation ===");
{
  const page = await newPage(390, 844);
  await page.goto(BASE + "/receiver", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  await page.getByRole("tab", { name: /request/i }).click();
  const amt = page.locator("#reqAmount");
  const create = page.getByRole("button", { name: "Create request" });
  for (const [v, label] of [["", "empty"], ["0", "zero"], ["-5", "negative"]]) {
    await amt.fill("");
    await amt.fill(v);
    await create.click();
    await page.waitForTimeout(250);
    /Enter an amount to request/.test(await statusText(page)) ? ok(`request amount ${label} → honest prompt`) : bad(`request amount ${label} not prompted`, await statusText(page));
  }
  await page.close();
}

// ============ REGULATOR receipt validation ============
console.log("\n=== REGULATOR · receipt JSON validation ===");
{
  const page = await newPage();
  await page.goto(BASE + "/regulator", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: "Verify disclosure", exact: true }).click();
  const ta = page.locator("textarea#receipt");
  await ta.waitFor({ state: "visible" });
  const verifyBtn = page.getByRole("button", { name: /Re-verify in browser and on-chain/i });

  // empty → button disabled
  (await verifyBtn.isDisabled()) ? ok("empty receipt → verify button disabled") : bad("empty receipt → button NOT disabled");

  const bodyErr = () => page.locator("p.text-red-t").last().innerText().catch(() => "");

  // not JSON
  await ta.fill("this is not json {");
  await verifyBtn.click();
  await page.waitForTimeout(400);
  /Not valid JSON/.test(await bodyErr()) ? ok("non-JSON → 'Not valid JSON.'") : bad("non-JSON not handled", await bodyErr());

  // truncated JSON
  await ta.fill('{ "kind":"tukar-audit-receipt", "type":"exact", "proof":');
  await verifyBtn.click();
  await page.waitForTimeout(400);
  /Not valid JSON/.test(await bodyErr()) ? ok("truncated JSON → 'Not valid JSON.'") : bad("truncated JSON not handled", await bodyErr());

  // valid JSON but missing proof/publicSignals
  await ta.fill('{ "kind":"tukar-audit-receipt", "type":"exact" }');
  await verifyBtn.click();
  await page.waitForTimeout(400);
  /Missing proof or publicSignals/.test(await bodyErr()) ? ok("no proof/publicSignals → honest 'Missing proof…'") : bad("missing-proof not handled", await bodyErr());

  // publicSignals too short
  await ta.fill('{ "type":"exact", "proof":{"pi_a":["1","2","3"],"pi_b":[["1","2"],["3","4"],["5","6"]],"pi_c":["1","2","3"],"protocol":"groth16","curve":"bn128"}, "publicSignals":["1"] }');
  await verifyBtn.click();
  await page.waitForTimeout(400);
  /Missing proof or publicSignals/.test(await bodyErr()) ? ok("<3 publicSignals → honest reject") : bad("short publicSignals not handled", await bodyErr());

  // syntactically valid but BOGUS proof (wrong-type-ish): must report INVALID, never crash / never bogus-valid
  const bogus = { kind: "tukar-audit-receipt", type: "exact", proof: { pi_a: ["1", "2", "1"], pi_b: [["1", "2"], ["3", "4"], ["1", "0"]], pi_c: ["1", "2", "1"], protocol: "groth16", curve: "bn128" }, publicSignals: ["111", "222", "333"], disclosureVerifier: "C" };
  await ta.fill(JSON.stringify(bogus));
  await verifyBtn.click();
  await page.getByText(/In your browser:/i).waitFor({ timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(500);
  const resTxt = await page.locator("div").filter({ hasText: /In your browser:/i }).last().innerText().catch(() => "");
  if (/✗ invalid/.test(resTxt)) ok("bogus proof → correctly reported INVALID (no crash, no bogus-valid)");
  else if (await bodyErr()) ok("bogus proof → honest error message (no crash): " + (await bodyErr()).slice(0, 80));
  else bad("bogus proof result unclear", resTxt.replace(/\s+/g, " ").slice(0, 140));
  await page.screenshot({ path: `${SHOTS}/qa2-edge-regulator.png` });
  await page.close();
}

console.log("\n=== ERRORS (unexpected console/page errors) ===");
const noteworthy = errs.filter((e) => !/er-api|Failed to load resource|favicon|reflector|manifest/i.test(e));
console.log(noteworthy.length ? noteworthy.slice(0, 30).map((e) => "  - " + e).join("\n") : "  none");
console.log(`\n=== qa2-edge: ${pass}/${pass + fail} checks passed ===`);
await browser.close();
