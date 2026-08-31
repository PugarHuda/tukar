import { test, expect, Page, Locator } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { createRequire } from "node:module";
import { goto200, watchNoise } from "./_helpers";

// FEATURES added 2026-08-27..29, exercised end to end on the live site as a person would:
// claim links (+PIN), /verify#r= receipt links, view-only notes, the compliance export pack,
// the sender cost card, sent notes + refund affordance, operator monitoring, the TRP lifecycle,
// the multi-wallet picker, the printable receipt, reduced motion + keyboard, axe after
// interaction, and the deck. Expectations are read from the components (file:line noted).
//
// ONE real deposit (test "live deposit") spends the shared testnet key; its outputs are written
// to test-results/features-live.json and reused by every later test. Tests that can run without
// chain state build their own self-consistent notes (Poseidon via webapp's circomlibjs) so the
// suite still reports honestly when the deposit is skipped (SKIP_DEPOSIT=1) or fails.

const POOL = "CBIYQACYOKDBPYDGU7DMSHPGJEWP2ZRETXDVOTC5HTU5RJBGDK2MHTWJ"; // lib/constants.ts:15
const LIVE_FILE = path.resolve(process.cwd(), "test-results", "features-live.json");
const SENT_KEY = `tukar:sent:${POOL}`; // components/sender/SentNotes.tsx:40
const PIN = "246810";
type Live = { bearer: string; claimLink: string; pin: string; viewNote: string; ref: string; commitment: string; depHash: string; regOk: boolean; note: NoteFields };
type NoteFields = { amount: string; privKey: string; pubKey: string; blinding: string; commitment: string };
// The live outputs belong to the chromium project, which is the only one that performs the deposit.
// Other projects run alongside it, so reading the file there would be a race: present or absent
// depending on who got there first, and stale from an earlier run when chromium is not in the
// selection at all. They read null and take the chainless fallbacks, which is deterministic.
const readLive = (): Live | null => {
  if (test.info().project.name !== "chromium") return null;
  try {
    return JSON.parse(fs.readFileSync(LIVE_FILE, "utf8"));
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------- crypto helpers (Node side)
const b64url = (u: Uint8Array) => Buffer.from(u).toString("base64url");
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64");
const bearerOf = (n: NoteFields, ref: string, corridor = "MX") => "tukar1:" + b64({ v: 1, ref, ...n, corridor }); // lib/zk.ts:153
const viewNoteOf = (n: NoteFields, corridor = "MX", depositTx?: string) =>
  "tukview1:" + Buffer.from(JSON.stringify({ v: 1, commitment: n.commitment, amount: n.amount, pubKey: n.pubKey, blinding: n.blinding, corridor, ...(depositTx ? { depositTx } : {}) })).toString("base64url"); // lib/view-note.ts:36

// Same construction as lib/claim-link.ts:31 (PBKDF2-SHA256 200k -> AES-GCM), on Node's WebCrypto.
async function encodeClaimPayload(note: string, pin?: string): Promise<string> {
  const bytes = new TextEncoder().encode(note);
  if (!pin) return `v1.${b64url(bytes)}`;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const raw = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 200_000 }, raw, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, bytes));
  return `v1.${b64url(salt)}.${b64url(iv)}.${b64url(ct)}`;
}

// A self-consistent note (commitment = Poseidon(amount, pubKey, blinding), lib/zk.ts:141) that was
// never deposited: proofs about it verify, but nothing binds it to the pool.
let poseidonP: Promise<any> | null = null;
async function mkNote(amountStroops: bigint): Promise<NoteFields> {
  if (!poseidonP) {
    const req = createRequire(path.resolve(process.cwd(), "webapp", "package.json"));
    poseidonP = req("circomlibjs").buildPoseidon();
  }
  const poseidon = await poseidonP;
  const F = poseidon.F;
  const rnd = () => BigInt("0x" + Buffer.from(crypto.getRandomValues(new Uint8Array(31))).toString("hex"));
  const privKey = rnd();
  const pubKey = F.toObject(poseidon([privKey])) as bigint;
  const blinding = rnd();
  const commitment = F.toObject(poseidon([amountStroops, pubKey, blinding])) as bigint;
  return { amount: amountStroops.toString(), privKey: privKey.toString(), pubKey: pubKey.toString(), blinding: blinding.toString(), commitment: commitment.toString() };
}
const decodeReceiptLink = (link: string) => JSON.parse(zlib.inflateRawSync(Buffer.from(link.split("#r=")[1], "base64url")).toString()); // lib/receipt-link.ts:88

// RFC 4180 reader (CRLF rows, quoted fields with doubled quotes) so escaping is checked by round-trip.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else q = false;
      } else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\r" && text[i + 1] === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// ---------------------------------------------------------------- page helpers (same idioms as exhaustive.spec)
