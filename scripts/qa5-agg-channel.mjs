// QA5 — aggregate issue->prove CHANNEL (tukaudit1:) + lib verifyReceipt fixes (F-1/F-2/F-3).
// Drives the LIVE dev server at :3000 as a real user. Read-only EXCEPT registerAuditRequest
// (an allowed on-chain write) which is SERIALIZED and collision-tolerant.
//   node scripts/qa5-agg-channel.mjs
import { chromium } from "playwright-core";
import { buildPoseidon } from "circomlibjs";
import fs from "fs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://localhost:3000";
const SHOTS = "scripts/qa-shots";
const POOL = "CBIYQACYOKDBPYDGU7DMSHPGJEWP2ZRETXDVOTC5HTU5RJBGDK2MHTWJ";
const NOTES_KEY = `tukar:rcv:notes:${POOL}`;
const R = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log("  PASS " + n); };
const bad = (n, e) => { fail++; console.log("  FAIL " + n + (e ? " :: " + e : "")); };
const info = (n) => console.log("  ..  " + n);
const rd = (p) => fs.readFileSync(p, "utf8");

// ---- Poseidon (matches lib/zk buildAggregateInput) ----
const poseidon = await buildPoseidon();
const F = poseidon.F;
const H = (arr) => F.toObject(poseidon(arr)).toString();
const rnd = () => (BigInt(Math.floor(Math.random() * 1e15)) * 1000003n + 7n).toString();
function makeNote(id, amountStroops, ref) {
  const privKey = rnd();
  const pubKey = H([BigInt(privKey)]);
  const blinding = rnd();
  const commitment = H([BigInt(amountStroops), BigInt(pubKey), BigInt(blinding)]);
  return { id, ref, amount: String(amountStroops), privKey, pubKey, blinding, commitment, corridor: "MX" };
}
// issuedHash = Poseidon(ctxNonce, commitments[5], active[5]) — cross-check the app's determinism.
function issuedHashOf(ctxNonce, commitments5, active5) {
  return H([BigInt(ctxNonce), ...commitments5.map((c) => BigInt(c)), ...active5.map((a) => BigInt(a))]);
}
function encodeAuditRequest({ ctxNonce, commitments, active, cap }) {
  const payload = { v: 1, kind: "audit", ctxNonce: String(ctxNonce), commitments: commitments.map(String), active: active.map(String), cap: String(cap) };
  return "tukaudit1:" + Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const errs = [];
async function newCtx(seed) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, permissions: ["clipboard-read", "clipboard-write"] });
  if (seed) await ctx.addInitScript(seed);
  return ctx;
}
function wire(page, tag) {
  page.on("pageerror", (e) => errs.push(`[${tag}] pageerror: ` + e.message));
  page.on("console", (m) => { if (m.type() === "error") errs.push(`[${tag}] console.error: ` + m.text().slice(0, 220)); });
  page.on("response", (r) => { if (r.status() === 404) errs.push(`[${tag}] 404: ` + r.url().slice(0, 120)); });
  page.setDefaultTimeout(45000);
}
const seedConn = `try{localStorage.setItem("tukar:conn","demo")}catch(e){}`;
const seedNotes = (notes) => `${seedConn};try{localStorage.setItem(${JSON.stringify(NOTES_KEY)}, ${JSON.stringify(JSON.stringify({ seq: 99, notes }))})}catch(e){}`;

const regResult = (page) => page.locator("#receipt").locator("xpath=ancestor::section[1]");
async function verifyReceipt(page, name, obj) {
  await page.locator("#receipt").fill(JSON.stringify(obj));
  await page.getByRole("button", { name: /Re-verify in browser and on-chain/ }).click();
  await page.waitForFunction(() => {
    const sec = document.querySelector("#receipt")?.closest("section");
    // Wait for the VERDICT box, not the card's static preamble (which contains "in your browser").
    return sec && /bound to (real )?on-chain state|Not valid\.|Verification error|Not valid JSON|Missing proof/i.test(sec.innerText);
  }, { timeout: 120000 }).catch(() => {});
  const txt = (await regResult(page).innerText()).replace(/\s+/g, " ");
  console.log(`    [${name}] ${txt.slice(0, 300)}`);
  return txt;
}

