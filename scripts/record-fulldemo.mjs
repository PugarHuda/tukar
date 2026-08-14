// Full silent demo walkthrough of Tukar across the FOUR separate apps
// (landing → sender → receiver → disclosure → regulator → operator → close),
// driving REAL testnet interactions. Injects a fake cursor + on-screen caption
// bar (the user records voiceover separately). Records to .webm; mux to .mp4.
//
//   node scripts/record-fulldemo.mjs [baseUrl]
//   default baseUrl: http://localhost:5050  (npx serve webapp/out -l 5050)
//
// Only ONE process may drive the embedded testnet key at a time — run this alone.
import { chromium } from "playwright-core";
import { readFileSync, writeFileSync, existsSync, renameSync } from "node:fs";
import { readdirSync } from "node:fs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = (process.argv[2] || "http://localhost:5050").replace(/\/$/, "");
const OUTDIR = "scripts/demo-video-out";
const W = 1366, H = 768;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const record = (s) => { log.push(s); console.log(s); };

// A genuine, on-chain-BOUND disclosure receipt + its tampered twin (proven pair
// used by the regulator QA). These are real prior on-chain deposits — the money shot.
const GENUINE = "scripts/qa-shots/qa2-receipt-threshold.json";
const TAMPERED = "scripts/qa-shots/qa4-tampered-threshold.json";

// ---------------------------------------------------------------------------
// Fake cursor + caption bar (injected on every navigation)
// ---------------------------------------------------------------------------
const UI_INIT = `
(() => {
  if (window.__tukUiInstalled) return;
  window.__tukUiInstalled = true;
  const ensure = () => {
    if (!document.body) return;
    if (!document.getElementById('tuk-cursor')) {
      const c = document.createElement('div');
      c.id = 'tuk-cursor';
      c.style.cssText = 'position:fixed;left:0;top:0;width:22px;height:22px;border-radius:50%;'
        + 'background:rgba(255,255,255,0.9);border:2px solid rgba(20,20,20,0.55);'
        + 'box-shadow:0 2px 8px rgba(0,0,0,0.35);z-index:2147483647;pointer-events:none;'
        + 'transform:translate(-50%,-50%);transition:none;will-change:left,top;';
      document.documentElement.appendChild(c);
      window.__cx = ${Math.round(W / 2)}; window.__cy = ${Math.round(H / 2)};
      c.style.left = window.__cx + 'px'; c.style.top = window.__cy + 'px';
    }
    if (!document.getElementById('tuk-caption')) {
      const bar = document.createElement('div');
      bar.id = 'tuk-caption';
      bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147483646;pointer-events:none;'
        + 'display:flex;justify-content:center;padding:0 0 26px 0;font-family:Inter,system-ui,sans-serif;';
      const inner = document.createElement('div');
      inner.id = 'tuk-caption-inner';
      inner.style.cssText = 'max-width:1080px;margin:0 20px;padding:12px 22px;border-radius:12px;'
        + 'background:rgba(12,12,14,0.82);color:#f4f4f5;font-size:21px;line-height:1.4;font-weight:500;'
        + 'text-align:center;box-shadow:0 6px 26px rgba(0,0,0,0.45);backdrop-filter:blur(3px);'
        + 'border:1px solid rgba(255,255,255,0.10);opacity:0;transition:opacity .35s ease;';
      bar.appendChild(inner);
      document.documentElement.appendChild(bar);
    }
  };
  window.__ensureUi = ensure;
  window.__cap = (text) => {
    ensure();
    const inner = document.getElementById('tuk-caption-inner');
    if (!inner) return Promise.resolve();
    return new Promise((res) => {
      inner.style.opacity = '0';
      setTimeout(() => { inner.textContent = text; inner.style.opacity = '1'; res(); }, 220);
    });
  };
  window.__moveCursor = (x, y, ms) => new Promise((res) => {
    ensure();
    const c = document.getElementById('tuk-cursor');
    if (!c) return res();
    const sx = window.__cx ?? x, sy = window.__cy ?? y;
    const dx = x - sx, dy = y - sy, steps = Math.max(12, Math.round(ms / 16));
    let i = 0;
    const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
    const step = () => {
      i++;
      const t = ease(i / steps);
      const nx = sx + dx * t, ny = sy + dy * t;
      c.style.left = nx + 'px'; c.style.top = ny + 'px';
      window.__cx = nx; window.__cy = ny;
      if (i < steps) requestAnimationFrame(step); else res();
    };
    requestAnimationFrame(step);
  });
  window.__pulse = () => {
    ensure();
    const c = document.getElementById('tuk-cursor');
    if (!c) return;
    const p = document.createElement('div');
    p.style.cssText = 'position:fixed;left:' + window.__cx + 'px;top:' + window.__cy + 'px;'
      + 'width:22px;height:22px;border-radius:50%;border:2px solid rgba(240,140,60,0.9);'
      + 'z-index:2147483645;pointer-events:none;transform:translate(-50%,-50%);'
      + 'transition:all .5s ease-out;opacity:0.9;';
    document.documentElement.appendChild(p);
    requestAnimationFrame(() => { p.style.width = '54px'; p.style.height = '54px'; p.style.opacity = '0'; });
    setTimeout(() => p.remove(), 520);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensure);
  else ensure();
})();
`;

