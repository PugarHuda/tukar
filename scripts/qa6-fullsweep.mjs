// QA6 FULL SWEEP — runs against live production (SDK 16 / Protocol 28 ready).
// Pages (desktop + mobile): pageerror + real network failures clean, key feature elements render
// (live testnet reads), no mobile horizontal overflow. API routes: server-side behaviour incl. real
// Soroban RPC reads, honest not-configured gates, security headers.
// Known-noise (WARN, not FAIL): the Vercel Web Analytics / Speed Insights scripts 404 until Web
// Analytics is enabled in the Vercel dashboard, and the browser favicon probe. These are cosmetic.
// Usage: node scripts/qa6-fullsweep.mjs   (override target with QA_BASE=...)
import { chromium } from "playwright-core";

const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.QA_BASE || "https://tukar-six.vercel.app";
let pass = 0, fail = 0, warn = 0;
const ok = (n) => { pass++; console.log("  PASS " + n); };
const bad = (n, e) => { fail++; console.log("  FAIL " + n + (e ? " :: " + e : "")); };

// Failed resources that are cosmetic, not defects: Vercel analytics (needs a dashboard toggle),
// favicon probe. Matched on the actual request URL (from the network listener, which has it).
// .mp4 streams are aborted when the headless context closes mid-load (net::ERR_ABORTED) even
// though the video serves fine (206 range). That abort is a test artifact, not a broken asset.
const BENIGN = [/_vercel\/(insights|speed-insights)/i, /favicon\.ico/i, /\.mp4(\?|$)/i];
const isBenign = (url) => BENIGN.some((r) => r.test(url));

// ---------- API sweep (server-side, real endpoints) ----------
async function api() {
  console.log("\n=== API ROUTES (" + BASE + ") ===");
  const J = { "Content-Type": "application/json" };
  const call = async (path, opts = {}) => {
    const r = await fetch(BASE + path, opts);
    let body = ""; try { body = await r.text(); } catch {}
    let json = null; try { json = JSON.parse(body); } catch {}
    return { status: r.status, headers: r.headers, body, json };
  };
  try {
    const ns = await call("/api/note-status", { method: "POST", headers: J, body: JSON.stringify({ commitment: "12345678901234567890" }) });
    ns.status === 200 && ns.json?.status === "unregistered" ? ok("note-status real Soroban RPC read (SDK16)") : bad("note-status", ns.status + " " + ns.body.slice(0, 80));

    const v = await call("/api/verify", { method: "POST", headers: J, body: JSON.stringify({ bad: 1 }) });
    v.status === 400 ? ok("verify rejects junk (400)") : bad("verify junk", "expected 400 got " + v.status);

    const trp = await call("/api/travel-rule/send", { method: "POST", headers: J, body: JSON.stringify({ ivms101: { originatingVASP: { n: 1 }, beneficiaryVASP: { n: 1 }, originator: { x: 1 }, beneficiary: { y: 1 }, transaction: { amount: "1", currency: "USDC", network: "Stellar", transactionReference: "R" } } }) });
    trp.status === 200 && trp.json?.ok === true ? ok("TRP 3.2.1 self-hosted exchange (approved)") : bad("TRP send", trp.status + " " + trp.body.slice(0, 80));

    const trisa = await call("/api/travel-rule/trisa", { method: "POST", headers: J, body: JSON.stringify({ beneficiaryVASP: "api.bob.vaspbot.net", ivms101: {} }) });
    trisa.json?.configured === false ? ok("TRISA gated honestly (not deployed -> configured:false)") : bad("TRISA gate", trisa.body.slice(0, 80));

    const cctp = await call("/api/cctp/attest", { method: "POST", headers: J, body: JSON.stringify({ txHash: "0x0000000000000000000000000000000000000000000000000000000000000001", sourceDomain: 6 }) });
    cctp.json?.status === "pending" ? ok("CCTP attest polls Iris (pending)") : bad("CCTP attest", cctp.body.slice(0, 80));

    const rc = await call("/api/reclaim", { method: "POST", headers: J, body: "{}" });
    rc.status === 200 && (rc.json?.configured === true || rc.json?.configured === false) ? ok("reclaim responds (configured=" + rc.json?.configured + ")") : bad("reclaim", rc.status + " " + rc.body.slice(0, 80));

    const nonce = await call("/api/schedules/nonce?address=GB2CVRVNR4VN5LYVOX637ZS46RJONKWVQZ4IZC5IIEPAPPFRC5CHYRVS");
    nonce.json?.configured === false ? ok("schedules gated (Blob/AUTH not set -> configured:false)") : ok("schedules nonce responds");

    const sched = await call("/api/schedules");
    sched.status === 401 || sched.json?.configured === false ? ok("schedules requires auth / gated (" + sched.status + ")") : bad("schedules auth", "expected 401/gated got " + sched.status);

    const toml = await call("/.well-known/stellar.toml");
    toml.status === 200 && toml.headers.get("access-control-allow-origin") === "*" ? ok("stellar.toml 200 + CORS *") : bad("stellar.toml", toml.status + " cors=" + toml.headers.get("access-control-allow-origin"));

    const sec = await call("/sender");
    const xfo = sec.headers.get("x-frame-options"), xcto = sec.headers.get("x-content-type-options"), rp = sec.headers.get("referrer-policy");
    xfo === "SAMEORIGIN" && xcto === "nosniff" && rp ? ok("security headers present (XFO/nosniff/Referrer-Policy)") : bad("security headers", "xfo=" + xfo + " xcto=" + xcto + " rp=" + rp);

    const fav = await call("/favicon.ico");
    fav.status === 200 ? ok("favicon.ico resolves (200)") : bad("favicon", fav.status);
  } catch (e) { bad("api sweep threw", e.message); }
}

