// TIGHT ~80-90s highlight cut of Tukar for the live pitch. Real testnet
// interactions, fake cursor + caption bar, silent (user records VO).
// Sender (real send) → Receiver (claim + real Reflector quote + gate) →
// Disclosure+Regulator (verify bound, then tamper REJECTED = climax) →
// Operator pan → close. Run alone (drives the embedded testnet key).
//
//   node scripts/record-shortcut.mjs [baseUrl]   default http://localhost:5050
import { chromium } from "playwright-core";
import { readFileSync, writeFileSync, existsSync, renameSync, readdirSync } from "node:fs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = (process.argv[2] || "http://localhost:5050").replace(/\/$/, "");
const OUTDIR = "scripts/demo-video-out";
const TAG = (process.argv[3] || "").trim();   // "" = full 1:50 cut; "90s" = tight pitch cut
const SUF = TAG ? "-" + TAG : "";
const VOD = OUTDIR + "/vo" + TAG;              // per-variant VO dir (vo / vo90s)
const W = 1366, H = 768;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const rec = (s) => { log.push(s); console.log(s); };
const GENUINE = "scripts/qa-shots/qa2-receipt-threshold.json";   // real, on-chain-bound
const TAMPERED = "scripts/qa-shots/qa4-tampered-threshold.json"; // one flipped char

// fake cursor + caption bar, injected on every navigation (identical to full cut)
const UI_INIT = `
(() => {
  if (window.__tukUiInstalled) return;
  window.__tukUiInstalled = true;
  const ensure = () => {
    if (!document.body) return;
    if (!document.getElementById('tuk-cursor')) {
      const c = document.createElement('div'); c.id = 'tuk-cursor';
      c.style.cssText = 'position:fixed;left:0;top:0;width:22px;height:22px;border-radius:50%;background:rgba(255,255,255,0.9);border:2px solid rgba(20,20,20,0.55);box-shadow:0 2px 8px rgba(0,0,0,0.35);z-index:2147483647;pointer-events:none;transform:translate(-50%,-50%);will-change:left,top;';
      document.documentElement.appendChild(c);
      window.__cx = ${Math.round(W / 2)}; window.__cy = ${Math.round(H / 2)};
      c.style.left = window.__cx + 'px'; c.style.top = window.__cy + 'px';
    }
    if (!document.getElementById('tuk-caption')) {
      const bar = document.createElement('div'); bar.id = 'tuk-caption';
      bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147483646;pointer-events:none;display:flex;justify-content:center;padding:0 0 26px 0;font-family:Inter,system-ui,sans-serif;';
      const inner = document.createElement('div'); inner.id = 'tuk-caption-inner';
      inner.style.cssText = 'max-width:1080px;margin:0 20px;padding:12px 22px;border-radius:12px;background:rgba(12,12,14,0.82);color:#f4f4f5;font-size:21px;line-height:1.4;font-weight:500;text-align:center;box-shadow:0 6px 26px rgba(0,0,0,0.45);backdrop-filter:blur(3px);border:1px solid rgba(255,255,255,0.10);opacity:0;transition:opacity .3s ease;';
      bar.appendChild(inner); document.documentElement.appendChild(bar);
    }
  };
  window.__ensureUi = ensure;
  window.__cap = (t) => { ensure(); const el = document.getElementById('tuk-caption-inner'); if (!el) return Promise.resolve();
    return new Promise((res) => { el.style.opacity = '0'; setTimeout(() => { el.textContent = t; el.style.opacity = '1'; res(); }, 200); }); };
  window.__moveCursor = (x, y, ms) => new Promise((res) => { ensure(); const c = document.getElementById('tuk-cursor'); if (!c) return res();
    const sx = window.__cx ?? x, sy = window.__cy ?? y, dx = x - sx, dy = y - sy, steps = Math.max(12, Math.round(ms / 16));
    let i = 0; const ease = (t) => (t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t+2,2)/2);
    const step = () => { i++; const t = ease(i/steps); const nx = sx+dx*t, ny = sy+dy*t; c.style.left = nx+'px'; c.style.top = ny+'px'; window.__cx = nx; window.__cy = ny; if (i<steps) requestAnimationFrame(step); else res(); };
    requestAnimationFrame(step); });
  window.__pulse = () => { ensure(); const c = document.getElementById('tuk-cursor'); if (!c) return;
    const p = document.createElement('div'); p.style.cssText = 'position:fixed;left:'+window.__cx+'px;top:'+window.__cy+'px;width:22px;height:22px;border-radius:50%;border:2px solid rgba(240,140,60,0.9);z-index:2147483645;pointer-events:none;transform:translate(-50%,-50%);transition:all .5s ease-out;opacity:0.9;';
    document.documentElement.appendChild(p); requestAnimationFrame(() => { p.style.width='54px'; p.style.height='54px'; p.style.opacity='0'; }); setTimeout(() => p.remove(), 520); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensure); else ensure();
})();`;

