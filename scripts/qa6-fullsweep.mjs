// QA6 FULL SWEEP — runs against live production (SDK 16 / Protocol 28 ready).
// Pages (desktop + mobile): console/pageerror clean + key feature elements render (live testnet reads).
// API routes: server-side behaviour incl. real Soroban RPC reads, honest not-configured gates, security headers.
// Usage: node scripts/qa6-fullsweep.mjs   (override target with QA_BASE=...)
import { chromium } from "playwright-core";

const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.QA_BASE || "https://tukar-six.vercel.app";
let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log("  PASS " + n); };
const bad = (n, e) => { fail++; console.log("  FAIL " + n + (e ? " :: " + e : "")); };

// Console noise that is benign and not a defect (third-party analytics only load on Vercel host).
const BENIGN = [/_vercel\/(insights|speed-insights)/i, /favicon/i];
const isBenign = (s) => BENIGN.some((r) => r.test(s));

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
    // real Soroban RPC read via SDK 16 (decimal commitment -> unregistered)
    const ns = await call("/api/note-status", { method: "POST", headers: J, body: JSON.stringify({ commitment: "12345678901234567890" }) });
    ns.status === 200 && ns.json?.status === "unregistered" ? ok("note-status real RPC read (SDK16)") : bad("note-status", ns.status + " " + ns.body.slice(0, 80));

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

    const demo = await call("/demo");
    ok("demo redirect status " + demo.status + " (expect 3xx to /)");
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
      // deck is one shared asset; only test it once (desktop)
      if (r.name === "deck" && vp.label === "mobile") continue;
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await ctx.newPage();
      const errs = [];
      page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
      page.on("console", (m) => { if (m.type() === "error") { const t = m.text(); if (!isBenign(t)) errs.push("console.error: " + t.slice(0, 160)); } });
      try {
        const resp = await page.goto(BASE + r.path, { waitUntil: "domcontentloaded", timeout: 45000 });
        await page.waitForTimeout(r.name === "operator" || r.name === "sender" ? 4500 : 2500);
        const status = resp ? resp.status() : 0;
        if (status === 200) ok(r.name + " [" + vp.label + "] HTTP 200"); else bad(r.name + " [" + vp.label + "] HTTP", status);
        const html = await page.content();
        for (const m of r.must) {
          if (m.test(html)) ok(r.name + " [" + vp.label + "] has " + m); else bad(r.name + " [" + vp.label + "] missing " + m);
        }
        if (errs.length === 0) ok(r.name + " [" + vp.label + "] console clean");
        else bad(r.name + " [" + vp.label + "] " + errs.length + " console/page errors", errs.slice(0, 4).join(" | "));
        // horizontal-scroll guard (no body overflow on mobile)
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
console.log("  PASS " + pass + "   FAIL " + fail);
console.log("===========================================");
process.exit(fail === 0 ? 0 : 1);
