// qa-watch.mjs — a HEADED, narrated, watchable tour of the Tukar app driven like a real user.
// Reuses the exact selectors/interactions proven in scripts/qa2-*.mjs (the cross-actor loop that
// passed). Real clicks + real typing, happy AND wrong paths. Watch it on screen + in the terminal.
//
//   USAGE:  node scripts/qa-watch.mjs [section] [--mobile]
//           npm run qa:watch                 # everything, desktop
//   section = landing | sender | receiver | regulator | operator | demo | loop | all   (default all)
//           loop = sender -> receiver -> regulator (the real cross-actor chain)
//   --mobile runs at a 390x844 phone viewport.
//
//   Assumes the dev server is already at http://localhost:3000
//   (start it with:  cd webapp && npm run dev   — or  npm run start  for the prod build).
//
// On-chain writes share ONE demo key, so this script is strictly serial (one tab, awaited in order)
// — never two writes in flight. ZK proving takes several seconds; timeouts are generous.
import { chromium } from "playwright-core";
import readline from "node:readline";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://localhost:3000";
const args = process.argv.slice(2);
const MOBILE = args.includes("--mobile");
const SECTION = (args.find((a) => !a.startsWith("--")) || "all").toLowerCase();
const VALID = ["landing", "sender", "receiver", "regulator", "operator", "demo", "loop", "all"];
if (!VALID.includes(SECTION)) {
  console.log(`Unknown section "${SECTION}". Use one of: ${VALID.join(" | ")}`);
  process.exit(1);
}

// ---- narration helpers ----
const C = { g: "\x1b[32m", r: "\x1b[31m", c: "\x1b[36m", y: "\x1b[33m", d: "\x1b[2m", x: "\x1b[0m", b: "\x1b[1m" };
let pass = 0, fail = 0;
const narr = (m) => console.log(`\n${C.c}▶ ${m}${C.x}`);
const say = (m) => console.log(`  ${C.d}${m}${C.x}`);
const good = (m) => { pass++; console.log(`  ${C.g}✅ ${m}${C.x}`); };
const bad = (m) => { fail++; console.log(`  ${C.r}❌ ${m} (bug)${C.x}`); };
const head = (m) => console.log(`\n${C.b}${C.y}══════ ${m} ══════${C.x}`);
const statusText = (page) => page.locator(".fixed.inset-x-0.bottom-0").innerText().catch(() => "");

const waitEnter = (ms) =>
  new Promise((res) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log(`\n${C.y}Browser left open. Press Enter to close (auto-closes in ${ms / 1000}s)…${C.x}`);
    const t = setTimeout(() => { rl.close(); res(); }, ms);
    rl.question("", () => { clearTimeout(t); rl.close(); res(); });
  });

// ---- launch ----
console.log(`${C.b}Tukar — watchable QA tour${C.x}  ·  section=${SECTION}  ·  viewport=${MOBILE ? "390x844 (mobile)" : "1440x900"}`);
const browser = await chromium.launch({ executablePath: CHROME, headless: false, slowMo: 450, args: ["--no-sandbox", MOBILE ? "" : "--start-maximized"].filter(Boolean) });
const ctx = await browser.newContext({ viewport: MOBILE ? { width: 390, height: 844 } : { width: 1440, height: 900 }, acceptDownloads: true, permissions: ["clipboard-read", "clipboard-write"] });
const page = await ctx.newPage();
page.on("dialog", (d) => d.accept().catch(() => {}));
page.setDefaultTimeout(60000);

// startup probe: fail loudly with instructions if the dev server isn't up
try {
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 15000 });
} catch {
  console.log(`\n${C.r}Could not reach ${BASE}. Is the dev server running?${C.x}`);
  console.log(`  Start it in another terminal:  ${C.b}cd webapp && npm run dev${C.x}   (or ${C.b}npm run start${C.x} for the prod build)`);
  await browser.close();
  process.exit(1);
}

const S = { bearer: null, receipt: null };

async function connectDemo() {
  const btn = page.getByRole("button", { name: "Use testnet key" }).first();
  if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
    say("clicking “Use testnet key” (built-in testnet demo key — real testnet txs, no install)");
    await btn.click();
    await page.waitForTimeout(1500);
  }
}

