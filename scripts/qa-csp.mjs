// QA-CSP — proves the Content-Security-Policy in webapp/next.config.mjs hardens the app WITHOUT
// breaking anything: no CSP "Refused to ..." violations on any actor page, and live testnet data
// still renders (Soroban RPC over connect-src). Also confirms the snarkjs WASM/worker path is not
// CSP-blocked on the sender page (which warms the Poseidon prover on mount, no wallet needed).
//
// Usage: PORT=3130 npm run start  (in webapp/, background), then: node scripts/qa-csp.mjs
//   override target with QA_BASE=... and Chrome with CHROME=...
import { chromium } from "playwright-core";

const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.QA_BASE || "http://localhost:3130";
let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log("  PASS " + n); };
const bad = (n, e) => { fail++; console.log("  FAIL " + n + (e ? " :: " + e : "")); };

// A console/pageerror message is a CSP violation only when it names the Content Security Policy.
// Chrome's CSP refusals always read "... because it violates the following Content Security Policy
// directive: ...". This deliberately EXCLUDES the nosniff MIME refusal on the Vercel analytics
// scripts ("... its MIME type ('text/html') is not executable ..."), which is X-Content-Type-Options
// at work on a same-origin 404, not CSP (those scripts are allowed by script-src 'self').
const isCsp = (t) => /content security policy/i.test(t);

const routes = [
  { path: "/", name: "landing", live: null },
  { path: "/sender", name: "sender", live: null },
  { path: "/operator", name: "operator", live: /custody|pool health/i }, // live Soroban read must render
  { path: "/regulator", name: "regulator", live: null },
  { path: "/verify", name: "verify", live: null },
  { path: "/receiver", name: "receiver", live: null },
];

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
console.log("=== CSP SWEEP (" + BASE + ") ===");

// 1) Header actually present on a route.
try {
  const ctx0 = await browser.newContext();
  const p0 = await ctx0.newPage();
  const resp = await p0.goto(BASE + "/sender", { waitUntil: "domcontentloaded", timeout: 45000 });
  const csp = resp?.headers()["content-security-policy"];
  csp && /default-src 'self'/.test(csp) && /wasm-unsafe-eval/.test(csp)
    ? ok("CSP header present with default-src + wasm-unsafe-eval")
    : bad("CSP header", csp ? csp.slice(0, 80) : "missing");
  await ctx0.close();
} catch (e) { bad("CSP header probe threw", e.message); }

for (const r of routes) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const cspHits = [];
  page.on("console", (m) => { if (isCsp(m.text())) cspHits.push("console: " + m.text()); });
  page.on("pageerror", (e) => { if (isCsp(e.message)) cspHits.push("pageerror: " + e.message); });
  try {
    await page.goto(BASE + r.path, { waitUntil: "domcontentloaded", timeout: 45000 });
    // give client reads (Soroban RPC) + prover warm time to run and any CSP violation time to fire
    await page.waitForTimeout(r.name === "operator" || r.name === "sender" ? 6000 : 3000);
    cspHits.length === 0 ? ok(r.name + " no CSP violations") : bad(r.name + " CSP violations", cspHits.slice(0, 3).join(" | "));
    if (r.live) {
      const html = await page.content();
      r.live.test(html) ? ok(r.name + " live data renders (" + r.live + ")") : bad(r.name + " live data missing", "connect-src may be blocking Soroban RPC");
    }
    if (r.name === "sender") {
      // The sender warms the Poseidon prover on mount (circomlibjs WASM). Assert no CSP error blocked
      // WASM compile or the proof worker on load, even though a full proof needs a wallet.
      const wasmBlocked = cspHits.some((h) => /wasm|worker|blob/i.test(h));
      !wasmBlocked ? ok("sender WASM/worker not CSP-blocked on load") : bad("sender WASM/worker blocked", cspHits.join(" | "));
    }
  } catch (e) { bad(r.name + " threw", e.message); }
  await ctx.close();
}

await browser.close();
console.log("\n================ CSP RESULT ================");
console.log("  PASS " + pass + "   FAIL " + fail);
console.log("===========================================");
process.exit(fail === 0 ? 0 : 1);
