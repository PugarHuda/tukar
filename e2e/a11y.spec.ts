import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { goto200 } from "./_helpers";

// Lightweight automated a11y on each main page: fail only on serious/critical violations.
// Lesser (minor/moderate) findings are logged, not asserted, so the run reports honestly
// without forcing green.
const PAGES = ["/", "/sender", "/receiver", "/operator", "/regulator", "/verify"];

for (const path of PAGES) {
  test(`a11y ${path} has no serious/critical violations`, async ({ page }, testInfo) => {
    await goto200(page, path);
    await page.waitForLoadState("load").catch(() => {});
    await page.waitForTimeout(2000);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    // Surface every finding in the report regardless of pass/fail.
    if (results.violations.length) {
      const lines = results.violations
        .map((v) => `  [${v.impact}] ${v.id}: ${v.help} (x${v.nodes.length})`)
        .join("\n");
      await testInfo.attach(`axe-${path.replace(/\W+/g, "_")}.txt`, { body: lines, contentType: "text/plain" });
      console.log(`a11y ${path}:\n${lines}`);
    }
    expect(
      bad.map((v) => `${v.id} (${v.impact}, x${v.nodes.length})`),
      `serious/critical a11y violations on ${path}`
    ).toEqual([]);
  });
}
