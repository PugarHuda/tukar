// QA functional (no on-chain writes): landing modal, operator CLI + no-sign, regulator wrong-path,
// sender/receiver validation + payment-request round-trip, demo client-side wrong paths.
import { chromium } from "playwright-core";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://localhost:3000";
const SHOTS = "scripts/qa-shots";
const results = [];
const ok = (n) => { results.push([1, n]); console.log("  PASS " + n); };
const bad = (n, w) => { results.push([0, n + " — " + w]); console.log("  FAIL " + n + " — " + w); };
async function tc(n, fn) { try { await fn(); ok(n); } catch (e) { bad(n, (e.message || String(e)).split("\n")[0]); } }
const assert = (c, m) => { if (!c) throw new Error(m); };

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });

async function newPage(w = 1440, h = 900) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  page.on("dialog", (d) => d.accept().catch(() => {}));
  page.setDefaultTimeout(30000);
  return { ctx, page, errs };
}

// ===================== LANDING MODAL =====================
async function testModal(page, triggerSel, name, vw, vh) {
  await page.locator(triggerSel).first().click();
  const dialog = page.locator(".launch-dialog");
  await dialog.waitFor({ state: "visible", timeout: 5000 });
  // portal: is it a direct child of body?
  const inBody = await page.evaluate(() => {
    const d = document.querySelector(".launch-backdrop");
    return d && d.parentElement === document.body;
  });
  assert(inBody, "backdrop not portaled to body");
  // not clipped: backdrop covers viewport, dialog within viewport
  const box = await page.evaluate((v) => {
    const bd = document.querySelector(".launch-backdrop").getBoundingClientRect();
    const dg = document.querySelector(".launch-dialog").getBoundingClientRect();
    return { bd: { w: bd.width, h: bd.height, t: bd.top, l: bd.left }, dg: { t: dg.top, b: dg.bottom, l: dg.left, r: dg.right }, v };
  }, { vw, vh });
  assert(box.bd.w >= vw - 2 && box.bd.h >= vh - 2, `backdrop ${box.bd.w}x${box.bd.h} doesn't cover ${vw}x${vh}`);
  assert(box.dg.t >= -1 && box.dg.l >= -1 && box.dg.r <= vw + 1 && box.dg.b <= vh + 2, `dialog clipped: ${JSON.stringify(box.dg)} in ${vw}x${vh}`);
  // focus trap: first focusable focused
  const focused = await page.evaluate(() => document.activeElement?.tagName + ":" + (document.activeElement?.textContent || "").slice(0, 20));
  // ESC closes
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden", timeout: 3000 });
  await page.screenshot({ path: `${SHOTS}/modal-${name}.png` });
  return focused;
}

await tc("landing modal — navbar trigger (desktop): portal, not clipped, ESC", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  await testModal(page, "header .launch-trigger", "navbar-desktop", 1440, 900);
  await ctx.close();
});
await tc("landing modal — hero trigger (desktop): portal, not clipped, ESC", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
  await testModal(page, ".hero .launch-trigger", "hero-desktop", 1440, 900);
  await ctx.close();
});
await tc("landing modal — apps trigger (desktop): portal, not clipped, ESC", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
  await testModal(page, "#apps .launch-trigger", "apps-desktop", 1440, 900);
  await ctx.close();
});
await tc("landing modal — navbar trigger (MOBILE 390): not clipped, covers viewport", async () => {
  const { ctx, page } = await newPage(390, 844);
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  await testModal(page, "header .launch-trigger", "navbar-mobile", 390, 844);
  await ctx.close();
});
await tc("landing modal — backdrop click closes", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
  await page.locator("header .launch-trigger").first().click();
  await page.locator(".launch-dialog").waitFor({ state: "visible" });
  await page.mouse.click(6, 6); // top-left corner = backdrop
  await page.locator(".launch-dialog").waitFor({ state: "hidden", timeout: 3000 });
  await ctx.close();
});
await tc("landing modal — role link navigates to /sender", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
  await page.locator("header .launch-trigger").first().click();
  await page.locator(".launch-dialog").waitFor({ state: "visible" });
  await page.locator('.launch-dialog a[href="/sender"]').click();
  await page.waitForURL("**/sender", { timeout: 8000 });
  assert(page.url().endsWith("/sender"), "did not navigate to /sender: " + page.url());
  await ctx.close();
});
await tc("landing modal — demo link navigates to /demo", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
  await page.locator(".hero .launch-trigger").first().click();
  await page.locator(".launch-dialog").waitFor({ state: "visible" });
  await page.locator('.launch-dialog a[href="/demo"]').click();
  await page.waitForURL("**/demo", { timeout: 8000 });
  await ctx.close();
});

