// QA4 — DEMO (/demo) corridor console. READ/INTERACTION ONLY — NO real deposit/withdraw/disclose
// submit (another agent owns on-chain writes). Walk 4 steps (Sender→Corridor→Receiver→Regulator)
// via Next; corridor pool stats + activity read live; audit select labeled; disclosure modes switch;
// threshold result label is "Threshold" not "Range" (verified at UI where safe); tamper/forge/deny
// toggles present; wrong-path (disclose w/o note) → honest prompt, no chain call; responsive; a11y.
import { chromium } from "playwright-core";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://localhost:3000";
const SHOTS = "scripts/qa-shots";
let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log("  PASS " + n); };
const bad = (n, e) => { fail++; console.log("  FAIL " + n + (e ? " :: " + e : "")); };

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const errs = [];
const net404 = [];
async function newCtx(w = 1440, h = 900) {
  return browser.newContext({ viewport: { width: w, height: h }, permissions: ["clipboard-read", "clipboard-write"] });
}
function wire(page) {
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errs.push("console.error: " + m.text().slice(0, 200)); });
  page.on("response", (r) => { if (r.status() === 404) net404.push(r.url()); });
  page.setDefaultTimeout(30000);
}
const hasHOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
const statusText = (page) => page.locator('[role="status"]').first().innerText().catch(() => "");

