import { test, expect } from "@playwright/test";
import { goto200 } from "./_helpers";

// @mobile — runs on the 390px mobile-chrome project. Sender + operator must render and
// must not overflow horizontally (the qa6 no-horizontal-scroll invariant).
for (const path of ["/sender", "/operator"]) {
  test(`@mobile ${path} renders with no horizontal overflow`, async ({ page }) => {
    await goto200(page, path);
    await page.waitForLoadState("load").catch(() => {});
    // let live reads settle so late-inserted wide content is included
    await page.waitForTimeout(3000);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow, `${path} scrollWidth exceeds innerWidth by ${overflow}px`).toBeLessThanOrEqual(2);
  });
}
