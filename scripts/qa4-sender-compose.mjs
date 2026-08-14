// QA4 SENDER — compose: amount field, 10 corridors + live "they receive" source,
// recipient, payment-request load/garbage/clear, WRONG-PATH amounts. No on-chain writes.
import { chromium } from "playwright-core";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://localhost:3000";
const SHOTS = "scripts/qa-shots";
let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log("  PASS " + n); };
const bad = (n, e) => { fail++; console.log("  FAIL " + n + (e ? " :: " + e : "")); };

// craft a valid tukreq1: (public payload, no secrets) — addr matches ^G[A-Z2-7]{55}$
const ADDR = "G" + "A".repeat(55);
const b64 = (s) => Buffer.from(s, "utf8").toString("base64");
const REQ = "tukreq1:" + b64(JSON.stringify({ v: 1, kind: "req", amount: "75.5", memo: "to GAAA..AAAA", addr: ADDR }));

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const errs = [];
function wire(page) {
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errs.push("console.error: " + m.text().slice(0, 200)); });
  page.on("response", (r) => { if (r.status() === 404) errs.push("404: " + r.url()); });
  page.setDefaultTimeout(20000);
}
async function newPage(w = 1440, h = 900) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, permissions: ["clipboard-read", "clipboard-write"] });
  const page = await ctx.newPage(); wire(page);
  return { ctx, page };
}
const receiveEl = (page) => page.locator(".text-green-t").first();
const rateNoteEl = (page) => page.getByText(/via Reflector oracle|· live|· at the edge/).first();

// ============ AMOUNT FIELD reads as a field ============
console.log("\n=== COMPOSE · amount field + corridors ===");
{
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/sender", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000); // live FX (Reflector on-chain + fx-api) settles ~4-5s after boot

  const amt = page.locator("#amount");
  const hasLabel = (await page.locator('label[for="amount"]').count()) > 0;
  const ariaLabel = await amt.getAttribute("aria-label");
  const type = await amt.getAttribute("type");
  (hasLabel && ariaLabel && type === "number")
    ? ok(`amount input is a labeled field (label 'You send' + aria-label='${ariaLabel}', type=number)`) : bad("amount field labeling", `label=${hasLabel} aria=${ariaLabel} type=${type}`);

  // type a valid amount, confirm receive figure is present + numeric
  await amt.fill("200");
  await page.waitForTimeout(400);
  const r0 = (await receiveEl(page).innerText()).trim();
  /\d/.test(r0) ? ok(`receive figure renders for $200 (${r0})`) : bad("receive figure missing", r0);

  // ---- switch ALL 10 corridors; confirm receive updates + source note present ----
  const CODES = ["MX", "BR", "AR", "PH", "ID", "VN", "TH", "IN", "NG", "CO"];
  const seen = [];
  let updates = 0, prev = r0;
  for (const c of CODES) {
    await page.locator("#corridor").selectOption(c);
    await page.waitForTimeout(250);
    const recv = (await receiveEl(page).innerText()).trim();
    const note = (await rateNoteEl(page).innerText().catch(() => "")).trim();
    const src = /Reflector/.test(note) ? "reflector" : /· live/.test(note) ? "fx-api" : "edge";
    seen.push(`${c}:${recv} [${src}]`);
    if (recv !== prev) updates++;
    prev = recv;
  }
  console.log("    corridors: " + seen.join("  |  "));
  updates >= 8 ? ok(`receive figure updates across corridors (${updates}/10 distinct transitions)`) : bad("receive not updating per corridor", `${updates} transitions`);

  // live FX source — poll (all-or-nothing setFx gated behind slowest Reflector read; ~4-8s, network-variable)
  await page.locator("#corridor").selectOption("MX");
  let liveSec = null, refl = false, fxapi = false;
  const t0 = Date.now();
  for (let i = 0; i < 20; i++) {
    const note = (await rateNoteEl(page).innerText().catch(() => "")).trim();
    if (/Reflector/.test(note)) refl = true;
    // check a fx-api-only corridor too
    await page.locator("#corridor").selectOption("PH"); await page.waitForTimeout(120);
    const phn = (await rateNoteEl(page).innerText().catch(() => "")).trim();
    if (/· live/.test(phn)) fxapi = true;
    await page.locator("#corridor").selectOption("MX"); await page.waitForTimeout(120);
    if (refl || fxapi) { liveSec = ((Date.now() - t0) / 1000).toFixed(1); break; }
    await page.waitForTimeout(700);
  }
  (refl || fxapi)
    ? ok(`live FX source surfaces (Reflector on-chain=${refl}, fx-api=${fxapi}) after ~${liveSec}s`)
    : bad("live FX source never surfaced within ~15s (stuck on static 'at the edge')");

  // recipient field editable + labeled
  await page.locator("#corridor").selectOption("MX");
  const rec = page.locator("#recipient");
  const recLabel = (await page.locator('label[for="recipient"]').count()) > 0;
  await rec.fill("Test Payee");
  ((await rec.inputValue()) === "Test Payee" && recLabel) ? ok("recipient is a labeled, editable field") : bad("recipient field", `label=${recLabel}`);
  // corridor change updates default recipient (when not editing a request)
  await page.locator("#corridor").selectOption("BR");
  await page.waitForTimeout(200);
  (await rec.inputValue()).includes("João") ? ok("changing corridor updates the default recipient") : bad("recipient not updated on corridor change", await rec.inputValue());

  await page.screenshot({ path: `${SHOTS}/qa4-compose-desktop.png` });
  await ctx.close();
}