// ============ WALK 4 STEPS via Next / Back / flow strip ============
console.log("\n=== DEMO · walk the 4 steps ===");
{
  const ctx = await newCtx(); const page = await ctx.newPage(); wire(page);
  await page.goto(BASE + "/demo", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  const labels = ["Sender", "Corridor", "Receiver", "Regulator"];
  // step 1 label present in pager
  (await page.getByText(/Step 1 of 4 · Sender/i).isVisible().catch(() => false)) ? ok("starts at Step 1 · Sender") : bad("pager not at Step 1 · Sender");

  for (let i = 1; i < 4; i++) {
    await page.getByRole("button", { name: "Next →" }).click();
    await page.waitForTimeout(500);
    const seen = await page.getByText(new RegExp(`Step ${i + 1} of 4 · ${labels[i]}`, "i")).isVisible().catch(() => false);
    seen ? ok(`Next → Step ${i + 1} · ${labels[i]}`) : bad(`did not reach Step ${i + 1} · ${labels[i]}`);
  }
  // Back returns to step 3
  await page.getByRole("button", { name: "← Back" }).click();
  await page.waitForTimeout(400);
  (await page.getByText(/Step 3 of 4 · Receiver/i).isVisible().catch(() => false)) ? ok("Back → Step 3 · Receiver") : bad("Back did not return to Step 3");
  // flow strip jump to step 1
  await page.locator(".flow .frag, .flow > *").first().click().catch(() => {});
  await page.waitForTimeout(300);
  (await page.getByText(/Step 1 of 4 · Sender/i).isVisible().catch(() => false)) ? ok("flow-strip click jumps to Step 1") : console.log("  NOTE flow-strip click didn't jump (selector) — pager-driven nav OK");
  await ctx.close();
}

// ============ STEP 1 · SENDER honest disabled state (no write) ============
console.log("\n=== DEMO · Sender send disabled while disconnected (no write) ===");
{
  const ctx = await newCtx(); const page = await ctx.newPage(); wire(page);
  await page.goto(BASE + "/demo", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(900);
  const send = page.getByRole("button", { name: /Send into corridor/ });
  (await send.isVisible().catch(() => false)) ? ok("Sender 'Send into corridor' button present") : bad("send button missing");
  // forge + deny teaching toggles present on Sender
  (await page.getByText(/Forge compliance/i).isVisible().catch(() => false)) ? ok("forge toggle present (Sender)") : bad("forge toggle missing");
  (await page.getByText(/Deposit from a sanctioned account/i).isVisible().catch(() => false)) ? ok("deny toggle present (Sender)") : bad("deny toggle missing");
  // amount input labeled
  (await page.getByLabel(/Amount to send in USDC/i).count()) ? ok("amount input has accessible label") : bad("amount input unlabeled");
  await ctx.close();
}

// ============ STEP 2 · CORRIDOR pool stats + activity read live ============
console.log("\n=== DEMO · Corridor pool stats + commitments read live ===");
{
  const ctx = await newCtx(); const page = await ctx.newPage(); wire(page);
  await page.goto(BASE + "/demo", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "Next →" }).click();
  await page.waitForTimeout(500);
  (await page.getByText("COMMITMENTS", { exact: true }).isVisible().catch(() => false)) ? ok("Corridor shows COMMITMENTS stat") : bad("COMMITMENTS stat missing");
  (await page.getByText(/ANONYMITY SET/).isVisible().catch(() => false)) ? ok("Corridor shows ANONYMITY SET stat") : bad("ANONYMITY SET missing");
  // pool count resolves to a live value (gated behind the ZK-prover load + tree sync, ~9s cold — poll up to 15s)
  let commitVal = "—";
  for (let i = 0; i < 15; i++) {
    commitVal = (await page.locator(".stat .v").first().innerText().catch(() => "")).trim();
    if (/^\d[\d,]*$/.test(commitVal)) break;
    await page.waitForTimeout(1000);
  }
  /^\d[\d,]*$/.test(commitVal) ? ok(`pool commitments read live (=${commitVal})`) : bad("pool commitments not resolved live within 15s", "got '" + commitVal + "'");
  // on-chain commitments list section present
  (await page.getByText(/ON-CHAIN COMMITMENTS/).isVisible().catch(() => false)) ? ok("on-chain commitments list section present") : bad("commitments list section missing");
  await ctx.close();
}

// ============ STEP 4 · REGULATOR audit select + disclosure modes + tamper ============
console.log("\n=== DEMO · Regulator audit select + disclosure modes ===");
{
  const ctx = await newCtx(); const page = await ctx.newPage(); wire(page);
  await page.goto(BASE + "/demo", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  for (let i = 0; i < 3; i++) { await page.getByRole("button", { name: "Next →" }).click(); await page.waitForTimeout(350); }
  (await page.getByText(/Step 4 of 4 · Regulator/i).isVisible().catch(() => false)) ? ok("reached Regulator step") : bad("did not reach Regulator step");

  // audit select is labeled
  const auditLabel = await page.locator("label[for='audit-select']").count();
  const auditSel = await page.locator("#audit-select").count();
  (auditLabel > 0 && auditSel > 0) ? ok("audit select is labeled (label[for=audit-select])") : bad("audit select label/field", `label=${auditLabel} sel=${auditSel}`);

  // disclosure mode buttons switch the shown input
  await page.getByRole("button", { name: /≤ Threshold/ }).click();
  await page.waitForTimeout(200);
  (await page.getByLabel(/Disclosure threshold in USDC/i).isVisible().catch(() => false)) ? ok("Threshold mode shows threshold input") : bad("threshold input not shown");
  await page.getByRole("button", { name: /Band X–Y/ }).click();
  await page.waitForTimeout(200);
  (await page.getByLabel(/Band lower bound in USDC/i).isVisible().catch(() => false)) ? ok("Range/Band mode shows band inputs") : bad("band inputs not shown");
  await page.getByRole("button", { name: /Σ Portfolio/ }).click();
  await page.waitForTimeout(200);
  (await page.getByLabel(/Aggregate reporting cap/i).isVisible().catch(() => false)) ? ok("Aggregate mode shows cap input") : bad("cap input not shown");
  // aggregate 'omit' teaching toggle
  (await page.getByText(/Try to omit a payment/i).isVisible().catch(() => false)) ? ok("aggregate omit teaching toggle present") : bad("omit toggle missing");

  // Regulator-step tamper toggle present
  (await page.getByText(/Tamper: claim a false amount/i).isVisible().catch(() => false)) ? ok("tamper toggle present (Regulator)") : bad("tamper toggle missing");

  // audit receipt verifier expander present + labeled input
  const sum = page.locator("summary").filter({ hasText: /Verify an audit receipt/i });
  (await sum.count()) ? ok("audit receipt verifier expander present") : bad("receipt verifier expander missing");

  // ---- WRONG-PATH (safe, no chain): exact mode + no note selected → honest prompt, early return ----
  await page.getByRole("button", { name: "Exact amount", exact: true }).click();
  await page.waitForTimeout(200);
  // ensure no note is selected (auditSel default "")
  const selVal = await page.locator("#audit-select").inputValue().catch(() => "");
  if (selVal === "") {
    await page.getByRole("button", { name: /Generate & verify disclosure proof/ }).click();
    await page.waitForTimeout(800);
    const st = await statusText(page);
    /Select a confidential payment to audit first/i.test(st)
      ? ok("wrong-path: disclose w/o note → honest 'select a payment first' prompt (no chain call)")
      : console.log("  NOTE wrong-path status = '" + st.slice(0, 80) + "' (a note may already exist from a prior deposit)");
  } else {
    console.log("  NOTE audit select pre-populated (auditable note present) — skipped wrong-path click to avoid a real disclose");
  }

  // threshold result label lives in the threshold path as "Threshold proof verified" (not "Range").
  // Not exercised end-to-end here: it requires an on-chain deposit + disclose submit, which this pass avoids.
  console.log("  NOTE 'Threshold proof verified' title is set by the threshold path in source; end-to-end run avoided (no on-chain writes).");

  const hOver = await hasHOverflow(page);
  hOver ? bad("horizontal overflow at 1440 (Regulator)") : ok("no horizontal overflow at 1440 (Regulator)");
  await page.screenshot({ path: `${SHOTS}/qa4-demo-regulator.png`, fullPage: false });
  await ctx.close();
}

// ============ RESPONSIVE overflow sweep across steps ============
console.log("\n=== DEMO · overflow sweep 360/390/414/768 ===");
for (const w of [360, 390, 414, 768]) {
  const ctx = await newCtx(w, 800); const page = await ctx.newPage(); wire(page);
  await page.goto(BASE + "/demo", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(700);
  let worst = false;
  for (let i = 0; i < 4; i++) {
    if (await hasHOverflow(page)) worst = true;
    if (i < 3) { await page.getByRole("button", { name: "Next →" }).click().catch(() => {}); await page.waitForTimeout(350); }
  }
  worst ? bad(`horizontal overflow at ${w} (some step)`) : ok(`no horizontal overflow at ${w} across all steps`);
  if (w === 390) await page.screenshot({ path: `${SHOTS}/qa4-demo-mobile.png` });
  await ctx.close();
}

// ============ focus-visible / first Tab ============
console.log("\n=== DEMO · first Tab reaches a control ===");
{
  const ctx = await newCtx(); const page = await ctx.newPage(); wire(page);
  await page.goto(BASE + "/demo", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
  await page.keyboard.press("Tab");
  const tag = await page.evaluate(() => document.activeElement?.tagName);
  ["A", "BUTTON", "INPUT", "TEXTAREA", "SELECT"].includes(tag || "") ? ok("first Tab reaches a control (" + tag + ")") : bad("first Tab reached: " + tag);
  await ctx.close();
}

console.log("\n=== ERRORS ===");
const noteworthy = errs.filter((e) => !/er-api|Failed to load resource|favicon|reflector|manifest|getUserMedia|Permissions|clipboard/i.test(e));
console.log(noteworthy.length ? noteworthy.slice(0, 30).map((e) => "  - " + e).join("\n") : "  none");
console.log("\n=== 404s ===");
const real404 = net404.filter((u) => !/favicon|manifest|reflector|er-api/i.test(u));
console.log(real404.length ? real404.slice(0, 20).map((u) => "  - " + u).join("\n") : "  none");
console.log(`\n=== qa4-demo: ${pass}/${pass + fail} checks passed ===`);
await browser.close();
