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

// @mobile — the documentation route carries the widest content in the app (long tables, command
// blocks, contract ids). Each of those scrolls inside its own frame, so the page must not widen.
// The viewport is set here rather than relying on the project, so the check is real on any project.
for (const path of ["/docs", "/docs/architecture", "/docs/threat-model"]) {
  test(`@mobile ${path} renders with no horizontal overflow at 390px`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await goto200(page, path);
    await page.waitForLoadState("load").catch(() => {});
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} scrollWidth exceeds innerWidth by ${overflow}px`).toBeLessThanOrEqual(2);
  });
}