// Phone frame for the mobile-first consumer apps: constrain the (already single-column)
// content to phone width + a tasteful rounded bezel on the dark backdrop. Desktop dashboards
// skip this. The app is genuinely mobile-first, so at ~340px it renders its true phone layout;
// scrolling/cursor/captions all keep working on the same page (no iframe).
const PHONE_JS = `(() => {
  const bg = '#0a0705';
  let st = document.getElementById('phone-style');
  if (!st) { st = document.createElement('style'); st.id = 'phone-style'; document.head.appendChild(st); }
  st.textContent = 'html,body{background:'+bg+' !important;}'
    + 'body > *:not(#phone-bezel):not(#phone-home):not(#tuk-cursor):not(#tuk-caption):not(#phone-style){max-width:340px !important;margin-left:auto !important;margin-right:auto !important;padding-top:46px !important;padding-bottom:56px !important;box-sizing:border-box !important;}';
  const mk = (id, css) => { let e = document.getElementById(id); if (!e) { e = document.createElement('div'); e.id = id; document.documentElement.appendChild(e); } e.style.cssText = css; return e; };
  mk('phone-bezel', 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:374px;height:724px;border-radius:50px;'
    + 'box-shadow:0 0 0 9999px '+bg+', 0 0 0 2px rgba(255,255,255,0.13) inset, 0 0 0 12px #17110d, 0 0 0 14px rgba(255,255,255,0.06), 0 40px 90px 10px rgba(0,0,0,0.55);'
    + 'pointer-events:none;z-index:2147483640;');
  mk('phone-home', 'position:fixed;left:50%;top:calc(50% + 362px - 22px);transform:translateX(-50%);width:120px;height:5px;border-radius:3px;background:rgba(255,255,255,0.28);pointer-events:none;z-index:2147483643;');
})();`;

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", `--window-size=${W},${H}`] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: OUTDIR, size: { width: W, height: H } }, permissions: ["clipboard-read", "clipboard-write"] });
await ctx.addInitScript(UI_INIT);
const page = await ctx.newPage();
page.setDefaultTimeout(30000);
page.on("dialog", (d) => d.accept().catch(() => {}));

const safe = (fn) => Promise.resolve().then(fn).catch((e) => rec("    (warn) " + (e.message || e)));
const cap = (t) => page.evaluate((x) => window.__cap(x), t).catch(() => {});
const ensureUi = () => page.evaluate(() => window.__ensureUi && window.__ensureUi()).catch(() => {});
async function moveTo(loc) { const b = await loc.boundingBox({ timeout: 8000 }).catch(() => null); if (!b) return;
  const x = Math.round(b.x + b.width/2), y = Math.round(Math.min(b.y + b.height/2, H - 90));
  await page.evaluate(({x,y}) => window.__moveCursor(x,y,480), {x,y}).catch(() => {}); await sleep(100); }
async function click(loc, { scroll = true } = {}) { const l = typeof loc === "string" ? page.locator(loc).first() : loc;
  if (scroll) await l.scrollIntoViewIfNeeded({ timeout: 8000 }).catch(() => {}); await sleep(120); await moveTo(l);
  await page.evaluate(() => window.__pulse()).catch(() => {}); await sleep(110);
  await l.click({ timeout: 12000 }).catch(async () => { await l.click({ timeout: 8000, force: true }).catch(() => {}); }); }
const glide = (sel) => page.evaluate(async (s) => { const el = document.querySelector(s); const target = el ? Math.max(0, el.getBoundingClientRect().top + scrollY - 150) : 0;
  const from = scrollY, dist = target - from; if (Math.abs(dist) <= 8) return; const steps = 40; for (let i=1;i<=steps;i++){ scrollTo(0, from + dist*(i/steps)); await new Promise(r=>setTimeout(r,13)); } }, sel).catch(() => {});
