// Protocol 28 write-path check: one REAL deposit + registration on the live pool through the app,
// signed with the embedded testnet demo key. Skipped in the default sweep (it spends a little of
// the shared key's testnet USDC and takes about half a minute of in-browser proving); opt in with
//   LIVE_DEPOSIT=1 QA_BASE=http://localhost:3100 npx playwright test --project=chromium --workers=1 e2e/p28-live.spec.ts
import { test, expect } from "@playwright/test";

test("live pool: real deposit + registration with the demo key, then note-status agrees", async ({ page, request }) => {
  test.skip(!process.env.LIVE_DEPOSIT, "opt-in: spends the shared demo key's testnet USDC (set LIVE_DEPOSIT=1)");
  test.setTimeout(480_000);
  await page.goto("/sender");
  await page.getByRole("button", { name: /Use testnet key/ }).click();
  await expect(page.getByRole("button", { name: /Disconnect/ })).toBeVisible({ timeout: 60_000 });

  await page.locator("#amount").fill("1");
  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(page.getByText(/Confirm and send/)).toBeVisible();
  await page.getByRole("button", { name: /^Send \$1/ }).click();

  // deposit (compliance + binding + merkleUpdate proofs, two signed txs) then registration
  const heading = page.getByRole("heading", { name: /Sent and shielded|Deposited, registration pending/ });
  await expect(heading).toBeVisible({ timeout: 420_000 });
  const title = (await heading.textContent()) || "";

  // The sender keeps its own record of sent notes (components/sender/SentNotes.tsx, newest first);
  // its commitment is enough for the public status route.
  const sent = await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (!k.startsWith("tukar:sent:")) continue;
      try {
        const a = JSON.parse(localStorage.getItem(k) || "[]");
        if (Array.isArray(a) && a[0]) return { commitment: String(a[0].commitment), depHash: String(a[0].depHash) };
      } catch {}
    }
    return null;
  });
  expect(sent, "a sent note was persisted").not.toBeNull();
  expect(sent!.commitment).toMatch(/^\d+$/);
  expect(sent!.depHash).toMatch(/^[0-9a-f]{64}$/);

  const st = await request.post("/api/note-status", { headers: { "content-type": "application/json" }, data: { commitment: sent!.commitment } });
  expect(st.status()).toBe(200);
  const j = await st.json();
  console.log(`P28 write path: "${title}" deposit tx ${sent!.depHash} -> note-status ${JSON.stringify(j)}`);
  // A commitment-only lookup cannot derive the nullifier (that needs the private key), so the route
  // honestly answers status "unknown"; what it CAN confirm on-chain is that the leaf is registered.
  if (/Sent and shielded/.test(title)) expect(j.knownLeaf).toBe(true);
  expect(["unregistered", "spendable", "unknown"]).toContain(j.status);
});
