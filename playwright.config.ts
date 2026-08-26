import { defineConfig, devices } from "@playwright/test";

// Real cross-browser E2E for Tukar. Runs against the live app by default; override
// with QA_BASE. Desktop projects on chromium/firefox/webkit plus two 390px mobile
// projects (sender + operator specs, tagged @mobile) on Mobile Chrome.
const BASE = process.env.QA_BASE || "https://tukar-six.vercel.app";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: 1,
  workers: process.env.CI ? 2 : 4,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE,
    trace: "on-first-retry",
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    {
      // 390px viewport for the overflow checks; only the @mobile-tagged specs.
      name: "mobile-chrome",
      use: { ...devices["Pixel 5"], viewport: { width: 390, height: 844 } },
      grep: /@mobile/,
    },
  ],
});
