// QA4 — Regulator console, desktop 1440. Focus: hardened receipt verification (F1 bound/unbound,
// F2 anchor confirmation, F3 figure-from-publicSignals) + reports reads + issue gating + trail export.
// READ-ONLY: never submits an on-chain write (no audit-request register, no anchor click).
import { chromium } from "playwright-core";
import fs from "fs";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://localhost:3000";
const SHOTS = "scripts/qa-shots";
let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log("  PASS " + n); };
const bad = (n, e) => { fail++; console.log("  FAIL " + n + (e ? " :: " + e : "")); };
const rd = (p) => fs.readFileSync(p, "utf8");

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const errs = [], reqfail = [];
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errs.push("console.error: " + m.text().slice(0, 240)); });
page.on("requestfailed", (r) => reqfail.push(r.url() + " :: " + (r.failure()?.errorText || "")));
page.on("response", (r) => { if (r.status() === 404) reqfail.push("404 " + r.url()); });
page.setDefaultTimeout(45000);

const resultPanel = () => page.locator("#receipt").locator("xpath=ancestor::section[1]").locator("div.bg-black\\/20").last();

async function verify(name, jsonPath, mutate) {
  let obj = JSON.parse(rd(jsonPath));
  if (mutate) obj = mutate(obj);
  await page.locator("#receipt").fill(JSON.stringify(obj));
  await page.getByRole("button", { name: /Re-verify in browser and on-chain/ }).click();
  // result block appears (or an error <p>). Wait for either.
  await page.waitForFunction(() => {
    const sec = document.querySelector("#receipt")?.closest("section");
    if (!sec) return false;
    return /In your browser|Verification error|Not valid JSON|Missing proof/.test(sec.innerText);
  }, { timeout: 120000 }).catch(() => {});
  const sec = page.locator("#receipt").locator("xpath=ancestor::section[1]");
  const txt = await sec.innerText();
  console.log("    [" + name + "] => " + txt.replace(/\s+/g, " ").slice(0, 340));
  return txt;
}