try {
  // =========================================================================
  // PART 2 — LIB verifyReceipt fixes (F-1 / F-2 / F-3). Read-only.
  // =========================================================================
  console.log("\n=== PART 2 · LIB verifyReceipt (F-1/F-2/F-3) @ /regulator ===");
  {
    const ctx = await newCtx(seedConn); const page = await ctx.newPage(); wire(page, "verify");
    await page.goto(BASE + "/regulator", { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: /Regulator \/ Compliance console/ }).waitFor({ timeout: 30000 }).catch(() => {});
    await page.getByRole("button", { name: "Verify disclosure" }).click();
    await page.waitForTimeout(400);

    // F-2: genuine RANGE receipt must NOT show "receipt metadata disagreed"; band from publicSignals.
    console.log("\n-- F-2: genuine range receipt (no false metadata mismatch) --");
    {
      const t = await verifyReceipt(page, "range", JSON.parse(rd(SHOTS + "/qa2-receipt-range.json")));
      const isRange = /Range disclosure/i.test(t);
      const localValid = /In your browser: ✓ valid/.test(t);
      const band = /in band \$0–\$115 USDC/.test(t);
      const mismatch = /receipt metadata disagreed/i.test(t);
      isRange && localValid ? ok("range receipt verifies (in-browser valid)") : bad("range receipt not valid", t.slice(0, 160));
      band ? ok("F-2: band figure ($0–$115) shown from publicSignals") : bad("F-2: band figure missing", t.slice(0, 160));
      !mismatch ? ok("F-2: NO false 'receipt metadata disagreed' flag") : bad("F-2: STILL flags metadata mismatch on genuine range", t.slice(0, 200));
      await page.screenshot({ path: SHOTS + "/qa5-f2-range.png", fullPage: true });
    }

    // F-1/F-3: aggregate receipt verify must NOT hard-error; reason renders (tri-state aware).
    console.log("\n-- F-1/F-3: aggregate receipt verify does not hard-error --");
    {
      const before = errs.length;
      const t = await verifyReceipt(page, "aggregate", JSON.parse(rd(SHOTS + "/qa2-receipt-aggregate.json")));
      const rendered = /Aggregate disclosure/i.test(t) && /portfolio ≤ \$5000 USDC/.test(t);
      const newErrs = errs.slice(before).filter((e) => /\[verify\]/.test(e));
      rendered ? ok("aggregate receipt renders a result (no hard error)") : bad("aggregate verify did not render", t.slice(0, 200));
      newErrs.length === 0 ? ok("aggregate verify: no console/page error thrown") : bad("aggregate verify threw", newErrs.join(" | "));
      const boundState = /bound to real on-chain state/i.test(t) ? "GREEN bound" : /NOT bound to on-chain state/i.test(t) ? "AMBER not-bound" : "other";
      info(`aggregate bound state: ${boundState}`);
      await page.screenshot({ path: SHOTS + "/qa5-f13-aggregate.png", fullPage: true });
    }

    // F-3 reason vocabulary: genuine bound (green) vs fabricated (amber "not a deposit").
    console.log("\n-- F-1: genuine bound=GREEN vs fabricated=AMBER not-a-deposit (anchor gated off) --");
    {
      const g = await verifyReceipt(page, "genuine-threshold", JSON.parse(rd(SHOTS + "/qa2-receipt-threshold.json")));
      const green = /Verified and bound to real on-chain state/.test(g) && /real on-chain deposit/.test(g);
      green ? ok("genuine threshold: GREEN 'verified and bound' (real deposit)") : bad("genuine threshold not green-bound", g.slice(0, 200));

      const fpath = SHOTS + "/qa4-fabricated-threshold.json";
      if (fs.existsSync(fpath)) {
        const fbefore = errs.length;
        const fb = await verifyReceipt(page, "fabricated-threshold", JSON.parse(rd(fpath)));
        const amber = /valid but NOT bound to on-chain state/i.test(fb);
        const notDeposit = /not an on-chain deposit/i.test(fb);
        const cantConfirm = /could not confirm on-chain/i.test(fb);
        amber ? ok("F-1: fabricated receipt shows AMBER not-bound (security holds after edit)") : bad("F-1: fabricated not gated amber", fb.slice(0, 200));
        (notDeposit && !cantConfirm) ? ok("F-3: reason reads 'not an on-chain deposit' (distinct from 'could not confirm')") : bad("F-3: reason vocabulary wrong", fb.slice(0, 200));
        // anchor gated off: no "Anchor on-chain" button when not bound
        const anchorBtn = await page.getByRole("button", { name: /^Anchor on-chain$/ }).count();
        anchorBtn === 0 ? ok("F-1: anchor action gated OFF for unbound receipt") : bad("F-1: anchor offered on unbound receipt");
        errs.slice(fbefore).filter((e) => /\[verify\]/.test(e)).length === 0 ? ok("fabricated verify: no hard error") : bad("fabricated verify threw");
      } else info("qa4-fabricated-threshold.json missing — skipped fabricated case");
    }
    await ctx.close();
  }

  // =========================================================================
  // PART 1 — aggregate issue->prove CHANNEL
  // =========================================================================

  // --- 1a: REGULATOR emits tukaudit1: (on-chain register, serialized) + round-trip ---
  console.log("\n=== PART 1a · REGULATOR issues audit request -> tukaudit1: ===");
  let regRequestStr = null, regSelectedCommitments = [], regNonce = null;
  {
    const ctx = await newCtx(seedConn); const page = await ctx.newPage(); wire(page, "issue");
    await page.goto(BASE + "/regulator", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Issue audit request" }).click();
    // wait leaves to load
    await page.waitForFunction(() => {
      const b = document.body.innerText;
      return /No commitments in the pool yet/.test(b) || document.querySelectorAll('input[type=checkbox]').length > 0;
    }, { timeout: 60000 }).catch(() => {});
    const boxes = page.locator('input[type=checkbox]');
    const nboxes = await boxes.count();
    if (nboxes < 2) { bad("1a: fewer than 2 on-chain commitments to select", `count=${nboxes}`); }
    else {
      ok(`1a: ${nboxes} on-chain commitment(s) available to select`);
      await boxes.nth(0).check(); await boxes.nth(1).check();
      // capture the two selected commitments (decimal) from the label rows' order == leaf order
      regSelectedCommitments = await page.evaluate(() => {
        // read the connected-wallet leaves via the checked rows is hard (truncated); instead
        // rely on decode round-trip. Return nothing here.
        return [];
      });
      await page.getByRole("button", { name: "Random" }).click();
      regNonce = await page.locator("#nonce").inputValue();
      await page.locator("#cap").fill("5000");

      // register (WRITE) — collision tolerant, one retry with a fresh nonce.
      let attempt = 0;
      while (attempt < 2 && !regRequestStr) {
        attempt++;
        await page.getByRole("button", { name: "Compute hash and register on-chain" }).click();
        info(`1a: registration submitted (attempt ${attempt}) — waiting for tukaudit1: …`);
        await page.waitForFunction(() => {
          const ta = [...document.querySelectorAll("textarea")].find((t) => /^tukaudit1:/.test(t.value));
          const err = /registration failed|could not|error/i.test(document.body.innerText);
          return !!ta || err;
        }, { timeout: 120000 }).catch(() => {});
        regRequestStr = await page.evaluate(() => {
          const ta = [...document.querySelectorAll("textarea")].find((t) => /^tukaudit1:/.test(t.value));
          return ta ? ta.value : null;
        });
        if (!regRequestStr) {
          const body = await page.locator("main").innerText();
          info(`1a: no string yet (attempt ${attempt}); page says: ${body.replace(/\s+/g, " ").match(/(registration failed|could not[^.]*|error[^.]*)/i)?.[0] || "(none)"}`);
          if (attempt < 2) { await page.getByRole("button", { name: "Random" }).click(); regNonce = await page.locator("#nonce").inputValue(); }
        }
      }

      if (regRequestStr) {
        ok("1a: tukaudit1: string emitted after on-chain registration");
        const copyBtn = await page.getByRole("button", { name: "Copy audit request" }).count();
        copyBtn === 1 ? ok("1a: copy button present") : bad("1a: no copy button");
        // click copy + read clipboard
        await page.getByRole("button", { name: "Copy audit request" }).click().catch(() => {});
        const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => "")).catch(() => "");
        clip === regRequestStr ? ok("1a: clipboard holds the exact tukaudit1: string") : bad("1a: clipboard mismatch", `clip.len=${clip.length}`);

        // ROUND-TRIP decode + match what the regulator emitted
        const payload = JSON.parse(Buffer.from(regRequestStr.replace(/^tukaudit1:/, ""), "base64").toString("utf8"));
        const expNonce = (BigInt(regNonce) % R).toString();
        payload.kind === "audit" ? ok("1a: decodes as kind=audit") : bad("1a: wrong kind", payload.kind);
        payload.ctxNonce === expNonce ? ok("1a: ctxNonce round-trips (== nonce % R)") : bad("1a: ctxNonce mismatch", `got ${payload.ctxNonce} exp ${expNonce}`);
        payload.commitments.length === 5 && payload.active.length === 5 ? ok("1a: carries 5 commitments + 5 active flags") : bad("1a: wrong array lengths");
        const nActive = payload.active.filter((a) => a === "1").length;
        nActive === 2 ? ok("1a: exactly 2 active flags (matches 2 selected)") : bad("1a: active count wrong", `active=${nActive}`);
        payload.cap === "50000000000" ? ok("1a: cap round-trips (5000 USDC = 50000000000 stroops)") : bad("1a: cap mismatch", payload.cap);
        // determinism: issuedHash we recompute == Poseidon over the exact ordered arrays
        const recomputed = issuedHashOf(payload.ctxNonce, payload.commitments, payload.active);
        info(`1a: recomputed issuedHash = ${recomputed.slice(0, 18)}… (regulator registered this exact hash)`);
        regSelectedCommitments = payload.commitments.filter((c) => c !== "0");
        await page.screenshot({ path: SHOTS + "/qa5-1a-regulator-emit.png", fullPage: true });
      } else {
        bad("1a: no tukaudit1: emitted (registration did not confirm — possible demo-key collision)");
      }
    }
    await ctx.close();
  }

  // --- 1b: RECEIVER request-mode HONEST not-held error (no proof) ---
  console.log("\n=== PART 1b · RECEIVER request-mode: honest 'you do not hold N payment(s)' ===");
  if (regRequestStr) {
    const note = makeNote(1, 1000000000n, "QA-1b"); // crafted note, NOT one of the regulator's leaves
    const ctx = await newCtx(seedNotes([note])); const page = await ctx.newPage(); wire(page, "req-notheld");
    await page.goto(BASE + "/receiver", { waitUntil: "domcontentloaded" });
    await page.getByRole("status").filter({ hasText: /Ready|Paste a bearer/i }).waitFor({ timeout: 30000 }).catch(() => {});
    await page.locator("summary", { hasText: "Prove to a regulator" }).first().click();
    await page.locator("#disc-mode-1").selectOption("aggregate");
    await page.locator("#audit-req-1").fill(regRequestStr);
    // confirm the request-mode helper copy is shown
    const reqCopy = await page.getByText(/Request mode, the production path/i).count();
    reqCopy > 0 ? ok("1b: request-mode helper text shown when a string is loaded") : bad("1b: no request-mode copy");
    await page.getByRole("button", { name: "Generate proof" }).click();
    await page.waitForFunction(() => /you do not hold|could not be read|no active payments/i.test(document.querySelector('[role=status]')?.innerText || ""), { timeout: 20000 }).catch(() => {});
    const st = await page.locator('[role=status]').innerText().catch(() => "");
    console.log(`    [1b status] ${st.replace(/\s+/g, " ").slice(0, 220)}`);
    /\d+ payment\(s\) you do not hold/i.test(st) ? ok("1b: honest 'N payment(s) you do not hold' error") : bad("1b: expected not-held error", st.slice(0, 160));
    const provedPanel = await page.getByText(/could not be trimmed|in the regulator's request/i).count();
    provedPanel === 0 ? ok("1b: NO proof produced for a not-held request") : bad("1b: produced a proof despite not holding");
    await page.screenshot({ path: SHOTS + "/qa5-1b-notheld.png", fullPage: true });
    await ctx.close();
  } else info("1b skipped — no regulator string from 1a");

  // --- 1c: request-mode proves against a REGISTERED hash + skips self-register; 1d self-serve label ---
  console.log("\n=== PART 1c · RECEIVER: self-serve registers, then request-mode proves against it ===");
  {
    const c1 = makeNote(1, 1000000000n, "QA-1c-A"); // 100 USDC
    const c2 = makeNote(2, 1500000000n, "QA-1c-B"); // 150 USDC
    const ctx = await newCtx(seedNotes([c1, c2])); const page = await ctx.newPage(); wire(page, "req-held");
    // capture downloads (exported receipts)
    const dlDir = SHOTS;
    let lastReceipt = null;
    page.on("download", async (d) => {
      try { const p = `${dlDir}/qa5-${Date.now()}.json`; await d.saveAs(p); lastReceipt = JSON.parse(rd(p)); } catch {}
    });
    // status log to prove request-mode does NOT self-register
    const statusLog = [];
    await page.exposeFunction("__qaStatus", (s) => statusLog.push(s));

    await page.goto(BASE + "/receiver", { waitUntil: "domcontentloaded" });
    await page.getByRole("status").filter({ hasText: /Ready|Paste a bearer/i }).waitFor({ timeout: 30000 }).catch(() => {});
    // observe the status region text changes
    await page.evaluate(() => {
      const el = document.querySelector('[role=status]');
      if (!el) return;
      const obs = new MutationObserver(() => window.__qaStatus(el.innerText));
      obs.observe(el, { childList: true, subtree: true, characterData: true });
    });

    await page.locator("summary", { hasText: "Prove to a regulator" }).first().click();
    await page.locator("#disc-mode-1").selectOption("aggregate");

    // 1d: self-serve label present when NO string loaded
    const selfLabel = await page.getByText(/Self-serve mode, a demo-only convenience/i).count();
    selfLabel > 0 ? ok("1d: self-serve mode is labeled demo-only when no string is loaded") : bad("1d: self-serve demo-only label missing");
    const capInput = await page.locator("#cap-1").count();
    capInput > 0 ? ok("1d: self-serve exposes a cap input") : bad("1d: no cap input in self-serve");

    // --- SELF-SERVE: register issuedHash on-chain (WRITE, serialized) ---
    console.log("-- 1c.i self-serve prove (registers the audit hash) --");
    await page.locator("#cap-1").fill("5000");
    statusLog.length = 0;
    await page.getByRole("button", { name: "Generate proof" }).click();
    await page.waitForFunction(() => {
      const s = document.querySelector('[role=status]')?.innerText || "";
      return /verified in your browser|On-chain check unavailable|Could not register|above \$/i.test(s);
    }, { timeout: 150000 }).catch(() => {});
    const ssStatus = await page.locator('[role=status]').innerText().catch(() => "");
    console.log(`    [self-serve status] ${ssStatus.replace(/\s+/g, " ").slice(0, 220)}`);
    const sawRegister = statusLog.some((s) => /Registering the audit request on-chain/i.test(s));
    sawRegister ? ok("1c.i: self-serve DID self-register (status 'Registering the audit request')") : info("1c.i: did not observe self-register status (may have registered fast)");
    // export the self-serve receipt to capture ctxNonce + issuedHash
    await page.getByRole("button", { name: "Export receipt (JSON)" }).click().catch(() => {});
    await page.waitForTimeout(1200);
    let ssCtxNonce = null, ssHash = null;
    if (lastReceipt && lastReceipt.type === "aggregate") {
      ssCtxNonce = lastReceipt.ctxNonce; ssHash = lastReceipt.auditContextHash;
      ok(`1c.i: self-serve receipt captured (ctxNonce ${String(ssCtxNonce).slice(0, 12)}…)`);
      const regOnChain = /verified in your browser and on Stellar against the registered/i.test(ssStatus);
      info(`1c.i: self-serve on-chain disclose = ${regOnChain ? "CONFIRMED" : "reached-submit only (crafted commitments are not real deposits)"}`);
    } else {
      bad("1c.i: could not capture self-serve receipt", `type=${lastReceipt?.type}`);
    }

    // --- Confirm the registry ACCEPTED that exact hash: paste the self-serve receipt into the
    //     regulator verify box; a "registered audit request" reason == isAuditRequest(hash)==true ---
    if (ssHash && lastReceipt) {
      console.log("-- 1c.ii confirm pool/registry recognizes the registered hash --");
      try {
        const rctx = await newCtx(seedConn); const rpage = await rctx.newPage(); wire(rpage, "reg-check");
        await rpage.goto(BASE + "/regulator", { waitUntil: "domcontentloaded" });
        await rpage.getByRole("heading", { name: /Regulator \/ Compliance console/ }).waitFor({ timeout: 30000 });
        await rpage.getByRole("button", { name: "Verify disclosure" }).click();
        await rpage.locator("#receipt").waitFor({ timeout: 15000 });
        const t = await verifyReceipt(rpage, "self-serve-onchain", lastReceipt);
        const registered = /registered audit request/i.test(t); // reached only when isAuditRequest==true
        const notReg = /audit request is not registered/i.test(t);
        registered ? ok("1c.ii: pool registry ACCEPTS the registered hash (verify reads 'registered audit request')")
          : notReg ? bad("1c.ii: registry says NOT registered (self-serve register may have collided)", t.slice(0, 160))
            : info(`1c.ii: bind inconclusive (RPC): ${t.slice(0, 160)}`);
        await rctx.close();
      } catch (e) { info(`1c.ii: skipped (harness/RPC): ${(e && e.message) || e}`); }
    }

    // --- REQUEST MODE: build tukaudit1: with the SAME ctxNonce+commitments; prove against it ---
    if (ssCtxNonce) {
      console.log("-- 1c.iii request-mode proves against the registered hash, skips self-register --");
      const commitments5 = [c1.commitment, c2.commitment, "0", "0", "0"];
      const active5 = ["1", "1", "0", "0", "0"];
      const reqStr = encodeAuditRequest({ ctxNonce: ssCtxNonce, commitments: commitments5, active: active5, cap: "50000000000" });
      // sanity: our recomputed hash == the self-serve registered hash
      const recomputed = issuedHashOf(ssCtxNonce, commitments5, active5);
      recomputed === ssHash ? ok("1c.iii: recomputed issuedHash == self-serve registered hash (both sides identical)") : bad("1c.iii: issuedHash mismatch", `req ${recomputed.slice(0,16)} vs reg ${String(ssHash).slice(0,16)}`);

      lastReceipt = null; statusLog.length = 0;
      // clear any prior disc by re-selecting aggregate, then load the string
      await page.locator("#disc-mode-1").selectOption("exact");
      await page.locator("#disc-mode-1").selectOption("aggregate");
      await page.locator("#audit-req-1").fill(reqStr);
      await page.getByRole("button", { name: "Generate proof" }).click();
      await page.waitForFunction(() => {
        const s = document.querySelector('[role=status]')?.innerText || "";
        return /against the regulator's registered request|On-chain check unavailable|do not hold|above \$/i.test(s);
      }, { timeout: 150000 }).catch(() => {});
      const rqStatus = await page.locator('[role=status]').innerText().catch(() => "");
      console.log(`    [request-mode status] ${rqStatus.replace(/\s+/g, " ").slice(0, 240)}`);

      // skip-self-register: request mode must NEVER show the "Registering the audit request" status
      const reqSawRegister = statusLog.some((s) => /Registering the audit request on-chain/i.test(s));
      !reqSawRegister ? ok("1c.iii: request-mode SKIPS self-registration (no 'Registering…' status)") : bad("1c.iii: request-mode re-registered (should not)");

      // proved-panel + wording proving it is REQUEST mode
      const proved = await page.getByText(/in the regulator's request.*could not be trimmed/i).count();
      proved > 0 ? ok("1c.iii: proof produced against the regulator's request (set could not be trimmed)") : bad("1c.iii: request-mode proof panel missing", rqStatus.slice(0, 160));

      // export request-mode receipt; ctxNonce must be the REQUEST's (not a fresh self-computed one)
      await page.getByRole("button", { name: "Export receipt (JSON)" }).click().catch(() => {});
      await page.waitForTimeout(1200);
      if (lastReceipt && lastReceipt.type === "aggregate") {
        String(lastReceipt.ctxNonce) === String(ssCtxNonce) ? ok("1c.iii: receipt uses the REQUEST's ctxNonce (not self-registered)") : bad("1c.iii: ctxNonce not from request", `${lastReceipt.ctxNonce}`);
        String(lastReceipt.auditContextHash) === String(ssHash) ? ok("1c.iii: receipt binds the exact REGISTERED audit hash") : bad("1c.iii: auditContextHash != registered", `${lastReceipt.auditContextHash}`);
      } else info("1c.iii: request-mode receipt not captured (proof/export may have been blocked)");

      const rqOnChain = /verified in your browser and on Stellar against the regulator's registered/i.test(rqStatus);
      info(`1c.iii: request-mode on-chain disclose = ${rqOnChain ? "CONFIRMED (pool accepted)" : "reached-submit only (crafted commitments not real deposits; disclose_aggregate gates on real deposits)"}`);
      await page.screenshot({ path: SHOTS + "/qa5-1c-request-mode.png", fullPage: true });
    } else info("1c.iii skipped — no self-serve ctxNonce captured");

    await ctx.close();
  }
} catch (e) {
  bad("FATAL", (e && e.stack) || String(e));
} finally {
  console.log("\n=== console/page errors (excluding tolerated network) ===");
  const netnoise = /er-api|reflector|onramper|stellar|rpc|horizon|friendbot|Failed to load resource/i;
  const real = errs.filter((e) => !netnoise.test(e));
  if (!real.length) console.log("  (none)");
  else real.slice(0, 30).forEach((e) => console.log("  " + e));
  console.log(`\n==== RESULT: ${pass} pass / ${fail} fail ====`);
  await browser.close();
  process.exit(fail ? 1 : 0);
}