// ============ PAYMENT REQUEST load / garbage / clear ============
console.log("\n=== COMPOSE · load payment request (tukreq1:) ===");
{
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/sender", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);

  // valid: prefills amount + payee and locks
  await page.locator("#req").fill(REQ);
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await page.waitForTimeout(400);
  const amtVal = await page.locator("#amount").inputValue();
  const amtRO = await page.locator("#amount").getAttribute("readonly");
  const recRO = await page.locator("#recipient").getAttribute("readonly");
  const fulfil = await page.getByText(/Fulfilling a payment request/i).isVisible().catch(() => false);
  (amtVal === "75.5" && amtRO !== null && recRO !== null && fulfil)
    ? ok("valid tukreq1: prefills amount=75.5 + payee, locks amount & recipient (readOnly)")
    : bad("request load did not prefill/lock", `amt=${amtVal} amtRO=${amtRO} recRO=${recRO} panel=${fulfil}`);
  const status = await page.getByRole("status").innerText().catch(() => "");
  /Loaded a request for 75.5/.test(status) ? ok("honest load confirmation status shown") : bad("no load status", status);

  // Clear restores (unlocks fields, shows the load box again)
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await page.waitForTimeout(300);
  const amtRO2 = await page.locator("#amount").getAttribute("readonly");
  const loadBoxBack = (await page.locator("#req").count()) > 0;
  (amtRO2 === null && loadBoxBack) ? ok("Clear restores: fields unlocked + load box returns") : bad("Clear did not restore", `amtRO=${amtRO2} loadBox=${loadBoxBack}`);

  // garbage → honest rejection, no crash
  await page.locator("#req").fill("tukreq1:this-is-not-valid-@@@");
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await page.waitForTimeout(300);
  const gs = await page.getByRole("status").innerText().catch(() => "");
  /Couldn't load that request/i.test(gs) ? ok("garbage request → honest rejection (no crash)") : bad("garbage not rejected honestly", gs);
  const stillCompose = await page.locator("#amount").isVisible();
  stillCompose ? ok("app stays on compose after bad request (no crash)") : bad("compose disappeared after bad request");

  // Load button disabled when input empty
  await page.locator("#req").fill("");
  (await page.getByRole("button", { name: "Load", exact: true }).isDisabled()) ? ok("Load disabled when request input empty") : bad("Load not disabled on empty input");

  await ctx.close();
}

// ============ WRONG PATH amounts ============
console.log("\n=== COMPOSE · wrong-path amounts (Continue gating) ===");
{
  const { ctx, page } = await newPage();
  await page.goto(BASE + "/sender", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  const cont = page.getByRole("button", { name: /Continue/ });
  const amt = page.locator("#amount");

  async function probe(val, label, expectEnabled) {
    await amt.fill("");
    try {
      await amt.fill(String(val));
    } catch (e) {
      // type=number natively refuses non-numeric text — that IS the honest guard.
      const disabled = await cont.isDisabled();
      return disabled
        ? ok(`${label} → browser refuses non-numeric entry (native type=number guard); Continue DISABLED`)
        : bad(`${label} → non-numeric refused but Continue ENABLED`);
    }
    await page.waitForTimeout(200);
    const iv = await amt.inputValue();
    const disabled = await cont.isDisabled();
    const title = await cont.getAttribute("title");
    const hint = await page.getByText(/Enter an amount greater than 0 to continue/).isVisible().catch(() => false);
    const enabled = !disabled;
    const crashed = !(await amt.isVisible());
    if (crashed) return bad(`${label}: crashed`);
    if (expectEnabled === enabled) {
      const reason = disabled ? ` (title="${title}", hint=${hint})` : "";
      ok(`${label} (input='${iv}') → Continue ${enabled ? "ENABLED" : "DISABLED"}${reason}`);
    } else {
      bad(`${label} (input='${iv}') → Continue ${enabled ? "ENABLED" : "DISABLED"}, expected ${expectEnabled ? "ENABLED" : "DISABLED"}`);
    }
  }
  await probe("0", "amount 0", false);
  await probe("", "empty", false);
  await probe("-5", "negative -5", false);
  await probe("abc", "non-numeric 'abc'", false);
  await probe("1e5", "scientific 1e5 (=100000, valid)", true);
  await probe("1e9", "1e9 (=1,000,000,000, valid at compose; cap enforced at send)", true);
  await probe("200", "valid 200", true);

  // disabled Continue shows a reason
  await amt.fill(""); await amt.fill("0");
  await page.waitForTimeout(150);
  const t = await cont.getAttribute("title");
  t ? ok(`disabled Continue exposes a reason (title="${t}")`) : bad("disabled Continue has no title/hint");

  await ctx.close();
}

console.log("\n=== ERRORS (filtered) ===");
const note = errs.filter((e) => !/er-api|Failed to load resource|favicon|reflector|manifest|getUserMedia|Permissions-Policy|open\.er-api/i.test(e));
console.log(note.length ? note.slice(0, 30).map((e) => "  - " + e).join("\n") : "  none");
console.log("\n=== raw error sample (first 8) ===");
console.log(errs.slice(0, 8).map((e) => "  ~ " + e).join("\n") || "  none");
console.log(`\n=== qa4-compose: ${pass}/${pass + fail} checks passed ===`);
await browser.close();