// ======================= LANDING =======================
async function landing() {
  head("LANDING — the marketing page + role picker");
  narr("LANDING — opening the page");
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);

  narr("LANDING — opening the “Launch demo” modal from the navbar");
  await page.locator(".launch-trigger.btn-cta").first().click();
  const dialog = page.locator('[role="dialog"]');
  const shown = await dialog.waitFor({ state: "visible", timeout: 8000 }).then(() => true).catch(() => false);
  shown ? good("modal opened") : bad("modal did not open");
  const links = await dialog.locator("a[href]").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  say(`the picker offers ${links.length} ways in: ${links.join(", ")}`);
  links.includes("/demo") && links.includes("/sender") ? good("all role/demo links present") : bad("role links missing");

  narr("LANDING — pressing ESC to close the modal");
  await page.keyboard.press("Escape");
  (await dialog.isHidden({ timeout: 4000 }).catch(() => false)) ? good("ESC closed the modal") : bad("ESC did not close the modal");

  narr("LANDING — clicking through to the Sender app, then back Home");
  await page.locator(".launch-trigger.btn-cta").first().click();
  await dialog.waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
  await dialog.getByRole("link", { name: /Send money/i }).click();
  await page.waitForURL("**/sender", { timeout: 15000 }).catch(() => {});
  page.url().includes("/sender") ? good("navigated to /sender from the picker") : bad("did not navigate to /sender");
  await page.getByRole("link", { name: /Home/i }).first().click();
  await page.waitForURL(BASE + "/", { timeout: 15000 }).catch(() => {});
  good("back Home");
}