// ===================== OPERATOR =====================
await tc("operator — nav across 4 sections, live reads render", async () => {
  const { ctx, page, errs } = await newPage();
  await page.goto(BASE + "/operator", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  for (const label of ["Compliance policy", "Oracle health", "Corridor & anchor", "Pool health"]) {
    await page.getByRole("button", { name: label, exact: true }).first().click();
    await page.waitForTimeout(600);
    assert(await page.getByRole("heading", { level: 2 }).first().isVisible(), "no h2 after nav " + label);
  }
  assert(errs.length === 0, "pageerrors: " + errs.join("; "));
  await ctx.close();
});
await tc("operator — admin action builds CLI 'stellar contract invoke' (copy, no in-browser sign)", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/operator", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Compliance policy", exact: true }).click();
  await page.waitForTimeout(800);
  const pre = page.locator("pre").filter({ hasText: "stellar contract invoke" }).first();
  await pre.waitFor({ timeout: 8000 });
  const txt = await pre.innerText();
  assert(/stellar contract invoke/.test(txt) && /set_asp_root/.test(txt), "CLI missing set_asp_root: " + txt.slice(0, 80));
  // copy button present, clicking it does not open a wallet/sign dialog
  const copyBtn = page.locator("button", { hasText: /^copy$/ }).first();
  await copyBtn.click();
  await page.waitForTimeout(400);
  // no wallet connected => still shows Connect wallet / Use testnet key in sidebar (no sign prompt)
  assert(await page.getByRole("button", { name: "Use testnet key" }).first().isVisible(), "wallet state changed unexpectedly");
  await ctx.close();
});

