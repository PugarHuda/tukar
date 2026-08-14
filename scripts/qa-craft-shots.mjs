// Craft-pass QA screenshots. Drives the real app on :3000 with system Chrome via
// playwright-core, captures the surfaces named in the craft task at desktop + mobile.
//   node scripts/qa-craft-shots.mjs
import { chromium } from "playwright-core";
import { mkdirSync } from "fs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.argv[2] || "http://localhost:3000";
const OUT = "scripts/qa-shots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const shot = async (page, name) => { await page.screenshot({ path: `${OUT}/craft-${name}.png` }); console.log("  saved", name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function overflowCheck(page, label) {
  const w = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
  const overflow = w.doc > w.win + 1;
  console.log(`  overflow[${label}] doc=${w.doc} win=${w.win} ${overflow ? "OVERFLOW!" : "ok"}`);
  return overflow;
}

async function desktop(path, name, prep) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept().catch(() => {}));
  await page.goto(BASE + path, { waitUntil: "networkidle" }).catch(() => {});
  await sleep(1200);
  if (prep) await prep(page).catch((e) => console.log("  prep err", name, e.message.split("\n")[0]));
  await overflowCheck(page, name);
  await shot(page, name);
  await ctx.close();
}

async function mobile(path, name, prep) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept().catch(() => {}));
  await page.goto(BASE + path, { waitUntil: "networkidle" }).catch(() => {});
  await sleep(1200);
  if (prep) await prep(page).catch((e) => console.log("  prep err", name, e.message.split("\n")[0]));
  await overflowCheck(page, name);
  await shot(page, name);
  await ctx.close();
}

// A demo bearer note (self-contained, valid tukar1: encoding) so the receiver shows a payment card.
// Built by claiming through the UI would need on-chain; instead we inject a note into localStorage
// using the same shape the receiver persists, so the PaymentCard renders (visual only).
const DEMO_NOTE = {
  seq: 1,
  notes: [{ id: 1, ref: "PAY-204", amount: "2000000000", privKey: "1", pubKey: "2", blinding: "3",
    commitment: "12345678901234567890", corridor: "MX", revealed: false }],
};

try {
  // /sender compose (desktop + mobile)
  await desktop("/sender", "sender-compose", null);
  await mobile("/sender", "sender-compose-mobile", null);

  // /sender progress state — click Continue then Send is gated on wallet; capture the "send" review screen instead
  await desktop("/sender", "sender-send", async (page) => {
    await page.getByRole("button", { name: /Continue/ }).click();
    await sleep(500);
  });

  // /receiver empty state (desktop + mobile)
  await desktop("/receiver", "receiver-empty", null);
  await mobile("/receiver", "receiver-empty-mobile", null);

  // /receiver payment card — seed a note into localStorage, reload
  await desktop("/receiver", "receiver-card", async (page) => {
    await page.evaluate((n) => {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith("tukar:rcv:notes:"));
      // find the store key the app uses (tukar:rcv:notes:<POOL>) — grab it off any existing or set a wildcard
      const POOL = document.body.innerHTML.match(/C[A-Z2-7]{55}/)?.[0];
      const key = keys[0] || (POOL ? `tukar:rcv:notes:${POOL}` : null);
      if (key) localStorage.setItem(key, JSON.stringify(n));
    }, DEMO_NOTE);
    await page.reload({ waitUntil: "networkidle" });
    await sleep(1500);
  });

  // /regulator verify tab — paste an invalid receipt to render the "not valid" verdict, and the reports view
  await desktop("/regulator", "regulator-reports", null);
  await desktop("/regulator", "regulator-verify", async (page) => {
    await page.getByRole("button", { name: /Verify disclosure/ }).click();
    await sleep(400);
  });

  // /operator pool health
  await desktop("/operator", "operator-pool", null);
} catch (e) {
  console.error("FATAL", e);
}

await browser.close();
console.log("done");
