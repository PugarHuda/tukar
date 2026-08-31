import { defineConfig, devices } from "@playwright/test";

// Real cross-browser E2E for Tukar. Runs against the live app by default; override
// with QA_BASE. Desktop projects on chromium/firefox/webkit plus two 390px mobile
// projects (sender + operator specs, tagged @mobile) on Mobile Chrome.
const BASE = process.env.QA_BASE || "https://tukar-six.vercel.app";

// When QA_BASE points at localhost, Playwright owns the server. Starting `next start`
// from a shell alongside the run is unreliable: the server is torn down with the shell's
// process group mid-suite, and every test after that fails on a 404 that looks like a
// product bug. `next dev` cannot be used here because the CSP has no 'unsafe-eval' and
// Next's HMR runtime evals, so client JS never evaluates: the suite needs a real build.
const local = /^https?:\/\/(localhost|127\.0\.0\.1):(\d+)/.exec(BASE);

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: 1,
  workers: process.env.CI ? 2 : 4,
  reporter: [["list"], ["html", { open: "never" }]],
  ...(local
    ? {
        webServer: {
          command: `npm --prefix webapp run start -- -p ${local[2]}`,
          url: `${BASE.replace(/\/$/, "")}/api/health`,
          reuseExistingServer: true,
          timeout: 180_000,
          stdout: "pipe" as const,
          stderr: "pipe" as const,
        },
      }
    : {}),
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