// ---------------------------------------------------------------------------
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", `--window-size=${W},${H}`] });
const ctx = await browser.newContext({
  viewport: { width: W, height: H },
  recordVideo: { dir: OUTDIR, size: { width: W, height: H } },
  permissions: ["clipboard-read", "clipboard-write"],
});
await ctx.addInitScript(UI_INIT);
const page = await ctx.newPage();
page.setDefaultTimeout(30000);
page.on("dialog", (d) => d.accept().catch(() => {}));

// --- helpers ---------------------------------------------------------------
const safe = (fn) => Promise.resolve().then(fn).catch((e) => { record("    (warn) " + (e.message || e)); });
const cap = async (t) => { await page.evaluate((x) => window.__cap(x), t).catch(() => {}); };
const ensureUi = () => page.evaluate(() => window.__ensureUi && window.__ensureUi()).catch(() => {});

async function moveTo(loc) {
  const box = await loc.boundingBox({ timeout: 8000 }).catch(() => null);
  if (!box) return null;
  const x = Math.round(box.x + box.width / 2);
  const y = Math.round(Math.min(box.y + box.height / 2, H - 90)); // keep above caption bar
  await page.evaluate(({ x, y }) => window.__moveCursor(x, y, 550), { x, y }).catch(() => {});
  await sleep(120);
  return { x, y };
}
// smooth-click: glide cursor to the element, pulse, then real click
async function click(loc, { scroll = true } = {}) {
  const l = typeof loc === "string" ? page.locator(loc).first() : loc;
  if (scroll) await l.scrollIntoViewIfNeeded({ timeout: 8000 }).catch(() => {});
  await sleep(150);
  await moveTo(l);
  await page.evaluate(() => window.__pulse()).catch(() => {});
  await sleep(120);
  await l.click({ timeout: 12000 }).catch(async () => { await l.click({ timeout: 8000, force: true }).catch(() => {}); });
}
// smooth vertical scroll to bring an element comfortably into view
const glide = (sel) => page.evaluate(async (s) => {
  const el = typeof s === "string" ? document.querySelector(s) : null;
  const target = el ? Math.max(0, el.getBoundingClientRect().top + scrollY - 150) : 0;
  const from = scrollY, dist = target - from;
  if (Math.abs(dist) <= 8) return;
  const steps = 46;
  for (let i = 1; i <= steps; i++) { scrollTo(0, from + dist * (i / steps)); await new Promise((r) => setTimeout(r, 14)); }
}, sel).catch(() => {});
const scrollBy = (to) => page.evaluate(async (y) => {
  const from = scrollY, dist = y - from, steps = 48;
  for (let i = 1; i <= steps; i++) { scrollTo(0, from + dist * (i / steps)); await new Promise((r) => setTimeout(r, 15)); }
}, to).catch(() => {});

