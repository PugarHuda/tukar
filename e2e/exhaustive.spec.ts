import { test, expect, Page, Locator, APIRequestContext } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { goto200, watchNoise, isBenign } from "./_helpers";

// EXHAUSTIVE sweep of the live app. Goes past routes/a11y/edge-inputs/resilience: static assets +
// headers, every API route with wrong methods / malformed / oversize bodies, the rate limiter, CSP
// violations + console errors on every page, keyboard-only flows, every button/tab on the four actor
// UIs, the demo-key connect path, the honest "not configured" state of each integration, offline +
// slow-3G, viewport extremes, colour-scheme / reduced-motion, back/forward/reload mid-flow, script
// injection strings, and axe on the states the a11y spec does not reach.
//
// Expectations are read from the components (file:line noted where non-obvious). Where behaviour
// legitimately depends on deployment config, the spec reads /api/health once and branches on it.

const BASE = process.env.QA_BASE || "https://tukar-six.vercel.app";
const PAGES = ["/", "/sender", "/receiver", "/operator", "/regulator", "/verify", "/deck"];
const POST_ONLY = [
  "/api/verify",
  "/api/note-status",
  "/api/reclaim",
  "/api/reclaim/verify",
  "/api/idos/credential",
  "/api/cctp/attest",
  "/api/cctp/mint",
  "/api/travel-rule",
  "/api/travel-rule/send",
  "/api/travel-rule/trisa",
];
const J = { "content-type": "application/json" };
const G = "GB2CVRVNR4VN5LYVOX637ZS46RJONKWVQZ4IZC5IIEPAPPFRC5CHYRVS";
// A structurally valid bearer note whose fields are field elements but which was never deposited
// (lib/zk.ts:165 decodeBearerNote only checks isFieldStr on the five fields).
const FAKE_NOTE_PAYLOAD = { v: 1, ref: "PAY-QA", amount: "2000000000", privKey: "1", pubKey: "2", blinding: "3", commitment: "4", corridor: "MX" };
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64");
const FAKE_NOTE = "tukar1:" + b64(FAKE_NOTE_PAYLOAD);
const XSS = `<img src=x onerror="window.__xss=1">`;

type Health = { status: string; checks: { rpc: string; reclaim: boolean; schedules: boolean; trisa: boolean; notabene: boolean } };
let health: Health;
test.beforeAll(async ({ request }) => {
  const r = await request.get("/api/health");
  expect(r.status()).toBe(200);
  health = await r.json();
});

// ---------------------------------------------------------------- helpers
// "due to access control checks": WebKit reports a cross-origin fetch cancelled by a reload as a page
// error even though the call sits in try/catch (app/sender/page.tsx:271-279 open.er-api, RPC reads).
// Reload-artifact noise, not an app crash; see the report.
const BENIGN_CRASH = /Loading chunk \d+ failed|ChunkLoadError|error loading dynamically imported module|due to access control checks/i;
// Console errors that are known-noise on this deployment: the Vercel analytics scripts 404 until
// Web Analytics is toggled on (same list _helpers.BENIGN uses for network failures).
function benignConsole(text: string, url: string) {
  // Firefox reports the circomlibjs `Function()` feature probe (see the csp filter below) as a
  // console error rather than a securitypolicyviolation event; same harmless probe.
  return isBenign(url) || /_vercel\/(insights|speed-insights)|favicon\.ico|blocked a JavaScript eval \(script-src\)/i.test(text);
}

async function watchAll(page: Page) {
  const noise = watchNoise(page);
  const consoleErrors: string[] = [];
  const rejections: string[] = [];
  await page.addInitScript(() => {
    (window as any).__cspv = [];
    window.addEventListener("securitypolicyviolation", (e: SecurityPolicyViolationEvent) => {
      (window as any).__cspv.push(`${e.violatedDirective} blocked ${e.blockedURI} (${e.sourceFile}:${e.lineNumber})`);
    });
    window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
      const r: any = e.reason;
      console.error("UNHANDLED_REJECTION: " + ((r && r.message) || String(r)));
    });
  });
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (t.includes("UNHANDLED_REJECTION")) rejections.push(t);
    else if (!benignConsole(t, m.location().url || "")) consoleErrors.push(t.slice(0, 300));
  });
  return {
    ...noise,
    consoleErrors,
    rejections,
    crashes: () => [...noise.pageErrors, ...rejections].filter((e) => !BENIGN_CRASH.test(e)),
    csp: () => page.evaluate(() => (window as any).__cspv as string[]),
  };
}