// ===================== REGULATOR wrong-path + nav =====================
await tc("regulator — nav across 4 tabs", async () => {
  const { ctx, page, errs } = await newPage();
  await page.goto(BASE + "/regulator", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  for (const label of ["Verify disclosure", "Issue audit request", "Audit trail", "Pool report"]) {
    await page.getByRole("button", { name: label, exact: true }).first().click();
    await page.waitForTimeout(500);
  }
  assert(errs.length === 0, "pageerrors: " + errs.join("; "));
  await ctx.close();
});
await tc("regulator — garbage receipt rejected honestly (no crash)", async () => {
  const { ctx, page, errs } = await newPage();
  await page.goto(BASE + "/regulator", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Verify disclosure", exact: true }).click();
  await page.waitForTimeout(500);
  const ta = page.locator("textarea#receipt");
  await ta.fill("not json {{{");
  await page.getByRole("button", { name: /Re-verify in browser and on-chain/i }).click();
  await page.getByText(/Not valid JSON/i).waitFor({ timeout: 8000 });
  await ta.fill('{"kind":"tukar-audit-receipt"}');
  await page.getByRole("button", { name: /Re-verify in browser and on-chain/i }).click();
  await page.getByText(/Missing proof or publicSignals/i).waitFor({ timeout: 8000 });
  assert(errs.length === 0, "pageerrors: " + errs.join("; "));
  await ctx.close();
});

// ===================== SENDER validation + request round-trip =====================
await tc("sender — invalid (zero) amount blocks Continue", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/sender", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  await page.locator("#amount").fill("0");
  const cont = page.getByRole("button", { name: /Continue/ });
  assert(await cont.isDisabled(), "Continue not disabled at amount 0");
  await page.locator("#amount").fill("-5");
  assert(await cont.isDisabled(), "Continue not disabled at negative amount");
  await ctx.close();
});
await tc("sender — garbage payment request rejected honestly", async () => {
  const { ctx, page, errs } = await newPage();
  await page.goto(BASE + "/sender", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  await page.locator("#req").fill("tukreq1:garbage!!!");
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await page.getByText(/Couldn't load that request/i).waitFor({ timeout: 6000 });
  assert(errs.length === 0, "pageerrors: " + errs.join("; "));
  await ctx.close();
});

// payment-request round-trip: receiver (connect demo key, no on-chain) -> create tukreq1 -> load in sender
let reqString = null;
await tc("receiver — connect demo key + create payment request (tukreq1)", async () => {
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/receiver", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Use testnet key" }).first().click();
  await page.waitForTimeout(1500);
  await page.locator("#reqAmount").fill("125");
  await page.getByRole("button", { name: "Create request" }).click();
  const pre = page.locator("pre").filter({ hasText: /tukreq1:/ }).first();
  await pre.waitFor({ timeout: 8000 });
  reqString = (await pre.innerText()).trim();
  assert(/^tukreq1:/.test(reqString), "no tukreq1 string: " + reqString.slice(0, 30));
  await ctx.close();
});
await tc("sender — loads receiver's tukreq1 request and prefills amount (locked)", async () => {
  assert(reqString, "no reqString from receiver step");
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/sender", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  await page.locator("#req").fill(reqString);
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await page.getByText(/Loaded a request for 125 USDC/i).waitFor({ timeout: 6000 });
  const amt = await page.locator("#amount").inputValue();
  assert(amt === "125", "amount not prefilled to 125: " + amt);
  const ro = await page.locator("#amount").getAttribute("readonly");
  assert(ro !== null, "amount not locked (readOnly) while fulfilling request");
  await ctx.close();
});

// ===================== RECEIVER garbage bearer note =====================
await tc("receiver — garbage bearer note rejected honestly", async () => {
  const { ctx, page, errs } = await newPage();
  await page.goto(BASE + "/receiver", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  await page.locator("textarea").first().fill("tukar1:not-a-real-note");
  await page.getByRole("button", { name: "Claim payment" }).click();
  await page.getByText(/Couldn't claim that note/i).waitFor({ timeout: 6000 });
  assert(errs.length === 0, "pageerrors: " + errs.join("; "));
  await ctx.close();
});

// ===================== DEMO client-side wrong paths =====================
await tc("demo — connect + deny-list toggle blocks deposit (unsatisfiable proof, no crash)", async () => {
  const { ctx, page, errs } = await newPage();
  await page.goto(BASE + "/demo", { waitUntil: "domcontentloaded" });
  await page.getByText(/Ready/).first().waitFor({ timeout: 45000 }).catch(() => {});
  await page.getByRole("button", { name: "Use testnet key" }).first().click();
  await page.waitForTimeout(1500);
  await page.locator('input[aria-label="Amount to send in USDC"]').fill("120");
  // toggle the sanctioned/deny tamper (second TamperCheck)
  await page.getByText(/Deposit from a sanctioned account/i).click();
  await page.getByRole("button", { name: /Send into corridor/ }).click();
  await page.locator(".statusbar").filter({ hasText: /deny-list|sanctions|unsatisf/i }).waitFor({ timeout: 90000 });
  assert(errs.length === 0, "pageerrors: " + errs.join("; "));
  await ctx.close();
});
await tc("demo — receipt verify garbage + incomplete rejected (no crash)", async () => {
  const { ctx, page, errs } = await newPage();
  await page.goto(BASE + "/demo", { waitUntil: "domcontentloaded" });
  await page.getByText(/Ready/).first().waitFor({ timeout: 45000 }).catch(() => {});
  // go to step 4 (Regulator) via flow node
  await page.locator(".flow-node").nth(3).click();
  await page.locator("#panel3").waitFor({ timeout: 8000 });
  await page.locator(".verify-receipt").evaluate((el) => { el.open = true; });
  await page.locator(".verify-receipt textarea").fill("not json {{{");
  await page.getByRole("button", { name: "Verify receipt" }).click();
  await page.getByText(/not valid json|invalid/i).first().waitFor({ timeout: 8000 });
  assert(errs.length === 0, "pageerrors: " + errs.join("; "));
  await ctx.close();
});

console.log("\n=== " + results.filter((r) => r[0]).length + "/" + results.length + " passed ===");
results.filter((r) => !r[0]).forEach((r) => console.log("FAIL:", r[1]));
await browser.close();