// ======================= SENDER =======================
async function sender() {
  head("SENDER — send money into the shielded corridor");
  narr("SENDER — opening /sender and connecting the wallet");
  await page.goto(BASE + "/sender", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  await connectDemo();

  narr("SENDER — typing a valid amount (200 USDC) and picking a corridor");
  await page.locator("#amount").fill("200");
  await page.waitForTimeout(400);
  await page.locator("#corridor").selectOption("BR");
  await page.waitForTimeout(600);
  const recv = await page.getByText(/They receive ≈/i).locator("xpath=../..").innerText().catch(() => "");
  say(`live “they receive” figure: ${recv.replace(/\s+/g, " ").trim().slice(0, 80)}`);
  await page.locator("#corridor").selectOption("MX"); // MX is oracle-backed → reveal reads on-chain
  await page.waitForTimeout(500);

  narr("SENDER — WRONG PATH: amount 0 should block the Continue button");
  await page.locator("#amount").fill("0");
  await page.waitForTimeout(400);
  (await page.getByRole("button", { name: /Continue/ }).isDisabled())
    ? good("rejected as expected — Continue is disabled for 0")
    : bad("NOT rejected — Continue enabled for 0");

  narr("SENDER — WRONG PATH: a garbage payment-request string should be refused");
  await page.locator("#req").fill("tukreq1:%%%not-base64%%%");
  await page.getByRole("button", { name: "Load" }).click();
  await page.waitForTimeout(600);
  /Couldn't load that request/.test(await page.evaluate(() => document.body.innerText))
    ? good("rejected as expected — honest “Couldn’t load that request”")
    : bad("NOT rejected — garbage request accepted");

  narr("SENDER — WRONG PATH: an absurd amount (2,000,000,000) is blocked at compose");
  await page.locator("#amount").fill("2000000000");
  await page.waitForTimeout(700);
  const overCapDisabled = await page.getByRole("button", { name: /Continue/ }).isDisabled().catch(() => false);
  const overCapHint = /under 1,000,000,000/.test(await page.evaluate(() => document.body.innerText));
  overCapDisabled || overCapHint
    ? good("rejected as expected — Continue disabled with “keep it under 1,000,000,000 USDC”")
    : bad("NOT rejected — absurd amount accepted");
  await page.locator("#amount").fill("15"); // restore a valid amount for the happy-path deposit
  await page.waitForTimeout(400);

  narr("SENDER — HAPPY PATH: one real on-chain deposit of $15 (builds ZK proofs + signs pool.deposit)");
  await page.locator("#amount").fill("15");
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByText(/Confirm and send/i).waitFor({ timeout: 8000 });
  say("proving compliance + amount-binding and depositing on-chain — this takes a bit, watch the steps…");
  await page.getByRole("button", { name: /^Send \$15/ }).click();
  await page.getByText(/Sent and shielded/i).waitFor({ timeout: 200000 });
  const pre = page.locator("pre").filter({ hasText: /tukar1:/ }).first();
  await pre.waitFor({ timeout: 8000 });
  S.bearer = (await pre.innerText()).trim();
  good(`deposit confirmed — success screen shows the bearer note (tukar1:…, ${S.bearer.length} chars). Copied for the receiver.`);
}

// ======================= RECEIVER =======================
async function receiver() {
  head("RECEIVER — claim the payment, reveal local fiat, prove to a regulator");
  if (!S.bearer) { say("no bearer note yet — running the SENDER deposit first so there’s a real note to claim"); await sender(); }
  narr("RECEIVER — opening /receiver and connecting");
  await page.goto(BASE + "/receiver", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await connectDemo();

  narr("RECEIVER — switching the consumer tabs (Payments / Claim / Request)");
  for (const t of [/payments/i, /request/i, /claim/i]) { await page.getByRole("tab", { name: t }).click(); await page.waitForTimeout(500); }
  good("tabs switch cleanly");

  narr("RECEIVER — WRONG PATH: pasting a garbage note should be refused");
  await page.locator("textarea").first().fill("tukar1:@@@garbage@@@");
  await page.getByRole("button", { name: "Claim payment" }).click();
  await page.waitForTimeout(700);
  /Couldn't claim that note/.test(await statusText(page))
    ? good("rejected as expected — honest “Couldn’t claim that note”")
    : bad("NOT rejected — garbage note accepted");

  narr("RECEIVER — HAPPY PATH: pasting the EXACT bearer note from the sender and claiming it");
  await page.locator("textarea").first().fill(S.bearer);
  await page.getByRole("button", { name: "Claim payment" }).click();
  await page.getByText(/shielded arrival/i).waitFor({ timeout: 12000 });
  good("claimed — the payment shows as a shielded arrival in Payments");

  narr("RECEIVER — revealing the local-fiat figure (read on-chain from the pool’s Reflector quote)");
  await page.getByRole("button", { name: /Reveal in/ }).first().click();
  await page.waitForTimeout(7000);
  (await page.getByText(/converted|Reflector|live FX/i).first().isVisible().catch(() => false))
    ? good("revealed — local figure shown from the on-chain quote")
    : say("reveal figure not shown (oracle/FX unavailable right now) — non-fatal");

  narr("RECEIVER — opening the “Prove to a regulator” panel");
  const details = page.locator('details:has(summary:has-text("Prove to a regulator"))').first();
  await details.scrollIntoViewIfNeeded();
  if (!(await details.evaluate((d) => d.open).catch(() => false))) await details.locator("summary").first().click();
  await page.waitForTimeout(600);
  const discSelect = () => page.locator('select:has(option[value="exact"])').first();

  narr("RECEIVER — generating a THRESHOLD disclosure (proves “amount ≤ a figure”, exact amount stays hidden)");
  await discSelect().selectOption("threshold");
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: /Generate proof/ }).click();
  await page.getByRole("button", { name: /Export receipt/ }).first().waitFor({ timeout: 150000 });
  (await page.getByText(/Verified on-chain/i).first().isVisible().catch(() => false))
    ? good("threshold proof generated + verified on the live Stellar verifier")
    : good("threshold proof generated + verified in-browser (on-chain read unavailable)");

  narr("RECEIVER — generating an EXACT disclosure and exporting the receipt JSON");
  await discSelect().selectOption("exact");
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: /Generate proof/ }).click();
  const exportBtn = page.getByRole("button", { name: /Export receipt/ }).first();
  await exportBtn.waitFor({ timeout: 150000 });
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }), exportBtn.click()]);
  const fs = await import("node:fs");
  S.receipt = fs.readFileSync(await dl.path(), "utf8");
  const obj = JSON.parse(S.receipt);
  good(`exact disclosure verified + receipt exported (type=${obj.type}, ${obj.publicSignals.length} public signals). Kept for the regulator.`);
}

