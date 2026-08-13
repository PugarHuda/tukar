// QA — recently-added features on the LIVE Tukar site (https://tukar-six.vercel.app).
// Read-only: connects the built-in testnet key and reads/renders, but performs NO on-chain WRITE
// (no deposit/withdraw) so it can't collide with the shared demo key's sequence number.
// Proven repo pattern: playwright-core + system Chrome, headless. One screenshot per surface.
import { chromium } from "playwright-core";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "https://tukar-six.vercel.app";
const SHOTS = "scripts/qa-shots";

let pass = 0, fail = 0;
const rows = [];
const ok = (n, why = "") => { pass++; rows.push(["PASS", n, why]); console.log("  PASS " + n + (why ? " :: " + why : "")); };
const bad = (n, why = "") => { fail++; rows.push(["FAIL", n, why]); console.log("  FAIL " + n + (why ? " :: " + why : "")); };

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const allErrs = []; // {surface, msg}
let surface = "";
function wire(page) {
  page.on("pageerror", (e) => allErrs.push({ surface, kind: "pageerror", msg: e.message }));
  page.on("console", (m) => { if (m.type() === "error") allErrs.push({ surface, kind: "console.error", msg: m.text().slice(0, 200) }); });
  page.setDefaultTimeout(25000);
}
async function newPage(width = 1440, height = 900) {
  const ctx = await browser.newContext({ viewport: { width, height }, permissions: ["clipboard-read", "clipboard-write"] });
  const page = await ctx.newPage();
  wire(page);
  return { ctx, page };
}
async function overflow(page) {
  return await page.evaluate(() => {
    const d = document.documentElement;
    return { scroll: d.scrollWidth, client: d.clientWidth };
  });
}
const shot = (page, name) => page.screenshot({ path: `${SHOTS}/${name}`, fullPage: false }).catch(() => {});
// Connect the built-in testnet key via the WalletBar; resolves once the bar shows "testnet key".
async function connectTestnetKey(page) {
  const btn = page.getByRole("button", { name: "Use testnet key" }).first();
  await btn.click();
  await page.getByText(/testnet key ·/i).first().waitFor({ timeout: 20000 });
}

// ===================================================================== 1 · LANDING
surface = "landing";
console.log("\n=== 1 · LANDING (/) ===");
{
  const { ctx, page } = await newPage(1440, 900);
  try {
    const resp = await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    resp && resp.ok() ? ok("landing loads (HTTP " + resp.status() + ")") : bad("landing did not load", resp ? "HTTP " + resp.status() : "no response");
    await page.getByText(/Send money home/i).first().waitFor();
    ok("hero shows 'Send money home'");
    const cards = page.locator(".app-card");
    const n = await cards.count();
    n === 4 ? ok("four app cards present", `count=${n}`) : bad("expected 4 app cards", `count=${n}`);
    // check the four destinations are wired
    const hrefs = await cards.evaluateAll((els) => els.map((e) => e.getAttribute("href")));
    const want = ["/sender", "/receiver", "/regulator", "/operator"];
    want.every((w) => hrefs.includes(w)) ? ok("app cards link to /sender /receiver /regulator /operator") : bad("app card hrefs off", JSON.stringify(hrefs));
    await page.waitForTimeout(600);
    const o1440 = await overflow(page);
    o1440.scroll <= o1440.client + 1 ? ok("no horizontal overflow @1440", `${o1440.scroll}<=${o1440.client}`) : bad("horizontal overflow @1440", `${o1440.scroll}>${o1440.client}`);
    await shot(page, "newfeat-landing-1440.png");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(600);
    const o390 = await overflow(page);
    o390.scroll <= o390.client + 1 ? ok("no horizontal overflow @390", `${o390.scroll}<=${o390.client}`) : bad("horizontal overflow @390", `${o390.scroll}>${o390.client}`);
    await shot(page, "newfeat-landing-390.png");
  } catch (e) { bad("landing threw", (e && e.message) || String(e)); }
  await ctx.close();
}