const BENIGN_CRASH = /Loading chunk \d+ failed|ChunkLoadError|error loading dynamically imported module/i;
async function watchCrashes(page: Page) {
  const noise = watchNoise(page);
  const rejections: string[] = [];
  await page.addInitScript(() => {
    (window as any).__cspv = [];
    window.addEventListener("securitypolicyviolation", (e: SecurityPolicyViolationEvent) => (window as any).__cspv.push(`${e.violatedDirective} blocked ${e.blockedURI}`));
    window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
      const r: any = e.reason;
      console.error("UNHANDLED_REJECTION: " + ((r && r.message) || String(r)));
    });
  });
  page.on("console", (m) => { if (m.type() === "error" && m.text().includes("UNHANDLED_REJECTION")) rejections.push(m.text()); });
  return {
    ...noise,
    crashes: () => [...noise.pageErrors, ...rejections].filter((e) => !BENIGN_CRASH.test(e)),
    csp: () => page.evaluate(() => (window as any).__cspv as string[]),
  };
}
async function senderReady(page: Page): Promise<Locator> {
  const amount = page.locator("#amount");
  await expect(amount).toBeVisible();
  const cont = page.getByRole("button", { name: /Continue/ });
  await expect(async () => {
    await amount.fill("0");
    await amount.fill("");
    await expect(cont).toBeDisabled({ timeout: 1500 });
  }).toPass({ timeout: 40_000 });
  return amount;
}
async function fillStable(loc: Locator, v: string) {
  await expect(async () => {
    await loc.fill(v);
    await loc.page().waitForTimeout(150);
    await expect(loc).toHaveValue(v, { timeout: 500 });
  }).toPass({ timeout: 30_000 });
}
async function connectDemo(page: Page) {
  await expect(async () => {
    await page.getByRole("button", { name: /Use testnet key/ }).first().click();
    await expect(page.getByRole("button", { name: /^Disconnect$/ })).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
}
async function selectNav(page: Page, label: RegExp) {
  const btn = page.locator("aside nav button", { hasText: label }).first();
  await expect(async () => {
    await btn.click();
    await expect(btn).toHaveAttribute("aria-current", "page", { timeout: 1500 });
  }).toPass({ timeout: 30_000 });
}
async function openReceiverTab(page: Page, name: RegExp, marker: Locator) {
  await expect(async () => {
    await page.getByRole("tab", { name }).click();
    await expect(marker).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 30_000 });
}
const toast = (page: Page) => page.getByRole("region", { name: "Notifications" });
async function axeClean(page: Page, label: string, testInfo: any) {
  const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const lines = res.violations.map((v) => `  [${v.impact}] ${v.id}: ${v.help} (x${v.nodes.length}) ${v.nodes[0]?.target?.join(" ") || ""}`).join("\n");
  if (lines) await testInfo.attach(`axe-${label.replace(/\W+/g, "_")}.txt`, { body: lines, contentType: "text/plain" });
  return res.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${label}: ${v.id} x${v.nodes.length}`);
}
// Claim a bearer note through the Claim tab and land on Payments.
async function claimNote(page: Page, bearer: string, refRe: RegExp) {
  await openReceiverTab(page, /^Claim$/, page.getByPlaceholder("tukar1:…"));
  await fillStable(page.getByPlaceholder("tukar1:…"), bearer);
  await page.getByRole("button", { name: "Claim payment" }).click();
  await expect(page.getByText(refRe)).toBeVisible();
}
// Run an exact disclosure on the first payment card and return the /verify#r= link from the printed receipt.
async function produceReceipt(page: Page): Promise<string> {
  await page.getByText("Prove to a regulator").first().click();
  await expect(page.getByRole("button", { name: "Generate proof" })).toBeVisible();
  await page.getByRole("button", { name: "Generate proof" }).click();
  // PaymentCard.tsx:1054: the receipt strip renders once the proof verified in-browser (+ on-chain).
  await expect(page.getByText("Payment receipt", { exact: true })).toBeVisible({ timeout: 180_000 });
  const dd = page.locator(".tk-print dd", { hasText: /\/verify#r=/ });
  await expect(dd).toBeVisible({ timeout: 30_000 });
  return (await dd.innerText()).trim();
}

// ================================================================ 0. ONE real deposit
test.describe("live deposit (one real send, outputs reused below)", () => {
  test("sender: $1 with a claim-link PIN → bearer note, PIN-wrapped claim link, view-only note, sent record", async ({ page, context, browserName }) => {
    test.skip(!!process.env.SKIP_DEPOSIT, "SKIP_DEPOSIT=1: chainless fallbacks only");
    // Chromium only, for two reasons. This spends real testnet USDC, and the describe block promises
    // ONE deposit per run, not one per browser project. And all four projects share this single
    // LIVE_FILE, so running it everywhere would have them unlink and overwrite each other's outputs
    // mid-read. The other projects fall back to the self-consistent notes built below, which is what
    // the header comment describes. clipboard-read is also a chromium-only permission in Playwright.
    test.skip(browserName !== "chromium", "one real deposit per run; other projects use the chainless fallbacks");
    test.setTimeout(480_000);
    try { fs.unlinkSync(LIVE_FILE); } catch {}
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const w = await watchCrashes(page);
    await goto200(page, "/sender");
    const amount = await senderReady(page);
    await connectDemo(page);
    await fillStable(amount, "1");
    await page.getByRole("button", { name: /Continue/ }).click();
    await expect(page.getByText(/Confirm and send/)).toBeVisible();
    // app/sender/page.tsx:1001-1011: optional 6-digit PIN, digits only
    const pinBox = page.locator("#claim-pin");
    await pinBox.fill("2a4b6c8d1e0f");
    await expect(pinBox).toHaveValue(PIN);
    await page.getByRole("button", { name: /^Send \$1/ }).click();
    const heading = page.getByRole("heading", { name: /Sent and shielded|Deposited, registration pending/ });
    await expect(heading).toBeVisible({ timeout: 420_000 });
    const regOk = /Sent and shielded/.test((await heading.textContent()) || "");
    // success screen: bearer string (page.tsx:1181), PIN-wrapped copy (page.tsx:1219), view-only export (page.tsx:1226)
    const bearer = (await page.locator("pre", { hasText: /^tukar1:/ }).innerText()).trim();
    await expect(page.getByText(/The link is PIN-wrapped: the recipient needs the 6-digit PIN you set/)).toBeVisible();
    await page.getByRole("button", { name: "Copy claim link (PIN-wrapped)" }).click();
    await expect(toast(page)).toContainText("Claim link copied");
    const claimLink = await page.evaluate(() => navigator.clipboard.readText());
    // lib/claim-link.ts:9 wrapped shape, on the page's own origin (http when QA_BASE is local).
    expect(claimLink).toMatch(/^https?:\/\/[^/]+\/receiver#claim=v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(claimLink.startsWith(new URL(page.url()).origin + "/receiver#claim=")).toBe(true);
    await page.getByRole("button", { name: "Export view-only note" }).click();
    await expect(toast(page)).toContainText("View-only note copied");
    const viewNote = await page.evaluate(() => navigator.clipboard.readText());
    expect(viewNote).toMatch(/^tukview1:/);
    expect(viewNote).not.toContain("privKey");
    const sent = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "[]")[0], SENT_KEY);
    expect(sent.commitment).toMatch(/^\d+$/);
    expect(sent.depHash).toMatch(/^[0-9a-f]{64}$/);
    const note: NoteFields = { amount: sent.amount, privKey: sent.privKey, pubKey: sent.pubKey, blinding: sent.blinding, commitment: sent.commitment };
    const live: Live = { bearer, claimLink, pin: PIN, viewNote, ref: sent.ref, commitment: sent.commitment, depHash: sent.depHash, regOk, note };
    fs.mkdirSync(path.dirname(LIVE_FILE), { recursive: true });
    fs.writeFileSync(LIVE_FILE, JSON.stringify(live, null, 2));
    console.log(`LIVE deposit ${sent.ref} tx ${sent.depHash} regOk=${regOk}`);
    expect(w.crashes()).toEqual([]);
  });
});

// ================================================================ (a) claim links
test.describe("claim links (/receiver#claim=)", () => {
  test("plain link: Claim tab opens, note is claimed, bearer payload dropped from the address bar", async ({ page }) => {
    const w = await watchCrashes(page);
    const n = await mkNote(50_000_000n);
    const payload = await encodeClaimPayload(bearerOf(n, "PAY-LINK"));
    await goto200(page, `/receiver#claim=${payload}`);
    // receiver/page.tsx:202-225: setTab("claim"), openClaimPayload -> claim(note); dropHash()
    await expect(page.getByText(/Claimed PAY-LINK\./)).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/receiver$/);
    await expect(page.getByRole("tab", { name: /Payments \(1\)/ })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("PAY-LINK").first()).toBeVisible();
    // survives a reload: the hash is gone, the payment persisted (no double claim)
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("tab", { name: /Payments \(1\)/ })).toBeVisible({ timeout: 20_000 });
    expect(w.crashes()).toEqual([]);
  });

  test("PIN-wrapped link: PIN prompt, empty/short/wrong PIN errors, Cancel, correct PIN unlocks and claims", async ({ page }) => {
    // Two full PBKDF2 derivations at 200k iterations (the wrong PIN, then the right one). That cost
    // is deliberate, it is what makes a 6-digit PIN worth wrapping with, and on one device it is
    // about a second. With four browser workers competing for this machine's CPU it can pass 30s,
    // which is a property of the test runner and not of the app, so this test gets more room.
    test.slow();
    const w = await watchCrashes(page);
    const n = await mkNote(75_000_000n);
    const payload = await encodeClaimPayload(bearerOf(n, "PAY-PIN"), "135790");
    await goto200(page, `/receiver#claim=${payload}`);
    await expect(page.getByText("PIN-protected claim link")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Enter the 6-digit PIN the sender gave you to unlock it in your browser\. Nothing is sent anywhere\./)).toBeVisible();
    await expect(page).toHaveURL(/#claim=v1\./); // hash kept until unlocked (page.tsx:214-216)
    const pin = page.locator("#claimPin");
    const unlock = page.getByRole("button", { name: "Unlock" });
    await unlock.click();
    await expect(page.getByText("Enter the 6 digits the sender gave you.")).toBeVisible(); // page.tsx:230
    await pin.fill("12345");
    await unlock.click();
    await expect(page.getByText("Enter the 6 digits the sender gave you.")).toBeVisible();
    await pin.fill("ab12cd34ef56");
    await expect(pin).toHaveValue("123456"); // digits only, capped at 6 in the change handler (lib/claim-link.ts normalizePin)
    await unlock.click();
    await expect(page.getByText("Wrong PIN. Check the 6 digits and try again.")).toBeVisible({ timeout: 90_000 }); // claim-link.ts:70, PBKDF2 200k
    await expect(page.getByRole("tab", { name: /Payments \(\d+\)/ })).toHaveCount(0);
    // Cancel hides the form; reload brings it back (hash still there)
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText("PIN-protected claim link")).toHaveCount(0);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByText("PIN-protected claim link")).toBeVisible({ timeout: 30_000 });
    await page.locator("#claimPin").fill("135790");
    await page.locator("#claimPin").press("Enter"); // form submit
    await expect(page.getByText(/Claimed PAY-PIN\./)).toBeVisible({ timeout: 90_000 }); // PBKDF2 200k
    await expect(page).toHaveURL(/\/receiver$/);
    await expect(page.getByRole("tab", { name: /Payments \(1\)/ })).toHaveAttribute("aria-selected", "true");
    expect(w.crashes()).toEqual([]);
  });

  test("malformed links fail honestly: wrong version, junk base64url, oversized, non-note payload", async ({ page }) => {
    const w = await watchCrashes(page);
    const cases: [string, RegExp][] = [
      ["v2.abc", /Couldn't read that claim link: malformed claim link/], // claim-link.ts:47
      ["v1.", /Couldn't read that claim link: malformed claim link/],
      ["v1.!!!", /Couldn't read that claim link: not base64url/], // receipt-link.ts:24 via openClaimPayload
      ["v1." + b64url(new TextEncoder().encode("not a note")), /Couldn't read that claim link: malformed claim link/], // claim-link.ts:73
      ["v1." + "A".repeat(9000), /Couldn't read that claim link: claim link too large/], // claim-link.ts:48
    ];
    for (const [payload, msg] of cases) {
      await page.goto(`/receiver#claim=${payload}`, { waitUntil: "domcontentloaded" });
      await expect(page.getByText(msg), payload.slice(0, 20)).toBeVisible({ timeout: 30_000 });
      await expect(page).toHaveURL(/\/receiver$/);
      await expect(page.getByPlaceholder("tukar1:…")).toBeVisible(); // Claim tab selected, page alive
    }
    expect(w.crashes()).toEqual([]);
  });

  test("the sender's real PIN-wrapped link: correct PIN claims the deposited note; status reads from chain", async ({ page }) => {
    const live = readLive();
    test.skip(!live, "no live deposit outputs (deposit skipped or failed)");
    const w = await watchCrashes(page);
    await page.goto(live!.claimLink, { waitUntil: "domcontentloaded" });
    await expect(page.getByText("PIN-protected claim link")).toBeVisible({ timeout: 30_000 });
    await page.locator("#claimPin").fill(live!.pin);
    await page.getByRole("button", { name: "Unlock" }).click();
    await expect(page.getByText(new RegExp(`Claimed ${live!.ref}\\.`))).toBeVisible({ timeout: 90_000 }); // PBKDF2 200k
    await expect(page.getByText(live!.ref).first()).toBeVisible();
    // Check status on the same note: registered -> spendable; deposit-only -> unregistered (never "unknown")
    await openReceiverTab(page, /^Claim$/, page.getByPlaceholder("tukar1:…"));
    await fillStable(page.getByPlaceholder("tukar1:…"), live!.bearer);
    await page.getByRole("button", { name: /Check status/ }).click();
    await expect(page.getByText("Note status")).toBeVisible({ timeout: 40_000 });
    await expect(page.getByText(live!.regOk ? "spendable" : "unregistered", { exact: true })).toBeVisible();
    expect(w.crashes()).toEqual([]);
  });
});

// ================================================================ (b) + (j) receipt links and the printable receipt
test.describe("receipt links (/verify#r=) and print", () => {
  test("receiver produces a receipt; its link opens /verify prefilled and re-verifies; print shows only the receipt", async ({ page }) => {
    test.setTimeout(400_000);
    const live = readLive();
    const w = await watchCrashes(page);
    await goto200(page, "/receiver");
    let bearer: string;
    let ref: RegExp;
    if (live) { bearer = live.bearer; ref = new RegExp(`Claimed ${live.ref}\\.`); }
    else { bearer = bearerOf(await mkNote(30_000_000n), "PAY-RCPT"); ref = /Claimed PAY-RCPT\./; }
    await claimNote(page, bearer, ref);
    const link = await produceReceipt(page);
    // receipt-link.ts:109 builds `${location.origin}/verify#r=<base64url>`, so the scheme and host
    // are whatever the page is served from (http on a local run, https deployed): assert the shape
    // against the page's OWN origin, plus the exact base64url alphabet toBase64Url emits.
    const u = new URL(link);
    expect(u.origin).toBe(new URL(page.url()).origin);
    expect(u.pathname).toBe("/verify");
    expect(u.hash).toMatch(/^#r=[A-Za-z0-9_-]+$/); // receipt-link.ts:24 (+/ mapped to -_, padding stripped)
    const receipt = decodeReceiptLink(link);
    expect(receipt.kind).toBe("tukar-audit-receipt");
    expect(receipt.type).toBe("exact");
    expect(receipt.disclosedAmountUsdc).toBe(live ? "1" : "3"); // fmtUsdc trims zeros (zk.ts:86)
    await expect(page.getByText(/The link carries the whole receipt after the # in the URL, so it is never sent to a server/)).toBeVisible();

    // (j) print: globals.css:186-217 hides everything but .tk-print
    await page.emulateMedia({ media: "print" });
    const vis = await page.evaluate(() => ({
      header: getComputedStyle(document.querySelector("header")!).visibility,
      tabs: getComputedStyle(document.querySelector("[role=tablist]")!).visibility,
      receipt: getComputedStyle(document.querySelector(".tk-print")!).visibility,
      receiptText: getComputedStyle(document.querySelector(".tk-print dd")!).visibility,
      printBtn: getComputedStyle([...document.querySelectorAll(".tk-print button")].find((b) => b.textContent?.includes("Print receipt"))!.parentElement!).display, // print:hidden on the row
    }));
    expect(vis).toEqual({ header: "hidden", tabs: "hidden", receipt: "visible", receiptText: "visible", printBtn: "none" });
    await page.emulateMedia({ media: "screen" });
    await expect(page.getByRole("button", { name: "Print receipt" })).toBeVisible();

    // (b) open the link cold, as a third party would
    await page.goto(link, { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/Receipt loaded from a verification link/)).toBeVisible({ timeout: 30_000 }); // verify/page.tsx:170
    await expect(page.getByRole("textbox")).toHaveValue(/"kind": "tukar-audit-receipt"/);
    // the same server verdict the paste flow gives: bound for a real deposit, honestly UNBOUND for a never-deposited note
    const stamp = page.locator(".tk-stamp", { hasText: /Cleared|Unbound|Rejected/ });
    await expect(stamp).toBeVisible({ timeout: 90_000 });
    // .tk-stamp is `text-transform: uppercase` (globals.css:104), and innerText returns the RENDERED
    // text, so the word comes back upper-cased: compare case-insensitively.
    const word = (await stamp.innerText()).trim();
    if (live?.regOk) expect(word).toMatch(/^Cleared$/i);
    else if (!live) expect(word).toMatch(/^Unbound$/i);
    else expect(word).toMatch(/^(Cleared|Unbound)$/i);
    await expect(page.getByRole("img", { name: "passed" }).first()).toBeVisible(); // Groth16 proof valid
    await expect(page.getByText(/^exact$/i).first()).toBeVisible();
    expect(w.crashes()).toEqual([]);
  });

  test("malformed receipt links: corrupted payload, empty payload, oversized payload, valid deflate but not a receipt", async ({ page }) => {
    const w = await watchCrashes(page);
    const deflated = (o: unknown) => zlib.deflateRawSync(Buffer.from(JSON.stringify(o))).toString("base64url");
    const cases: [string, RegExp][] = [
      ["not-base64!!!", /This verification link could not be read: the link payload is corrupted or truncated\. Ask for the receipt JSON and paste it instead\./],
      ["", /This verification link could not be read: empty link payload/],
      ["A".repeat(17_000), /This verification link could not be read: link payload too large/],
      [deflated({ hello: "world" }), /This verification link could not be read: not a Tukar audit receipt/], // receipt-link.ts:64
      // Three signals so the per-type count check (receipt-link.ts:72) passes and the BROKEN PROOF is
      // what fails; with one signal the honest error is the count one, which is covered by the unit tests.
      [deflated({ kind: "tukar-audit-receipt", version: 1, type: "exact", publicSignals: ["1", "2", "3"], proof: {} }), /could not be read: malformed proof/],
    ];
    for (const [payload, msg] of cases) {
      await page.goto(`/verify#r=${payload}`, { waitUntil: "domcontentloaded" });
      await expect(page.getByText(msg), payload.slice(0, 20)).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText(/Receipt loaded from a verification link/)).toHaveCount(0);
      await expect(page.getByRole("heading", { name: /Verify a Tukar receipt/ })).toBeVisible();
    }
    expect(w.crashes()).toEqual([]);
  });
});

// ================================================================ (c) view-only notes on the regulator Verify tab
test.describe("regulator: view-only note import", () => {
  test("rejects a bearer note, junk, and an opening that does not reproduce its commitment", async ({ page }) => {
    const w = await watchCrashes(page);
    await goto200(page, "/regulator");
    await selectNav(page, /Verify disclosure/);
    const box = page.locator("#view-note");
    const btn = page.getByRole("button", { name: "Recompute commitment and look up on-chain" });
    await expect(btn).toBeDisabled();
    await expect(btn).toHaveAttribute("title", "Paste a view-only note first");
    const n = await mkNote(10_000_000n);
    for (const [input, msg] of [
      [bearerOf(n, "X"), /this is a spendable bearer note \(tukar1:\), not a view-only note; do not share it with a regulator/], // view-note.ts:47
      ["hello", /not a Tukar view-only note \(expected a tukview1: string\)/],
      ["tukview1:!!!", /malformed view-only note/],
      ["tukview1:" + Buffer.from(JSON.stringify({ v: 1, commitment: "4", amount: n.amount, pubKey: n.pubKey, blinding: n.blinding, corridor: "MX", privKey: "1" })).toString("base64url"), /this string carries a private key; a view-only note must not/],
      ["tukview1:" + Buffer.from(JSON.stringify({ v: 1, commitment: "4", amount: n.amount, pubKey: n.pubKey, blinding: n.blinding, corridor: "mx" })).toString("base64url"), /malformed or missing corridor code/],
      [viewNoteOf({ ...n, commitment: "4" }), /The opening does not reproduce the stated commitment \(recomputed 0x[0-9a-f]{8}…[0-9a-f]{2}, stated 0x4…4\)\. The note was altered or mis-copied\./], // ViewNoteCard.tsx:85
    ] as const) {
      await fillStable(box, input);
      await btn.click();
      await expect(page.getByText(msg)).toBeVisible({ timeout: 60_000 });
    }
    expect(w.crashes()).toEqual([]);
  });

  test("a valid opening that was never deposited: commitment reproduced, honestly 'Not a pool leaf', no proving offered", async ({ page }) => {
    test.slow();
    const w = await watchCrashes(page);
    await goto200(page, "/regulator");
    await selectNav(page, /Verify disclosure/);
    const n = await mkNote(1_234_500_000n);
    await fillStable(page.locator("#view-note"), viewNoteOf(n, "PH", "ab".repeat(32)));
    await page.getByRole("button", { name: "Recompute commitment and look up on-chain" }).click();
    await expect(page.getByText("Opening reproduces the commitment.")).toBeVisible({ timeout: 90_000 });
    await expect(page.locator("dd", { hasText: /^123\.45\s*USDC$/ })).toBeVisible(); // Contents, fmtUsdc
    await expect(page.getByText("Philippines (PHP)")).toBeVisible();
    await expect(page.getByText("not in the note, cannot spend")).toBeVisible();
    // ViewNoteCard.tsx:273-300: null = RPC failed (Leaf unconfirmed + Retry), -1 = Not a pool leaf
    const stamp = page.locator(".tk-stamp", { hasText: /Not a pool leaf|Leaf unconfirmed|On-chain deposit/ });
    await expect(stamp).toBeVisible({ timeout: 90_000 });
    // .tk-stamp uppercases its text in CSS (globals.css:104) and innerText is the rendered text, so
    // every comparison on the stamp word is case-insensitive (a case-sensitive one can never match).
    const word = (await stamp.innerText()).replace(/\s+/g, " ").trim();
    expect(word).not.toMatch(/On-chain deposit/i);
    if (/Not a pool leaf/i.test(word)) {
      await expect(page.getByText("This commitment is not a leaf in the pool. It is not an on-chain deposit, so no disclosure about it can be bound to real state.")).toBeVisible();
      await expect(page.getByRole("button", { name: "Prove and verify" })).toHaveCount(0);
    } else {
      await expect(page.getByText(/Could not read the pool leaves from the chain \(RPC error\)/)).toBeVisible();
      await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
    }
    expect(w.crashes()).toEqual([]);
  });

  test("the sender's exported view-only note: leaf found on-chain, then an exact proof verifies bound", async ({ page }) => {
    const live = readLive();
    test.skip(!live, "no live deposit outputs (deposit skipped or failed)");
    test.setTimeout(300_000);
    const w = await watchCrashes(page);
    await goto200(page, "/regulator");
    await selectNav(page, /Verify disclosure/);
    await fillStable(page.locator("#view-note"), live!.viewNote);
    await page.getByRole("button", { name: "Recompute commitment and look up on-chain" }).click();
    await expect(page.getByText("Opening reproduces the commitment.")).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText("Mexico (MXN)")).toBeVisible();
    await expect(page.getByText(live!.depHash.slice(0, 10) + "…")).toBeVisible(); // Deposit field, short()
    const stamp = page.locator(".tk-stamp", { hasText: /Not a pool leaf|Leaf unconfirmed|On-chain deposit/ });
    await expect(stamp).toBeVisible({ timeout: 90_000 });
    const word = (await stamp.innerText()).replace(/\s+/g, " ").trim(); // rendered uppercase, see above
    if (!live!.regOk) {
      expect(word).not.toMatch(/On-chain deposit/i);
      return;
    }
    expect(word).toMatch(/On-chain deposit/i);
    await expect(page.getByText(/On-chain deposit: leaf #\d+ of the pool/)).toBeVisible();
    await page.getByRole("button", { name: "Prove and verify" }).click();
    await expect(page.getByText("Verified in your browser and on Stellar.")).toBeVisible({ timeout: 240_000 }); // ViewNoteCard.tsx:188
    await expect(page.getByText("discloses $1 USDC", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "Download audit receipt (.json)" })).toBeVisible();
    await expect(page.getByText("Added to the compliance export pack on the Pool report tab.")).toBeVisible();
    // it landed in the export pack (regulator/page.tsx:98-100 -> ComplianceExportCard counts)
    await selectNav(page, /Pool report/);
    await expect(page.getByText("reading pool events from Stellar RPC…")).toHaveCount(0, { timeout: 90_000 });
    const disclosures = page.locator("dl").filter({ hasText: "Disclosures" }).locator("dd").nth(1);
    await expect(disclosures).toHaveText("1");
    expect(w.crashes()).toEqual([]);
  });
});

// ================================================================ (d) compliance export
test.describe("regulator: compliance export pack", () => {
  test("every preset downloads CSV + JSON; header block, RFC 4180 escaping and row counts agree between the two", async ({ page }, testInfo) => {
    test.slow();
    const w = await watchCrashes(page);
    await goto200(page, "/regulator");
    await expect(page.getByText("Compliance export pack")).toBeVisible();
    await expect(page.getByText("reading pool events from Stellar RPC…")).toHaveCount(0, { timeout: 120_000 });
    const rpcErr = page.getByText(/Could not read pool events from the RPC/);
    if (await rpcErr.isVisible()) {
      await page.getByRole("button", { name: "Retry" }).click();
      await expect(rpcErr).toHaveCount(0, { timeout: 120_000 });
    }
    const PRESETS = [
      { id: "ppatk-ltkl", label: "PPATK LTKL (Indonesia)", jurisdiction: "Indonesia", firstCol: "Tanggal transaksi (transaction date, UTC)", cols: 16 },
      { id: "eu-tfr", label: "EU TFR", jurisdiction: "European Union", firstCol: "Transfer date (UTC)", cols: 17 },
      { id: "bsp-php-50k", label: "BSP PHP 50,000 threshold (Philippines)", jurisdiction: "Philippines", firstCol: "Transaction date (UTC)", cols: 17 },
    ] as const; // lib/compliance-export.ts:119-197
    for (const p of PRESETS) {
      await page.locator("#ce-preset").selectOption(p.id);
      await expect(page.locator(".tk-stamp", { hasText: p.label })).toBeVisible();
      await expect(page.getByText(`Bundle · ${p.jurisdiction}`)).toBeVisible();
      if (p.id === "bsp-php-50k") await expect(page.getByText(/PHP threshold test at [\d.]+ PHP per USD|USD to PHP rate unavailable; the threshold column says so for every row\./)).toBeVisible({ timeout: 30_000 });
      const csvBtn = page.getByRole("button", { name: "Download CSV" });
      const jsonBtn = page.getByRole("button", { name: "Download JSON" });
      if (await csvBtn.isDisabled()) {
        // ComplianceExportCard.tsx:167: nothing in the window -> disabled + titled, never an empty file
        await expect(csvBtn).toHaveAttribute("title", "Nothing in the selected window");
        await expect(page.getByText("No pool events in the selected window.")).toBeVisible();
        console.log(`export ${p.id}: no rows in window (RPC retention), downloads disabled honestly`);
        continue;
      }
      const from = await page.locator("#ce-from").inputValue();
      const to = await page.locator("#ce-to").inputValue();
      const [dl] = await Promise.all([page.waitForEvent("download"), csvBtn.click()]);
      expect(dl.suggestedFilename()).toBe(`tukar-compliance-${p.id}-${from}-to-${to}.csv`);
      await expect(toast(page)).toContainText("CSV downloaded");
      const csv = fs.readFileSync((await dl.path())!, "utf8");
      const [dj] = await Promise.all([page.waitForEvent("download"), jsonBtn.click()]);
      expect(dj.suggestedFilename()).toBe(`tukar-compliance-${p.id}-${from}-to-${to}.json`);
      const report = JSON.parse(fs.readFileSync((await dj.path())!, "utf8"));
      await testInfo.attach(`${p.id}.csv`, { body: csv, contentType: "text/csv" });

      // ---- CSV shape (compliance-export.ts:380-387): key,value block, blank line, columns, rows, CRLF
      expect(csv.endsWith("\r\n")).toBe(true);
      expect(csv).not.toMatch(/[^\r]\n/); // every line break is CRLF
      const rows = parseCsv(csv);
      expect(rows[0]).toEqual(["key", "value"]);
      const blank = rows.findIndex((r, i) => i > 0 && r.length === 1 && r[0] === "");
      expect(blank).toBeGreaterThan(5);
      const headerCsv = Object.fromEntries(rows.slice(1, blank).map((r) => [r[0], r[1]]));
      // round-trip: every JSON header value survives the CSV (commas, quotes, null->"")
      for (const [k, v] of Object.entries(report.header)) expect(headerCsv[k], `header ${k}`).toBe(v == null ? "" : String(v));
      expect(headerCsv.report).toBe("Tukar compliance export pack");
      expect(headerCsv.preset).toBe(p.label);
      expect(headerCsv.jurisdiction).toBe(p.jurisdiction);
      expect(headerCsv.poolContract).toBe(POOL);
      expect(headerCsv.network).toBe("Test SDF Network ; September 2015");
      expect(headerCsv.piiNote).toContain('exported as "anchor-held"');
      expect(headerCsv["dataWindow.note"]).toMatch(/^Stellar RPC retains roughly 7 days/);
      expect(headerCsv["dataWindow.selectedFrom"]).toBe(from);
      expect(headerCsv["dataWindow.selectedTo"]).toBe(to);
      // raw escaping on real content: the quote-bearing piiNote and the comma-bearing preset/regulation are quoted + doubled
      expect(csv).toContain('""anchor-held""');
      if (p.id === "bsp-php-50k") expect(csv).toContain(`preset,"${p.label}"`);
      expect(csv).toMatch(/\r\nregulation,"[^\r\n]*,[^\r\n]*"\r\n/);
      // columns + rows
      const cols = rows[blank + 1];
      expect(cols).toEqual(report.columns.map((c: any) => c.label));
      expect(cols.length).toBe(p.cols);
      expect(cols[0]).toBe(p.firstCol);
      const dataRows = rows.slice(blank + 2).filter((r) => !(r.length === 1 && r[0] === ""));
      const expected = Number(report.header["counts.poolEvents"]) + Number(report.header["counts.disclosures"]) + Number(report.header["counts.auditRequests"]);
      expect(dataRows.length).toBe(expected);
      expect(report.rows.length).toBe(expected);
      expect(expected).toBeGreaterThan(0);
      for (let i = 0; i < dataRows.length; i++) {
        expect(dataRows[i].length, `row ${i} width`).toBe(cols.length);
        expect(dataRows[i]).toEqual(cols.map((c) => report.rows[i][c])); // CSV row == JSON row, in column order
      }
      // identity columns are the literal "anchor-held" on every pool-event row (Tukar holds no PII)
      const origIdx = cols.findIndex((c) => /Identitas pengirim|Originator name|Originator identity/.test(c));
      for (const r of dataRows.filter((r) => /^pool event: /.test(r[cols.findIndex((c) => /record type/i.test(c))]))) expect(r[origIdx]).toBe("anchor-held");
      // rows are sorted by date, all inside the window
      const dateIdx = 0;
      const ts = dataRows.map((r) => Date.parse(r[dateIdx]));
      expect(ts.every((t) => Number.isFinite(t))).toBe(true);
      expect([...ts].sort((a, b) => a - b)).toEqual(ts);
      expect(ts[0]).toBeGreaterThanOrEqual(Date.parse(from + "T00:00:00Z"));
      if (p.id === "bsp-php-50k") {
        expect(report.header["fx.thresholdPhp"]).toBe(50000);
        expect(["unavailable", "open.er-api.com (USD base)"]).toContain(report.header["fx.source"]);
        const thrIdx = cols.indexOf("PHP 50,000 threshold test");
        const ok = /^(below PHP 50,000|at or above PHP 50,000 \(originator and beneficiary information required\)|PHP rate unavailable|not testable from chain \(amount shielded\)|not applicable|)$/;
        for (const r of dataRows) expect(r[thrIdx], "threshold column").toMatch(ok);
      }
    }
    expect(w.crashes()).toEqual([]);
  });
});

// ================================================================ (e) sender cost card
test.describe("sender: cost and policy card", () => {
  test("MX: policy cap from the on-chain registry, benchmark resolves honestly, over-cap and over-benchmark copy", async ({ page }) => {
    const w = await watchCrashes(page);
    await goto200(page, "/sender");
    const amount = await senderReady(page);
    await fillStable(amount, "200");
    const card = page.locator("aside", { hasText: "Cost and policy" });
    await expect(card.getByText(/About 0\.0186 XLM\./)).toBeVisible(); // (94_002 + 91_599) / 1e7, CostCard.tsx:18
    await expect(card.getByText("0. There is no relayer today; you sign and pay the network fee yourself.")).toBeVisible();
    await expect(card.getByText("Reading the policy registry.")).toHaveCount(0, { timeout: 45_000 });
    const policy = card.getByText(/Cap \$[\d,]+ USDC, required disclosure: (exact|threshold|range|aggregate)\.|No policy set for MX|Policy registry unreadable right now\./);
    await expect(policy).toBeVisible();
    const policyText = await policy.innerText();
    expect(policyText, "MX has a policy in the registry").toMatch(/^Cap \$[\d,]+ USDC/);
    const cap = Number(policyText.match(/Cap \$([\d,]+)/)![1].replace(/,/g, ""));
    await expect(card.getByText("Fetching provider quotes.")).toHaveCount(0, { timeout: 45_000 });
    await expect(card.getByText(/Best of \d+ providers: .+ delivers \$[\d,.]+ MXN after a \$[\d.]+ fee.*Tukar quote: \$[\d,.]+ MXN \([+-][\d,.]+ vs .+\), before the cash-out provider's fee\.|Benchmark unavailable\.|no benchmark for MXN/)).toBeVisible();
    await expect(card.getByText(/Reflector on-chain oracle \(SEP-40\)|HTTP FX fallback\. Reflector's MXN feed is stale or unreadable right now\.|Static preview rate\./)).toBeVisible();
    // over the cap: CostCard.tsx:77
    await fillStable(amount, String(cap + 1));
    await expect(card.getByText(/This amount is above the cap\. The cap is enforced on the preview pool, not yet on the live pool\./)).toBeVisible();
    // over the benchmark bound: CostCard.tsx:92
    await fillStable(amount, "1000001");
    await expect(card.getByText("Benchmark needs an amount between 0 and 1,000,000 USD.")).toBeVisible();
    await fillStable(amount, "0");
    await expect(card.getByText("Benchmark needs an amount between 0 and 1,000,000 USD.")).toBeVisible();
    expect(w.crashes()).toEqual([]);
  });

  test("non-oracle corridor with the FX API blocked: 'indicative (static rate)' on compose + confirm, card says static preview", async ({ page }) => {
    const w = await watchCrashes(page);
    await page.route(/open\.er-api\.com/, (r) => r.abort());
    await goto200(page, "/sender");
    const amount = await senderReady(page);
    await fillStable(amount, "50");
    await page.locator("#corridor").selectOption("PH"); // no `oracle` (sender/page.tsx:49)
    await expect(page.getByText(/PHP at 58\.50 · indicative \(static rate\)/)).toBeVisible(); // page.tsx:779
    const card = page.locator("aside", { hasText: "Cost and policy" });
    await expect(card.getByText("Static preview rate. The live FX rate has not loaded yet.")).toBeVisible(); // CostCard.tsx:68
    await page.getByRole("button", { name: /Continue/ }).click();
    await expect(page.getByText(/Confirm and send/)).toBeVisible();
    await expect(page.getByText(/PHP · indicative \(static rate\)/)).toBeVisible(); // page.tsx:992
    // the card is still there on the confirm screen (page.tsx:680) with the same honest source line
    await expect(card.getByText("Static preview rate. The live FX rate has not loaded yet.")).toBeVisible();
    expect(w.crashes()).toEqual([]);
  });

  test("oracle corridor labels its source: Reflector on-chain, or the honest HTTP/static fallback", async ({ page }) => {
    const w = await watchCrashes(page);
    await goto200(page, "/sender");
    await senderReady(page);
    await expect(page.getByText(/MXN at [\d.,]+ · (via Reflector oracle \(on-chain\)|live|indicative \(static rate\))/)).toBeVisible({ timeout: 30_000 });
    const note = await page.getByText(/MXN at [\d.,]+ · /).innerText();
    console.log("MX rate note:", note);
    expect(w.crashes()).toEqual([]);
  });
});

// ================================================================ (f) sent notes + refund affordance
test.describe("sender: sent notes panel", () => {
  test("statuses from chain, refund button gated on connection + status, no button once refunded/spent, newest-10 copy", async ({ page }) => {
    test.slow();
    const live = readLive();
    const w = await watchCrashes(page);
    await goto200(page, "/sender");
    const fresh = await mkNote(20_000_000n);
    const notes: any[] = [
      { ref: "PAY-FRESH", ...fresh, corridor: "PH", depHash: "", createdAt: new Date().toISOString() },
      { ref: "PAY-REFUNDED", ...(await mkNote(40_000_000n)), corridor: "BR", depHash: "ab".repeat(32), createdAt: new Date().toISOString(), refunded: "cd".repeat(32) },
    ];
    if (live) notes.unshift({ ref: live.ref, ...live.note, corridor: "MX", depHash: live.depHash, createdAt: new Date().toISOString() });
    for (let i = 0; i < 9; i++) notes.push({ ref: `PAY-OLD${i}`, ...(await mkNote(1_000_000n)), corridor: "ID", depHash: "", createdAt: new Date(Date.now() - i * 1e6).toISOString() });
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [SENT_KEY, JSON.stringify(notes)]);
    await page.reload({ waitUntil: "domcontentloaded" });
    await senderReady(page);
    await expect(page.getByText("Sent notes", { exact: true })).toBeVisible();
    await expect(page.getByText("Refundable until the receiver claims it. Refunding reveals that this note was withdrawn to your address.")).toBeVisible();
    await expect(page.getByText(`Showing the newest 10 of ${notes.length}.`)).toBeVisible(); // SentNotes.tsx:238
    const item = (ref: string) => page.locator("li", { hasText: ref });
    // refunded: badge REFUNDED, refund tx link, no button (SentNotes.tsx:197-231). The status is
    // read off the row's data-note-status, not its text: "PAY-REFUNDED" is a payment reference and
    // contains the word REFUNDED itself, so text matching hits the title line as well as the badge.
    await expect(item("PAY-REFUNDED")).toHaveAttribute("data-note-status", "refunded");
    await expect(item("PAY-REFUNDED").getByText("REFUNDED", { exact: true })).toBeVisible();
    await expect(item("PAY-REFUNDED").getByRole("link", { name: /refund tx cdcdcdcdcd…/ })).toBeVisible();
    await expect(item("PAY-REFUNDED").getByRole("button", { name: /Cancel and refund/ })).toHaveCount(0);
    // never deposited: UNREGISTERED after the live status read; button disabled while disconnected with the honest title
    await expect(item("PAY-FRESH").getByText("UNREGISTERED")).toBeVisible({ timeout: 90_000 });
    await expect(item("PAY-FRESH").getByText("$2 USDC · PH · PAY-FRESH")).toBeVisible();
    const btn = item("PAY-FRESH").getByRole("button", { name: "Cancel and refund" });
    await expect(btn).toBeDisabled();
    await expect(btn).toHaveAttribute("title", "Connect a wallet or the testnet key to sign the refund");
    if (live) {
      await expect(item(live.ref).getByText(live.regOk ? "SPENDABLE" : "UNREGISTERED")).toBeVisible({ timeout: 90_000 });
      await expect(item(live.ref).getByRole("link", { name: new RegExp(`deposit tx ${live.depHash.slice(0, 10)}…`) })).toBeVisible();
    }
    // connect -> enabled (status known). Not clicked: a refund is a real on-chain write.
    await connectDemo(page);
    await expect(btn).toBeEnabled();
    await expect(btn).not.toHaveAttribute("title", /Connect/);
    // Refresh status re-checks and settles again
    await page.getByRole("button", { name: "Refresh status" }).click();
    await expect(item("PAY-FRESH").getByText("UNREGISTERED")).toBeVisible({ timeout: 90_000 });
    expect(w.crashes()).toEqual([]);
  });
});

// ================================================================ (g) operator monitoring
test.describe("operator: monitoring section", () => {
  test("window stated with real UTC timestamps, failed invocations 'not observable', heuristics honest at zero", async ({ page }) => {
    test.slow();
    const w = await watchCrashes(page);
    await goto200(page, "/operator");
    await selectNav(page, /Monitoring/);
    await expect(page.getByText("Velocity ledger")).toBeVisible();
    await expect(page.getByText("reading events…")).toHaveCount(0, { timeout: 120_000 });
    const pill = page.getByText(/RPC getEvents · pool \+ token \+ registry \+ timelock|event read failed/);
    await expect(pill).toBeVisible();
    // always-honest copy regardless of the read (operator/page.tsx:1218-1222, 1322)
    await expect(page.getByText("not observable", { exact: true })).toBeVisible();
    await expect(page.getByText(/Failed pool calls are not measured: this RPC serves getEvents only for successful contract calls/)).toBeVisible();
    await expect(page.getByText(/Not observable: the live pool .* emits no event from set_asp_root, set_deny_list, set_auditor or set_fx_oracle/)).toBeVisible();
    if (/failed/.test(await pill.innerText())) {
      await expect(page.getByText("Could not read the event window from the RPC. Refresh to retry; the other sections read independently.")).toBeVisible();
      console.log("monitoring: event read failed on this run (honest error state asserted)");
      expect(w.crashes()).toEqual([]);
      return;
    }
    // page.tsx:1204: "computed from ledgers X to Y, YYYY-MM-DD HH:MM UTC to YYYY-MM-DD HH:MM UTC"
    const para = page.getByText(/The public testnet RPC retains/);
    const text = await para.innerText();
    const m = text.match(/retains ([\d,]+) ledgers of events, about ([\d.]+) days\. Everything below is computed from ledgers ([\d,]+) to ([\d,]+), (\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC) to (\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC)\./);
    expect(m, text).not.toBeNull();
    const [, retention, days, fromL, toL, fromT, toT] = m!;
    expect(Number(retention.replace(/,/g, ""))).toBeGreaterThan(1000);
    expect(Number(days)).toBeGreaterThan(0.5);
    expect(Number(toL.replace(/,/g, ""))).toBeGreaterThan(Number(fromL.replace(/,/g, "")));
    const from = Date.parse(fromT.replace(" UTC", ":00Z").replace(" ", "T"));
    const to = Date.parse(toT.replace(" UTC", ":00Z").replace(" ", "T"));
    expect(to).toBeGreaterThan(from);
    expect(Date.now() - to).toBeLessThan(2 * 3600_000); // the window ends near "now": real ledger close times
    expect(Math.round((to - from) / 86400_000 * 10) / 10).toBeCloseTo(Number(days), 0);
    // figures render numbers (zeros allowed), not "pending"
    // Addressed by data-figure, not by text: "Deposits in window" is legitimately both a figure
    // caption up here and the per-depositor column header in the repeated-actor table below.
    for (const f of ["Deposits in window", "Withdrawals in window", "Admin events in window", "Failed invocations"]) await expect(page.locator(`[data-figure="${f}"]`)).toBeVisible();
    await expect(page.getByText("pending", { exact: true })).toHaveCount(0);
    await expect(page.getByText(/^[\d,.]+ USDC moved in$/)).toBeVisible();
    await expect(page.getByText(/^[\d,.]+ USDC released$/)).toBeVisible();
    // velocity buckets carry real hour labels
    await expect(page.getByText(/^\d{2}:\d{2} UTC$/).first()).toBeVisible();
    // structuring: caps read -> "N of M deposits sit in the band", else the honest no-caps copy
    await expect(page.getByText(/\d+ of \d+ deposits sit in the band just under a cap|Corridor caps could not be read from the policy registry, so this heuristic has nothing to compare against\./)).toBeVisible({ timeout: 60_000 });
    // repeated actor: rows or the zero copy; N=1 must not crash and re-evaluates
    const zero = page.getByText(/No depositor reached \d+ deposits in a 24h span/);
    await expect(zero.or(page.locator("tbody td.font-bold"))).toBeVisible();
    await page.locator("#mon-min-n").fill("1");
    await expect(page.getByText(/No depositor reached 1 deposits in a 24h span/).or(page.locator("tbody td", { hasText: /^G[A-Z2-7]{4}…/ }).first())).toBeVisible();
    await page.locator("#mon-min-n").fill("0"); // clamped to 1 (page.tsx:1268)
    await expect(page.locator("#mon-min-n")).toHaveValue("1");
    await expect(page.getByText(/No policy-registry or timelock events in the window\.|set_policy|tl_prop|tl_exec|tl_cancel|policy/).first()).toBeVisible();
    expect(w.crashes()).toEqual([]);
  });
});

// ================================================================ (h) travel-rule lifecycle
test.describe("regulator: Travel Rule lifecycle", () => {
  test("self-hosted TRP send approves, 'Check lifecycle' returns the stored record; Notabene without a wallet is refused honestly", async ({ page, request }) => {
    test.slow();
    const w = await watchCrashes(page);
    await goto200(page, "/regulator");
    await selectNav(page, /Travel Rule/);
    // Notabene destination while disconnected (regulator/page.tsx:1159, 996-999)
    await page.locator("#trp-dest").selectOption("notabene");
    await expect(page.getByText("Connect a wallet to send to the Notabene sandbox.").first()).toBeVisible();
    await page.getByRole("button", { name: "Send as TRP message" }).click();
    await expect(page.getByText("TRP send failed.")).toBeVisible();
    await expect(page.getByText("Connect a wallet to send to the Notabene sandbox.")).toHaveCount(2);
    await expect(page.locator(".tk-stamp", { hasText: "Failed" })).toBeVisible();
    // self-hosted round trip
    await page.locator("#trp-dest").selectOption("self");
    await expect(page.getByText("TRP send failed.")).toHaveCount(0); // reset on destination change (page.tsx:959-963)
    await page.getByRole("button", { name: "Send as TRP message" }).click();
    await expect(page.getByText(/Approved by the beneficiary VASP · TRP 200/)).toBeVisible({ timeout: 60_000 });
    const idText = await page.locator("div", { hasText: /^request-identifier / }).last().innerText();
    const id = idText.replace(/^request-identifier\s+/, "").trim();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    // The lifecycle record names the settlement address, the peer callback and its key, so the GET
    // is operator-only (api/travel-rule/callback/route.ts:70, lib/auth.ts authOwner). Disconnected,
    // the page refuses before it sends anything.
    const check = page.getByRole("button", { name: "Check lifecycle" });
    await check.click();
    await expect(page.getByText("Connect a wallet to check the lifecycle (the record is only served to the signing peer or a signed-in wallet).")).toBeVisible();
    await connectDemo(page);
    await check.click();
    // Wallet sign-in (nonce -> SEP-53 signature -> bearer) is the same one the scheduler uses, so it
    // needs Blob + AUTH_SECRET on the target. Assert the real outcome for this target either way.
    const signInReady = (await (await request.get("/api/schedules/nonce")).json())?.configured === true;
    if (!signInReady) {
      await expect(page.getByText("Wallet sign-in is not configured on this server, so the lifecycle read cannot be authorized.")).toBeVisible({ timeout: 30_000 });
      console.log("TRP lifecycle: wallet sign-in is not configured on this target, the authorized read was not exercised");
    } else {
      // callback/route.ts:64-68: 200 with the record, or 404 when the store has no entry
      const outcome = page.getByText(/^HTTP \d+$|No lifecycle record for this request-identifier yet \(404\)\./);
      await expect(outcome).toBeVisible({ timeout: 30_000 });
      const o = await outcome.innerText();
      expect(o, "the beneficiary node stored the approved inquiry").toBe("HTTP 200");
      const pre = page.locator("pre", { hasText: /"status"/ });
      await expect(pre).toBeVisible();
      const rec = JSON.parse(await pre.innerText());
      expect(rec.status).toBe("approved");
      expect(rec.requestIdentifier).toBe(id); // lib/trp.ts:218 TrpLifecycle
    }
    await expect(page.getByText("Sent to our own inbound TRP endpoint, real TRP protocol, single operator (one node, both ends).")).toBeVisible();
    expect(w.crashes()).toEqual([]);
  });
});

// ================================================================ (i) wallet kit
test.describe("wallet kit", () => {
  test("Connect wallet lists Freighter / xBull / Albedo / Rabet / Lobstr / Hana (+ Ledger when WebUSB exists); dismiss recovers", async ({ page }) => {
    const w = await watchCrashes(page);
    await goto200(page, "/sender");
    await senderReady(page);
    const connect = page.getByRole("button", { name: /Connect wallet/ });
    await connect.click();
    await expect(connect).toBeDisabled({ timeout: 15_000 });
    // @creit.tech/stellar-wallets-kit auth-options page: one <li> per module (lib/wallet-kit.ts:36-44)
    for (const name of [/freighter/i, /xbull/i, /albedo/i, /rabet/i, /lobstr/i, /hana/i]) {
      await expect(page.locator("li", { hasText: name }).first(), String(name)).toBeVisible({ timeout: 20_000 });
    }
    const hasUsb = await page.evaluate(() => "usb" in navigator);
    const ledger = await page.locator("li", { hasText: /ledger/i }).count();
    console.log(`wallet picker: Ledger ${ledger ? "listed" : "hidden"} (navigator.usb ${hasUsb ? "present" : "absent"})`);
    if (hasUsb) expect(ledger).toBeGreaterThan(0);
    // the kit's backdrop click closes it (it ignores Escape); WalletBar.tsx:254 toasts the rejection
    await page.mouse.click(5, 5);
    await expect(connect).toBeEnabled({ timeout: 20_000 });
    await expect(toast(page)).toContainText(/closed the modal|Could not connect/);
    await expect(page.getByRole("button", { name: /Use testnet key/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Disconnect$/ })).toHaveCount(0);
    // opening a second time works (kit init is idempotent, wallet-kit.ts:6)
    await connect.click();
    await expect(page.locator("li", { hasText: /freighter/i }).first()).toBeVisible({ timeout: 20_000 });
    await page.mouse.click(5, 5);
    await expect(connect).toBeEnabled({ timeout: 20_000 });
    expect(w.crashes()).toEqual([]);
  });

  test("network guard copy is wired (source check): wrong-network alert + Re-check, signing blocked", async () => {
    // Cannot be driven in headless Chromium (needs a real extension on another network); assert the
    // contract in code so a regression in the copy or the guard call sites is still caught.
    const bar = fs.readFileSync(path.resolve(process.cwd(), "webapp/components/WalletBar.tsx"), "utf8");
    expect(bar).toContain("Your wallet is on {wrongNetwork}; switch it to Testnet. Signing is blocked until it matches.");
    expect(bar).toMatch(/role="alert"/);
    expect(bar).toContain("Re-check");
    const kit = fs.readFileSync(path.resolve(process.cwd(), "webapp/lib/wallet-kit.ts"), "utf8");
    expect(kit).toContain("switch it to Testnet");
    expect(kit).toMatch(/export function assertNetwork/);
    expect(kit).toContain("assertNetwork();"); // signMessageWithWallet
    const provider = fs.readFileSync(path.resolve(process.cwd(), "webapp/components/WalletProvider.tsx"), "utf8");
    expect(provider).toMatch(/checkNetwork|assertNetwork/);
  });

  test.skip("wrong-network wallet shows the alert and blocks signing", () => {
    // Needs a real wallet extension (Freighter/xBull/Lobstr) set to a non-Testnet network; not
    // reproducible in headless Chromium. Copy + guard call sites are asserted from source above.
  });
});

// ================================================================ (k) reduced motion + keyboard-only sender
test.describe("sender: reduced motion + keyboard only", () => {
  test("prefers-reduced-motion collapses animations; Tab/Enter drive compose → confirm → PIN → edit", async ({ page }) => {
    const w = await watchCrashes(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await goto200(page, "/sender");
    const amount = await senderReady(page);
    // globals.css:220-227: every animation/transition collapses to 0.001ms
    const dur = await page.evaluate(() => {
      const el = document.querySelector(".animate-tk-pop")!;
      return { anim: getComputedStyle(el).animationDuration, iter: getComputedStyle(el).animationIterationCount, trans: getComputedStyle(document.querySelector("#amount")!).transitionDuration };
    });
    expect(parseFloat(dur.anim)).toBeLessThanOrEqual(0.001);
    expect(dur.iter).toBe("1");
    expect(parseFloat(dur.trans)).toBeLessThanOrEqual(0.001);
    // keyboard only from here
    const focusedId = () => page.evaluate(() => document.activeElement?.id || document.activeElement?.textContent?.trim().slice(0, 30) || "");
    // Every scan starts from the top of the document. Clearing focus is not enough on its own: the
    // sequential focus navigation starting point survives a blur, and it also survives the focused
    // element being removed from the DOM, which is what happens each time Enter advances the screen.
    // So tabbing would resume past the control we are looking for. Chromium happened to wrap back
    // within 40 presses and Firefox did not, which is the only reason this ever looked green.
    // Focusing body sets the starting point explicitly, and both browsers then agree.
    const fromTop = () =>
      page.evaluate(() => {
        (document.activeElement as HTMLElement | null)?.blur();
        document.body.setAttribute("tabindex", "-1");
        document.body.focus();
        document.body.removeAttribute("tabindex");
      });
    // Tab first, then read: body carries the whole page's text, so checking before the first press
    // would let a predicate match the document rather than a control.
    const tabTo = async (pred: (s: string) => boolean, max = 40) => {
      await fromTop();
      for (let i = 0; i < max; i++) {
        await page.keyboard.press("Tab");
        if (pred(await focusedId())) return true;
      }
      return false;
    };
    expect(await tabTo((s) => s === "amount")).toBe(true);
    await page.keyboard.type("44");
    await expect(amount).toHaveValue("44");
    // the amount box shows a visible focus ring (focus-within shadow, page.tsx:797)
    const ring = await page.evaluate(() => getComputedStyle(document.querySelector("#amount")!.parentElement!).boxShadow);
    expect(ring).not.toBe("none");
    expect(await tabTo((s) => /Continue/.test(s))).toBe(true);
    await page.keyboard.press("Enter");
    await expect(page.getByText(/Confirm and send/)).toBeVisible();
    expect(await tabTo((s) => s === "claim-pin")).toBe(true);
    await page.keyboard.type("12ab34cd");
    await expect(page.locator("#claim-pin")).toHaveValue("1234");
    expect(await tabTo((s) => /Edit payment/.test(s), 60)).toBe(true);
    await page.keyboard.press("Enter");
    await expect(page.locator("#amount")).toHaveValue("44");
    expect(w.crashes()).toEqual([]);
  });
});

// ================================================================ (l) axe after interaction
test.describe("axe on the new panels after interaction", () => {
  test("regulator: every nav section, plus the imported view-note and TRP result states", async ({ page }, testInfo) => {
    test.slow();
    await goto200(page, "/regulator");
    const bad: string[] = [];
    await expect(page.getByText("reading pool events from Stellar RPC…")).toHaveCount(0, { timeout: 120_000 });
    bad.push(...(await axeClean(page, "regulator/reports", testInfo)));
    await selectNav(page, /Verify disclosure/);
    await fillStable(page.locator("#view-note"), viewNoteOf(await mkNote(5_000_000n), "ID"));
    await page.getByRole("button", { name: "Recompute commitment and look up on-chain" }).click();
    await expect(page.getByText("Opening reproduces the commitment.")).toBeVisible({ timeout: 90_000 });
    await expect(page.locator(".tk-stamp", { hasText: /Not a pool leaf|Leaf unconfirmed/ })).toBeVisible({ timeout: 90_000 });
    bad.push(...(await axeClean(page, "regulator/verify+viewnote", testInfo)));
    await selectNav(page, /Issue audit request/);
    bad.push(...(await axeClean(page, "regulator/issue", testInfo)));
    await selectNav(page, /Travel Rule/);
    await page.getByRole("button", { name: "Send as TRP message" }).click();
    await expect(page.getByText(/Approved by the beneficiary VASP|TRP send failed|Rejected · TRP/)).toBeVisible({ timeout: 60_000 });
    bad.push(...(await axeClean(page, "regulator/travel+result", testInfo)));
    await selectNav(page, /Audit trail/);
    bad.push(...(await axeClean(page, "regulator/trail", testInfo)));
    expect(bad).toEqual([]);
  });

  test("operator: every nav section including Monitoring after its reads settle", async ({ page }, testInfo) => {
    test.slow();
    await goto200(page, "/operator");
    const bad: string[] = [];
    await expect(page.getByText(/reading pool state…/)).toHaveCount(0, { timeout: 60_000 });
    bad.push(...(await axeClean(page, "operator/pool", testInfo)));
    for (const label of [/Compliance policy/, /Oracle health/, /Corridor & anchor/, /Monitoring/]) {
      await selectNav(page, label);
      if (String(label).includes("Monitoring")) await expect(page.getByText("reading events…")).toHaveCount(0, { timeout: 120_000 });
      await page.waitForTimeout(1500);
      bad.push(...(await axeClean(page, "operator/" + String(label).replace(/\W/g, ""), testInfo)));
    }
    expect(bad).toEqual([]);
  });

  test("sender confirm screen (cost card + PIN) and receiver PIN prompt + wallet picker", async ({ page }, testInfo) => {
    const bad: string[] = [];
    await goto200(page, "/sender");
    const amount = await senderReady(page);
    await fillStable(amount, "10");
    await page.getByRole("button", { name: /Continue/ }).click();
    await expect(page.getByText(/Confirm and send/)).toBeVisible();
    await expect(page.getByText("Reading the policy registry.")).toHaveCount(0, { timeout: 45_000 });
    bad.push(...(await axeClean(page, "sender/confirm", testInfo)));
    const payload = await encodeClaimPayload(bearerOf(await mkNote(1_000_000n), "PAY-A11Y"), "111111");
    await goto200(page, `/receiver#claim=${payload}`);
    await expect(page.getByText("PIN-protected claim link")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Unlock" }).click();
    await expect(page.getByText("Enter the 6 digits the sender gave you.")).toBeVisible();
    bad.push(...(await axeClean(page, "receiver/pin", testInfo)));
    expect(bad).toEqual([]);
  });
});

// ================================================================ (m) the deck
test.describe("deck", () => {
  test("every slide reachable by keyboard (arrows, PageDown, Space, Home/End, Tab to each sheet); video never autoplays", async ({ page }) => {
    const w = await watchCrashes(page);
    await goto200(page, "/deck");
    await page.waitForLoadState("load");
    const rail = page.locator("#rail");
    const n = await page.locator("#rail .s").count();
    expect(n).toBe(9);
    const at = () => rail.evaluate((el) => Math.round(el.scrollLeft / el.clientWidth));
    await expect(page.locator("#num")).toHaveText(`1 / ${n}`);
    for (let i = 1; i < n; i++) {
      await page.keyboard.press(i % 3 === 0 ? "PageDown" : i % 3 === 1 ? "ArrowRight" : "Space");
      await expect.poll(at, { message: `slide ${i}` }).toBe(i);
      await expect(page.locator("#num")).toHaveText(`${i + 1} / ${n}`);
    }
    await expect(page.locator("#next")).toBeDisabled(); // deck.html:511
    await page.keyboard.press("ArrowRight");
    await expect.poll(at).toBe(n - 1); // clamped
    await page.keyboard.press("Home");
    await expect.poll(at).toBe(0);
    await expect(page.locator("#prev")).toBeDisabled();
    await page.keyboard.press("End");
    await expect.poll(at).toBe(n - 1);
    await page.keyboard.press("Backspace");
    await expect.poll(at).toBe(n - 2);
    await page.keyboard.press("PageUp");
    await expect.poll(at).toBe(n - 3);
    // every sheet is a tab stop (deck.html: .sheet tabindex="0"); the rail itself too
    expect(await page.locator("#rail .sheet[tabindex='0']").count()).toBe(n);
    await expect(rail).toHaveAttribute("tabindex", "0");
    await page.locator("#rail .sheet").first().focus();
    for (let i = 1; i < n; i++) {
      // Tab moves through the links inside a sheet before the next sheet; skip until the next .sheet is focused
      for (let k = 0; k < 15; k++) {
        await page.keyboard.press("Tab");
        const idx = await page.evaluate(() => [...document.querySelectorAll("#rail .sheet")].indexOf(document.activeElement as Element));
        if (idx === i) break;
        if (k === 14) throw new Error(`Tab never reached sheet ${i}`);
      }
    }
    await expect.poll(at).toBe(n - 1); // focus scrolled the rail to the last slide
    // video (deck.html:430): controls, playsinline, metadata preload, no autoplay, paused
    const v = page.locator("video.demovid");
    await expect(v).toHaveAttribute("preload", "metadata");
    await expect(v).not.toHaveAttribute("autoplay", /.*/);
    expect(await v.evaluate((el: HTMLVideoElement) => ({ paused: el.paused, autoplay: el.autoplay, controls: el.controls, currentTime: el.currentTime }))).toEqual({ paused: true, autoplay: false, controls: true, currentTime: 0 });
    expect(w.crashes()).toEqual([]);
  });

  test("Google Fonts load under the CSP (style-src fonts.googleapis.com, font-src fonts.gstatic.com), zero violations", async ({ page, request }) => {
    const w = await watchCrashes(page);
    const fontHits: { url: string; status: number }[] = [];
    page.on("response", (r) => { if (/fonts\.(googleapis|gstatic)\.com/.test(r.url())) fontHits.push({ url: r.url(), status: r.status() }); });
    const csp = (await request.get("/deck")).headers()["content-security-policy"];
    expect(csp).toMatch(/style-src [^;]*https:\/\/fonts\.googleapis\.com/); // next.config.mjs:41
    expect(csp).toMatch(/font-src [^;]*https:\/\/fonts\.gstatic\.com/); // next.config.mjs:43
    await goto200(page, "/deck");
    await page.waitForLoadState("load");
    const fonts = await page.evaluate(async () => {
      await (document as any).fonts.ready;
      const faces = [...(document as any).fonts] as FontFace[];
      return { loaded: faces.filter((f) => f.status === "loaded").map((f) => f.family.replace(/"/g, "")), stencil: (document as any).fonts.check('16px "Saira Stencil One"'), barlow: (document as any).fonts.check('16px "Barlow"') };
    });
    expect(fonts.stencil).toBe(true);
    expect(fonts.barlow).toBe(true);
    expect(fonts.loaded.some((f) => /Saira Stencil One/.test(f)), JSON.stringify(fonts.loaded)).toBe(true);
    expect(fonts.loaded.some((f) => /Barlow/.test(f))).toBe(true);
    expect(fonts.loaded.some((f) => /Courier Prime/.test(f))).toBe(true);
    expect(fontHits.some((h) => /fonts\.googleapis\.com\/css2/.test(h.url) && h.status === 200), JSON.stringify(fontHits)).toBe(true);
    expect(fontHits.some((h) => /fonts\.gstatic\.com/.test(h.url) && h.status === 200)).toBe(true);
    expect(fontHits.filter((h) => h.status >= 400)).toEqual([]);
    expect(await w.csp()).toEqual([]);
    expect(w.crashes()).toEqual([]);
  });
});
