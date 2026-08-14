// QA5 SENDER (item 5) — early amount cap at compose (2e9 -> Continue disabled + hint, no advance);
// Clear on a loaded request RESTORES the prior amount; on-ramp button is wired (no real anchor).
import { chromium } from "playwright-core";
import { readFileSync } from "fs";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://localhost:3000";
const SHOTS = "scripts/qa-shots";
let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log("  PASS " + n); };
const bad = (n, e) => { fail++; console.log("  FAIL " + n + (e ? " :: " + e : "")); };
const ADDR = "G" + "A".repeat(55);
const b64 = (s) => Buffer.from(s, "utf8").toString("base64");
const REQ = "tukreq1:" + b64(JSON.stringify({ v: 1, kind: "req", amount: "75.5", memo: "to GAAA..AAAA", addr: ADDR }));
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const errs = [];
function wire(page) {
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errs.push("console.error: " + m.text().slice(0, 160)); });
  page.on("response", (r) => { if (r.status() === 404) errs.push("404: " + r.url()); });
  page.setDefaultTimeout(20000);
}
async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
  const page = await ctx.newPage(); wire(page);
  return { ctx, page };
}

// ============ EARLY AMOUNT CAP at compose ============
console.log("\n=== SENDER · early amount cap (2,000,000,000) ===");
{
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/sender", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  const amt = page.locator("#amount");
  const cont = page.getByRole("button", { name: /Continue/ });
  // over-cap: 2,000,000,000
  await amt.fill(""); await amt.fill("2000000000");
  await page.waitForTimeout(200);
  const disabled = await cont.isDisabled();
  const title = await cont.getAttribute("title");
  const hintVisible = await page.getByText(/Keep it under 1,000,000,000 USDC/i).isVisible().catch(() => false);
  (disabled && hintVisible) ? ok(`2e9 over cap → Continue DISABLED with hint "Keep it under 1,000,000,000 USDC to continue." (title="${title}")`)
    : bad("2e9 not gated at compose", `disabled=${disabled} hint=${hintVisible} title=${title}`);
  // clicking Continue must NOT advance (force-click a disabled button, then confirm still on compose)
  await cont.click({ force: true }).catch(() => {});
  await page.waitForTimeout(300);
  const stillCompose = await amt.isVisible();
  stillCompose ? ok("force-clicking the capped Continue does NOT advance (still on compose)") : bad("advanced past compose despite cap");

  // boundary: exactly 1,000,000,000 is allowed (<= MAX_USDC)
  await amt.fill(""); await amt.fill("1000000000");
  await page.waitForTimeout(200);
  (await cont.isDisabled()) === false ? ok("boundary 1,000,000,000 (== cap) → Continue ENABLED") : bad("boundary 1e9 wrongly disabled");
  // just over: 1,000,000,001 disabled
  await amt.fill(""); await amt.fill("1000000001");
  await page.waitForTimeout(200);
  (await cont.isDisabled()) === true ? ok("1,000,000,001 (cap+1) → Continue DISABLED") : bad("cap+1 wrongly enabled");
  await page.screenshot({ path: `${SHOTS}/qa5-sender-cap.png` }).catch(() => {});
  await ctx.close();
}

// ============ CLEAR restores the prior amount ============
console.log("\n=== SENDER · Clear restores the pre-request amount ===");
{
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/sender", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  // set a distinctive amount, then load a request (overwrites amount to 75.5), then Clear -> restored
  await page.locator("#amount").fill(""); await page.locator("#amount").fill("777");
  await page.waitForTimeout(150);
  await page.locator("#req").fill(REQ);
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await page.waitForTimeout(400);
  const loaded = await page.locator("#amount").inputValue();
  loaded === "75.5" ? ok("request load overwrote amount to 75.5 (as before)") : bad("request did not load amount", loaded);
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await page.waitForTimeout(300);
  const restored = await page.locator("#amount").inputValue();
  restored === "777" ? ok(`Clear RESTORES the pre-request amount ("777"), not the 75.5 from the request`)
    : bad(`Clear did not restore prior amount (got "${restored}", expected "777")`);
  await ctx.close();
}

// ============ ON-RAMP button wiring (no real anchor) ============
console.log("\n=== SENDER · on-ramp button wired (no real anchor opened) ===");
{
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/sender", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  // advance to the send screen with a valid amount
  await page.locator("#amount").fill(""); await page.locator("#amount").fill("200");
  await page.waitForTimeout(150);
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.waitForTimeout(500);
  const anchorBtn = page.getByRole("button", { name: /Fund via a real anchor/i });
  if (await anchorBtn.count()) {
    ok("on-ramp button present on send screen: 'Fund via a real anchor (SEP-24 on-ramp)'");
    // click WITHOUT connecting: openAnchor bails with a "Connect first" status — proves it's wired,
    // and opens NO real anchor.
    await anchorBtn.click().catch(() => {});
    await page.waitForTimeout(500);
    const status = await page.getByRole("status").innerText().catch(() => "");
    /Connect first.*anchor authenticates|Connect first/i.test(status)
      ? ok(`on-ramp button wired to openAnchor: unconnected click → "Connect first" (no real anchor opened)`)
      : bad("on-ramp click produced no wired 'Connect first' status", status);
  } else bad("on-ramp button not found on send screen");
  await ctx.close();
}

// source: SEP-24 status poll now wired after anchorOnramp (matches off-ramp)
const src = readFileSync("webapp/app/sender/page.tsx", "utf8");
/pollOnrampStatus\(s\.sep24, s\.bearer, s\.id\)/.test(src) && /anchorTxStatus\(/.test(src)
  ? ok("source: SEP-24 on-ramp status poll (pollOnrampStatus -> anchorTxStatus) wired after anchorOnramp")
  : bad("SEP-24 on-ramp status poll not wired in source");

console.log("\n=== ERRORS (filtered) ===");
const note = errs.filter((e) => !/er-api|Failed to load resource|favicon|reflector|manifest|getUserMedia|Permissions-Policy|429|throttl/i.test(e));
console.log(note.length ? note.slice(0, 20).map((e) => "  - " + e).join("\n") : "  none");
console.log(`\n=== qa5-sender: ${pass}/${pass + fail} checks passed ===`);
await browser.close();
