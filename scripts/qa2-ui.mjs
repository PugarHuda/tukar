// QA2 — WALLET GATING, receiver TABS+EXPANDERS+QR, LANDING modal, A11Y basics.
// No on-chain writes: gating checks stop at the honest prompt / disabled state before any submit.
import { chromium } from "playwright-core";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://localhost:3000";
const SHOTS = "scripts/qa-shots";
let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log("  PASS " + n); };
const bad = (n, e) => { fail++; console.log("  FAIL " + n + (e ? " :: " + e : "")); };

const b64 = (s) => Buffer.from(s, "utf8").toString("base64");
const NOTE = { v: 1, ref: "UI-001", amount: "5000000000", privKey: "123456789", pubKey: "987654321", blinding: "555", commitment: "424242424243", corridor: "MX" };
const BEARER = "tukar1:" + b64(JSON.stringify(NOTE));

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const errs = [];
async function newCtx(w = 1440, h = 900) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, permissions: ["clipboard-read", "clipboard-write"] });
  return ctx;
}
function wire(page) {
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errs.push("console.error: " + m.text().slice(0, 200)); });
  page.setDefaultTimeout(30000);
}
const statusText = (page) => page.locator(".fixed.inset-x-0.bottom-0").innerText().catch(() => "");

// ============ WALLET GATING ============
console.log("\n=== WALLET GATING · sender send button ===");
{
  const ctx = await newCtx(); const page = await ctx.newPage(); wire(page);
  await page.goto(BASE + "/sender", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(900);
  await page.locator("#amount").fill("50");
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByText(/Confirm and send/i).waitFor({ timeout: 8000 });
  const send = page.getByRole("button", { name: /^Send \$50/ });
  (await send.isDisabled()) ? ok("send DISABLED while disconnected") : bad("send not disabled while disconnected");
  await page.getByRole("button", { name: "Use testnet key" }).first().click();
  await page.waitForTimeout(1200);
  (await send.isEnabled()) ? ok("send ENABLED after connecting testnet key") : bad("send still disabled after connect");
  await page.getByRole("button", { name: "Disconnect" }).first().click();
  await page.waitForTimeout(600);
  (await send.isDisabled()) ? ok("send DISABLED again after disconnect (mid-session)") : bad("send not disabled after disconnect");
  await ctx.close();
}

console.log("\n=== WALLET GATING · receiver withdraw (honest prompt, no crash) ===");
{
  const ctx = await newCtx(390, 844); const page = await ctx.newPage(); wire(page);
  await page.goto(BASE + "/receiver", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await page.getByRole("tab", { name: /claim/i }).click();
  await page.locator("textarea").first().fill(BEARER);
  await page.getByRole("button", { name: "Claim payment" }).click();
  await page.getByText(/shielded arrival/i).waitFor({ timeout: 8000 });
  // disconnected: clicking Withdraw must produce an honest prompt, not a silent failure/crash
  await page.getByRole("button", { name: /Withdraw on-chain/ }).first().click();
  await page.waitForTimeout(700);
  /Connect a wallet or the testnet key to withdraw/.test(await statusText(page))
    ? ok("withdraw while disconnected → honest 'Connect…' prompt (no on-chain, no crash)")
    : bad("withdraw disconnected did not prompt honestly", await statusText(page));
  await ctx.close();
}

console.log("\n=== WALLET GATING · regulator issue-audit register button ===");
{
  const ctx = await newCtx(); const page = await ctx.newPage(); wire(page);
  await page.goto(BASE + "/regulator", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: "Issue audit request", exact: true }).click();
  const reg = page.getByRole("button", { name: /Compute hash and register on-chain/ });
  await reg.waitFor();
  (await reg.isDisabled()) ? ok("register DISABLED while disconnected") : bad("register not disabled while disconnected");
  const connectPrompt = await page.getByText(/Connect the testnet key.*to sign/i).isVisible().catch(() => false);
  connectPrompt ? ok("register shows honest 'Connect the testnet key' prompt") : bad("no connect prompt on issue tab");
  // connect via the sidebar wallet bar
  await page.getByRole("button", { name: "Use testnet key" }).first().click().catch(() => {});
  await page.waitForTimeout(1200);
  (await reg.isEnabled()) ? ok("register ENABLED after connecting") : bad("register still disabled after connect");
  await ctx.close();
}

// ============ RECEIVER TABS + EXPANDERS + QR ============
console.log("\n=== RECEIVER · tab switching + expander state survival + QR ===");
{
  const ctx = await newCtx(390, 844); const page = await ctx.newPage(); wire(page);
  await page.goto(BASE + "/receiver", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  // claim a note first so Payments has a card
  await page.getByRole("tab", { name: /claim/i }).click();
  await page.locator("textarea").first().fill(BEARER);
  await page.getByRole("button", { name: "Claim payment" }).click();
  await page.getByText(/shielded arrival/i).waitFor({ timeout: 8000 });

  // switch tabs repeatedly
  let switchOk = true;
  for (let i = 0; i < 3; i++) {
    for (const name of [/claim/i, /request/i, /payments/i]) {
      await page.getByRole("tab", { name }).click();
      await page.waitForTimeout(120);
    }
  }
  // confirm aria-selected tracks the active tab
  await page.getByRole("tab", { name: /request/i }).click();
  await page.waitForTimeout(150);
  const sel = await page.getByRole("tab", { name: /request/i }).getAttribute("aria-selected");
  sel === "true" ? ok("tab switching works; aria-selected tracks active tab") : bad("aria-selected not updated", "got " + sel);
  // request tab has an input; claim tab has the tukar1: textarea
  await page.getByRole("tab", { name: /claim/i }).click();
  await page.waitForTimeout(150);
  (await page.getByPlaceholder(/tukar1:/i).count()) > 0 ? ok("Claim tab shows tukar1: input") : bad("Claim tab missing input");

  // EXPANDER state survival: type into the disclosure 'Audit reference', collapse, reopen, confirm persisted
  await page.getByRole("tab", { name: /payments/i }).click();
  await page.waitForTimeout(200);
  const sum = page.locator("summary").filter({ hasText: /Prove to a regulator/i }).first();
  await sum.scrollIntoViewIfNeeded();
  await sum.click();
  await page.waitForTimeout(250);
  const auditInput = page.locator("[id^='audit-ctx-']").first();
  await auditInput.fill("SURVIVAL-CHECK-XYZ");
  // switch disclosure mode to threshold and set a figure, to have richer state
  const discSelect = () => page.locator('select:has(option[value="exact"])').first();
  await discSelect().selectOption("threshold");
  await page.waitForTimeout(150);
  await page.locator("[id^='thr-']").first().fill("321");
  // collapse
  await sum.click();
  await page.waitForTimeout(200);
  // reopen
  await sum.click();
  await page.waitForTimeout(250);
  const persisted = await auditInput.inputValue();
  const modePersist = await discSelect().inputValue();
  const thrPersist = await page.locator("[id^='thr-']").first().inputValue().catch(() => "");
  (persisted === "SURVIVAL-CHECK-XYZ" && modePersist === "threshold" && thrPersist === "321")
    ? ok("expander state (audit ref + mode + figure) SURVIVES collapse/reopen")
    : bad("expander state lost on collapse", `ref=${persisted} mode=${modePersist} thr=${thrPersist}`);

  // QR scan toggle on Claim tab (headless: unsupported/ no camera → honest message, no crash)
  await page.getByRole("tab", { name: /claim/i }).click();
  await page.waitForTimeout(200);
  await page.getByRole("button", { name: /Scan QR/ }).click();
  await page.waitForTimeout(600);
  const st = await statusText(page);
  if (/isn't supported|Couldn't open the camera/.test(st)) ok("Scan QR → honest unsupported/no-camera message (no crash)");
  else {
    // if a stream opened, the button flips to 'Stop scan'; leaving Claim tab must stop it
    const stopVisible = await page.getByRole("button", { name: /Stop scan/ }).isVisible().catch(() => false);
    if (stopVisible) {
      await page.getByRole("tab", { name: /payments/i }).click();
      await page.waitForTimeout(300);
      await page.getByRole("tab", { name: /claim/i }).click();
      const backToScan = await page.getByRole("button", { name: /Scan QR/ }).isVisible().catch(() => false);
      backToScan ? ok("QR stream stops when leaving Claim tab (button back to 'Scan QR')") : bad("QR stream not stopped on tab leave");
    } else ok("Scan QR handled without crash");
  }
  await page.screenshot({ path: `${SHOTS}/qa2-receiver-ui.png` });
  await ctx.close();
}

// ============ LANDING MODAL ============
async function testModal(page, label) {
  const triggers = page.locator(".launch-trigger");
  const n = await triggers.count();
  let opened = 0;
  for (let i = 0; i < n; i++) {
    const t = triggers.nth(i);
    if (!(await t.isVisible().catch(() => false))) continue;
    await t.scrollIntoViewIfNeeded().catch(() => {});
    await t.click();
    const dialog = page.locator('[role="dialog"]');
    const shown = await dialog.isVisible({ timeout: 3000 }).catch(() => false);
    if (!shown) { bad(`${label}: trigger ${i} did not open dialog`); continue; }
    // aria-modal + labelledby
    const modalAttr = await dialog.getAttribute("aria-modal");
    if (modalAttr !== "true") bad(`${label}: dialog missing aria-modal`);
    // not clipped: dialog box within viewport bounds (top >= 0 area, width <= viewport)
    const box = await dialog.boundingBox();
    const vw = page.viewportSize().width;
    if (box && box.width <= vw + 1 && box.x >= -1) { /* ok */ } else bad(`${label}: dialog clipped`, JSON.stringify(box));
    // ESC closes
    await page.keyboard.press("Escape");
    const gone = await dialog.isHidden({ timeout: 2000 }).catch(() => false);
    if (!gone) { bad(`${label}: ESC did not close dialog ${i}`); await page.keyboard.press("Escape"); }
    opened++;
  }
  return opened;
}
for (const [w, h, label] of [[1440, 900, "desktop"], [390, 844, "mobile"]]) {
  console.log(`\n=== LANDING MODAL · ${label} (${w}px) ===`);
  const ctx = await newCtx(w, h); const page = await ctx.newPage(); wire(page);
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  const nTrig = await page.locator(".launch-trigger").count();
  const opened = await testModal(page, label);
  opened >= 1 ? ok(`${label}: ${opened}/${nTrig} visible Launch triggers opened + ESC-closed the dialog`) : bad(`${label}: no Launch trigger opened`);

  // focus trap + backdrop + focus return (test on first visible trigger)
  const firstTrig = page.locator(".launch-trigger").first();
  await firstTrig.click();
  const dialog = page.locator('[role="dialog"]');
  await dialog.waitFor({ state: "visible", timeout: 3000 }).catch(() => {});
  // focus trap: first focusable is focused; shift+Tab should wrap to last (stay in dialog)
  const insideBefore = await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') != null);
  await page.keyboard.press("Shift+Tab");
  await page.waitForTimeout(100);
  const insideAfter = await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') != null);
  (insideBefore && insideAfter) ? ok(`${label}: focus trapped inside dialog (shift+Tab wraps)`) : bad(`${label}: focus not trapped`, `before=${insideBefore} after=${insideAfter}`);
  // backdrop click closes
  await page.locator(".launch-backdrop").click({ position: { x: 5, y: 5 } });
  const closed = await dialog.isHidden({ timeout: 2000 }).catch(() => false);
  closed ? ok(`${label}: backdrop click closes dialog`) : bad(`${label}: backdrop click did not close`);
  // focus returns to trigger
  const returned = await page.evaluate(() => document.activeElement?.classList.contains("launch-trigger"));
  returned ? ok(`${label}: focus returns to the trigger on close`) : bad(`${label}: focus not returned to trigger`);

  // role/demo links present in modal
  await firstTrig.click();
  await dialog.waitFor({ state: "visible" }).catch(() => {});
  const hrefs = await dialog.locator("a[href]").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  const need = ["/demo", "/sender", "/receiver", "/regulator", "/operator"];
  need.every((h) => hrefs.includes(h)) ? ok(`${label}: modal links to ${need.join(", ")}`) : bad(`${label}: modal missing role links`, JSON.stringify(hrefs));
  await page.keyboard.press("Escape");
  await ctx.close();
}

// ============ LANDING · circuits tab (7) + nav anchors + a11y tablist ============
console.log("\n=== LANDING · circuits tab + nav anchors ===");
{
  const ctx = await newCtx(); const page = await ctx.newPage(); wire(page);
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(700);
  // default circuits tab shows 7 cards
  const cards = await page.locator(".circ-card").count();
  cards === 7 ? ok("Circuits tab shows 7 circuit cards") : bad("circuit card count", "got " + cards);
  // tablist roles + aria-selected
  const tabs = page.locator('.tabs [role="tab"]');
  const tn = await tabs.count();
  const selCount = await tabs.evaluateAll((els) => els.filter((e) => e.getAttribute("aria-selected") === "true").length);
  (tn >= 4 && selCount === 1) ? ok(`landing tablist: ${tn} tabs, exactly 1 aria-selected`) : bad("landing tablist a11y", `tabs=${tn} selected=${selCount}`);
  // switch to Contracts tab
  await page.getByRole("tab", { name: "Contracts" }).click();
  await page.waitForTimeout(200);
  (await page.getByRole("tab", { name: "Contracts" }).getAttribute("aria-selected")) === "true" ? ok("Contracts tab selects") : bad("Contracts tab not selected");
  // nav anchors exist
  const anchors = await page.locator(".nav a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  ["#apps", "#corridor", "#circuits", "#contracts"].every((h) => anchors.includes(h)) ? ok("header nav anchors present (#apps/#corridor/#circuits/#contracts)") : bad("nav anchors", JSON.stringify(anchors));
  // clicking an anchor updates the hash
  await page.getByRole("link", { name: "Apps", exact: true }).click();
  await page.waitForTimeout(200);
  (await page.evaluate(() => location.hash)) === "#apps" ? ok("nav anchor scroll works (hash=#apps)") : bad("nav anchor hash not set");
  await ctx.close();
}

// ============ A11Y basics: focus-visible defined + first-Tab reaches a control ============
console.log("\n=== A11Y basics ===");
{
  const ctx = await newCtx(); const page = await ctx.newPage(); wire(page);
  await page.goto(BASE + "/regulator", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  await page.keyboard.press("Tab");
  const tag = await page.evaluate(() => document.activeElement?.tagName);
  ["A", "BUTTON", "INPUT", "TEXTAREA", "SELECT"].includes(tag || "") ? ok("first Tab reaches a focusable control (" + tag + ")") : bad("first Tab did not reach a control", "active=" + tag);
  await ctx.close();
}

console.log("\n=== ERRORS ===");
const noteworthy = errs.filter((e) => !/er-api|Failed to load resource|favicon|reflector|manifest|getUserMedia|Permissions/i.test(e));
console.log(noteworthy.length ? noteworthy.slice(0, 30).map((e) => "  - " + e).join("\n") : "  none");
console.log(`\n=== qa2-ui: ${pass}/${pass + fail} checks passed ===`);
await browser.close();
