import { test, expect, chromium, type BrowserContext } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { goto200 } from "./_helpers";

// Real Web Push end to end. The receiver opts in via "Notify me", the cron sweep (and the
// opportunistic /api/note-status path) sends a real push through the browser's push service, and
// the service worker mirrors the received payload to the page (public/sw.js postMessage), which is
// what we assert on: Playwright cannot see OS notifications, but it can see that the SW's push
// event fired with our payload.
//
// This test drives its OWN browser context instead of the `page` fixture, because a push
// subscription needs two things the default one cannot give:
//   * a browser with a push service. Playwright's bundled Chromium has none, and
//     pushManager.subscribe rejects with AbortError "Registration failed - push service not
//     available", so this runs against installed Chrome (channel "chrome").
//   * a persistent profile. Chrome's push registration lives in the profile; from the default
//     throwaway context the same call rejects with "Registration failed - permission denied",
//     even with the notifications permission granted.
// Headless Chrome also reports Notification.permission as "denied" whatever the Permissions API
// says, which is why the picker's honest "denied" state is what the fixture page would show.
//
// The cron leg needs CRON_SECRET for the target (set it when running against a local server); the
// /api/note-status leg needs no secret and always runs.
const POOL = "CBIYQACYOKDBPYDGU7DMSHPGJEWP2ZRETXDVOTC5HTU5RJBGDK2MHTWJ";
// Leaf 0 of the live testnet pool: a commitment that is registered on-chain, so a "spendable"
// watch on it fires on the first check.
const LEAF0 = "12584484584939809709511852356187687794985356322368241668257788345509874701524";
const SECRET = process.env.CRON_SECRET;
const AUTH = { authorization: `Bearer ${SECRET}` };

test.describe("web push watches", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "push subscription needs Chrome's push service");

  test("receiver Notify me -> real subscription -> cron sweep + note-status both deliver a push the service worker receives", async ({ request, baseURL }) => {
    test.slow();
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), "tukar-push-"));
    let ctx: BrowserContext;
    try {
      ctx = await chromium.launchPersistentContext(profile, { channel: "chrome", baseURL, permissions: ["notifications"] });
    } catch (e: any) {
      fs.rmSync(profile, { recursive: true, force: true });
      test.skip(true, `Google Chrome is not installed here, and Playwright's bundled Chromium has no push service: ${(e && e.message) || e}`);
      return;
    }
    try {
      await ctx.addInitScript(() => {
        (window as any).__tukarPush = [];
        navigator.serviceWorker?.addEventListener("message", (e: MessageEvent) => {
          if (e.data?.type === "tukar-push") (window as any).__tukarPush.push(e.data.data);
        });
      });
      const page = await ctx.newPage();
      await goto200(page, "/receiver");
      // No service worker before the tap (the client registers it only inside subscribeWatch).
      expect(await page.evaluate(() => navigator.serviceWorker.controller)).toBeNull();
      await page.evaluate(
        ([k, v]) => localStorage.setItem(k, v),
        [`tukar:rcv:notes:${POOL}`, JSON.stringify({ seq: 1, notes: [{ id: 1, ref: "PAY-PUSH", amount: "10000000", privKey: "1", pubKey: "1", blinding: "1", commitment: LEAF0, corridor: "PH" }] })],
      );
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByRole("tab", { name: /Payments \(1\)/ })).toBeVisible({ timeout: 20_000 });

      const notify = page.getByRole("button", { name: "Notify me when it is ready to withdraw" });
      await expect(notify).toBeVisible();
      await expect(page.locator("[data-push-state=idle]")).toBeVisible();
      const subscribe = async () => {
        // The first tap registers the service worker AND registers with the browser's push
        // service over the network, which takes well past the 15s default.
        const resp = page.waitForResponse((r) => r.url().endsWith("/api/push/subscribe") && r.request().method() === "POST", { timeout: 60_000 });
        await notify.click();
        const r = await resp;
        expect(r.status()).toBe(200);
        const { id } = await r.json();
        expect(id).toMatch(new RegExp(`^push:${LEAF0}:spendable:[0-9a-f]{16}$`));
        await expect(page.locator("[data-push-state=subscribed]")).toBeVisible();
        await expect(page.getByRole("button", { name: "Watching, stop notifying me" })).toBeVisible();
        return id as string;
      };
      const id1 = await subscribe();
      // A real push-service subscription now exists for this origin.
      const endpoint = await page.evaluate(async () => (await (await navigator.serviceWorker.ready).pushManager.getSubscription())?.endpoint);
      expect(endpoint).toMatch(/^https:\/\//);

      const delivered = expect.objectContaining({ title: "Your payment is ready", url: "/receiver", kind: "spendable" });
      let expected = 0;
      // 1. The cron sweep: reads the chain, LEAF0 is a registered leaf, so the watch fires and is deleted.
      if (SECRET) {
        const cron = await request.get("/api/cron/push", { headers: AUTH });
        expect(cron.status()).toBe(200);
        const j = await cron.json();
        expect(j.configured).toBe(true);
        expect(j.sent).toBeGreaterThanOrEqual(1);
        expected = 1;
        await expect.poll(() => page.evaluate(() => (window as any).__tukarPush), { timeout: 30_000 }).toEqual(expect.arrayContaining([delivered]));
        // One-shot: deleting the fulfilled watch again is a no-op 200, and re-subscribing gets the same deterministic id.
        expect((await request.delete("/api/push/subscribe", { data: { id: id1 } })).status()).toBe(200);
      } else {
        console.log("push: CRON_SECRET is not set for this target, the sweep leg was not exercised");
        test.info().annotations.push({ type: "skipped-leg", description: "CRON_SECRET not set: /api/cron/push sweep not exercised" });
      }

      // 2. The opportunistic path: stop, re-subscribe, then a plain /api/note-status read on this
      //    commitment fires the watch after the response (no cron involved).
      await page.getByRole("button", { name: "Watching, stop notifying me" }).click();
      await expect(page.locator("[data-push-state=idle]")).toBeVisible();
      const id2 = await subscribe();
      expect(id2).toBe(id1);
      const st = await request.post("/api/note-status", { data: { commitment: LEAF0 } });
      expect(st.status()).toBe(200);
      expect((await st.json()).knownLeaf).toBe(true);
      expected += 1;
      await expect.poll(() => page.evaluate(() => (window as any).__tukarPush), { timeout: 30_000 }).toEqual(expect.arrayContaining([delivered]));
      await expect.poll(() => page.evaluate(() => (window as any).__tukarPush.length), { timeout: 30_000 }).toBeGreaterThanOrEqual(expected);
    } finally {
      await ctx.close();
      fs.rmSync(profile, { recursive: true, force: true });
    }
  });

  test("cron is bearer-gated and subscribe validates its body", async ({ request }) => {
    expect((await request.get("/api/cron/push")).status()).toBe(401);
    expect((await request.get("/api/cron/push", { headers: { authorization: "Bearer nope" } })).status()).toBe(401);
    const bad = await request.post("/api/push/subscribe", { data: { subscription: { endpoint: "http://x", keys: {} }, watch: {} } });
    expect([400, 503]).toContain(bad.status()); // 503 only when the target has no push store / VAPID key
    const del = await request.delete("/api/push/subscribe", { data: { id: "lock:x" } });
    expect([400, 503]).toContain(del.status());
  });
});
