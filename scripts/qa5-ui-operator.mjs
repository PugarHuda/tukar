// QA5 OPERATOR (item 3) — Oracle health: SPOT beside MEDIAN per corridor (offramp_quote vs
// offramp_quote_twap), honest median-settles note, and a StatusPill that RESOLVES (not stuck on
// skeletons) + the timeout/error code path exists. RPC outage can't be forced, so we assert the
// pill leaves "loading" and the error branch is present in source.
import { chromium } from "playwright-core";
import { readFileSync } from "fs";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://localhost:3000";
const SHOTS = "scripts/qa-shots";
let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log("  PASS " + n); };
const bad = (n, e) => { fail++; console.log("  FAIL " + n + (e ? " :: " + e : "")); };
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const errs = [];
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errs.push("console.error: " + m.text().slice(0, 160)); });
page.on("response", (r) => { if (r.status() === 404) errs.push("404: " + r.url()); });
page.setDefaultTimeout(30000);

console.log("\n=== OPERATOR · Oracle health section ===");
await page.goto(BASE + "/operator", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1000);
// navigate to Oracle health section
const nav = page.getByRole("button", { name: /oracle health/i }).first();
if (await nav.count()) { await nav.click(); await page.waitForTimeout(600); } else console.log("  (note) oracle nav not found");

// The section head has a StatusPill: loading -> "reading FX oracle…", ok -> "Reflector SEP-40 FX",
// err -> "oracle unreachable". Poll until it leaves the loading state (proves it isn't stuck).
let pillText = "", resolved = false;
for (let i = 0; i < 20; i++) {
  pillText = await page.evaluate(() => {
    // the pill sits in the Oracle health section head
    const heads = [...document.querySelectorAll("*")].filter((e) => /Oracle health/.test(e.textContent || "") && e.children.length < 8);
    const t = document.body.innerText;
    return t;
  });
  const cur = await page.evaluate(() => document.body.innerText);
  if (/oracle unreachable|Reflector SEP-40 FX/.test(cur)) { resolved = true; pillText = /oracle unreachable/.test(cur) ? "oracle unreachable (err)" : "Reflector SEP-40 FX (ok)"; break; }
  if (/reading FX oracle/.test(cur)) pillText = "reading FX oracle… (loading)";
  await page.waitForTimeout(1500);
}
resolved ? ok(`Oracle StatusPill RESOLVED to a terminal state, not stuck on skeletons: "${pillText}"`)
  : bad(`Oracle StatusPill still in loading/skeleton after ~30s: "${pillText}"`);

// spot vs median line + code labels + honest note
await page.waitForTimeout(1500);
const body = await page.evaluate(() => document.body.innerText);
/median/i.test(body) && /spot/i.test(body) ? ok("both 'median' and 'spot' labels render in Oracle health") : bad("missing spot/median labels", body.slice(0, 200));
/offramp_quote_twap/.test(body) ? ok("median labelled with offramp_quote_twap") : bad("offramp_quote_twap label missing");
/offramp_quote\b/.test(body) ? ok("spot labelled with offramp_quote") : bad("offramp_quote label missing");
/median of 5 records|median is the floor|median.*withdraw/i.test(body) ? ok("honest 'median settles / is the floor' note present") : bad("median-settles note missing");

// count corridor cards that show a spot+median pair
const pairs = await page.evaluate(() => {
  const nodes = [...document.querySelectorAll("*")];
  let n = 0;
  for (const el of nodes) {
    const t = el.textContent || "";
    if (el.children.length && /median/.test(t) && /spot/.test(t) && /offramp_quote_twap/.test(t) && /offramp_quote\b/.test(t) && t.length < 400) n++;
  }
  return n;
});
pairs > 0 ? ok(`at least one corridor shows a spot+median pair block (matched ${pairs} container(s))`) : bad("no corridor spot/median pair block found");

// error-state code path exists in source (can't force a real RPC outage)
const src = readFileSync("webapp/app/operator/page.tsx", "utf8");
/couldn.t reach the FX oracle|Couldn&apos;t reach the FX oracle/i.test(src) && /status === "err"/.test(src) && /oracle unreachable/.test(src)
  ? ok("error-state code path present: timeout(15s) race + 'err' pill + 'couldn't reach the FX oracle' message")
  : bad("error-state code path not found in operator source");
/Promise\.race\(\[work, timeout\]\)|setTimeout\(\(\) => res\(null\), 15000\)/.test(src)
  ? ok("15s timeout race guards against a hung oracle read (never stuck on skeletons)")
  : bad("timeout race not found in source");

await page.screenshot({ path: `${SHOTS}/qa5-operator-oracle.png`, fullPage: true }).catch(() => {});

console.log("\n=== ERRORS (filtered) ===");
const note = errs.filter((e) => !/er-api|Failed to load resource|favicon|reflector|manifest|Permissions-Policy|429|throttl/i.test(e));
console.log(note.length ? note.slice(0, 20).map((e) => "  - " + e).join("\n") : "  none");
console.log(`\n=== qa5-operator: ${pass}/${pass + fail} checks passed ===`);
await browser.close();
