// Capture the real Tukar app for the demo video.
//
//   node capture.mjs [baseUrl]            default http://localhost:3100
//
// Drives the running app with Playwright and records it. Nothing here is staged:
// it connects the built-in testnet key, makes a real on-chain deposit, claims the
// note, reads the live Reflector quote, withdraws on-chain, generates real
// selective-disclosure proofs, and verifies them on the live Stellar verifier.
//
// Three recorded contexts, one per shot size:
//   desk1  1600x900   the landing
//   phone   430x932   sender + receiver (the consumer apps are mobile-first)
//   desk2  1600x900   regulator + operator + public verify + docs
//
// Writes captures/<name>.webm plus captures/marks.json: every scene's start and
// end inside its source video, which is what the Remotion composition slices on.
import { chromium } from "playwright-core";
import { readFileSync, writeFileSync, mkdirSync, rmSync, renameSync, copyFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = (process.argv[2] || "http://localhost:3100").replace(/\/$/, "");
const OUT = path.join(HERE, "captures");
const SCRIPT = JSON.parse(readFileSync(path.join(HERE, "script.json"), "utf8"));
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";

mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);

// ---------------------------------------------------------------- scene marks
const marks = []; // {id, source, startMs, endMs}
let src = null; // {name, t0}
let open = null;

function begin(id) {
  if (open) end();
  open = { id, source: src.name, startMs: Date.now() - src.t0 };
}
function end() {
  if (!open) return;
  open.endMs = Date.now() - src.t0;
  marks.push(open);
  log(`    ${open.id}  ${(open.startMs / 1000).toFixed(1)}s -> ${(open.endMs / 1000).toFixed(1)}s`);
  open = null;
}

// Callouts: measure the element the narration is about, at the moment it is on screen and
// still, in this shot's viewport pixels. The composition draws a box there for as long as
// the page stays put (holdMs of real time). An element that is missing or off screen is
// logged and left out, never guessed.
const boxes = []; // {id, source, atMs, x, y, w, h, label, holdMs}
async function callout(page, target, label, holdMs = 2400) {
  if (!open) return;
  try {
    const loc = typeof target === "string" ? page.locator(target).first() : target.first();
    // bring it on screen first, the way a person would scroll to the thing they are pointing at
    await loc.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => {});
    await sleep(350);
    const b = await loc.boundingBox({ timeout: 4000 });
    const vp = page.viewportSize();
    if (!b || b.width < 4 || b.height < 4 || b.y > vp.height - 8 || b.y + b.height < 8) {
      log(`    ! callout off screen, left out: ${label}`);
      return;
    }
    const pad = 8;
    const x = Math.max(3, b.x - pad), y = Math.max(3, b.y - pad);
    const r = Math.min(vp.width - 3, b.x + b.width + pad), bt = Math.min(vp.height - 3, b.y + b.height + pad);
    boxes.push({ id: open.id, source: src.name, atMs: Date.now() - src.t0, x: Math.round(x), y: Math.round(y), w: Math.round(r - x), h: Math.round(bt - y), label, holdMs });
    log(`    box  ${open.id} "${label}"`);
  } catch (e) {
    log(`    ! callout not found, left out: ${label}`);
  }
}

// Every scene must have at least as much real footage as it has narration, so the
// composition never runs out of frames. Where the app genuinely made us wait (a
// proof, a ledger confirmation) the clip ends up longer than that, and the
// composition speeds it up and prints the real multiplier on screen.
const VO = JSON.parse(readFileSync(path.join(HERE, "public", "vo", "vo.json"), "utf8"));
const needMs = (id) => (VO.find((v) => v.id === id)?.ms ?? 8000) + 900;
async function hold(id) {
  const want = needMs(id);
  const got = Date.now() - src.t0 - open.startMs;
  if (got < want) await sleep(want - got);
}

// -------------------------------------------------------------- page helpers
const safe = async (fn, what) => {
  try {
    return await fn();
  } catch (e) {
    log(`    ! ${what}: ${String(e).split("\n")[0]}`);
    return null;
  }
};