try {
  console.log("\n=== LOAD /regulator (desktop 1440) ===");
  await page.goto(BASE + "/regulator", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  (await page.getByRole("heading", { name: /Regulator \/ Compliance console/ }).count()) ? ok("heading rendered") : bad("heading missing");
  // sidebar nav present (desktop)
  const navBtns = ["Pool report", "Verify disclosure", "Issue audit request", "Audit trail"];
  for (const n of navBtns) (await page.getByRole("button", { name: n }).count()) ? ok("nav: " + n) : bad("nav missing: " + n);

  console.log("\n=== REPORTS / POOL READS ===");
  // KPIs populate from chain (Commitments, Leaf count, Custody balance, Current root)
  await page.waitForFunction(() => /Live · \d+ commitments/.test(document.body.innerText) || /Pool read error/.test(document.body.innerText), { timeout: 60000 }).catch(() => {});
  const statusTxt = await page.locator("div.font-mono.text-\\[11px\\]").first().innerText().catch(() => "");
  /Live · \d+ commitments · \d+ leaves/.test(statusTxt) ? ok("pool status live: " + statusTxt.trim()) : bad("pool status not live", statusTxt.trim());
  const bodyR = await page.locator("main").innerText();
  /Deny-list entries/.test(bodyR) ? ok("compliance policy card present") : bad("compliance card missing");
  /Recent corridor activity/.test(bodyR) ? ok("recent activity card present") : bad("activity card missing");
  // deny list has rows or an explicit empty/unavailable message (not a stuck skeleton)
  await page.waitForTimeout(1000);
  await page.screenshot({ path: SHOTS + "/qa4-reg-reports.png", fullPage: true });

  console.log("\n=== VERIFY · F1 GENUINE (bound) ===");
  await page.getByRole("button", { name: "Verify disclosure" }).click();
  await page.waitForTimeout(400);
  {
    const t = await verify("genuine", SHOTS + "/qa2-receipt-threshold.json");
    const local = /In your browser:\s*✓ valid/.test(t);
    const oc = /Stellar\s*verifier:\s*✓ valid/.test(t);
    const boundGreen = /Verified and bound to real on-chain state/.test(t);
    (local && oc) ? ok("genuine: valid in-browser AND on-chain") : bad("genuine proof not dual-valid", `local=${local} oc=${oc}`);
    boundGreen ? ok("F1 genuine: shows GREEN verified+bound") : bad("F1 genuine: missing bound-green", t.slice(0,200));
    await page.screenshot({ path: SHOTS + "/qa4-reg-genuine.png", fullPage: true });
  }

  console.log("\n=== VERIFY · F1 FABRICATED (never-deposited commitment) ===");
  {
    const t = await verify("fabricated", SHOTS + "/qa4-fabricated-threshold.json");
    const local = /In your browser:\s*✓ valid/.test(t);
    const oc = /Stellar\s*verifier:\s*✓ valid/.test(t);
    const amber = /valid but NOT bound to on-chain state/.test(t);
    const plainGreen = /Verified and bound to real on-chain state/.test(t);
    const anchorBtn = await page.getByRole("button", { name: /^Anchor on-chain$/ }).count();
    console.log(`    local=${local} oc=${oc} amber=${amber} plainGreen=${plainGreen} anchorBtn=${anchorBtn}`);
    // F1 verdict: proof valid but must NOT show plain green; must show amber; anchor gated (no button)
    if (local && amber && !plainGreen && anchorBtn === 0) ok("F1 PASS: valid proof shown as NOT bound (amber), no plain-green, anchor gated");
    else bad("F1 FAIL", `local=${local} amber=${amber} plainGreen=${plainGreen} anchorBtn=${anchorBtn}`);
    await page.screenshot({ path: SHOTS + "/qa4-reg-fabricated.png", fullPage: true });
  }

  console.log("\n=== VERIFY · TAMPERED (flip one proof char) ===");
  {
    const t = await verify("tampered", SHOTS + "/qa4-tampered-threshold.json");
    const invalid = /✗ invalid/.test(t) || /Not valid\.?/.test(t);
    const notBoundOrRejected = /proof was rejected|Not valid/.test(t);
    (invalid && notBoundOrRejected) ? ok("tampered: shows INVALID / rejected (red)") : bad("tampered not flagged invalid", t.slice(0,200));
    await page.screenshot({ path: SHOTS + "/qa4-reg-tampered.png", fullPage: true });
  }

  console.log("\n=== VERIFY · F2 BOGUS ANCHOR ===");
  {
    const t = await verify("bogus-anchor", SHOTS + "/qa4-bogus-anchor-threshold.json");
    const anchorLine = /On-chain anchor:/.test(t);
    const notConfirmed = /not confirmed on-chain/.test(t);
    const notMatch = !/✓ confirmed on-chain/.test(t);
    (anchorLine && notConfirmed && notMatch) ? ok("F2 PASS: bogus anchor => 'not confirmed on-chain', not a match") : bad("F2 FAIL", `line=${anchorLine} notConfirmed=${notConfirmed} notMatch=${notMatch}`);
    await page.screenshot({ path: SHOTS + "/qa4-reg-bogus-anchor.png", fullPage: true });
  }

  console.log("\n=== VERIFY · F3 META MISMATCH (metadata disagrees with proven signal) ===");
  {
    const t = await verify("meta-mismatch", SHOTS + "/qa4-meta-mismatch-threshold.json");
    // proven value is 15 USDC (sig1=150000000). metadata thresholdUsdc=999999 disagrees.
    const showsProven = /≤ \$15 USDC/.test(t);
    const flagged = /receipt metadata disagreed|showing the proven value/.test(t);
    const notShows999 = !/≤ \$999999 USDC/.test(t);
    (showsProven && flagged && notShows999) ? ok("F3 PASS: shows proven $15 & flags metadata mismatch (ignores bogus 999999)") : bad("F3 FAIL", `proven=${showsProven} flagged=${flagged} notBogus=${notShows999}`);
    await page.screenshot({ path: SHOTS + "/qa4-reg-meta-mismatch.png", fullPage: true });
  }

  console.log("\n=== ISSUE AUDIT REQUEST · wallet gating (NO submit) ===");
  await page.getByRole("button", { name: "Issue audit request" }).click();
  await page.waitForTimeout(1200);
  {
    const btn = page.getByRole("button", { name: /Compute hash and register on-chain/ });
    (await btn.isDisabled()) ? ok("issue button DISABLED while disconnected") : bad("issue button not disabled while disconnected");
    const bodyI = await page.locator("main").innerText();
    /Connect the testnet key/.test(bodyI) ? ok("honest 'connect key' prompt shown") : bad("no connect prompt");
    // leaves list loaded (checkboxes) or empty-state message
    await page.waitForFunction(() => {
      const t = document.querySelector("main")?.innerText || "";
      return !/Loading on-chain leaves/.test(t);
    }, { timeout: 30000 }).catch(() => {});
    const cbs = await page.locator('main input[type=checkbox]').count();
    (cbs > 0) ? ok(`leaf checkboxes loaded (${cbs})`) : bad("no leaf checkboxes / still loading");
    // connect testnet key -> button enables (but DO NOT submit)
    await page.getByRole("button", { name: /Use testnet key/ }).first().click().catch(() => {});
    await page.waitForTimeout(1500);
    // select one leaf + random nonce so we can confirm the button ENABLES, then stop (no click)
    if (cbs > 0) await page.locator('main input[type=checkbox]').first().check().catch(() => {});
    const enabledNow = await btn.isEnabled();
    enabledNow ? ok("issue button ENABLES after connecting key (submit intentionally NOT clicked)") : bad("issue button still disabled after connect");
    await page.screenshot({ path: SHOTS + "/qa4-reg-issue.png", fullPage: true });
  }

  console.log("\n=== AUDIT TRAIL · entries + export toast ===");
  await page.getByRole("button", { name: "Audit trail" }).click();
  await page.waitForTimeout(800);
  {
    const bodyT = await page.locator("main").innerText();
    const hasVerified = /Verified disclosure/.test(bodyT);
    hasVerified ? ok("trail recorded the verifications this session") : bad("trail empty / no verify entries");
    // result pills: expect a 'valid + bound', a 'valid, not bound', an 'invalid'
    /valid \+ bound/.test(bodyT) ? ok("trail pill: valid + bound") : bad("no 'valid + bound' pill");
    /valid, not bound/.test(bodyT) ? ok("trail pill: valid, not bound (F1 recorded)") : bad("no 'valid, not bound' pill");
    /invalid/.test(bodyT) ? ok("trail pill: invalid") : bad("no 'invalid' pill");
    // export JSON -> toast
    await page.getByRole("button", { name: /Export JSON/ }).click();
    await page.waitForTimeout(500);
    (await page.getByText(/^Exported$/).count()) ? ok("Export JSON -> toast") : bad("no export toast");
    await page.screenshot({ path: SHOTS + "/qa4-reg-trail.png", fullPage: true });
  }

  console.log("\n=== BACK TO HOME ===");
  await page.getByRole("link", { name: /Back to home/ }).click();
  await page.waitForTimeout(1200);
  /\/$|localhost:3000\/?$/.test(page.url()) ? ok("back-to-home navigates to landing (" + page.url() + ")") : bad("back-to-home url", page.url());

} catch (e) {
  bad("UNCAUGHT", e.message);
} finally {
  console.log("\n=== CONSOLE / PAGEERROR / 404 ===");
  const noiseFilter = (s) => !/favicon|manifest|Download the React DevTools|hydrat/i.test(s);
  const cErr = [...new Set(errs)].filter(noiseFilter);
  const rf = [...new Set(reqfail)].filter(noiseFilter);
  cErr.length ? cErr.forEach((e) => console.log("  console/pageerror: " + e)) : console.log("  (no console errors / pageerrors)");
  rf.length ? rf.forEach((e) => console.log("  reqfail/404: " + e)) : console.log("  (no failed requests / 404s)");
  console.log(`\nRESULT desktop: ${pass} pass / ${fail} fail`);
  await browser.close();
}
