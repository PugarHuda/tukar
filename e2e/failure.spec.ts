import { test, expect } from "@playwright/test";
import { goto200 } from "./_helpers";

// Failure path: junk in the verifier yields an honest rejection, not a crash.
test("verify rejects junk input with an honest failure, page survives", async ({ page }) => {
  await goto200(page, "/verify");
  await page.getByRole("textbox").fill("this is not a receipt and not a hash");
  await page.getByRole("button", { name: /^Verify$/ }).click();
  // Honest client-side verdict; the on-chain path is exercised via /api/verify in qa6.
  await expect(
    page.getByText(/neither valid receipt JSON nor a 64-character transaction hash/i)
  ).toBeVisible();
  // Not a crash: the page is still the verifier, still interactive.
  await expect(page.getByRole("heading", { name: /Verify a Tukar receipt/i })).toBeVisible();
});

// The connect/wallet bar is present on the actor apps that transact.
for (const path of ["/sender", "/receiver"]) {
  test(`wallet bar present on ${path}`, async ({ page }) => {
    await goto200(page, path);
    await expect(page.getByText(/Connect wallet/i).first()).toBeVisible();
  });
}