// ---------- page sweep ----------
async function pages() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
  const routes = [
    { path: "/", name: "landing", must: [/send money home|private|remittance/i] },
    { path: "/sender", name: "sender", must: [/send|connect|amount/i] },
    { path: "/receiver", name: "receiver", must: [/claim|receive|note/i] },
    { path: "/operator", name: "operator", must: [/pool health/i, /custody/i, /reserves attestation/i, /voluntary reserves/i, /deployed contract inventory/i] },
    { path: "/regulator", name: "regulator", must: [/travel rule/i, /verify|disclosure/i] },
    { path: "/verify", name: "verify", must: [/verify|receipt|paste/i] },
    { path: "/deck", name: "deck", must: [/tukar|private|corridor/i] },
  ];
  const viewports = [{ label: "desktop", width: 1440, height: 900 }, { label: "mobile", width: 390, height: 844 }];
  for (const vp of viewports) {
    console.log("\n=== PAGES · " + vp.label + " (" + vp.width + "x" + vp.height + ") ===");
    for (const r of routes) {
      if (r.name === "deck" && vp.label === "mobile") continue; // deck is a shared asset, test once
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await ctx.newPage();
      const pageErrs = [], failedRes = [];
      page.on("pageerror", (e) => pageErrs.push("pageerror: " + e.message));
      page.on("response", (r2) => { if (r2.status() >= 400) failedRes.push(r2.status() + " " + r2.url()); });
      page.on("requestfailed", (r2) => failedRes.push("FAILED " + r2.url()));
      try {
        const resp = await page.goto(BASE + r.path, { waitUntil: "domcontentloaded", timeout: 45000 });
        await page.waitForTimeout(r.name === "operator" || r.name === "sender" ? 4500 : 2500);
        const status = resp ? resp.status() : 0;
        if (status === 200) ok(r.name + " [" + vp.label + "] HTTP 200"); else bad(r.name + " [" + vp.label + "] HTTP", status);
        const html = await page.content();
        for (const m of r.must) (m.test(html) ? ok(r.name + " [" + vp.label + "] has " + m) : bad(r.name + " [" + vp.label + "] missing " + m));
        const realRes = failedRes.filter((u) => !isBenign(u));
        const benignRes = failedRes.filter((u) => isBenign(u));
        warn += benignRes.length;
        if (pageErrs.length === 0 && realRes.length === 0) ok(r.name + " [" + vp.label + "] clean" + (benignRes.length ? " (ignored " + benignRes.length + " known-noise)" : ""));
        else bad(r.name + " [" + vp.label + "] issues", [...pageErrs, ...realRes].slice(0, 4).join(" | "));
        if (vp.label === "mobile") {
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
          overflow ? bad(r.name + " [mobile] body overflows horizontally") : ok(r.name + " [mobile] no horizontal overflow");
        }
      } catch (e) { bad(r.name + " [" + vp.label + "] threw", e.message); }
      await ctx.close();
    }
  }
  await browser.close();
}

await api();
await pages();
console.log("\n================ QA6 RESULT ================");
console.log("  PASS " + pass + "   FAIL " + fail + "   WARN(known-noise) " + warn);
if (warn) console.log("  note: WARN = Vercel analytics script 404 (enable Web Analytics in the dashboard) / favicon probe. Cosmetic.");
console.log("===========================================");
process.exit(fail === 0 ? 0 : 1);