const scrollBy = (y) => page.evaluate(async (yy) => { const from = scrollY, dist = yy - from, steps = 40; for (let i=1;i<=steps;i++){ scrollTo(0, from + dist*(i/steps)); await new Promise(r=>setTimeout(r,13)); } }, y).catch(() => {});
async function nav(p) { await page.goto(BASE + p, { waitUntil: "domcontentloaded", timeout: 60000 }); await ensureUi(); await sleep(250); }
// present the consumer apps inside the phone frame (dashboards stay full desktop)
const enterPhone = () => page.evaluate(PHONE_JS).catch(() => {});
// caption + minimum hold while an optional action runs
async function beat(text, holdMs, action) { await cap(text); const t0 = Date.now(); if (action) await safe(action); const r = holdMs - (Date.now() - t0); if (r > 0) await sleep(r); }

// canonical caption text + per-line VO durations (dash-free lines == VO == subtitles)
const LINES = JSON.parse(readFileSync(VOD + "/lines.json", "utf8"));
const DUR = existsSync(VOD + "/durs.json") ? JSON.parse(readFileSync(VOD + "/durs.json", "utf8")).durs : {};
const SPEED = 4; // must match speedup post-process
const capMarks = []; // {id, t} in VIDEO seconds — used to place each VO line on the final timeline

const t0 = Date.now();
const videoT0 = t0; // video timeline origin ≈ page creation
const speedRanges = []; // {label,start,end} in VIDEO seconds — post-processed to SPEEDx (sped up, not cut)
const relS = () => (Date.now() - videoT0) / 1000;
// set a caption by line id and log the moment it appeared (for VO sync)
async function capId(id) { capMarks.push({ id, t: +relS().toFixed(2) }); await cap(LINES[id] ?? id); }
// wrap a real loading/processing wait: keep the (already-set) caption up, log its
// video-relative span so ffmpeg can accelerate ONLY these ranges afterward. Returns source seconds.
async function slowSeg(label, fn) { const s = relS(); await safe(fn); const e = relS(); const d = e - s; if (d >= 2.5) { speedRanges.push({ label, start: +s.toFixed(2), end: +e.toFixed(2) }); rec(`    [seg] ${label}: ${s.toFixed(1)}→${e.toFixed(1)}s`); } return d; }
// A line absent from this variant's lines.json is merged into its neighbour: the action still
// runs (e.g. amount entry) but no separate caption/VO appears. Lets the 90s cut drop a beat.
const hasLine = (id) => LINES[id] != null;
// NORMAL caption: show it, run the (quick) action, then hold so it stays on screen ~its VO length
async function say(id, action) { const start = Date.now(); if (hasLine(id)) await capId(id); if (action) await safe(action); const target = hasLine(id) ? (DUR[id] || 3) + 0.3 : 0.5; const need = target - (Date.now() - start) / 1000; if (need > 0) await sleep(need * 1000); }
// LOADING caption: show it, trigger, run the sped real wait, then top up so its FINAL (post-speedup) on-screen time ~ its VO length
async function loadSay(id, trigger, label, waitFn) { if (hasLine(id)) await capId(id); if (trigger) await safe(trigger); const segSrc = await slowSeg(label, waitFn); if (hasLine(id)) { const segFinal = segSrc >= 2.5 ? segSrc / SPEED : segSrc; const need = (DUR[id] || 3) + 0.3 - segFinal; if (need > 0) await sleep(need * 1000); } return segSrc; }
// scroll a result element so its top sits ~pad px below the viewport top — keeps it
// well clear of the fixed bottom caption bar, then the caller holds on it.
async function bringUp(loc, pad = 200) { const l = typeof loc === "string" ? page.locator(loc).first() : loc; await l.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {}); const b = await l.boundingBox().catch(() => null); if (!b) return;
  await page.evaluate(async ({ y, pad }) => { const target = Math.max(0, scrollY + y - pad); const from = scrollY, dist = target - from, steps = 26; for (let i = 1; i <= steps; i++) { scrollTo(0, from + dist * (i / steps)); await new Promise(r => setTimeout(r, 12)); } }, { y: b.y, pad }); }