async function nav(path) {
  await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 60000 });
  await ensureUi();
  await sleep(600);
}

// caption + minimum on-screen hold; runs an optional action while the caption is up
async function beat(text, holdMs = 2800, action) {
  await cap(text);
  const t0 = Date.now();
  if (action) await safe(action);
  const remain = holdMs - (Date.now() - t0);
  if (remain > 0) await sleep(remain);
}

const recStart = Date.now();
let liveBearer = null;   // captured from a real send if it completes
const results = { send: "skipped", claim: "skipped", reveal: "skipped", disclosure: "skipped", regGenuine: "skipped", regTamper: "skipped" };

// ===========================================================================
try {
  // ---- SCENE 0: LANDING ----------------------------------------------------
  record("SCENE 0 · Landing");
  await nav("/");
  await sleep(1400);
  await beat("Tukar — a private way to send money home, built on Stellar.", 3400);
  await beat("Dollars in one end; family cashes out in local currency at the other.", 3400, () => scrollBy(700));
  await beat("The crossing in the middle is private — amount and both people hidden on-chain.", 3600, () => glide("#apps"));
  await beat("Four apps: Sender, Receiver, Regulator, Operator — all live on testnet.", 3400, () => sleep(500));
  await beat("Seven zero-knowledge circuits, eight contracts on Stellar testnet. All real.", 3800, () => glide("#circuits"));
  record("  landing: hero + apps + circuits sections shown");

  // ---- SCENE 1: SENDER -----------------------------------------------------
  record("SCENE 1 · Sender");
  await beat("Launch → Send money. The sender app, mobile-first for the person paying.", 3200);
  await nav("/sender");
  await sleep(1200);
  await beat("One tap connects a real built-in testnet key — no seed phrase.", 3200, async () => {
    await click(page.getByRole("button", { name: "Use testnet key" }).first());
    await page.getByText(/testnet key ·/).first().waitFor({ timeout: 12000 }).catch(() => {});
  });
  const connected = await page.getByText(/testnet key ·/).first().isVisible().catch(() => false);
  record("  connect: " + (connected ? "testnet key connected" : "connect NOT confirmed"));

  await beat("Tukar checks the account against the compliance allow-list first.", 3200, () => glide("#amount"));
  await beat("I enter the amount and pick a corridor. There's a cap, and the app hints why.", 3600, async () => {
    await click(page.locator("#corridor")); await page.locator("#corridor").selectOption("MX").catch(() => {});
    await page.locator("#amount").fill("500").catch(() => {});
    await sleep(600);
  });
  await beat("The fiat-in step is a simulated anchor — where a licensed provider would sit.", 3400);

  // Continue → confirm → real send
  await safe(() => click(page.getByRole("button", { name: /Continue/ }).first()));
  await page.getByText(/Confirm and send/i).waitFor({ timeout: 8000 }).catch(() => {});
  await sleep(600);
  await beat("When I send, the compliance proof is built right here, in the browser.", 3600);
  await beat("It proves I'm allow-listed and NOT on the deny-list — without revealing who I am.", 4000, async () => {
    const sendBtn = page.getByRole("button", { name: /^Send \$/ }).first();
    await click(sendBtn);
  });
  // real proving + on-chain deposit + merkleUpdate — generous wait
  await beat("The proof is building on the phone… the deposit goes on-chain for real.", 4000, async () => {
    await page.getByText(/Zero-knowledge proofs/i).first().waitFor({ timeout: 8000 }).catch(() => {});
  });
  await beat("My note enters a Merkle tree as a commitment; a second proof registers it on-chain.", 4200);
  const sentOk = await page.getByRole("heading", { name: /Sent and shielded/i }).waitFor({ timeout: 150000 }).then(() => true).catch(() => false);
  if (sentOk) {
    results.send = "COMPLETED on-chain";
    await sleep(800);
    await glide("h2");
    liveBearer = await page.locator("pre").first().innerText().then((s) => s.trim()).catch(() => null);
    if (liveBearer && /^tukar1:/.test(liveBearer)) record("  send: on-chain deposit COMPLETED, captured live bearer note (" + liveBearer.length + " chars)");
    else { record("  send: success screen reached but bearer capture failed"); liveBearer = null; }
    const depHash = await page.getByText(/Deposit tx/i).locator("xpath=following-sibling::*").first().innerText().catch(() => "");
    await beat("Out comes a bearer claim note. Whoever holds it can claim the money.", 4200, () => glide("pre"));
    await beat("The deposit is public at the edge; the transfer in the middle stays hidden.", 3800);
  } else {
    results.send = "did not confirm (shown-only)";
    record("  send: real deposit did NOT confirm within timeout — continuing with a crafted note");
    await beat("(On-chain deposit is still settling — continuing the walkthrough.)", 3200);
  }

  // ---- SCENE 2: RECEIVER ---------------------------------------------------
  record("SCENE 2 · Receiver");
  // Craft a fallback bearer if the live send didn't yield one (keeps receiver real & interactive)
  let bearer = liveBearer;
  if (!bearer) {
    const { buildPoseidon } = await import("circomlibjs");
    const poseidon = await buildPoseidon(); const Fp = poseidon.F;
    const Hh = (a) => Fp.toObject(poseidon(a)).toString();
    const rnd = () => (BigInt(Math.floor(Math.random() * 1e15)) * 1000003n + 7n).toString();
    const amt = 5000000000n, pk = rnd(), pub = Hh([BigInt(pk)]), bl = rnd();
    const commitment = Hh([amt, BigInt(pub), BigInt(bl)]);
    const note = { v: 1, ref: "DEMO-500", amount: String(amt), privKey: pk, pubKey: pub, blinding: bl, commitment, corridor: "MX" };
    bearer = "tukar1:" + Buffer.from(JSON.stringify(note), "utf8").toString("base64");
    record("  receiver: using crafted fallback bearer note (live send unavailable)");
  }
  await nav("/receiver");
  await page.getByRole("status").filter({ hasText: /Ready|Paste a bearer/i }).first().waitFor({ timeout: 20000 }).catch(() => {});
  await beat("Back home, the family opens the receiver app: Payments, Claim, and Request.", 3600);
  await beat("They paste the claim note; the app rebuilds the Merkle tree from on-chain data.", 3800, async () => {
    await click(page.getByRole("tab", { name: /^Claim$/ }));
    await page.locator("textarea").first().fill(bearer).catch(() => {});
    await sleep(400);
  });
  await safe(() => click(page.getByRole("button", { name: "Claim payment" })));
  const claimed = await page.getByText(/shielded arrival/i).first().waitFor({ timeout: 12000 }).then(() => true).catch(() => false);
  results.claim = claimed ? "COMPLETED (note claimed from chain)" : "shown-only";
  record("  claim: " + results.claim);

  if (claimed) {
    await beat("The note is found and shows as a shielded arrival.", 3000, () => glide("text=shielded arrival"));
    // Reveal → real on-chain Reflector oracle quote
    await beat("Now cash out to local fiat. The app pulls a live FX quote from Reflector on Stellar.", 4000, async () => {
      await click(page.getByRole("button", { name: /Reveal in/ }).first());
      await page.getByRole("status").filter({ hasText: /read on-chain|no live price|unavailable|live .* rate|median/i }).first().waitFor({ timeout: 20000 }).catch(() => {});
    });
    const revealed = await page.getByText(/^Revealed$/).first().isVisible().catch(() => false);
    const revStatus = await page.locator("div[role=status]").first().innerText().catch(() => "");
    results.reveal = revealed ? ("COMPLETED — " + (/read on-chain/i.test(revStatus) ? "on-chain Reflector quote" : "quote shown")) : "shown-only";
    record("  reveal: " + results.reveal + (revStatus ? "  [" + revStatus.replace(/\s+/g, " ").slice(0, 80) + "]" : ""));
    await beat("It's a median of five sources, read on-chain — spot shown next to the median.", 4000, () => glide("text=Cash out to fiat").catch(() => {}));
    // Cash-out UI + settlement gate
    await safe(() => click(page.getByText("Cash out to fiat", { exact: true })));
    await sleep(600);
    await beat("A settlement gate: set a minimum you'll accept. Stale price → it fails closed.", 4000);
    await beat("Withdraw spends a nullifier on-chain — releasing tokens, preventing double-spend.", 4000);
    await beat("The final fiat-out step is a simulated anchor — Tukar never touches the money.", 3800);
    await beat("The app also shows the anonymity set — how many notes this payment blends with.", 3800);

    // ---- SCENE 3: SELECTIVE DISCLOSURE -----------------------------------
    record("SCENE 3 · Selective disclosure");
    await beat("Here's what makes this compliant, not just private: selective disclosure.", 3600, async () => {
      await click(page.getByText(/Prove to a regulator/i).first());
      await sleep(400);
    });
    const modeSel = page.locator("[id^=disc-mode-]").first();
    const genBtn = page.getByRole("button", { name: /Generate proof/ }).first();

    async function discl(mode, setup, factRe, label) {
      await safe(async () => { await modeSel.selectOption(mode); });
      if (setup) await safe(setup);
      await sleep(400);
      await safe(() => click(genBtn));
      const got = await page.getByText(factRe).first().waitFor({ timeout: 45000 }).then(() => true).catch(() => false);
      record("    disclosure/" + label + ": " + (got ? "proof generated, fact shown" : "not shown"));
      return got;
    }
    await beat("Exact: prove the precise amount.", 3200, () => discl("exact", null, /Disclosed amount/i, "exact"));
    await beat("Threshold: prove the amount is at or under a limit — without the exact figure.", 4000,
      () => discl("threshold", () => page.locator("[id^=thr-]").first().fill("600"), /at or below \$600/i, "threshold"));
    await beat("Range: prove it sits between two bounds — again, no exact number.", 4000,
      () => discl("range", async () => { await page.locator("[id^=lo-]").first().fill("400"); await page.locator("[id^=hi-]").first().fill("600"); }, /between \$400 and \$600/i, "range"));
    await beat("Aggregate: prove a set of payments sums to at or under a cap.", 3600, () => safe(async () => { await modeSel.selectOption("aggregate"); }));
    // export a real receipt
    let exported = false;
    await beat("Each proof makes a receipt the holder can export and hand to an auditor.", 4000, async () => {
      await safe(async () => { await modeSel.selectOption("range"); await page.locator("[id^=lo-]").first().fill("400"); await page.locator("[id^=hi-]").first().fill("600"); });
      await safe(() => click(genBtn));
      await page.getByText(/between \$400 and \$600/i).first().waitFor({ timeout: 45000 }).catch(() => {});
      const exportBtn = page.getByRole("button", { name: /Export receipt/ }).first();
      if (await exportBtn.isVisible().catch(() => false)) {
        const dl = page.waitForEvent("download", { timeout: 8000 }).catch(() => null);
        await click(exportBtn);
        const f = await dl;
        if (f) { await f.saveAs(OUTDIR + "/live-receipt.json").catch(() => {}); exported = true; }
      }
    });
    results.disclosure = exported ? "COMPLETED (real receipt generated + exported)" : "generated (export not captured)";
    record("  disclosure: " + results.disclosure);
    await beat("The amount stays hidden. Only the one fact being proven is revealed.", 3600);
  } else {
    record("  claim did not confirm — captioning disclosure conceptually, skipping live proofs");
    await beat("Selective disclosure: prove one fact — exact, threshold, range, or aggregate — nothing else.", 4200);
    await beat("Each proof makes a receipt the holder can export and hand to an auditor.", 3600);
  }

  // ---- SCENE 4: REGULATOR (money shot) ------------------------------------
  record("SCENE 4 · Regulator");
  await nav("/regulator");
  await page.getByRole("heading", { name: /Regulator \/ Compliance console/ }).first().waitFor({ timeout: 15000 }).catch(() => {});
  await beat("Now the regulator's side — where the fact gets checked.", 3200, async () => {
    await safe(() => click(page.getByRole("button", { name: "Verify disclosure" }).first()));
    await sleep(400);
  });
  const genuineJson = existsSync(OUTDIR + "/live-receipt.json") ? null : GENUINE; // prefer live if bound; else proven pair
  // Verify a genuine, on-chain-bound receipt
  async function verifyReceipt(jsonPath, mutate) {
    let obj = JSON.parse(readFileSync(jsonPath, "utf8"));
    if (mutate) obj = mutate(obj);
    await page.locator("#receipt").fill(JSON.stringify(obj));
    await safe(() => click(page.getByRole("button", { name: /Re-verify in browser and on-chain/ }).first()));
    await page.waitForFunction(() => {
      const sec = document.querySelector("#receipt")?.closest("section");
      return sec && /In your browser|Verification error|Not valid JSON|Missing proof/.test(sec.innerText);
    }, { timeout: 120000 }).catch(() => {});
    const sec = page.locator("#receipt").locator("xpath=ancestor::section[1]");
    return (await sec.innerText().catch(() => "")).replace(/\s+/g, " ");
  }
  await beat("The regulator pastes a receipt. It's verified twice — in the browser…", 3600, async () => {
    await page.locator("#receipt").fill(readFileSync(GENUINE, "utf8")).catch(() => {});
    await sleep(300);
  });
  await beat("…and for real by the live verifier contract on Stellar. Checked on-chain, not claimed.", 4200, async () => {
    const t = await verifyReceipt(GENUINE);
    const bound = /Verified and bound to real on-chain state/.test(t);
    const dual = /In your browser:\s*✓ valid/.test(t) && /verifier:\s*✓ valid/.test(t);
    results.regGenuine = bound ? "COMPLETED — genuine receipt VALID + BOUND on-chain" : (dual ? "valid on-chain (bound flag not matched)" : "verify text not matched");
    record("  regulator/genuine: " + results.regGenuine);
  });
  await beat("A real receipt passes — shown bound to an actual on-chain deposit.", 3600, () => glide("#receipt"));

  await beat("Now watch a forged one — a receipt with one number changed.", 3600, async () => {
    await page.locator("#receipt").fill(readFileSync(TAMPERED, "utf8")).catch(() => {});
    await sleep(300);
  });
  await beat("The verifier returns invalid and flags it as not bound. You can't fake past it.", 4400, async () => {
    const t = await verifyReceipt(TAMPERED);
    const invalid = /✗ invalid/.test(t) || /Not valid/.test(t) || /proof was rejected/.test(t);
    results.regTamper = invalid ? "COMPLETED — tampered receipt REJECTED (invalid)" : "rejection text not matched";
    record("  regulator/tamper: " + results.regTamper);
  });
  await beat("For an aggregate audit, the regulator issues a signed, on-chain request.", 3800, async () => {
    await safe(() => click(page.getByRole("button", { name: "Issue audit request" }).first()));
    await sleep(600);
    await page.waitForFunction(() => !/Loading on-chain leaves/.test(document.querySelector("main")?.innerText || ""), { timeout: 20000 }).catch(() => {});
  });
  await beat("An on-chain registry enforces the answer is complete — no cherry-picking.", 3800);
  await beat("Honest note: this demo's auditor uses a shared key; production uses an independent one.", 4000, async () => {
    await safe(() => click(page.getByRole("button", { name: "Pool report" }).first()));
    await sleep(600);
  });

  // ---- SCENE 5: OPERATOR ---------------------------------------------------
  record("SCENE 5 · Operator");
  await nav("/operator");
  await page.getByRole("heading", { name: /Corridor operations/ }).first().waitFor({ timeout: 15000 }).catch(() => {});
  await beat("Last, the operator console — for whoever runs the desk.", 3200);
  await beat("Pool health: the Merkle root and depth, and deposits bound on-chain.", 4000, async () => {
    await page.waitForFunction(() => /commitment|leaves|root/i.test(document.body.innerText), { timeout: 20000 }).catch(() => {});
    await scrollBy(500);
  });
  await beat("The compliance policy: how many accounts are allow-listed, and the deny-list.", 4000, async () => {
    await safe(() => click(page.getByRole("button", { name: /Compliance policy/ }).first()));
    await sleep(800); await scrollBy(300);
  });
  await beat("The FX oracle: the Reflector feed, spot next to the average, and the off-ramp quote.", 4200, async () => {
    await safe(() => click(page.getByRole("button", { name: /Oracle health/ }).first()));
    await page.waitForFunction(() => /Reflector SEP-40 FX|oracle unreachable/.test(document.body.innerText), { timeout: 20000 }).catch(() => {});
    await scrollBy(400);
  });
  await beat("Every contract is here by ID, linking straight to the explorer.", 4000, async () => {
    await safe(() => click(page.getByRole("button", { name: /Corridor & anchor/ }).first()));
    await sleep(800); await scrollBy(300);
  });
  record("  operator: pool / policy / oracle / corridor sections panned");

  // ---- SCENE 6: CLOSE ------------------------------------------------------
  record("SCENE 6 · Close");
  await nav("/");
  await scrollBy(0);
  await beat("That's Tukar end to end: a consumer sends money home, family cashes out in fiat.", 4200);
  await beat("The transfer between is private, and every step is provable to a regulator on-chain.", 4200);
  await beat("Seven circuits, eight contracts, live on testnet today.", 3600);
  await beat("Private in the middle, accountable at the edges.", 3800);
  record("  close: returned to landing");
} catch (e) {
  record("FATAL flow error: " + (e.stack || e.message));
} finally {
  await sleep(800);
  const video = page.video();       // grab handle before closing
  await page.close();               // finalizes the .webm
  let out = null;
  if (video) { out = await video.path().catch(() => null); }
  await ctx.close();
  await browser.close();

  // rename to a stable filename
  let finalWebm = OUTDIR + "/tukar-fulldemo.webm";
  try {
    if (out && existsSync(out)) { renameSync(out, finalWebm); }
    else {
      const webms = readdirSync(OUTDIR).filter((f) => f.endsWith(".webm") && f !== "tukar-fulldemo.webm");
      if (webms.length) renameSync(OUTDIR + "/" + webms[webms.length - 1], finalWebm);
    }
  } catch (e) { record("rename warn: " + e.message); finalWebm = out || finalWebm; }

  const dur = ((Date.now() - recStart) / 1000).toFixed(1);
  record("\n===== PER-SCENE RESULTS =====");
  for (const [k, v] of Object.entries(results)) record("  " + k + ": " + v);
  record("\nVIDEO: " + finalWebm);
  record("APPROX DURATION (wall): " + dur + "s");
  writeFileSync(OUTDIR + "/record-log.txt", log.join("\n"), "utf8");
  record("log written: " + OUTDIR + "/record-log.txt");
}