// React's value tracker only fires onChange when the DOM value actually changes.
async function fillStable(loc, v) {
  for (let i = 0; i < 20; i++) {
    await loc.fill(v);
    await sleep(120);
    if ((await loc.inputValue()) === v) return;
  }
}

// Type at a human pace so the recording shows the field filling in.
async function typeSlow(loc, v) {
  await loc.click();
  await loc.fill("");
  await loc.type(v, { delay: 70 });
}

async function connect(page) {
  for (let i = 0; i < 12; i++) {
    await safe(() => page.getByRole("button", { name: /Use testnet key/ }).first().click({ timeout: 4000 }), "connect");
    if (await page.getByRole("button", { name: /^Disconnect$/ }).first().isVisible().catch(() => false)) return true;
    await sleep(1000);
  }
  return false;
}

// A slow, even scroll. Hard jumps read as a glitch in a video. Takes a pixel
// offset, a CSS selector, or a Playwright locator.
async function glide(page, target, ms = 1400) {
  let want = target;
  if (typeof target !== "number") {
    const loc = typeof target === "string" ? page.locator(target).first() : target.first ? target.first() : target;
    const box = await loc.boundingBox().catch(() => null);
    if (!box) return;
    want = Math.max(0, (await page.evaluate(() => scrollY)) + box.y - 90);
  }
  return page.evaluate(
    async ([wanted, dur]) => {
      const want = wanted;
      const from = scrollY;
      const d = want - from;
      if (Math.abs(d) < 6) return;
      const steps = Math.max(12, Math.round(dur / 16));
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        scrollTo(0, from + d * (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2));
        await new Promise((r) => setTimeout(r, 16));
      }
    },
    [want, ms],
  );
}

// <details> panels: click only when actually closed. A blind click toggles, and
// after a withdraw the app re-renders with some of these already open.
async function openDetails(page, text) {
  const sum = page.locator("summary").filter({ hasText: text }).first();
  for (let i = 0; i < 6; i++) {
    if (await sum.evaluate((el) => !!el.parentElement.open).catch(() => false)) return true;
    await sum.click({ timeout: 8000 }).catch(() => {});
    await sleep(450);
  }
  log(`    ! could not open "${text}"`);
  return false;
}

async function newShot(browser, name, width, height) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    recordVideo: { dir: OUT, size: { width, height } },
    permissions: ["clipboard-read", "clipboard-write"],
    reducedMotion: "no-preference",
  });
  ctx.setDefaultTimeout(25_000); // fail fast; the long waits each carry their own timeout
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.dismiss().catch(() => {}));
  // Production rate-limits its API routes for real. A 429 on camera is a re-take,
  // so record every one against the scene it landed in.
  page.on("response", (r) => {
    if (r.status() === 429) {
      const where = open ? open.id : "(between scenes)";
      throttled.push({ scene: where, url: r.url() });
      log(`    ! 429 during ${where}: ${r.url()}`);
    }
  });
  src = { name, t0: Date.now() };
  return { ctx, page };
}

async function closeShot(ctx, page, name) {
  end();
  const tEnd = Date.now() - src.t0;
  const video = page.video();
  await ctx.close();
  const raw = await video.path();
  const dest = path.join(OUT, `${name}.webm`);
  rmSync(dest, { force: true });
  try {
    renameSync(raw, dest);
  } catch {
    copyFileSync(raw, dest);
    rmSync(raw, { force: true });
  }
  sources[name] = { file: `${name}.webm`, wallMs: tEnd };
  log(`  -> ${name}.webm  (${(tEnd / 1000).toFixed(1)}s wall)`);
}

const sources = {};
const throttled = []; // any HTTP 429 the live site handed back
const carry = {};

// Re-take one shot without redoing the rest (and without a second real deposit):
//   SHOTS=desk2 node capture.mjs https://tukar-six.vercel.app
// The phone shot saves what the consoles need, so a console re-take reuses it.
const ONLY = (process.env.SHOTS || "").split(",").map((x) => x.trim()).filter(Boolean);
const wants = (name) => ONLY.length === 0 || ONLY.includes(name);
const CARRY_FILE = path.join(OUT, "carry.json");
const MARKS_FILE = path.join(OUT, "marks.json");
if (ONLY.length) {
  log(`re-taking only: ${ONLY.join(", ")}`);
  if (existsSync(CARRY_FILE)) Object.assign(carry, JSON.parse(readFileSync(CARRY_FILE, "utf8")));
} // things one shot hands to the next