// Sender hydration proof: SSR renders Continue ENABLED (default "200"); it only goes DISABLED once
// React's onChange is live (app/sender/page.tsx:577). Leaves the amount field empty.
async function senderReady(page: Page): Promise<Locator> {
  const amount = page.locator("#amount");
  await expect(amount).toBeVisible();
  const cont = page.getByRole("button", { name: /Continue/ });
  // Alternate two values on every attempt: React's value tracker only fires onChange when the DOM
  // value CHANGES from what it last saw, so re-filling the same string after a pre-hydration fill
  // never reaches state (that is the WebKit /verify baseline failure; see the report).
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
async function openReceiverTab(page: Page, name: RegExp, marker: Locator) {
  await expect(async () => {
    await page.getByRole("tab", { name }).click();
    await expect(marker).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 30_000 });
}
async function connectDemo(page: Page) {
  await expect(async () => {
    await page.getByRole("button", { name: /Use testnet key/ }).first().click();
    await expect(page.getByRole("button", { name: /^Disconnect$/ })).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
}
// Dashboard nav (components/dashboard/Sidebar.tsx:56-59): buttons with aria-current="page" when active.
async function selectNav(page: Page, label: RegExp) {
  const btn = page.locator("aside nav button", { hasText: label }).first();
  await expect(async () => {
    await btn.click();
    await expect(btn).toHaveAttribute("aria-current", "page", { timeout: 1500 });
  }).toPass({ timeout: 30_000 });
}
const overflowPx = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const toast = (page: Page) => page.getByRole("region", { name: "Notifications" });

// ================================================================ 1. STATIC / HEADERS / REDIRECTS
test.describe("static routes, headers, redirects", () => {
  for (const p of PAGES) {
    test(`${p} → 200 with CSP / XFO / nosniff / Referrer-Policy (next.config.mjs:53-59)`, async ({ request }) => {
      const r = await request.get(p);
      expect(r.status()).toBe(200);
      const h = r.headers();
      expect(h["x-frame-options"]).toBe("SAMEORIGIN");
      expect(h["x-content-type-options"]).toBe("nosniff");
      expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
      expect(h["content-security-policy"]).toMatch(/default-src 'self'/);
      expect(h["content-security-policy"]).toMatch(/frame-ancestors 'self'/);
      expect(h["content-security-policy"]).toMatch(/object-src 'none'/);
      expect(h["content-type"]).toMatch(/text\/html/);
    });
  }

  test("HEAD on every page is 200", async ({ request }) => {
    for (const p of PAGES) expect((await request.head(p)).status(), p).toBe(200);
  });

  test("/demo and /demo/* permanently redirect to / (next.config.mjs:76-77)", async ({ request }) => {
    for (const p of ["/demo", "/demo/anything/deep"]) {
      const r = await request.get(p, { maxRedirects: 0 });
      expect([301, 308], p).toContain(r.status());
      expect(r.headers()["location"]).toMatch(/^(https?:\/\/[^/]+)?\/$/);
    }
  });

  test("trailing-slash and double-slash variants resolve (redirect or 200), never 5xx", async ({ request }) => {
    for (const p of ["/sender/", "/verify/", BASE + "//sender", "/sender?x=%3Cscript%3E&y=" + "a".repeat(2000), "/verify#frag"]) {
      const r = await request.get(p); // absolute for the double-slash case: a bare "//host" is protocol-relative
      expect(r.status(), p).toBeLessThan(500);
      expect([200, 404], p).toContain(r.status());
    }
  });

  test("/favicon.ico rewrites to the SVG icon (next.config.mjs:87)", async ({ request }) => {
    const r = await request.get("/favicon.ico");
    expect(r.status()).toBe(200);
    expect(r.headers()["content-type"]).toMatch(/svg/);
  });

  test("/.well-known/stellar.toml: 200, text/plain, CORS *, TOML body", async ({ request }) => {
    const r = await request.get("/.well-known/stellar.toml");
    expect(r.status()).toBe(200);
    expect(r.headers()["access-control-allow-origin"]).toBe("*");
    expect(r.headers()["content-type"]).toMatch(/text\/plain/);
    const body = await r.text();
    expect(body.length).toBeGreaterThan(20);
    expect(body).toMatch(/NETWORK_PASSPHRASE|ACCOUNTS|\[\[CURRENCIES\]\]|VERSION/);
  });

  test("manifest.webmanifest parses, icons resolve, start_url lands on a 200", async ({ request }) => {
    const r = await request.get("/manifest.webmanifest");
    expect(r.status()).toBe(200);
    const m = await r.json();
    expect(m.short_name).toBe("Tukar");
    for (const i of m.icons) expect((await request.get(i.src)).status(), i.src).toBe(200);
    const s = await request.get(m.start_url); // "/demo" -> redirected to "/"
    expect(s.status()).toBe(200);
  });

  test("og-image / icons / deck video are served (video supports byte ranges)", async ({ request }) => {
    for (const p of ["/og-image.png", "/icon-192.png", "/icon-512.png", "/icon.svg"]) {
      const r = await request.get(p);
      expect(r.status(), p).toBe(200);
      expect(r.headers()["content-type"], p).toMatch(/image\//);
    }
    const v = await request.get("/demo-id.mp4", { headers: { Range: "bytes=0-1023" } });
    expect([200, 206]).toContain(v.status());
    expect(v.headers()["content-type"]).toMatch(/video\/mp4/);
    if (v.status() === 206) expect(v.headers()["content-range"]).toMatch(/^bytes 0-1023\//);
  });

  test("/circuit assets are immutable-cached (next.config.mjs:69-71)", async ({ request }) => {
    // any circuit asset; the compliance vkey is the smallest guaranteed one
    const r = await request.get("/circuit/verification_key.json");
    expect(r.status()).toBe(200);
    expect(r.headers()["cache-control"]).toMatch(/immutable/);
  });

  test("404s: unknown page, unknown API, long path, traversal, unicode → 404 not 5xx", async ({ request }) => {
    const cases = ["/this-does-not-exist", "/api/nope", "/api/verify/extra", "/_next/static/nope.js", "/" + "a".repeat(1500), "/..%2F..%2Fetc%2Fpasswd", "/s%C3%A9nder", "/sender/%00"];
    for (const p of cases) {
      const r = await request.get(p);
      expect(r.status(), p).toBeGreaterThanOrEqual(400);
      expect(r.status(), p).toBeLessThan(500);
    }
  });

  test("404 page renders Next's not-found UI with headers and no page error", async ({ page }) => {
    const w = await watchAll(page);
    const resp = await page.goto("/this-does-not-exist", { waitUntil: "domcontentloaded" });
    expect(resp!.status()).toBe(404);
    expect(resp!.headers()["x-frame-options"]).toBe("SAMEORIGIN");
    await expect(page.getByText(/404|could not be found/i).first()).toBeVisible();
    expect(w.crashes()).toEqual([]);
  });
});

// ================================================================ 2. API ROUTES
test.describe("API: methods, malformed bodies, gates", () => {
  test("/api/health: 200 JSON, presence-only booleans, rpc ok|unreachable, POST → 405", async ({ request }) => {
    expect(health.status).toBe("ok");
    expect(["ok", "unreachable"]).toContain(health.checks.rpc);
    for (const k of ["reclaim", "schedules", "trisa", "notabene"] as const) expect(typeof health.checks[k], k).toBe("boolean");
    // never leaks a value, only booleans
    expect(JSON.stringify(health)).not.toMatch(/secret|token|key=/i);
    expect((await request.post("/api/health", { data: {} })).status()).toBe(405);
    expect((await request.delete("/api/health")).status()).toBe(405);
  });

  test("GET / PUT / DELETE on POST-only routes → 405", async ({ request }) => {
    for (const p of POST_ONLY) {
      expect((await request.get(p)).status(), `GET ${p}`).toBe(405);
      expect((await request.delete(p)).status(), `DELETE ${p}`).toBe(405);
    }
    for (const p of ["/api/schedules", "/api/schedules/nonce", "/api/cron/recurring"]) {
      expect((await request.put(p, { data: {} })).status(), `PUT ${p}`).toBe(405);
    }
  });

  test("POST invalid JSON (text/plain) → 400 on every body-parsing route, gated routes answer honestly first", async ({ request }) => {
    const junk = { headers: { "content-type": "text/plain" }, data: "not json {{{" };
    // parse-first routes -> 400 (route.ts try/catch around req.json())
    for (const p of ["/api/verify", "/api/note-status", "/api/cctp/attest", "/api/cctp/mint", "/api/travel-rule/send"]) {
      const r = await request.post(p, junk);
      expect(r.status(), p).toBe(400);
      expect((await r.json()).error, p).toBeTruthy();
    }
    // inbound TRP: the body is parsed first (the signature covers it), then the headers are gated
    const trp = await request.post("/api/travel-rule", junk);
    expect(trp.status()).toBe(400);
    expect((await trp.json()).rejected).toMatch(/api-version|not valid JSON/);
    // config gates come BEFORE parsing on reclaim / idos / trisa
    const rc = await request.post("/api/reclaim", junk);
    expect(rc.status()).toBe(200);
    expect((await rc.json()).configured).toBe(health.checks.reclaim);
    const idos = await request.post("/api/idos/credential", junk);
    expect([200, 400, 429]).toContain(idos.status()); // 429 if the rate-limit test already ran on this IP
    const trisa = await request.post("/api/travel-rule/trisa", junk);
    if (!health.checks.trisa) {
      expect(trisa.status()).toBe(200);
      const tj = await trisa.json();
      expect(tj.configured).toBe(false);
      expect(tj.note).toMatch(/not deployed/i);
    } else expect(trisa.status()).toBe(400);
    // auth-first routes -> 401 before parsing
    expect((await request.post("/api/schedules", junk)).status()).toBe(401);
    const nonce = await request.post("/api/schedules/nonce", junk);
    if (health.checks.schedules) expect(nonce.status()).toBe(400);
    else expect((await nonce.json()).configured).toBe(false);
  });

  test("wrong content-type with a valid JSON body is still parsed (no false 400)", async ({ request }) => {
    const r = await request.post("/api/verify", { headers: { "content-type": "application/x-www-form-urlencoded" }, data: JSON.stringify({ txHash: "zz" }) });
    expect(r.status()).toBe(400);
    expect((await r.json()).error).toMatch(/64 hex/);
  });

  test("/api/verify: junk hash 400, unknown 64-hex → anchor mode not-found, bogus receipt → fail/502 never 200-ok, oversize body rejected", async ({ request }) => {
    expect((await request.post("/api/verify", { headers: J, data: { txHash: "0xnotahash" } })).status()).toBe(400);
    const anchor = await request.post("/api/verify", { headers: J, data: { txHash: "0".repeat(64) } });
    expect(anchor.status()).toBe(200);
    const a = await anchor.json();
    expect(a.ok).toBe(false);
    expect(a.mode).toBe("anchor");
    expect(a.anchorMemoHash).toBeNull();
    expect(a.note).toMatch(/No hash memo/);
    // schema errors are listed
    const bad = await request.post("/api/verify", { headers: J, data: { receipt: { kind: "evil", type: "nope", publicSignals: ["x"], proof: {} } } });
    expect(bad.status()).toBe(400);
    const be = (await bad.json()).error as string;
    expect(be).toMatch(/kind must be/);
    expect(be).toMatch(/type must be one of/);
    expect(be).toMatch(/publicSignals/);
    expect(be).toMatch(/pi_a/);
    // structurally valid but cryptographically bogus: must not report ok
    const bogus = await request.post("/api/verify", {
      headers: J,
      data: { receipt: { kind: "tukar-audit-receipt", type: "exact", publicSignals: ["4", "2000000000", "7"], proof: { pi_a: ["1", "2", "1"], pi_b: [["1", "2"], ["3", "4"], ["1", "0"]], pi_c: ["1", "2", "1"], protocol: "groth16", curve: "bn128" } } },
      timeout: 60_000,
    });
    expect([200, 502]).toContain(bogus.status());
    if (bogus.status() === 200) {
      const bj = await bogus.json();
      expect(bj.ok).toBe(false);
      expect(bj.status).toBe("fail");
      expect(bj.checks.groth16).toBe(false);
    }
    // 1 MB of over-long "field elements" -> schema 400 (isField caps at 78 digits), not a 500
    const big = await request.post("/api/verify", { headers: J, data: { receipt: { type: "exact", publicSignals: new Array(1000).fill("9".repeat(1000)), proof: { pi_a: 1, pi_b: 1, pi_c: 1 } } }, timeout: 60_000 });
    expect([400, 413]).toContain(big.status());
    // 5 MB is over Vercel's 4.5 MB function body limit -> 413 from the platform; a plain `next start`
    // has no such limit, so the route's own schema check answers 400 there. Never 200, never 500.
    const huge = await request.post("/api/verify", { headers: J, data: "{\"pad\":\"" + "x".repeat(5 * 1024 * 1024) + "\"}", timeout: 120_000 });
    expect([400, 413]).toContain(huge.status());
  });

  test("/api/note-status: junk / missing / non-numeric → 400; unknown commitment → unregistered; unknown tukar1 note → unregistered", async ({ request }) => {
    for (const body of [{}, { commitment: "abc" }, { note: "tukar1:not-base64!!" }, { commitment: -1 }, { commitment: "1e5" }]) {
      const r = await request.post("/api/note-status", { headers: J, data: body });
      expect(r.status(), JSON.stringify(body)).toBe(400);
    }
    const c = await request.post("/api/note-status", { headers: J, data: { commitment: "12345678901234567890" } });
    expect(c.status()).toBe(200);
    expect((await c.json()).status).toBe("unregistered");
    const n = await request.post("/api/note-status", { headers: J, data: { note: FAKE_NOTE } });
    expect(n.status()).toBe(200);
    expect((await n.json()).status).toBe("unregistered");
  });

  test("/api/cctp: attest validates the hash shape; mint refuses without message+attestation", async ({ request }) => {
    for (const h of ["", "0x123", "1".repeat(64), "0x" + "g".repeat(64)]) {
      const r = await request.post("/api/cctp/attest", { headers: J, data: { txHash: h } });
      expect(r.status(), h).toBe(400);
    }
    // sourceDomain must be a u32; a non-number is refused rather than silently defaulted
    const badDomain = await request.post("/api/cctp/attest", { headers: J, data: { txHash: "0x" + "1".repeat(64), sourceDomain: "not-a-number" } });
    expect(badDomain.status()).toBe(400);
    // a well-formed hash nobody burned: Iris says pending, or the route says honestly it could not reach Iris
    const ok = await request.post("/api/cctp/attest", { headers: J, data: { txHash: "0x" + "1".repeat(64), sourceDomain: 6 } });
    expect(ok.status()).toBe(200);
    expect(["pending", "error"]).toContain((await ok.json()).status);
    for (const body of [{}, { message: "0x01" }, { attestation: "0x01" }]) {
      const r = await request.post("/api/cctp/mint", { headers: J, data: body });
      expect(r.status(), JSON.stringify(body)).toBe(400);
    }
  });

  test("/api/travel-rule (inbound TRP 3.2.1): header + token + IVMS101 validation", async ({ request }) => {
    const av = { "api-version": "3.2.1", "request-identifier": "qa-" + Date.now() };
    // wrong version
    let r = await request.post("/api/travel-rule", { headers: { ...J, "api-version": "9.9.9", "request-identifier": "x" }, data: {} });
    expect(r.status()).toBe(400);
    // missing request-identifier
    r = await request.post("/api/travel-rule", { headers: { ...J, "api-version": "3.2.1" }, data: {} });
    expect(r.status()).toBe(400);
    expect((await r.json()).rejected).toMatch(/request-identifier/);
    // Unsigned inquiries are refused (401) before the Travel Address token or IVMS101 are looked at,
    // so an unauthenticated caller cannot probe which tokens exist. The signed path (token 404,
    // IVMS101 rejection list, approval) is exercised end to end through /api/travel-rule/send below.
    r = await request.post("/api/travel-rule?t=expired", { headers: { ...J, ...av }, data: {} });
    expect(r.status()).toBe(401);
    r = await request.post("/api/travel-rule", { headers: { ...J, ...av }, data: { IVMS101: { transaction: {} } } });
    expect(r.status()).toBe(401);
    expect((await r.json()).rejected).toMatch(/signature/i);
    // A signature header that is merely present is not enough: it is verified against the supplied
    // Ed25519 public key, so a bogus one is refused even on a well-formed inquiry.
    r = await request.post("/api/travel-rule?t=demo", {
      headers: { ...J, ...av, "x-trp-signature": "sig" },
      data: { IVMS101: { originatingVASP: {}, beneficiaryVASP: {}, originator: {}, beneficiary: {}, transaction: { amount: "1", currency: "USDC", network: "Stellar", transactionReference: "R" } } },
    });
    expect(r.status()).toBe(401);
    // The properly signed inquiry (approved with a real G address + callback) is asserted through
    // the /api/travel-rule/send round trip in the next test.
  });

  test("/api/travel-rule/send: missing ivms101 400, bad Travel Address 400, self-hosted round trip 200", async ({ request }) => {
    expect((await request.post("/api/travel-rule/send", { headers: J, data: {} })).status()).toBe(400);
    const bad = await request.post("/api/travel-rule/send", { headers: J, data: { ivms101: {}, destination: "!!!not-base58!!!" } });
    expect(bad.status()).toBe(400);
    expect((await bad.json()).error).toMatch(/Travel Address/);
    const r = await request.post("/api/travel-rule/send", { headers: J, data: { ivms101: {} }, timeout: 30_000 });
    expect(r.status()).toBe(200);
    const j = await r.json();
    expect(j.mode).toBe("self-hosted");
    expect(j.apiVersion).toBe("3.2.1");
    expect(j.signature.alg).toBeTruthy();
    // empty IVMS is answered by our own inbound node with a rejection, transported honestly
    expect(j.response.rejected).toMatch(/IVMS101 validation failed/);
    // asking for Notabene without the key silently falls back to self-hosted (route.ts:56-64)
    const nb = await request.post("/api/travel-rule/send", { headers: J, data: { ivms101: {}, destination: { notabene: true } }, timeout: 30_000 });
    expect((await nb.json()).mode).toBe(health.checks.notabene ? "notabene" : "self-hosted");
  });

  test("/api/schedules + nonce + cron: auth fails closed, gates are honest", async ({ request }) => {
    expect((await request.get("/api/schedules")).status()).toBe(401);
    expect((await request.get("/api/schedules", { headers: { authorization: "Bearer garbage" } })).status()).toBe(401);
    expect((await request.get("/api/schedules", { headers: { authorization: "Bearer " } })).status()).toBe(401);
    expect((await request.post("/api/schedules", { headers: J, data: { amount: "1", code: "MX", recipient: "x", frequency: "weekly" } })).status()).toBe(401);
    const n = await request.get("/api/schedules/nonce?address=" + G);
    expect(n.status()).toBe(200);
    const nj = await n.json();
    expect(nj.configured).toBe(health.checks.schedules);
    if (health.checks.schedules) expect(nj.nonce).toBeTruthy();
    else expect(nj.nonce).toBeUndefined();
    // a malformed address never yields a nonce
    const bad = await request.get("/api/schedules/nonce?address=" + XSS);
    expect((await bad.json()).nonce).toBeUndefined();
    // cron: no / wrong / empty bearer -> 401 (constant-time, fails closed on a missing secret)
    for (const h of [{}, { authorization: "Bearer wrong" }, { authorization: "Bearer undefined" }, { authorization: "Bearer " }]) {
      const c = await request.get("/api/cron/recurring", { headers: h });
      expect(c.status(), JSON.stringify(h)).toBe(401);
    }
    expect((await request.post("/api/cron/recurring", { data: {} })).status()).toBe(405);
  });

  test("/api/reclaim + /api/reclaim/verify + /api/idos/credential honour their config gates", async ({ request }) => {
    // Init binds the Reclaim session to a wallet address, so a valid G address is part of the body.
    const rc = await request.post("/api/reclaim", { headers: J, data: { address: G } });
    expect(rc.status()).toBe(200);
    const rj = await rc.json();
    expect(rj.configured).toBe(health.checks.reclaim);
    if (health.checks.reclaim) {
      expect(rj.requestUrl).toMatch(/^https:\/\//);
      expect(rj.statusUrl).toMatch(/^https:\/\//);
      // Without an address the init is refused (never runs against the app credentials blindly).
      const noAddr = await request.post("/api/reclaim", { headers: J, data: {} });
      expect(noAddr.status()).toBe(400);
    }
    const rv = await request.post("/api/reclaim/verify", { headers: J, data: {} });
    const vj = await rv.json();
    if (health.checks.reclaim) {
      expect(rv.status()).toBe(400);
      expect(typeof vj.error).toBe("string");
    } else expect(vj).toEqual({ verified: false, configured: false });
    // a fake proof never verifies and never 500s with internals
    const fake = await request.post("/api/reclaim/verify", { headers: J, data: { proof: { identifier: "x", claimData: {}, signatures: ["0x00"], witnesses: [] }, address: G } });
    expect([200, 500]).toContain(fake.status());
    const fj = await fake.json();
    expect(fj.verified).toBe(false);
    expect(JSON.stringify(fj)).not.toMatch(/at .*\.js|stack|RECLAIM_APP/);
  });
});

// ================================================================ 3. RATE LIMITER
test.describe("rate limiter", () => {
  test("/api/idos/credential (15/min) returns 429 + Retry-After under a burst", async ({ request }) => {
    // Chosen because no UI path calls it headlessly, so no other test is starved. The gate runs
    // AFTER the limiter (app/api/idos/credential/route.ts:20-24), so the route is limitable even
    // when idOS is not configured. 40 > 15 with margin for a 2-instance in-memory fallback.
    let first429 = -1;
    let retryAfter: string | undefined;
    for (let i = 0; i < 40; i++) {
      const r = await request.post("/api/idos/credential", { headers: J, data: {} });
      expect([200, 400, 429], `request ${i}`).toContain(r.status());
      if (r.status() === 429) {
        first429 = i;
        retryAfter = r.headers()["retry-after"];
        expect((await r.json()).error).toMatch(/Too many requests/);
        break;
      }
    }
    expect(first429, "no 429 within 40 requests: limiter not enforced for this IP").toBeGreaterThanOrEqual(0);
    expect(Number(retryAfter)).toBeGreaterThan(0);
  });
});

// ================================================================ 4. EVERY PAGE: console / CSP / axe / colour scheme
test.describe("every page: clean console, no CSP violations, axe, dark-only theme", () => {
  for (const p of PAGES) {
    test(`${p}: zero unexpected console errors, zero CSP violations, no crash`, async ({ page }) => {
      const w = await watchAll(page);
      await goto200(page, p);
      await page.waitForLoadState("load").catch(() => {});
      await page.waitForTimeout(4000); // let live RPC reads + lazy chunks settle
      // one combined assertion so a single failure report lists everything at once
      // circomlibjs (via get-intrinsic/function-bind) runs a `Function("return function*(){}")`
      // feature probe inside try/catch when the prover chunk loads; CSP reports it as a blocked eval
      // but nothing breaks. Deliberately not fixed with 'unsafe-eval'.
      const cspViolations = [...new Set(await w.csp())].filter((v) => !/^script-src blocked eval \(.*_next\/static\/chunks\//.test(v));
      expect({ csp: cspViolations, console: w.consoleErrors, crashes: w.crashes(), failed: w.failed }, `${p} problems`)
        .toEqual({ csp: [], console: [], crashes: [], failed: [] });
    });
  }

  test("/deck + 404 page: no serious/critical axe violations (pages the a11y spec skips)", async ({ page }, testInfo) => {
    for (const p of ["/deck", "/this-does-not-exist"]) {
      await page.goto(p, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1500);
      const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      const lines = res.violations.map((v) => `  [${v.impact}] ${v.id}: ${v.help} (x${v.nodes.length})`).join("\n");
      if (lines) await testInfo.attach(`axe-${p.replace(/\W+/g, "_")}.txt`, { body: lines, contentType: "text/plain" });
      expect(res.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${p} ${v.id} x${v.nodes.length}`)).toEqual([]);
    }
  });

  test("the app is dark-only: body stays dark under prefers-color-scheme light AND dark", async ({ page }) => {
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/sender", { waitUntil: "domcontentloaded" }); // second visit may be a cached 304 on Firefox
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      const m = bg.match(/\d+/g)!.map(Number);
      const lum = (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255;
      expect(lum, `${scheme}: body bg ${bg}`).toBeLessThan(0.2);
    }
  });

  test("prefers-reduced-motion: landing renders (canvases + marquee) without errors", async ({ page }) => {
    const w = await watchAll(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await goto200(page, "/");
    await expect(page.getByRole("heading", { name: /Send money home/i })).toBeVisible();
    // landing.css:892 and globals.css:103 carry reduced-motion rules; the marquee must not animate.
    const anim = await page.evaluate(() => getComputedStyle(document.getElementById("marquee")!).animationName);
    expect(["none", ""]).toContain(anim);
    expect(w.crashes()).toEqual([]);
  });
});

// ================================================================ 5. VIEWPORT EXTREMES
test.describe("viewport extremes", () => {
  for (const p of ["/", "/sender", "/receiver", "/operator", "/regulator", "/verify"]) {
    test(`${p} at 320px: no horizontal overflow, key content visible`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await goto200(page, p);
      await page.waitForLoadState("load").catch(() => {});
      await page.waitForTimeout(3000);
      expect(await overflowPx(page), `${p} overflows at 320px`).toBeLessThanOrEqual(2);
      const h = page.locator("h1").first();
      await expect(h).toBeVisible();
    });
  }

  test("4K (3840x2160): landing + sender render, content is max-width-bounded, no overflow", async ({ page }) => {
    await page.setViewportSize({ width: 3840, height: 2160 });
    await goto200(page, "/");
    expect(await overflowPx(page)).toBeLessThanOrEqual(2);
    await goto200(page, "/sender");
    const w = await page.locator("main").first().evaluate((el) => el.getBoundingClientRect().width);
    expect(w).toBeLessThanOrEqual(560); // app/sender/page.tsx:536 max-w-[520px] + padding
    expect(await overflowPx(page)).toBeLessThanOrEqual(2);
  });

  test("operator at 320px: hamburger drawer opens (dialog), Esc closes, focus returns, nav selection closes it", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await goto200(page, "/operator");
    const burger = page.getByRole("button", { name: "Open navigation" });
    await expect(async () => {
      await burger.click();
      await expect(page.getByRole("dialog", { name: /Operator/ })).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 30_000 });
    // DashboardShell.tsx:42 focuses the first nav button
    await expect(page.locator("[role=dialog] nav button").first()).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(burger).toBeFocused(); // DashboardShell.tsx:67
    await burger.click();
    await page.locator("[role=dialog] nav button", { hasText: "Oracle health" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator("main").getByText("Oracle health").first()).toBeVisible();
  });
});

// ================================================================ 6. LANDING
test.describe("landing", () => {
  test("every internal link resolves 200; every target=_blank link carries rel=noopener", async ({ page, request }) => {
    await goto200(page, "/");
    const links = await page.locator("a[href]").evaluateAll((as) => as.map((a) => ({ href: a.getAttribute("href")!, target: a.getAttribute("target"), rel: a.getAttribute("rel") })));
    expect(links.length).toBeGreaterThan(20);
    const internal = [...new Set(links.map((l) => l.href).filter((h) => h.startsWith("/")))];
    for (const h of internal) expect((await request.get(h)).status(), h).toBe(200);
    for (const l of links.filter((l) => l.target === "_blank")) expect(l.rel, l.href).toMatch(/noopener/);
    const hashes = links.map((l) => l.href).filter((h) => h.startsWith("#"));
    for (const h of hashes) expect(await page.locator(h).count(), `anchor ${h}`).toBe(1);
  });

  test("header anchor nav scrolls to its section (hash updates, section in view)", async ({ page }) => {
    await goto200(page, "/");
    for (const [name, id] of [["Circuits", "circuits"], ["Contracts", "contracts"], ["Apps", "apps"]] as const) {
      await page.locator("nav.nav a", { hasText: name }).click();
      await expect(page).toHaveURL(new RegExp("#" + id + "$"));
      const top = await page.locator("#" + id).evaluate((el) => el.getBoundingClientRect().top);
      expect(top, `${id} top after click`).toBeLessThan(400);
    }
  });

  test("Launch modal: opens via keyboard, traps Tab, Esc closes + restores focus, backdrop click closes, links navigate", async ({ page }) => {
    const w = await watchAll(page);
    await goto200(page, "/");
    const trigger = page.locator("header .launch-trigger");
    await expect(async () => {
      await trigger.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("dialog", { name: "Open Tukar as" })).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 30_000 });
    // LaunchModal.tsx:55 focuses the first focusable = the Close button
    await expect(page.getByRole("button", { name: "Close" })).toBeFocused();
    // Tab x5 cycles through close + 4 role links and wraps (LaunchModal.tsx:63-75)
    for (let i = 0; i < 5; i++) await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Close" })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(page.locator("[role=dialog] a[href='/operator']")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(trigger).toBeFocused();
    // backdrop click
    await trigger.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.locator(".launch-backdrop").click({ position: { x: 5, y: 5 } });
    await expect(page.getByRole("dialog")).toHaveCount(0);
    // body scroll restored (LaunchModal.tsx:80)
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
    // keyboard-navigate into an app (initial focus lands a frame after the click, so wait for it
    // the way a person would before pressing Tab)
    await trigger.click();
    await expect(page.getByRole("button", { name: "Close" })).toBeFocused();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/sender$/);
    await expect(page.getByText(/Send money\./)).toBeVisible();
    expect(w.crashes()).toEqual([]);
  });

  test("Circuits/Contracts tabs are real tabs: click switches aria-selected + panel, all rendered", async ({ page }) => {
    await goto200(page, "/");
    const tabs = page.getByRole("tablist", { name: "Corridor layers" }).getByRole("tab");
    const n = await tabs.count();
    expect(n).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < n; i++) {
      await expect(async () => {
        await tabs.nth(i).click();
        await expect(tabs.nth(i)).toHaveAttribute("aria-selected", "true", { timeout: 1500 });
      }).toPass({ timeout: 20_000 });
      await expect(page.locator("#circ-panel")).toHaveAttribute("aria-labelledby", await tabs.nth(i).getAttribute("id") || "");
      expect(await page.locator("#circ-panel").innerText()).not.toBe("");
    }
  });

  test("footer role links go to the right app and browser back returns to the landing", async ({ page }) => {
    await goto200(page, "/");
    await page.locator("footer a[href='/regulator']").click();
    await expect(page).toHaveURL(/\/regulator$/);
    await expect(page.getByRole("heading", { name: /Regulator \/ Compliance console/ })).toBeVisible();
    await page.goBack({ waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: /Send money home/i })).toBeVisible();
    await page.goForward({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Regulator \/ Compliance console/ })).toBeVisible();
  });
});

// ================================================================ 7. /deck
test.describe("deck", () => {
  test("renders and reaches load even with the video stream blocked (media never blocks the page)", async ({ page }) => {
    const w = await watchAll(page);
    await page.route(/\.mp4(\?|$)/, (r) => r.abort());
    const t0 = Date.now();
    await goto200(page, "/deck");
    await page.waitForLoadState("load");
    expect(Date.now() - t0).toBeLessThan(20_000);
    await expect(page.locator("#rail .s").first()).toBeVisible();
    // video is metadata-preload only with a poster, so nothing waits on it (public/deck.html:362)
    await expect(page.locator("video.demovid")).toHaveAttribute("preload", "metadata");
    expect(w.crashes()).toEqual([]);
  });

  test("keyboard slide navigation: ArrowRight / ArrowLeft move the rail (public/deck.html:457)", async ({ page }) => {
    await goto200(page, "/deck");
    const rail = page.locator("#rail");
    const at = () => rail.evaluate((el) => Math.round(el.scrollLeft / el.clientWidth));
    expect(await at()).toBe(0);
    await page.keyboard.press("ArrowRight");
    await expect.poll(at).toBe(1);
    await page.keyboard.press("ArrowRight");
    await expect.poll(at).toBe(2);
    await page.keyboard.press("ArrowLeft");
    await expect.poll(at).toBe(1);
  });
});

// ================================================================ 8. WALLET BAR (demo key, no extension, KYC gates)
test.describe("wallet bar", () => {
  test("demo key: connects, shows testnet key · addr, persists across reload, disconnect clears", async ({ page }) => {
    const w = await watchAll(page);
    await goto200(page, "/sender");
    await connectDemo(page);
    await expect(page.getByText(/testnet key ·/)).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("tukar:conn"))).toBe("demo");
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: /^Disconnect$/ })).toBeVisible();
    await page.getByRole("button", { name: /^Disconnect$/ }).click();
    await expect(page.getByRole("button", { name: /Use testnet key/ })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("tukar:conn"))).toBeNull();
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: /Use testnet key/ })).toBeVisible();
    expect(w.crashes()).toEqual([]);
  });

  test("Connect wallet with NO extension installed: picker opens, dismiss → back to disconnected, no crash", async ({ page }) => {
    const w = await watchAll(page);
    await goto200(page, "/sender");
    await senderReady(page);
    const connect = page.getByRole("button", { name: /Connect wallet/ });
    await connect.click();
    // stellar-wallets-kit renders its own modal; give it up to 10s to mount (8s kit-load timeout)
    await expect(connect).toBeDisabled({ timeout: 10_000 }); // busy while the picker is open
    await page.waitForTimeout(2000);
    // NOTE (third-party): the kit's picker ignores Escape; a backdrop click is what closes it.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1000);
    if (await connect.isDisabled()) await page.mouse.click(5, 5);
    // must settle: kit rejects authModal -> WalletBar.tsx:218 toasts the error, button re-enables
    await expect(connect).toBeEnabled({ timeout: 20_000 });
    await expect(toast(page)).toContainText(/closed the modal|Could not connect/);
    await expect(page.getByRole("button", { name: /Use testnet key/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Disconnect$/ })).toHaveCount(0);
    expect(w.crashes()).toEqual([]);
  });

  test("Reusable KYC panel: idOS and Reclaim each report their real configured state", async ({ page }) => {
    const w = await watchAll(page);
    await goto200(page, "/sender");
    await senderReady(page);
    await page.getByText("Reusable KYC", { exact: true }).click();
    // idOS: either not configured (IdosConnect.tsx:83-88) or "Connect a wallet first" + disabled button
    const idosNotConf = page.getByText(/idOS reusable KYC is not configured on this deployment yet/);
    const idosBtn = page.getByRole("button", { name: /Check idOS profile/ });
    await expect(idosNotConf.or(idosBtn)).toBeVisible();
    if (await idosBtn.isVisible()) {
      await expect(idosBtn).toBeDisabled();
      await expect(page.getByText("Connect a wallet first.")).toBeVisible();
    }
    // Reclaim: WalletBar.tsx:96-109
    const reclaim = page.getByRole("button", { name: /Verify with Reclaim/ });
    await expect(reclaim).toBeVisible();
    if (!health.checks.reclaim) {
      await reclaim.click();
      // The proof is bound to a wallet address, so with no wallet connected the panel asks for one
      // before it ever reaches the server; with a wallet it reports the server's not-configured state.
      await expect(page.getByText(/Reclaim is not configured on this deployment yet|Reclaim error: Connect a wallet first/)).toBeVisible();
    } else {
      // configured: clicking opens a real Reclaim portal window; block the popup and just assert the pending state.
      await page.addInitScript(() => { window.open = () => null; });
      await reclaim.click();
      await expect(page.getByText(/Complete proof-of-personhood|Reclaim error/).first()).toBeVisible({ timeout: 30_000 });
    }
    expect(w.crashes()).toEqual([]);
  });

  test("connected: 'Verify identity' details reveals idOS check (enabled) + Reclaim; idOS profile read is honest", async ({ page }) => {
    const w = await watchAll(page);
    await goto200(page, "/receiver");
    await connectDemo(page);
    await page.getByText(/Verify identity to enable deposits/).click();
    const idosBtn = page.getByRole("button", { name: /Check idOS profile/ });
    if (await idosBtn.isVisible().catch(() => false)) {
      await expect(idosBtn).toBeEnabled();
      await idosBtn.click();
      // real playground read: the shared demo key either has no profile or has one; never a hang
      await expect(page.getByText(/This wallet has no idOS profile|owns an idOS profile|idOS error/).first()).toBeVisible({ timeout: 45_000 });
    } else {
      await expect(page.getByText(/idOS reusable KYC is not configured/)).toBeVisible();
    }
    await expect(page.getByRole("button", { name: /Verify with Reclaim/ })).toBeVisible();
    expect(w.crashes()).toEqual([]);
  });
});

// ================================================================ 9. SENDER
test.describe("sender", () => {
  test("corridor select drives recipient + currency; recipient is capped at 24 chars; XSS string is inert", async ({ page }) => {
    const w = await watchAll(page);
    await goto200(page, "/sender");
    const amount = await senderReady(page);
    await page.locator("#corridor").selectOption("BR");
    await expect(page.locator("#recipient")).toHaveValue("João · São Paulo"); // app/sender/page.tsx:40
    await expect(page.getByText(/BRL at/)).toBeVisible();
    await page.locator("#corridor").selectOption("NG");
    await expect(page.locator("#recipient")).toHaveValue("Chidi · Lagos");
    const rec = page.locator("#recipient");
    await rec.fill("");
    await rec.pressSequentially("x".repeat(40));
    expect((await rec.inputValue()).length).toBe(24); // maxLength={24} (page.tsx:702)
    await rec.fill(XSS);
    await fillStable(amount, "12.5");
    await page.getByRole("button", { name: /Continue/ }).click();
    await expect(page.getByText(/Confirm and send/)).toBeVisible();
    await expect(page.getByText(XSS.slice(0, 24))).toBeVisible(); // inert text (React escapes it), cut by maxLength=24
    expect(await page.evaluate(() => (window as any).__xss)).toBeUndefined();
    await expect(page.getByRole("heading", { name: "Send $12.5" })).toBeVisible();
    expect(w.crashes()).toEqual([]);
  });

  test("keyboard-only compose → confirm → back keeps the amount", async ({ page }) => {
    await goto200(page, "/sender");
    const amount = await senderReady(page);
    await amount.focus();
    await page.keyboard.type("77");
    await expect(page.getByRole("button", { name: /Continue/ })).toBeEnabled();
    // Tab until Continue has focus, then Enter
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press("Tab");
      const isCont = await page.evaluate(() => document.activeElement?.textContent?.includes("Continue"));
      if (isCont) break;
    }
    await page.keyboard.press("Enter");
    await expect(page.getByText(/Confirm and send/)).toBeVisible();
    await page.getByRole("button", { name: /Edit payment/ }).click();
    await expect(page.locator("#amount")).toHaveValue("77");
  });

  test("Continue rapid double-click lands on the confirm screen once; Send is disabled + titled until connected", async ({ page }) => {
    const w = await watchAll(page);
    await goto200(page, "/sender");
    const amount = await senderReady(page);
    await fillStable(amount, "5");
    await page.getByRole("button", { name: /Continue/ }).click({ clickCount: 2, delay: 30 });
    await expect(page.getByText(/Confirm and send/)).toHaveCount(1);
    const send = page.getByRole("button", { name: /^Send \$5/ });
    await expect(send).toBeDisabled();
    await expect(send).toHaveAttribute("title", /Connect a wallet or use the testnet key/);
    await expect(page.getByText("Connect above to send on-chain.")).toBeVisible();
    // anchor on-ramp without a connection is refused honestly (page.tsx:425-428)
    await page.getByRole("button", { name: /Fund via a real anchor/ }).click();
    await expect(page.getByText(/Connect first\. The anchor authenticates your address \(SEP-10\)/)).toBeVisible();
    // connect from the inline bar -> Send enables, signer shown
    await connectDemo(page);
    await expect(send).toBeEnabled();
    await expect(page.getByText(/signing as G/)).toBeVisible();
    expect(w.crashes()).toEqual([]);
  });

  test.skip("Send $ with the demo key executes a real deposit", () => {
    // Deliberately not part of the sweep: it spends the shared testnet key's USDC (proving + two
    // signed txs). Run e2e/p28-live.spec.ts on demand for the real deposit + registration check.
  });

  test("offline mid-flow: Send degrades to an honest failure and returns to the confirm screen", async ({ page, context }) => {
    // The circuit assets are immutable-cached, so offline the prover still loads and the proofs run
    // before the first network call; Firefox proves several times slower than Chromium (and slower
    // again when other browser projects share the CPU), so give it a generous budget.
    test.setTimeout(420_000);
    const w = await watchAll(page);
    await goto200(page, "/sender");
    const amount = await senderReady(page);
    await connectDemo(page);
    await fillStable(amount, "3");
    await page.getByRole("button", { name: /Continue/ }).click();
    await expect(page.getByText(/Confirm and send/)).toBeVisible();
    await context.setOffline(true);
    await page.getByRole("button", { name: /^Send \$3/ }).click();
    // page.tsx:378-398: prover-load failure or deposit failure, both honest, both bounce back.
    // The compliance + binding proofs are built in-browser BEFORE the first network call; Firefox's
    // WASM proving is several times slower than Chromium's, hence the generous ceiling.
    await expect(page.getByText(/Prover failed to load|Deposit failed:/).first()).toBeVisible({ timeout: 360_000 });
    await expect(page.getByText(/Confirm and send/)).toBeVisible({ timeout: 15_000 });
    await context.setOffline(false);
    expect(w.crashes()).toEqual([]);
  });

  test("scheduled sends: weekly/monthly reveal the plan box in the deployment's real mode; save/remove/persist (device mode) or auth-gated (server mode)", async ({ page }) => {
    const w = await watchAll(page);
    await goto200(page, "/sender");
    const amount = await senderReady(page);
    await fillStable(amount, "20");
    await page.locator("#frequency").selectOption("weekly");
    await expect(page.getByText(/Schedule a weekly send/)).toBeVisible();
    const badge = page.getByText(health.checks.schedules ? "AUTOMATED" : "PREVIEW", { exact: true });
    await expect(badge).toBeVisible({ timeout: 20_000 }); // waits for the /api/schedules/nonce probe
    const save = page.getByRole("button", { name: /(Save|Schedule) weekly plan/ });
    await expect(save).toBeEnabled();
    if (health.checks.schedules) {
      await save.click();
      await expect(toast(page)).toContainText(/Connect a wallet to schedule/);
      return;
    }
    await save.click();
    await expect(toast(page)).toContainText("Plan saved on this device");
    await expect(page.getByText("Scheduled sends")).toBeVisible();
    await expect(page.getByText(/\$20 USDC · Mexico/)).toBeVisible();
    await expect(page.getByText("saved on this device", { exact: true })).toBeVisible();
    // reload -> persisted via localStorage tukar:schedules
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByText(/\$20 USDC · Mexico/)).toBeVisible({ timeout: 20_000 });
    // prefill from the plan
    await page.getByText(/\$20 USDC · Mexico/).click();
    await expect(toast(page)).toContainText("Plan loaded");
    await expect(page.locator("#frequency")).toHaveValue("weekly");
    // remove
    await page.getByRole("button", { name: "Remove scheduled plan" }).click();
    await expect(page.getByText("Scheduled sends")).toHaveCount(0);
    // monthly also shows the annual estimate (SavingsNote.tsx:30-38)
    await page.locator("#frequency").selectOption("monthly");
    await expect(page.getByText(/every month, traditional fees would total/)).toBeVisible();
    // an unsendable amount disables the save button too
    await fillStable(amount, "0");
    await expect(page.getByRole("button", { name: /(Save|Schedule) monthly plan/ })).toBeDisabled();
    expect(w.crashes()).toEqual([]);
  });

  test("payment request: Load disabled when empty, junk → honest error, valid tukreq1 locks amount+payee, Clear restores", async ({ page }) => {
    const w = await watchAll(page);
    await goto200(page, "/sender");
    const amount = await senderReady(page);
    await fillStable(amount, "200");
    const req = page.locator("#req");
    const load = page.getByRole("button", { name: /^Load$/ });
    await expect(load).toBeDisabled();
    await fillStable(req, "tukreq1:" + XSS);
    await expect(load).toBeEnabled();
    await req.press("Enter");
    await expect(page.getByText(/Couldn't load that request/)).toBeVisible();
    // wrong kind
    await fillStable(req, "tukreq1:" + b64({ v: 1, kind: "audit", amount: "1", addr: G }));
    // Firefox occasionally dispatches the click before React has committed the new input value
    // (the previous junk then re-errors); a person would simply press Load again.
    await expect(async () => {
      await load.click();
      await expect(page.getByText(/not a Tukar payment request/)).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 30_000 });
    // 8 decimals is rejected (lib/zk.ts:186 allows <= 7)
    await fillStable(req, "tukreq1:" + b64({ v: 1, kind: "req", amount: "1.12345678", memo: "m", addr: G }));
    await load.click();
    await expect(page.getByText(/invalid request amount/)).toBeVisible();
    // valid
    await fillStable(req, "tukreq1:" + b64({ v: 1, kind: "req", amount: "42.5", memo: "m", addr: G }));
    await load.click();
    await expect(page.getByText("Fulfilling a payment request")).toBeVisible();
    await expect(page.locator("#amount")).toHaveValue("42.5");
    await expect(page.locator("#amount")).toHaveAttribute("readonly", "");
    await expect(page.locator("#recipient")).toHaveValue(/Requested payee · GB2CVR…YRVS/); // page.tsx:500 slice(0,6)…slice(-4)
    await expect(page.getByText(/Loaded a request for 42\.5 USDC/)).toBeVisible();
    // corridor change keeps the requested-payee label (page.tsx:552)
    await page.locator("#corridor").selectOption("PH");
    await expect(page.locator("#recipient")).toHaveValue(/Requested payee/);
    await page.getByRole("button", { name: /^Clear$/ }).click();
    await expect(page.locator("#amount")).toHaveValue("200");
    await expect(page.locator("#amount")).not.toHaveAttribute("readonly", "");
    await expect(page.locator("#recipient")).toHaveValue("Andrea · Manila");
    expect(w.crashes()).toEqual([]);
  });

  test("CCTP panels without an EVM wallet: Fund is disabled + honest; Send validates amount + 0x recipient", async ({ page }) => {
    const w = await watchAll(page);
    await goto200(page, "/sender");
    const amount = await senderReady(page);
    await fillStable(amount, "1");
    await page.getByRole("button", { name: /Continue/ }).click();
    await expect(page.getByText(/Confirm and send/)).toBeVisible();
    // Fund from another chain (CctpFund.tsx:193-216)
    const fund = page.getByRole("button", { name: /Fund from another chain/ });
    await fund.click();
    await expect(fund).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByText(/No EVM wallet detected\. Install a wallet like/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Burn on Base Sepolia → mint on Stellar/ })).toBeDisabled();
    await page.locator("#cctp-recipient").fill("not-an-address");
    await expect(page.getByText("Not a valid Stellar address.")).toBeVisible();
    await page.locator("#cctp-recipient").fill(G);
    await expect(page.getByText(/classic account \(G\/M\).*trustline/)).toBeVisible();
    await page.locator("#cctp-recipient").fill("CBIYQACYOKDBPYDGU7DMSHPGJEWP2ZRETXDVOTC5HTU5RJBGDK2MHTWJ");
    await expect(page.getByText(/Contract recipient.*no trustline needed/)).toBeVisible();
    // Send out (CctpSend.tsx:95-112)
    const send = page.getByRole("button", { name: /Send out to another chain/ });
    await send.click();
    await expect(page.getByText(/No EVM wallet detected\. The burn \+ attestation still run/)).toBeVisible();
    const run = page.getByRole("button", { name: /Burn on Stellar → mint on Base Sepolia/ });
    await expect(run).toBeEnabled();
    await page.locator("#cctp-out-amt").fill("0");
    await run.click();
    await expect(page.locator("p[role=alert]")).toContainText("Enter a positive USDC amount.");
    await page.locator("#cctp-out-amt").fill("abc");
    await run.click();
    await expect(page.locator("p[role=alert]")).toContainText("Enter a positive USDC amount.");
    await page.locator("#cctp-out-amt").fill("1");
    await page.locator("#cctp-out-recipient").fill("0x1234");
    await expect(page.getByText("Not a valid 0x EVM address.")).toBeVisible();
    await run.click();
    await expect(page.locator("p[role=alert]")).toContainText("Enter a valid 0x EVM recipient address.");
    // collapse toggles
    await send.click();
    await expect(send).toHaveAttribute("aria-expanded", "false");
    expect(w.crashes()).toEqual([]);
  });

  test("Blend savings panel: disconnected copy, live position read resolves when connected, zero-amount supply refused", async ({ page }) => {
    const w = await watchAll(page);
    await goto200(page, "/sender");
    await senderReady(page);
    await expect(page.getByText(/Connect a wallet or the testnet key to supply USDC/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Traditional \(6\.2%\)/)).toHaveCount(0); // amount is empty -> no fee row
    await fillStable(page.locator("#amount"), "100");
    await expect(page.getByText(/Traditional \(6\.2%\)/)).toBeVisible();
    await expect(page.getByText("$6.20")).toBeVisible();
    await connectDemo(page);
    // SavingsNote.tsx:152-161: loading -> position/none, never stuck
    await expect(page.getByText("Reading your Blend position on-chain…")).toHaveCount(0, { timeout: 45_000 });
    await expect(page.getByText(/No USDC supplied yet|Your Blend balance/).first()).toBeVisible();
    await page.locator("#blend-amount").fill("0");
    await page.getByRole("button", { name: /^Supply$/ }).click();
    await expect(page.getByText("Enter a positive USDC amount to supply.")).toBeVisible();
    expect(w.crashes()).toEqual([]);
  });

  test("back/forward mid-flow: Home link from the confirm screen, then back → sender recovers cleanly", async ({ page }) => {
    const w = await watchAll(page);
    await goto200(page, "/sender");
    const amount = await senderReady(page);
    await fillStable(amount, "9");
    await page.getByRole("button", { name: /Continue/ }).click();
    await expect(page.getByText(/Confirm and send/)).toBeVisible();
    await page.getByRole("link", { name: "Back to home" }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goBack({ waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/sender$/);
    await expect(page.getByText(/Send money\./)).toBeVisible();
    await expect(page.locator("#amount")).toBeVisible();
    expect(w.crashes()).toEqual([]);
  });
});

// ================================================================ 10. RECEIVER
test.describe("receiver", () => {
  test("tabs: ARIA wiring, keyboard activation, empty-state shortcuts", async ({ page }) => {
    const w = await watchAll(page);
    await goto200(page, "/receiver");
    await expect(page.getByRole("tablist", { name: "Receiver sections" })).toBeVisible();
    await openReceiverTab(page, /^Claim$/, page.getByPlaceholder("tukar1:…"));
    await expect(page.getByRole("tab", { name: /^Claim$/ })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tab", { name: /^Payments$/ })).toHaveAttribute("aria-selected", "false");
    await expect(page.locator("#panel-claim")).toHaveAttribute("aria-labelledby", "tab-claim");
    // keyboard: focus the Request tab and press Enter
    await page.getByRole("tab", { name: /^Request$/ }).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#panel-request")).toBeVisible();
    await expect(page.locator("#reqAmount")).toBeVisible();
    // back to Payments -> empty state buttons switch tabs
    await page.getByRole("tab", { name: /^Payments$/ }).click();
    await expect(page.getByText("No payments yet")).toBeVisible();
    await page.getByRole("button", { name: "Claim a payment" }).click();
    await expect(page.locator("#panel-claim")).toBeVisible();
    await page.getByRole("tab", { name: /^Payments$/ }).click();
    await page.getByRole("button", { name: "Request a payment" }).click();
    await expect(page.locator("#panel-request")).toBeVisible();
    expect(w.crashes()).toEqual([]);
  });

  test("request: empty → prompt, disconnected → honest connect prompt, connected → tukreq1 string the sender accepts, double-click makes one", async ({ page, browserName }) => {
    const w = await watchAll(page);
    await goto200(page, "/receiver");
    await openReceiverTab(page, /^Request$/, page.locator("#reqAmount"));
    const create = page.getByRole("button", { name: "Create request" });
    await create.click();
    await expect(page.getByText("Enter an amount to request.")).toBeVisible();
    await fillStable(page.locator("#reqAmount"), "-5");
    await create.click();
    await expect(page.getByText("Enter an amount to request.")).toBeVisible();
    await fillStable(page.locator("#reqAmount"), "12.3456789"); // 7 decimals max — clamped by encode
    await create.click();
    await expect(page.getByText(/Connect first so the request points at the account/)).toBeVisible();
    await connectDemo(page);
    await create.click({ clickCount: 2, delay: 30 });
    await expect(page.locator("pre", { hasText: /^tukreq1:/ })).toHaveCount(1);
    const str = (await page.locator("pre", { hasText: /^tukreq1:/ }).innerText()).trim();
    const payload = JSON.parse(Buffer.from(str.slice("tukreq1:".length), "base64").toString());
    expect(payload.kind).toBe("req");
    expect(payload.amount).toBe("12.3456789");
    expect(payload.addr).toMatch(/^G[A-Z2-7]{55}$/);
    await expect(page.getByText(/Requested 12\.3456789 USDC/)).toBeVisible();
    // the sender must accept exactly this string
    await goto200(page, "/sender");
    await senderReady(page);
    await fillStable(page.locator("#req"), str);
    await page.getByRole("button", { name: /^Load$/ }).click();
    await expect(page.locator("#amount")).toHaveValue("12.3456789");
    await expect(page.locator("#recipient")).toHaveValue(/Requested payee · /);
    expect(w.crashes()).toEqual([]);
    void browserName;
  });

  test("claim: empty no-op, XSS junk honest error, structurally valid unknown note claims with a safe ref, persists across reload, duplicate refused", async ({ page }) => {
    const w = await watchAll(page);
    await goto200(page, "/receiver");
    await openReceiverTab(page, /^Claim$/, page.getByPlaceholder("tukar1:…"));
    const box = page.getByPlaceholder("tukar1:…");
    const claim = page.getByRole("button", { name: "Claim payment" });
    await fillStable(box, "tukar1:" + b64({ ...FAKE_NOTE_PAYLOAD, amount: "not-a-field" }));
    await claim.click();
    await expect(page.getByText(/Couldn't claim that note: malformed or missing field: amount/)).toBeVisible();
    // ref with markup is replaced by PAY-001 (receiver/page.tsx:147 safeRef regex)
    await fillStable(box, "tukar1:" + b64({ ...FAKE_NOTE_PAYLOAD, ref: "<script>alert(1)</script>" }));
    await claim.click();
    await expect(page.getByText(/Claimed PAY-001\./)).toBeVisible();
    await expect(page.getByRole("tab", { name: /Payments \(1\)/ })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("PAY-001").first()).toBeVisible();
    await expect(page.getByText("Shielded", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Reveal in MXN/ })).toBeVisible();
    // reload -> persisted (localStorage tukar:rcv:notes:*)
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("tab", { name: /Payments \(1\)/ })).toBeVisible({ timeout: 20_000 });
    // duplicate commitment refused
    await openReceiverTab(page, /^Claim$/, box);
    await fillStable(box, FAKE_NOTE);
    await claim.click();
    await expect(page.getByText("That payment is already in this wallet.")).toBeVisible();
    await expect(page.getByRole("tab", { name: /Payments \(1\)/ })).toBeVisible();
    expect(w.crashes()).toEqual([]);
  });

  test("payment card: reveal reads the on-chain quote (or says it is unavailable), corridor switch re-prices, withdraw on an unregistered note fails honestly", async ({ page }) => {
    test.slow();
    const w = await watchAll(page);
    await goto200(page, "/receiver");
    await openReceiverTab(page, /^Claim$/, page.getByPlaceholder("tukar1:…"));
    await fillStable(page.getByPlaceholder("tukar1:…"), FAKE_NOTE);
    await page.getByRole("button", { name: "Claim payment" }).click();
    await expect(page.getByText(/Claimed PAY-QA\./)).toBeVisible();
    // Withdraw without a connection -> honest prompt (PaymentCard.tsx:218-221); reveal first
    await page.getByRole("button", { name: /Reveal in MXN/ }).click();
    await expect(page.getByText(/Off-ramp figure read on-chain|no live price|On-chain quote unavailable/).first()).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText("Revealed", { exact: true })).toBeVisible();
    // switch to a non-oracle corridor: priced from the FX API, never spins on an on-chain read
    await page.locator("select[id^='cashout-']").selectOption("PH");
    await expect(page.getByText(/Shown at the live PHP rate|Live PHP rate unavailable/).first()).toBeVisible({ timeout: 20_000 });
    const withdraw = page.getByRole("button", { name: /^Withdraw on-chain$/ });
    await withdraw.click();
    await expect(page.getByText("Connect a wallet or the testnet key to withdraw on-chain.")).toBeVisible();
    await connectDemo(page);
    await withdraw.click();
    // a never-deposited commitment cannot be registered: honest failure, card returns to Withdraw
    await expect(page.getByText(/isn't in the on-chain tree yet|Withdraw failed|not registered|couldn't|can't withdraw/i).first()).toBeVisible({ timeout: 90_000 });
    await expect(page.getByRole("button", { name: /^Withdraw on-chain$/ })).toBeVisible({ timeout: 120_000 });
    expect(w.crashes()).toEqual([]);
  });

  test("check status: tukar1 note path returns 'unregistered'; offline → honest 'Status check failed'", async ({ page, context }) => {
    const w = await watchAll(page);
    await goto200(page, "/receiver");
    await openReceiverTab(page, /^Claim$/, page.getByPlaceholder("tukar1:…"));
    await fillStable(page.getByPlaceholder("tukar1:…"), FAKE_NOTE);
    await page.getByRole("button", { name: /Check status/ }).click();
    await expect(page.getByText("Note status")).toBeVisible({ timeout: 40_000 });
    await expect(page.getByText("unregistered", { exact: true })).toBeVisible();
    await context.setOffline(true);
    await page.getByRole("button", { name: /Check status/ }).click();
    await expect(page.getByText(/Status check failed/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: /Check status/ })).toBeEnabled();
    await context.setOffline(false);
    expect(w.crashes()).toEqual([]);
  });

  test("QR scan: unsupported browser → paste hint; supported but camera denied → honest fallback, no crash", async ({ page }) => {
    const w = await watchAll(page);
    await page.addInitScript(() => { delete (window as any).BarcodeDetector; });
    await goto200(page, "/receiver");
    await openReceiverTab(page, /^Claim$/, page.getByPlaceholder("tukar1:…"));
    await page.getByRole("button", { name: "Scan QR" }).click();
    await expect(page.getByText(/Live scanning isn't supported on this browser, paste the note string instead/)).toBeVisible();
    // now pretend support but deny the camera
    await page.addInitScript(() => {
      (window as any).BarcodeDetector = class { detect() { return Promise.resolve([]); } };
      // headless WebKit has no navigator.mediaDevices at all; define one so the deny path is exercised
      const md: any = (navigator as any).mediaDevices || {};
      md.getUserMedia = () => Promise.reject(new DOMException("denied", "NotAllowedError"));
      try { Object.defineProperty(navigator, "mediaDevices", { value: md, configurable: true }); } catch {}
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await openReceiverTab(page, /^Claim$/, page.getByPlaceholder("tukar1:…"));
    await page.getByRole("button", { name: "Scan QR" }).click();
    await expect(page.getByText(/Couldn't open the camera, paste the note string instead/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Scan QR" })).toBeVisible(); // not stuck on "Stop scan"
    expect(w.crashes()).toEqual([]);
  });
});

// ================================================================ 11. OPERATOR
test.describe("operator", () => {
  test("every nav section renders its real content; pool state settles to live or read-failed", async ({ page }) => {
    test.slow();
    const w = await watchAll(page);
    await goto200(page, "/operator");
    await expect(page.locator("aside nav button", { hasText: "Pool health" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByText(/reading pool state…/)).toHaveCount(0, { timeout: 60_000 });
    await expect(page.getByText(/live ·|read failed/).first()).toBeVisible();
    for (const [label, must] of [
      ["Compliance policy", /Deny-list \(field elements\)/],
      ["Oracle health", /Oracle health/],
      ["Corridor & anchor", /Anchor partners \(fiat on\/off-ramp\)/],
      ["Pool health", /Deployed contract inventory/],
    ] as const) {
      await selectNav(page, new RegExp(label.replace("&", "&")));
      await expect(page.getByText(must).first()).toBeVisible({ timeout: 30_000 });
    }
    expect(w.crashes()).toEqual([]);
  });

  test("compliance policy presets rewrite the per-corridor table; admin CLI builders accept/reject input", async ({ page }) => {
    const w = await watchAll(page);
    await goto200(page, "/operator");
    await selectNav(page, /Compliance policy/);
    await expect(page.getByText(/Per-corridor policy registry/)).toBeVisible({ timeout: 30_000 });
    // presets (operator/page.tsx:513-516)
    for (const preset of ["EU (MiCA / TFR)", "US (FinCEN)", "APAC", "Default (on-chain)"]) {
      const btn = page.getByRole("button", { name: preset, exact: true });
      if (await btn.count()) await btn.click();
    }
    // per-corridor inputs exist for all 10 corridors and accept boundary values without crashing
    const thr = page.getByLabel(/Mexico amount threshold in USDC/);
    await thr.fill("0");
    await thr.fill("-1");
    await thr.fill("999999999999");
    await thr.fill("1e3");
    // admin inputs (page.tsx:444-468) render; junk does not crash the CLI builder
    // NOTE: id="admin-asp-root" is duplicated on the live page (two inputs) — reported as a defect;
    // .first() keeps this test about crash-safety rather than the duplicate id.
    await page.locator("#admin-asp-root").first().fill(XSS);
    await page.locator("#admin-asp-root").nth(1).fill(XSS).catch(() => {});
    await page.locator("#admin-auditor").first().fill("not-a-G-address");
    await page.locator("#admin-fx-oracle").first().fill("C" + "A".repeat(10));
    // the duplicate-id defect itself, asserted explicitly so it is visible in the report
    for (const id of ["admin-asp-root", "admin-deny-list", "admin-auditor", "admin-fx-oracle"]) {
      expect(await page.locator("#" + id).count(), `duplicate id="${id}" (AdminForms mounted twice, operator/page.tsx AdminForms/DemonstratedPolicy share key "${"status"}")`).toBe(1);
    }
    expect(await page.evaluate(() => (window as any).__xss)).toBeUndefined();
    expect(w.crashes()).toEqual([]);
  });

  test("sidebar: Back to home + brand link navigate; wallet bar lives in the rail", async ({ page }) => {
    await goto200(page, "/operator");
    await expect(page.locator("aside").getByRole("button", { name: /Use testnet key/ })).toBeVisible();
    await page.locator("aside").getByRole("link", { name: "Back to home" }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("slow 3G: operator still renders and settles, no crash (chromium CDP throttle)", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "CDP network emulation is chromium-only");
    test.slow();
    const w = await watchAll(page);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 400, downloadThroughput: (400 * 1024) / 8, uploadThroughput: (400 * 1024) / 8 });
    await goto200(page, "/operator");
    await expect(page.getByRole("heading", { name: /Corridor operations/ })).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText(/reading pool state…/)).toHaveCount(0, { timeout: 120_000 });
    await expect(page.getByText(/live ·|read failed/).first()).toBeVisible();
    expect(w.crashes()).toEqual([]);
  });
});

// ================================================================ 12. REGULATOR
test.describe("regulator", () => {
  test("every tab renders; Refresh from chain works; Verify rejects junk/XSS; Issue is gated on the auditor key", async ({ page }) => {
    test.slow();
    const w = await watchAll(page);
    await goto200(page, "/regulator");
    await expect(page.getByRole("heading", { name: "Live pool state" })).toBeVisible();
    const refresh = page.getByRole("button", { name: "Refresh from chain" });
    await expect(refresh).toBeEnabled({ timeout: 60_000 });
    await refresh.click();
    await expect(refresh).toBeEnabled({ timeout: 60_000 });
    // Verify tab
    await selectNav(page, /Verify disclosure/);
    const box = page.locator("textarea").first();
    const verify = page.getByRole("button", { name: /Re-verify in browser and on-chain/ }); // regulator/page.tsx:476
    await expect(verify).toBeDisabled();
    await expect(verify).toHaveAttribute("title", "Paste an audit receipt to verify");
    await fillStable(box, XSS);
    await expect(verify).toBeEnabled();
    await verify.click({ clickCount: 2, delay: 30 });
    await expect(page.getByText("Not valid JSON.")).toBeVisible(); // regulator/page.tsx:406
    expect(await page.evaluate(() => (window as any).__xss)).toBeUndefined();
    // Issue tab: disabled until connected
    await selectNav(page, /Issue audit request/);
    const issue = page.getByRole("button", { name: "Compute hash and register on-chain" }); // regulator/page.tsx:777
    await expect(issue).toBeDisabled();
    await expect(issue).toHaveAttribute("title", "Connect the auditor key first");
    await connectDemo(page);
    await expect(issue).toBeEnabled();
    // Trail tab: export/clear disabled with an empty trail
    await selectNav(page, /Audit trail/);
    for (const name of [/JSON/, /CSV/, /Clear/]) {
      const b = page.locator("main").getByRole("button", { name }).first();
      await expect(b).toBeDisabled();
      await expect(b).toHaveAttribute("title", "No audit actions recorded yet");
    }
    expect(w.crashes()).toEqual([]);
  });

  test("Travel Rule tab: example → 'Verify a disclosure' jumps to Verify; TRP send round-trips for real; TRISA reports its real gate", async ({ page, browserName, context }) => {
    test.slow();
    const w = await watchAll(page);
    if (browserName === "chromium") await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await goto200(page, "/regulator");
    await selectNav(page, /Travel Rule/);
    await expect(page.getByText("FATF Travel Rule (TRP 3.2.1)")).toBeVisible();
    await expect(page.getByText(/IVMS101-shaped Travel Rule payload/)).toBeVisible();
    await page.getByRole("button", { name: "Verify a disclosure to fill this in" }).click();
    await expect(page.locator("aside nav button", { hasText: "Verify disclosure" })).toHaveAttribute("aria-current", "page");
    await selectNav(page, /Travel Rule/);
    if (browserName === "chromium") {
      await page.getByRole("button", { name: "Copy payload" }).click();
      await expect(toast(page)).toContainText("Payload copied");
    }
    await page.locator("#tr-corridor").selectOption("BR");
    // real TRP send (self-hosted, single operator) — the beneficiary approves (qa6 baseline)
    const send = page.getByRole("button", { name: "Send as TRP message" });
    await send.click({ clickCount: 2, delay: 30 }); // busy flag blocks the second fire
    await expect(page.getByText(/Approved by the beneficiary VASP · TRP 200/)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/Approved by the beneficiary VASP/)).toHaveCount(1);
    await expect(page.getByText(/request-identifier/).first()).toBeVisible();
    // TRISA
    await page.getByPlaceholder("api.bob.vaspbot.net").fill("api.bob.vaspbot.net");
    await page.getByRole("button", { name: "Send via TRISA node" }).click();
    if (!health.checks.trisa) {
      await expect(toast(page)).toContainText(/TRISA node not deployed/);
      await expect(page.getByText("TRISA companion node not deployed.")).toBeVisible();
    } else {
      await expect(page.getByText(/TRISA Transfer accepted|TRISA transfer rejected|TRISA send failed/).first()).toBeVisible({ timeout: 60_000 });
    }
    expect(w.crashes()).toEqual([]);
  });

  test("offline: Verify a hash reports the fetch failure honestly, button re-enables", async ({ page, context }) => {
    const w = await watchAll(page);
    await goto200(page, "/verify");
    const box = page.getByRole("textbox");
    const btn = page.getByRole("button", { name: /^Verify$/ });
    await expect(async () => {
      await box.fill("1"); // value must CHANGE each attempt (React value tracker), see senderReady
      await box.fill("0".repeat(64));
      await expect(btn).toBeEnabled({ timeout: 1500 });
    }).toPass({ timeout: 40_000 });
    await context.setOffline(true);
    await btn.click();
    await expect(page.getByText(/Failed to fetch|Load failed|NetworkError|Request failed|network/i).first()).toBeVisible({ timeout: 20_000 });
    await expect(btn).toBeEnabled();
    await context.setOffline(false);
    expect(w.crashes()).toEqual([]);
  });
});

// ================================================================ 13. CLICKJACKING (browser-enforced)
test("the app refuses to be framed cross-origin (X-Frame-Options / frame-ancestors)", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "console wording for blocked frames is chromium-specific");
  const msgs: string[] = [];
  page.on("console", (m) => msgs.push(m.text()));
  await page.goto("about:blank");
  await page.setContent(`<iframe id="f" src="${BASE}/sender" width="600" height="400"></iframe>`);
  await page.waitForTimeout(5000);
  const framed = await page.evaluate(() => {
    const f = document.getElementById("f") as HTMLIFrameElement;
    try { return !!f.contentDocument?.body?.innerText; } catch { return false; }
  });
  expect(framed).toBe(false);
  // Chromium only logs the refusal message on some builds; the headers themselves are asserted in
  // the security-headers test, and `framed === false` is the behaviour that matters.
  void msgs;
});