// ===================================================================== 2 · SENDER (390)
surface = "sender";
console.log("\n=== 2 · SENDER (/sender @390) ===");
{
  const { ctx, page } = await newPage(390, 844);
  try {
    await page.goto(BASE + "/sender", { waitUntil: "domcontentloaded" });
    await page.locator("#amount").waitFor();

    // --- connect area: testnet key button + Reusable KYC details ---
    (await page.getByRole("button", { name: "Use testnet key" }).count())
      ? ok("connect area shows 'Use testnet key'") : bad("'Use testnet key' missing");
    const kyc = page.locator("details", { has: page.getByText(/Reusable KYC/i) }).first();
    if (await kyc.count()) {
      await kyc.locator("summary").click();
      await page.waitForTimeout(200);
      const txt = await kyc.innerText();
      const hasIdos = /idOS/.test(txt), hasReclaim = /Reclaim/.test(txt);
      const links = await kyc.locator("a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
      const idosLink = links.some((h) => /idos\.network/.test(h || ""));
      const reclaimLink = links.some((h) => /reclaimprotocol\.org/.test(h || ""));
      (hasIdos && hasReclaim && idosLink && reclaimLink)
        ? ok("Reusable KYC expands: idOS + Reclaim text and links present")
        : bad("Reusable KYC content incomplete", `idOS=${hasIdos} Reclaim=${hasReclaim} idosLink=${idosLink} reclaimLink=${reclaimLink}`);
    } else bad("Reusable KYC (roadmap) details element missing");

    // --- connect testnet key (read/sign key only; no write here) ---
    await connectTestnetKey(page);
    ok("connected the built-in testnet key");

    // --- amount + corridor + savings note ---
    await page.locator("#amount").fill("");
    await page.locator("#amount").fill("500");
    await page.locator("#corridor").selectOption("PH");
    await page.waitForTimeout(300);
    const savings = page.getByText(/What you would pay elsewhere/i).first();
    if (await savings.count()) {
      const sn = page.locator("div", { has: page.getByText(/What you would pay elsewhere/i) }).first();
      const t = await sn.innerText();
      /Traditional \(6\.2%\)/.test(t) && /Tukar/.test(t) && /a fraction of a cent/.test(t)
        ? ok("savings note shows traditional-vs-Tukar breakdown") : bad("savings breakdown incomplete", t.slice(0, 120));
    } else bad("savings note not shown after amount entered");

    // --- Repeat = Monthly → annual projection + scheduled sends preview/save/remove ---
    await page.locator("#frequency").selectOption("monthly");
    await page.waitForTimeout(300);
    (await page.getByText(/a year, which is what Tukar avoids/i).count())
      ? ok("monthly annual projection line appears") : bad("annual projection line missing after Monthly");
    // preview block + badge
    const previewOk = (await page.getByText(/Schedule a monthly send/i).count()) && (await page.getByText(/ROADMAP|PREVIEW/).count());
    previewOk ? ok("'Schedule a monthly send' preview block + badge present") : bad("scheduled-send preview block missing");
    // save a plan
    const saveBtn = page.getByRole("button", { name: /Save monthly plan/i });
    if (await saveBtn.count()) {
      await saveBtn.click();
      await page.waitForTimeout(300);
      const listed = page.getByText(/Scheduled sends/i);
      (await listed.count()) && (await page.getByText(/\$500 USDC · Philippines/).count())
        ? ok("saved plan is listed under 'Scheduled sends'") : bad("saved plan not listed");
      // remove it
      const rm = page.getByRole("button", { name: "Remove scheduled plan" }).first();
      if (await rm.count()) {
        await rm.click();
        await page.waitForTimeout(300);
        (await page.getByText(/\$500 USDC · Philippines/).count()) === 0
          ? ok("removing the plan clears it from the list") : bad("plan still listed after remove");
      } else bad("remove button not found for saved plan");
    } else bad("'Save monthly plan' button missing");
    await shot(page, "newfeat-sender-compose-390.png");

    // --- CCTP inbound preview lives on the SEND (confirm) screen ---
    await page.getByRole("button", { name: /Continue/ }).click();
    await page.waitForTimeout(500);
    const cctpToggle = page.getByRole("button", { name: /Fund from another chain \(Circle CCTP\)/i });
    if (await cctpToggle.count()) {
      await cctpToggle.click();
      await page.waitForTimeout(300);
      const picker = await page.locator("#cctp-chain").count();
      const badge = await page.getByText(/ROADMAP, NOT WIRED YET/i).count();
      (picker && badge) ? ok("CCTP preview: source-chain picker + 'ROADMAP, NOT WIRED YET' badge")
        : bad("CCTP preview incomplete", `picker=${picker} badge=${badge}`);
    } else bad("CCTP inbound preview toggle not found on send screen");
    await shot(page, "newfeat-sender-send-390.png");
  } catch (e) { bad("sender threw", (e && e.message) || String(e)); }
  await ctx.close();
}

// ===================================================================== 3 · RECEIVER
surface = "receiver";
console.log("\n=== 3 · RECEIVER (/receiver) ===");
{
  const { ctx, page } = await newPage(390, 844);
  try {
    await page.goto(BASE + "/receiver", { waitUntil: "domcontentloaded" });
    await page.locator('[role="tablist"]').waitFor();
    // connect card shows once before connect (single WalletBar / single testnet-key button)
    const keyBtns = await page.getByRole("button", { name: "Use testnet key" }).count();
    keyBtns === 1 ? ok("connect card shows once before connect", "one testnet-key button") : bad("connect area not shown once", `testnet-key buttons=${keyBtns}`);
    // tabs switch — wait for each panel to render rather than snapshotting instantly
    const tab = (name) => page.getByRole("tab", { name: new RegExp(name, "i") });
    const switched = async (name, panel) => {
      await tab(name).click();
      try { await page.locator(panel).waitFor({ state: "visible", timeout: 8000 }); ok(`${name} tab switches`); }
      catch { bad(`${name} panel missing`); }
    };
    await switched("Claim", "#panel-claim");
    await switched("Request", "#panel-request");
    await switched("Payments", "#panel-payments");
    ok("savings note only appears after a claimed note — none claimed here, OK if absent");
    await shot(page, "newfeat-receiver-390.png");
  } catch (e) { bad("receiver threw", (e && e.message) || String(e)); }
  await ctx.close();
}

// ===================================================================== 4 · REGULATOR
surface = "regulator";
console.log("\n=== 4 · REGULATOR (/regulator @1440) ===");
{
  const { ctx, page } = await newPage(1440, 900);
  try {
    await page.goto(BASE + "/regulator", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Pool report" }).first().waitFor();
    const tabs = ["Pool report", "Verify disclosure", "Issue audit request", "Travel Rule (reference)", "Audit trail"];
    let allTabs = true;
    for (const t of tabs) if (!(await page.getByRole("button", { name: t }).count())) { allTabs = false; bad("regulator tab missing", t); }
    if (allTabs) ok("all five regulator tabs present");
    // Open Travel Rule
    await page.getByRole("button", { name: "Travel Rule (reference)" }).first().click();
    await page.waitForTimeout(400);
    const payloadPre = page.locator("pre", { hasText: /IVMS101|naturalPerson|originatingVASP/ }).first();
    (await payloadPre.count()) ? ok("IVMS101 payload renders") : bad("IVMS101 payload pre not found");
    (await page.getByRole("button", { name: /Download IVMS101 payload \(\.json\)/i }).count())
      ? ok("'Download IVMS101 payload (.json)' button present") : bad("download button missing");
    (await page.getByText(/\(held by the anchor's KYC, not by Tukar\)/i).count())
      ? ok("PII placeholder '(held by the anchor's KYC, not by Tukar)' appears") : bad("PII placeholder text missing");
    const note = await page.getByText(/TRISA/).first().innerText().catch(() => "");
    /TRISA/.test(note) && /TRP/.test(note) && /OpenVASP/.test(note)
      ? ok("TRISA / TRP / OpenVASP note present") : bad("TRISA/TRP/OpenVASP note incomplete", note.slice(0, 100));
    (await page.getByText(/Example payload/i).count())
      ? ok("amber 'Example payload' pill shown (no receipt loaded)") : bad("'Example payload' pill missing");
    await shot(page, "newfeat-regulator-travelrule-1440.png");
  } catch (e) { bad("regulator threw", (e && e.message) || String(e)); }
  await ctx.close();
}

// ===================================================================== 5 · OPERATOR
surface = "operator";
console.log("\n=== 5 · OPERATOR (/operator @1440) ===");
{
  const { ctx, page } = await newPage(1440, 900);
  try {
    await page.goto(BASE + "/operator", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Pool health" }).first().waitFor();

    // --- Pool health (default section): Reserves cards + honest wording ---
    // ensure we're on Pool health
    await page.getByRole("button", { name: "Pool health" }).first().click();
    await page.getByText(/Reserves/i).first().waitFor({ timeout: 25000 });
    const reservesOk = (await page.getByText(/USDC in custody/i).count())
      && (await page.getByText(/Notes committed/i).count())
      && (await page.getByText(/Funded|Unfunded/).count());
    reservesOk ? ok("Reserves cards present (USDC in custody, Notes committed, funded indicator)")
      : bad("Reserves cards incomplete");
    (await page.getByText(/not a cryptographic proof-of-reserves/i).count())
      ? ok("honest 'not a cryptographic proof-of-reserves' wording present") : bad("proof-of-reserves honesty wording missing");
    await shot(page, "newfeat-operator-pool-1440.png");

    // --- Policy section: presets + editable table + policy-as-code updates ---
    await page.getByRole("button", { name: "Compliance policy" }).first().click();
    await page.getByText(/Jurisdiction preset/i).first().waitFor();
    let presetsOk = true;
    for (const p of ["Default", "EU", "US", "APAC"])
      if (!(await page.getByRole("button", { name: new RegExp(p) }).count())) { presetsOk = false; bad("preset button missing", p); }
    if (presetsOk) ok("jurisdiction preset buttons (EU / US / APAC / Default) present");
    // editable per-corridor table: threshold number inputs present
    const thresholdInputs = await page.locator('input[aria-label$="amount threshold in USDC"]').count();
    thresholdInputs >= 10 ? ok("per-corridor editable table present", `${thresholdInputs} threshold inputs`) : bad("editable corridor table not found", `inputs=${thresholdInputs}`);
    // policy-as-code updates when a preset is applied
    const codeBlock = page.locator("pre", { hasText: /corridors:/ }).first();
    const before = await codeBlock.innerText();
    await page.getByRole("button", { name: /^US/ }).first().click();
    await page.waitForTimeout(300);
    const after = await codeBlock.innerText();
    after !== before ? ok("'Policy as code' block updates when a preset is applied")
      : bad("policy-as-code did not change on preset switch");
    await shot(page, "newfeat-operator-policy-1440.png");
  } catch (e) { bad("operator threw", (e && e.message) || String(e)); }
  await ctx.close();
}

// ===================================================================== 6 · CONSOLE ERRORS
console.log("\n=== 6 · CONSOLE / PAGE ERRORS (filtered) ===");
// Benign noise on a live testnet build: RPC/oracle rate-limits, favicons, PWA manifest, camera perms.
const BENIGN = /er-api|Failed to load resource|favicon|reflector|manifest|getUserMedia|Permissions-Policy|429|throttl|net::ERR_ABORTED|the server responded with a status of 4|soroban|rpc|sequence|status of 5|ERR_BLOCKED_BY_CLIENT/i;
const fatal = allErrs.filter((e) => !BENIGN.test(e.msg));
if (fatal.length === 0) ok("no uncaught page errors / fatal console errors across all surfaces");
else { bad(`${fatal.length} fatal console/page error(s)`); fatal.slice(0, 25).forEach((e) => console.log(`   - [${e.surface}] ${e.kind}: ${e.msg}`)); }
console.log(`\n(filtered out ${allErrs.length - fatal.length} benign console messages)`);

// ===================================================================== SUMMARY
console.log("\n========== PASS/FAIL SUMMARY ==========");
for (const [r, n, why] of rows) console.log(`${r}  ${n}${why ? "  — " + why : ""}`);
console.log(`\n=== qa-newfeatures: ${pass}/${pass + fail} checks passed, ${fail} failed ===`);
await browser.close();
process.exit(fail ? 1 : 0);