// ============================================================== the three shots
const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--force-device-scale-factor=1", "--hide-scrollbars"],
});

// ---- 1. the landing -------------------------------------------------------
if (wants("desk1")) {
  log("shot 1/3  landing (1600x900)");
  const { ctx, page } = await newShot(browser, "desk1", 1600, 900);
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await safe(() => page.getByRole("heading", { name: /Send money home/i }).waitFor(), "hero");
  await sleep(1600);

  begin("n01");
  await glide(page, "#apps", 1600);
  await callout(page, "#apps", "Four apps, one corridor", 1100);
  await sleep(1100);
  await glide(page, "#corridor", 1600);
  await callout(page, "#corridor", "Private in the middle", 1100);
  await sleep(1100);
  await glide(page, "#circuits", 1600);
  await callout(page, "#circuits", "Proofs verified on-chain", 1400);
  await sleep(1400);
  await glide(page, 0, 1200);
  await safe(() => page.locator("header .launch-trigger").first().click(), "launch dialog");
  await sleep(900);
  await hold("n01");
  await closeShot(ctx, page, "desk1");
}

// ---- 2. sender + receiver, on a phone --------------------------------------
if (wants("phone")) {
  log("shot 2/3  sender + receiver (430x932)");
  const { ctx, page } = await newShot(browser, "phone", 430, 932);

  // -- sender ---------------------------------------------------------------
  await page.goto(`${BASE}/sender`, { waitUntil: "domcontentloaded" });
  const amount = page.locator("#amount");
  await amount.waitFor();
  // hydration: SSR renders Continue enabled, React makes it disabled on an empty amount
  await safe(async () => {
    for (let i = 0; i < 40; i++) {
      await amount.fill("0");
      await amount.fill("");
      if (await page.getByRole("button", { name: /Continue/ }).isDisabled().catch(() => false)) return;
      await sleep(500);
    }
  }, "hydrate");
  await fillStable(amount, "200");
  await sleep(600);

  begin("n02");
  if (!(await connect(page))) throw new Error("could not connect the testnet key");
  await sleep(1200);
  await typeSlow(amount, "200");
  await safe(() => page.locator("#corridor").selectOption("MX"), "corridor");
  await sleep(900);
  await glide(page, "aside", 1300); // the cost-and-policy packing slip
  await sleep(1400); // let the policy registry + provider benchmark land
  await callout(page, "aside", "Cap from the policy registry", 1400);
  await sleep(1400);
  await glide(page, 0, 1000);
  await hold("n02");

  // -- proving + deposit (real, ~30s) ---------------------------------------
  begin("n03");
  await safe(() => page.getByRole("button", { name: /Continue/ }).click(), "continue");
  await safe(() => page.getByText(/Confirm and send/).waitFor({ timeout: 20000 }), "confirm");
  await sleep(1400);
  await safe(() => typeSlow(page.locator("#claim-pin"), "204815"), "pin");
  await sleep(900);
  await safe(() => page.getByRole("button", { name: /^Send \$/ }).click(), "send");
  await safe(() => page.getByText(/Zero-knowledge proofs/).waitFor({ timeout: 20000 }), "progress");
  await callout(page, page.getByText(/Zero-knowledge proofs/), "Proving on the device", 3000);
  await safe(
    () => page.getByRole("heading", { name: /Sent and shielded|Deposited, registration pending/ }).waitFor({ timeout: 420_000 }),
    "deposit",
  );
  // "Sent and shielded" means the note actually made it into the tree. The other
  // heading means the deposit landed but registration did not, which is a re-take.
  carry.registered = await page.getByRole("heading", { name: /Sent and shielded/ }).isVisible().catch(() => false);
  log(`    deposit ${carry.registered ? "registered into the tree" : "DEPOSITED BUT NOT REGISTERED (re-take)"}`);
  await callout(page, page.getByRole("heading", { name: /Sent and shielded|Deposited, registration pending/ }), "Real USDC, now shielded", 2400);
  await hold("n03");

  // -- the claim note -------------------------------------------------------
  begin("n04");
  await sleep(1500);
  carry.note = await page.locator("pre", { hasText: /^tukar1:/ }).first().innerText();
  await glide(page, "aside", 1200);
  await callout(page, "aside", "Bearer claim note", 2200);
  await sleep(2200); // the string, the QR
  await glide(page, 99999, 1200);
  await safe(() => page.getByRole("button", { name: /^Copy claim link/ }).click(), "claim link");
  await sleep(1600);
  await safe(() => page.getByRole("button", { name: "Export view-only note" }).click(), "view-only");
  await sleep(1400);
  carry.viewNote = await safe(() => page.evaluate(() => navigator.clipboard.readText()), "clipboard");
  await hold("n04");

  // -- receiver: claim ------------------------------------------------------
  await page.goto(`${BASE}/receiver`, { waitUntil: "domcontentloaded" });
  await safe(() => page.getByRole("tab", { name: /^Claim$/ }).click(), "claim tab");
  await safe(() => page.locator("#claimNote").waitFor(), "claim box");
  await sleep(800);

  begin("n05");
  await safe(() => page.locator("#claimNote").fill(carry.note), "paste note");
  await sleep(1400);
  await safe(() => page.getByRole("button", { name: "Claim payment" }).click(), "claim");
  await safe(() => page.getByRole("tab", { name: /Payments \(1\)/ }).waitFor({ timeout: 120_000 }), "claimed");
  await callout(page, page.getByRole("tab", { name: /Payments \(1\)/ }), "Claimed", 1600);
  await sleep(1600);
  await hold("n05");

  // -- receiver: the on-chain FX quote --------------------------------------
  begin("n06");
  await safe(() => page.getByRole("button", { name: /Reveal in / }).click(), "reveal");
  await safe(
    () => page.getByText(/Off-ramp figure read on-chain|On-chain quote unavailable|no live price/).waitFor({ timeout: 90_000 }),
    "revealed",
  );
  await sleep(1200);
  await glide(page, page.getByText("Customs desk").first(), 1200);
  await callout(page, page.getByText(/Off-ramp figure read on-chain|On-chain quote unavailable/), "Rate read on-chain, Reflector", 3000);
  await sleep(3000);
  await hold("n06");

  // -- receiver: anchor quote + on-chain withdraw ---------------------------
  begin("n07");
  await openDetails(page, "Cash out to fiat");
  await safe(() => page.getByText(/Indicative:/).first().waitFor({ timeout: 60_000 }), "sep-38 quote");
  await glide(page, page.getByText("Anchor desk").first(), 1100);
  await callout(page, page.getByText(/Indicative:/), "Anchor quote, SEP-38", 3600);
  await sleep(3600); // the real SEP-38 indicative quote and what the anchor will not do
  await safe(() => page.getByRole("button", { name: /^Withdraw on-chain$/ }).scrollIntoViewIfNeeded(), "scroll withdraw");
  await sleep(600);
  await safe(() => page.getByRole("button", { name: /^Withdraw on-chain$/ }).click(), "withdraw");
  await safe(
    () => page.getByText(/withdrawn on-chain\. Tokens released|already spent|Withdraw failed|withdraw held/i).first().waitFor({ timeout: 420_000 }),
    "withdrawn",
  );
  await callout(page, page.getByText(/withdrawn on-chain\. Tokens released|already spent|Withdraw failed|withdraw held/i), "Withdrawn on-chain", 1500);
  await sleep(1500);
  await hold("n07");

  // -- receiver: selective disclosure ---------------------------------------
  begin("n08");
  await openDetails(page, "Prove to a regulator");
  await sleep(800);
  const modeSel = page.locator("select[id^='disc-mode-']").first();
  await safe(() => modeSel.scrollIntoViewIfNeeded(), "scroll mode");
  for (const m of ["exact", "threshold", "range", "aggregate"]) {
    await safe(() => modeSel.selectOption(m), `mode ${m}`);
    await sleep(900);
  }
  await safe(() => modeSel.selectOption("threshold"), "mode threshold");
  await sleep(800);
  const dl = page.waitForEvent("download", { timeout: 300_000 }).catch(() => null);
  await safe(() => page.getByRole("button", { name: "Generate proof" }).click(), "generate");
  await safe(() => page.getByText(/Verified on-chain by the live Stellar verifier|Browser only/).waitFor({ timeout: 300_000 }), "proved");
  await callout(page, page.getByText(/Verified on-chain by the live Stellar verifier|Browser only/), "Checked by the live verifier", 1500);
  await sleep(1500);
  await safe(() => page.getByRole("button", { name: /Export receipt/ }).click({ timeout: 60_000 }), "export");
  const d = await dl;
  if (d) carry.receipt = readFileSync(await d.path(), "utf8");
  await safe(() => page.getByText("Payment receipt", { exact: true }).waitFor({ timeout: 180_000 }), "print receipt");
  await glide(page, page.getByText("Payment receipt", { exact: true }).first(), 1200);
  await sleep(2000);
  carry.verifyLink = await safe(
    () => page.locator(".tk-print dd", { hasText: /\/verify#r=/ }).first().innerText(),
    "verify link",
  );
  await hold("n08");

  await closeShot(ctx, page, "phone");
  writeFileSync(CARRY_FILE, JSON.stringify({ note: carry.note, viewNote: carry.viewNote, receipt: carry.receipt, verifyLink: carry.verifyLink, registered: carry.registered }, null, 2));
}

if (wants("desk2") && !carry.receipt) throw new Error("no disclosure receipt; run the phone shot first (it writes captures/carry.json)");
if (wants("phone") && !carry.registered) log("WARNING: the note never registered into the tree; re-take: SHOTS=phone node capture.mjs <base>");

// ---- 3. the consoles ------------------------------------------------------
if (wants("desk2")) {
  log("shot 3/3  regulator + operator + verify (1600x900)");
  const { ctx, page } = await newShot(browser, "desk2", 1600, 900);
  const nav = async (label) => {
    for (let i = 0; i < 10; i++) {
      await safe(() => page.locator("aside nav button", { hasText: label }).first().click({ timeout: 4000 }), `nav ${label}`);
      const el = page.locator("aside nav button", { hasText: label }).first();
      if ((await el.getAttribute("aria-current").catch(() => null)) === "page") return;
      await sleep(600);
    }
  };

  await page.goto(`${BASE}/regulator`, { waitUntil: "domcontentloaded" });
  await safe(() => page.getByRole("heading", { name: /Regulator/ }).first().waitFor(), "regulator");
  await sleep(1500);
  await nav("Verify disclosure");
  await sleep(900);

  // -- verify a genuine receipt --------------------------------------------
  begin("n09");
  await safe(() => page.locator("#receipt").fill(carry.receipt), "paste receipt");
  await sleep(1300);
  await safe(() => page.getByRole("button", { name: /Re-verify in browser and on-chain/ }).click(), "verify");
  await safe(() => page.getByText(/Verified and bound|Proof is valid but NOT bound|Not valid/).waitFor({ timeout: 180_000 }), "verdict");
  await callout(page, page.getByText(/Verified and bound|Proof is valid but NOT bound|Not valid/), "Verified and bound on-chain", 2200);
  await sleep(2200);
  await hold("n09");

  // -- tamper one character -------------------------------------------------
  begin("n10");
  const bad = (() => {
    const r = JSON.parse(carry.receipt);
    const bump = (s) => (String(s).endsWith("7") ? String(s).slice(0, -1) + "8" : String(s).slice(0, -1) + "7");
    if (Array.isArray(r.publicSignals) && r.publicSignals.length) r.publicSignals[0] = bump(r.publicSignals[0]);
    else if (r.proof?.pi_a?.[0]) r.proof.pi_a[0] = bump(r.proof.pi_a[0]);
    return JSON.stringify(r, null, 2);
  })();
  await safe(() => page.locator("#receipt").fill(bad), "paste tampered");
  await sleep(1400);
  await safe(() => page.getByRole("button", { name: /Re-verify in browser and on-chain/ }).click(), "re-verify");
  await safe(() => page.getByText(/Not valid|Proof is valid but NOT bound/).waitFor({ timeout: 180_000 }), "rejected");
  await callout(page, page.getByText(/Not valid|Proof is valid but NOT bound/), "One character changed, rejected", 2400);
  await sleep(2400);
  await hold("n10");

  // -- view-only note, audit request, travel rule, compliance export --------
  begin("n11");
  // Put the genuine receipt back: the Travel Rule payload is filled from the last
  // disclosure that actually verified, and the tamper just overwrote it.
  await safe(() => page.locator("#receipt").fill(carry.receipt), "restore receipt");
  await safe(() => page.getByRole("button", { name: /Re-verify in browser and on-chain/ }).click(), "re-verify genuine");
  await safe(() => page.getByText(/Verified and bound|Proof is valid but NOT bound/).waitFor({ timeout: 180_000 }), "restored");
  await sleep(800);
  if (carry.viewNote && carry.viewNote.startsWith("tukview1:")) {
    await safe(() => page.locator("#view-note").scrollIntoViewIfNeeded(), "scroll view-note");
    await safe(() => page.locator("#view-note").fill(carry.viewNote), "paste view-note");
    await sleep(800);
    await safe(() => page.getByRole("button", { name: "Recompute commitment and look up on-chain" }).click(), "recompute");
    await safe(() => page.getByText(/Opening reproduces the commitment|not a Tukar view-only note/).waitFor({ timeout: 120_000 }), "view-note result");
    await callout(page, page.getByText(/Opening reproduces the commitment|not a Tukar view-only note/), "Same commitment the pool stored", 2000);
    await sleep(2000);
  }
  await hold("n11");

  begin("n12");
  await nav("Issue audit request");
  await sleep(900);
  await connect(page);
  const boxes = page.locator("input[type=checkbox]");
  for (const i of [0, 1]) await safe(() => boxes.nth(i).check({ timeout: 5000 }), `leaf ${i}`);
  await safe(() => page.getByRole("button", { name: /^Random$/ }).click(), "nonce");
  await sleep(700);
  await safe(() => page.getByRole("button", { name: "Compute hash and register on-chain" }).click(), "audit request");
  await safe(() => page.locator("#audit-str").waitFor({ timeout: 90_000 }), "audit string");
  await callout(page, "#audit-str", "Request registered on-chain", 1600);
  await sleep(1600);
  await hold("n12");

  begin("n13");
  await nav("Travel Rule");
  await sleep(1200);
  await glide(page, 600, 1200);
  await safe(() => page.getByRole("button", { name: "Send as TRP message" }).click(), "trp send");
  await safe(() => page.getByText(/Approved by the beneficiary VASP|TRP send failed|Rejected · TRP/).waitFor({ timeout: 90_000 }), "trp result");
  await callout(page, page.getByText(/Approved by the beneficiary VASP|TRP send failed|Rejected · TRP/), "Real TRP 3.2.1 exchange", 2200);
  await sleep(2200);
  await glide(page, 99999, 1400); // the TRISA panel's honest not-deployed stamp
  await callout(page, page.getByText(/TRISA companion node not deployed/), "Said plainly, not deployed", 1300);
  await sleep(1300);
  await hold("n13");

  begin("n14");
  await nav("Pool report");
  await sleep(1000);
  await glide(page, page.getByText("Compliance export pack").first(), 1300);
  await safe(() => page.getByText("reading pool events from Stellar RPC…").waitFor({ state: "detached", timeout: 150_000 }), "export ready");
  await sleep(900);
  await safe(() => page.locator("#ce-preset").selectOption("eu-tfr"), "preset");
  await callout(page, "#ce-preset", "Jurisdiction preset", 1200);
  await sleep(1200);
  await hold("n14");

  // -- operator -------------------------------------------------------------
  await page.goto(`${BASE}/operator`, { waitUntil: "domcontentloaded" });
  await safe(() => page.getByRole("heading", { name: /Corridor operations/ }).waitFor(), "operator");
  await safe(() => page.getByText(/reading pool state…/).waitFor({ state: "detached", timeout: 120_000 }), "pool read");
  await sleep(1200);

  begin("n15");
  await glide(page, page.getByText("Reserves attestation").first(), 1500);
  await callout(page, page.getByText("Reserves attestation"), "Reserves attestation", 2400);
  await sleep(2400);
  await glide(page, page.getByText("Deployed contract inventory").first(), 1500);
  await callout(page, page.getByText("Deployed contract inventory"), "Every contract id, openable", 2200);
  await sleep(2200);
  await hold("n15");

  begin("n16");
  await nav("Compliance policy");
  await sleep(800);
  await glide(page, page.getByText("Per-corridor policy registry").first(), 1400);
  await callout(page, page.getByText("Per-corridor policy registry"), "Policy read on-chain", 2200);
  await sleep(2200);
  await nav("Oracle health");
  // the gauge card reads Reflector live; do not film its skeleton
  await safe(() => page.getByText(/reading FX oracle/).first().waitFor({ state: "detached", timeout: 90_000 }), "oracle read");
  await sleep(2600);
  await hold("n16");

  begin("n17");
  await nav("Monitoring");
  await safe(() => page.getByText(/reading events…/).waitFor({ state: "detached", timeout: 150_000 }), "events");
  await callout(page, page.getByText("Monitoring is live and read-only"), "Live, read-only, limits stated", 2400);
  await sleep(2400);
  await hold("n17");

  // -- the public verify page, then the docs --------------------------------
  begin("n18");
  const link = (carry.verifyLink || "").trim();
  if (link.startsWith("http")) {
    await page.goto(link, { waitUntil: "domcontentloaded" });
    await safe(() => page.getByText(/Receipt loaded from a verification link/).waitFor({ timeout: 30_000 }), "link loaded");
  } else {
    await page.goto(`${BASE}/verify`, { waitUntil: "domcontentloaded" });
    await safe(() => page.locator("#receipt").fill(carry.receipt), "verify paste");
    await safe(() => page.getByRole("button", { name: /^Verify$/ }).click(), "verify click");
  }
  await safe(() => page.getByRole("img", { name: /passed|failed/ }).first().waitFor({ timeout: 180_000 }), "verify verdict");
  await callout(page, page.getByRole("img", { name: /passed|failed/ }), "Checked with no wallet", 2600);
  await sleep(2600);
  await hold("n18");

  begin("n19");
  await page.goto(`${BASE}/docs`, { waitUntil: "domcontentloaded" });
  await sleep(1000);
  await glide(page, 700, 1600);
  await sleep(1400);
  await hold("n19");

  // -- close ----------------------------------------------------------------
  begin("n20");
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await safe(() => page.getByRole("heading", { name: /Send money home/i }).waitFor(), "hero");
  await sleep(2200);
  await glide(page, page.getByText("Try it now").first(), 1800);
  await callout(page, page.getByText("Try it now"), "Try it on testnet", 2200);
  await sleep(2200);
  await hold("n20");

  await closeShot(ctx, page, "desk2");
}

await browser.close();

let out = { base: BASE, sources, marks, boxes };
if (ONLY.length && existsSync(MARKS_FILE)) {
  const prev = JSON.parse(readFileSync(MARKS_FILE, "utf8"));
  out = {
    base: BASE,
    sources: { ...prev.sources, ...sources },
    marks: [...prev.marks.filter((m) => !ONLY.includes(m.source)), ...marks],
    boxes: [...(prev.boxes || []).filter((b) => !ONLY.includes(b.source)), ...boxes],
  };
  log(`merged ${marks.length} re-taken scene(s) into the existing marks`);
}
writeFileSync(MARKS_FILE, JSON.stringify(out, null, 2));
log(`\nwrote captures/marks.json  (${marks.length} scenes, ${boxes.length} callouts)`);
const missing = SCRIPT.scenes.filter((s) => !out.marks.find((m) => m.id === s.id));
if (missing.length) log(`WARNING: no mark for ${missing.map((s) => s.id).join(", ")}`);
if (throttled.length) {
  log(`
WARNING: ${throttled.length} rate-limited response(s). Re-take these scenes:`);
  for (const t of [...new Set(throttled.map((t) => t.scene))]) log(`  ${t}`);
} else {
  log("no rate-limited responses");
}