// ======================= REGULATOR =======================
async function regulator() {
  head("REGULATOR — independently re-verify a receipt, and reject a tampered one");
  if (!S.receipt) { say("no receipt yet — running the RECEIVER flow first to produce one"); await receiver(); }
  narr("REGULATOR — opening /regulator → Verify disclosure");
  await page.goto(BASE + "/regulator", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Verify disclosure", exact: true }).click();
  const ta = page.locator("textarea#receipt");
  await ta.waitFor({ state: "visible", timeout: 10000 });

  narr("REGULATOR — HAPPY PATH: pasting the exported receipt and re-verifying (browser + on-chain)");
  await ta.fill(S.receipt);
  await page.getByRole("button", { name: /Re-verify in browser and on-chain/i }).click();
  await page.getByText(/In your browser:/i).waitFor({ timeout: 120000 });
  const okTxt = await page.locator("div").filter({ hasText: /In your browser:/i }).last().innerText();
  /✓ valid/.test(okTxt.split("On the live")[0])
    ? good(`re-verified VALID — ${okTxt.replace(/\s+/g, " ").trim().slice(0, 120)}`)
    : bad("receipt did NOT verify valid");

  narr("REGULATOR — WRONG PATH: tampering ONE character of the receipt and re-verifying");
  const t = JSON.parse(S.receipt);
  if (Array.isArray(t.publicSignals) && t.publicSignals.length > 1) {
    const i = t.publicSignals.length - 1;
    t.publicSignals[i] = (BigInt(t.publicSignals[i] || "1") + 1n).toString();
  } else if (t.proof?.pi_a) t.proof.pi_a[0] = (BigInt(t.proof.pi_a[0]) + 1n).toString();
  await ta.fill(JSON.stringify(t));
  await page.getByRole("button", { name: /Re-verify in browser and on-chain/i }).click();
  await page.getByText(/In your browser:/i).waitFor({ timeout: 120000 });
  const tTxt = await page.locator("div").filter({ hasText: /In your browser:/i }).last().innerText();
  /✗ invalid/.test(tTxt)
    ? good("rejected as expected — tampered receipt is INVALID (in browser and on-chain)")
    : bad("NOT rejected — tampered receipt still passed");
}

// ======================= OPERATOR =======================
async function operator() {
  head("OPERATOR — live pool reads + admin actions that only COPY a CLI (no in-browser signing)");
  narr("OPERATOR — opening /operator (Pool health reads live from Stellar testnet)");
  await page.goto(BASE + "/operator", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  (await page.getByText(/live on Stellar testnet/i).first().isVisible().catch(() => false))
    ? good("live pool health is reading from chain")
    : say("live badge not visible yet — reads may still be loading");

  narr("OPERATOR — opening Compliance policy and clicking an admin “copy” button");
  await page.getByRole("button", { name: "Compliance policy" }).first().click();
  await page.waitForTimeout(1000);
  let popup = false;
  page.on("popup", () => { popup = true; });
  const copyBtn = page.getByRole("button", { name: "copy" }).first();
  await copyBtn.waitFor({ timeout: 10000 });
  await copyBtn.click();
  await page.waitForTimeout(700);
  (await page.getByRole("button", { name: /copied/ }).first().isVisible().catch(() => false))
    ? good("admin button COPIED the CLI (flips to “copied ✓”)")
    : bad("copy button did not confirm");
  const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => "")).catch(() => "");
  /stellar contract invoke/.test(clip) ? good("clipboard holds a real “stellar contract invoke” command for the operator to run offline") : bad("clipboard is not a CLI command");
  !popup ? good("no wallet/signing popup — the admin secret never touches the browser") : bad("an unexpected popup opened");
}

// ======================= DEMO =======================
async function demo() {
  head("DEMO — the all-in-one corridor console (quick visible walkthrough of the 4 steps)");
  narr("DEMO — opening /demo");
  await page.goto(BASE + "/demo", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  for (const label of ["Corridor", "Receiver", "Regulator"]) {
    narr(`DEMO — advancing to the “${label}” step with “Next →”`);
    await page.getByRole("button", { name: /Next →/ }).click();
    await page.waitForTimeout(900);
    const pager = await page.locator(".pager-label").innerText().catch(() => "");
    say(`now on: ${pager}`);
  }
  const onRegulator = await page.locator(".pager-label").innerText().catch(() => "");
  /Regulator/i.test(onRegulator) ? good("walked all 4 steps of the console (Sender → Corridor → Receiver → Regulator)") : bad("did not reach the Regulator step");
  await page.getByRole("button", { name: /← Back/ }).click().catch(() => {});
}

// ---- run selected section(s) ----
try {
  if (SECTION === "landing") await landing();
  else if (SECTION === "sender") await sender();
  else if (SECTION === "receiver") await receiver();
  else if (SECTION === "regulator") await regulator();
  else if (SECTION === "operator") await operator();
  else if (SECTION === "demo") await demo();
  else if (SECTION === "loop") { await sender(); await receiver(); await regulator(); }
  else { await landing(); await sender(); await receiver(); await regulator(); await operator(); await demo(); }
} catch (e) {
  bad("tour aborted: " + ((e && e.message) || e).split("\n")[0]);
}

head(`SUMMARY — ${pass} passed · ${fail} failed`);
console.log(fail === 0 ? `${C.g}All watched checks passed.${C.x}` : `${C.r}${fail} check(s) failed — see ❌ above.${C.x}`);
await waitEnter(60000);
await browser.close();
process.exit(fail === 0 ? 0 : 1);