const results = { send: "skipped", claim: "skipped", reveal: "skipped", disclosure: "skipped", regGenuine: "skipped", regTamper: "skipped", operator: "skipped" };
let liveBearer = null;

try {
  // ---- SENDER (real send) --------------------------------------------------
  rec("SHORT · Sender");
  await nav("/sender");
  await enterPhone();
  await sleep(700);
  await say("s1", async () => {
    await click(page.getByRole("button", { name: "Use testnet key" }).first());
    await page.getByText(/testnet key ·/).first().waitFor({ timeout: 12000 }).catch(() => {});
  });
  results.connect = (await page.getByText(/testnet key ·/).first().isVisible().catch(() => false)) ? "connected" : "not confirmed";
  await say("s2", async () => {
    await glide("#amount");
    await page.locator("#corridor").selectOption("MX").catch(() => {});
    await page.locator("#amount").fill("500").catch(() => {});
  });
  // s3 = "Hit send…": advance to confirm and actually click Send (proving starts under this caption)
  await say("s3", async () => {
    await click(page.getByRole("button", { name: /Continue/ }).first());
    await page.getByText(/Confirm and send/i).waitFor({ timeout: 8000 }).catch(() => {});
    await sleep(300);
    await click(page.getByRole("button", { name: /^Send \$/ }).first());
    await page.getByText(/Zero-knowledge proofs/i).first().waitFor({ timeout: 8000 }).catch(() => {});
  });
  // s4 = held over the real proving + on-chain deposit wait (this range is sped up, not cut)
  let sent = false;
  await loadSay("s4", null, "proving + on-chain deposit", async () => {
    sent = await page.getByRole("heading", { name: /Sent and shielded/i }).waitFor({ timeout: 150000 }).then(() => true).catch(() => false);
  });
  if (sent) {
    results.send = "COMPLETED on-chain";
    liveBearer = await page.locator("pre").first().innerText().then(s => s.trim()).catch(() => null);
    if (!(liveBearer && /^tukar1:/.test(liveBearer))) liveBearer = null;
    rec("  send: COMPLETED on-chain" + (liveBearer ? ", captured live bearer" : ", bearer capture failed"));
    await say("s5", async () => { await sleep(400); await glide("pre"); });
  } else {
    results.send = "did not confirm";
    rec("  send: did NOT confirm in time");
    await beat("The deposit is still settling. Continuing the walkthrough.", 2600);
  }

  // ---- RECEIVER (claim + real Reflector quote + gate) ----------------------
  rec("SHORT · Receiver");
  let bearer = liveBearer;
  if (!bearer) { // crafted fallback keeps the receiver interactive if the live send didn't yield one
    const { buildPoseidon } = await import("circomlibjs"); const P = await buildPoseidon(); const Fp = P.F;
    const Hh = (a) => Fp.toObject(P(a)).toString(); const rnd = () => (BigInt(Math.floor(Math.random()*1e15))*1000003n+7n).toString();
    const amt = 5000000000n, pk = rnd(), pub = Hh([BigInt(pk)]), bl = rnd(); const cm = Hh([amt, BigInt(pub), BigInt(bl)]);
    bearer = "tukar1:" + Buffer.from(JSON.stringify({ v:1, ref:"DEMO-500", amount:String(amt), privKey:pk, pubKey:pub, blinding:bl, commitment:cm, corridor:"MX" }), "utf8").toString("base64");
    rec("  receiver: using crafted fallback bearer");
  }
  await nav("/receiver");
  await enterPhone();
  await page.getByRole("status").filter({ hasText: /Ready|Paste a bearer/i }).first().waitFor({ timeout: 20000 }).catch(() => {});
  // r1 = paste + claim (Merkle tree rebuilds from chain)
  let claimed = false;
  await loadSay("r1", async () => {
    await click(page.getByRole("tab", { name: /^Claim$/ }));
    await page.locator("textarea").first().fill(bearer).catch(() => {});
    await click(page.getByRole("button", { name: "Claim payment" }));
  }, "rebuilding the tree + claiming on-chain", async () => { claimed = await page.getByText(/shielded arrival/i).first().waitFor({ timeout: 12000 }).then(() => true).catch(() => false); });
  results.claim = claimed ? "COMPLETED (claimed from chain)" : "shown-only";
  rec("  claim: " + results.claim);
  if (claimed) {
    await sleep(500);
    // r2 = cash out, live Reflector quote read on-chain
    await loadSay("r2", async () => {
      await glide("text=shielded arrival");
      await click(page.getByRole("button", { name: /Reveal in/ }).first());
    }, "reading the on-chain Reflector quote", async () => {
      await page.getByRole("status").filter({ hasText: /read on-chain|no live price|unavailable|median|live .* rate/i }).first().waitFor({ timeout: 20000 }).catch(() => {});
    });
    const revStatus = await page.locator("div[role=status]").first().innerText().catch(() => "");
    results.reveal = (await page.getByText(/^Revealed$/).first().isVisible().catch(() => false)) ? ("COMPLETED — " + (/read on-chain/i.test(revStatus) ? "on-chain Reflector quote" : "quote shown")) : "shown-only";
    rec("  reveal: " + results.reveal);
    // r3 = median of five, spot beside it, min-receive gate
    await say("r3", async () => {
      await safe(() => click(page.getByText("Cash out to fiat", { exact: true })));
      await sleep(300); await scrollBy(await page.evaluate(() => scrollY + 260));
    });
    // ---- DISCLOSURE: one real receipt ------------------------------------
    rec("SHORT · Disclosure");
    // d1 = prove one fact, here a range
    await say("d1", async () => {
      await safe(() => click(page.getByText(/Prove to a regulator/i).first()));
      await sleep(250);
      await safe(async () => { await page.locator("[id^=disc-mode-]").first().selectOption("range"); });
      await page.locator("[id^=lo-]").first().fill("400").catch(() => {});
      await page.locator("[id^=hi-]").first().fill("600").catch(() => {});
    });
    // d2 = generated in-browser, then export a receipt
    let got = false;
    await loadSay("d2", async () => { await click(page.getByRole("button", { name: /Generate proof/ }).first()); },
      "proving the range in-browser", async () => { got = await page.getByText(/between \$400 and \$600/i).first().waitFor({ timeout: 45000 }).then(() => true).catch(() => false); });
    let exported = false;
    const eb = page.getByRole("button", { name: /Export receipt/ }).first();
    if (await eb.isVisible().catch(() => false)) { const dl = page.waitForEvent("download", { timeout: 8000 }).catch(() => null); await click(eb); const f = await dl; if (f) { await f.saveAs(OUTDIR + "/short-receipt" + SUF + ".json").catch(() => {}); exported = true; } }
    results.disclosure = got ? (exported ? "COMPLETED (real proof + receipt exported)" : "proof generated") : "not shown";
    rec("  disclosure: " + results.disclosure);
  } else {
    await beat("Selective disclosure proves one fact, exact, threshold, range, or aggregate, and nothing else.", 4000);
  }

  // ---- REGULATOR (climax) --------------------------------------------------
  rec("SHORT · Regulator");
  await nav("/regulator");
  await page.getByRole("heading", { name: /Regulator \/ Compliance console/ }).first().waitFor({ timeout: 15000 }).catch(() => {});
  await safe(() => click(page.getByRole("button", { name: "Verify disclosure" }).first()));
  await sleep(300);
  const clickVerify = () => safe(() => click(page.getByRole("button", { name: /Re-verify in browser and on-chain/ }).first()));
  const waitVerdict = () => page.waitForFunction(() => { const s = document.querySelector("#receipt")?.closest("section"); return s && /In your browser:|Verification error|Not valid JSON|Missing proof/.test(s.innerText); }, { timeout: 120000 }).catch(() => {});
  // the rendered verdict block is the bg-black/20 tile that carries the capitalized "In your browser:"
  // (intro copy says lowercase "in your browser" with no colon, so this isolates the real result)
  const verdict = () => page.locator("div.bg-black\\/20").filter({ hasText: /In your browser:/ }).last();
  const verdictText = async () => (await verdict().innerText().catch(() => "")).replace(/\s+/g, " ");
  const topUp = async (id, segSrc, extra = 0.3) => { const segFinal = segSrc >= 2.5 ? segSrc / SPEED : segSrc; const need = (DUR[id] || 3) + extra - segFinal; if (need > 0) await sleep(need * 1000); };

  // g1 = "verifies it twice, browser + live contract" — over the genuine verify
  await capId("g1");
  await page.locator("#receipt").fill(readFileSync(GENUINE, "utf8")).catch(() => {});
  await sleep(300);
  await clickVerify();
  const segG = await slowSeg("verifying the genuine receipt on-chain", waitVerdict);
  await bringUp(verdict(), 170);
  const tg = await verdictText();
  results.regGenuine = /Verified and bound to real on-chain state/.test(tg) ? "COMPLETED — VALID + BOUND on-chain" : "verify text not matched (" + tg.slice(0, 80) + ")";
  rec("  regulator/genuine: " + results.regGenuine);
  await topUp("g1", segG);
  // g2 = "a real receipt passes, valid and bound" — HOLD on the green VALID + BOUND verdict
  await capId("g2");
  await bringUp(verdict(), 170);
  await sleep((DUR.g2 || 4) * 1000 + 400);

  // t1 = "now a forged one, change a single number"
  await capId("t1");
  await page.locator("#receipt").fill(readFileSync(TAMPERED, "utf8")).catch(() => {});
  await bringUp(page.locator("#receipt"), 150);
  await sleep((DUR.t1 || 3) * 1000 + 300);
  // t2 = "the verifier rejects it, invalid and not bound" — CLIMAX, HOLD clearly on the REJECTED verdict
  await capId("t2");
  await clickVerify();
  const segT = await slowSeg("verifier rejecting the forgery", waitVerdict);
  await bringUp(verdict(), 170);
  const tt = await verdictText();
  results.regTamper = (/✗ invalid/.test(tt) || /Not valid/.test(tt) || /rejected/i.test(tt) || /not bound/i.test(tt)) ? "COMPLETED — REJECTED (invalid)" : "rejection text not matched (" + tt.slice(0, 80) + ")";
  rec("  regulator/tamper: " + results.regTamper + "  [verdict: " + tt.slice(0, 100) + "]");
  await topUp("t2", segT, 0.8); // hold the climax a beat longer

  // ---- OPERATOR (quick pan) ------------------------------------------------
  rec("SHORT · Operator");
  await nav("/operator");
  await page.getByRole("heading", { name: /Corridor operations/ }).first().waitFor({ timeout: 15000 }).catch(() => {});
  await say("o1", async () => {
    await page.waitForFunction(() => /commitment|leaves|root/i.test(document.body.innerText), { timeout: 15000 }).catch(() => {});
    await scrollBy(520);
    await safe(() => click(page.getByRole("button", { name: /Oracle health/ }).first()));
    await page.waitForFunction(() => /Reflector SEP-40 FX|oracle unreachable/.test(document.body.innerText), { timeout: 15000 }).catch(() => {});
    await scrollBy(360);
  });
  results.operator = "panned (pool + oracle)";

  // ---- CLOSE ---------------------------------------------------------------
  rec("SHORT · Close");
  await nav("/");
  await say("c1");
  rec("  close: landing");
} catch (e) {
  rec("FATAL: " + (e.stack || e.message));
} finally {
  await sleep(700);
  const video = page.video();
  await page.close();
  let out = video ? await video.path().catch(() => null) : null;
  await ctx.close(); await browser.close();
  let finalWebm = OUTDIR + "/tukar-shortcut" + SUF + ".webm";
  try { if (out && existsSync(out)) renameSync(out, finalWebm);
    else { const w = readdirSync(OUTDIR).filter(f => f.endsWith(".webm") && !/^tukar-(shortcut|fulldemo)/.test(f)); if (w.length) renameSync(OUTDIR + "/" + w[w.length-1], finalWebm); } }
  catch (e) { rec("rename warn: " + e.message); finalWebm = out || finalWebm; }
  writeFileSync(OUTDIR + "/shortcut-ranges" + SUF + ".json", JSON.stringify({ webm: finalWebm, voDir: VOD, suf: SUF, speed: SPEED, ranges: speedRanges, capMarks }, null, 2), "utf8");
  rec("\n===== SHORT-CUT PER-SCENE =====");
  for (const [k, v] of Object.entries(results)) rec("  " + k + ": " + v);
  rec("speed ranges: " + speedRanges.length + " → " + OUTDIR + "/shortcut-ranges" + SUF + ".json");
  rec("VIDEO(webm): " + finalWebm);
  rec("APPROX WALL: " + ((Date.now() - t0) / 1000).toFixed(1) + "s");
  writeFileSync(OUTDIR + "/shortcut-log" + SUF + ".txt", log.join("\n"), "utf8");
}
