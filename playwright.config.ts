import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for MarDoc e2e tests.
 *
 * Tests run against a locally-booted Next.js dev server (or `next start`
 * in CI). MarDoc is a fully client-side static export, so there's no
 * backend to mock — demo mode provides fixture data for every flow.
 *
 * Two projects are defined so the same test file can run on desktop
 * and mobile viewports without duplication.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      name: "mobile",
      use: { ...devices["iPhone 14"] },
    },
  ],

  webServer: {
    // In CI the test.yml workflow runs `next build` before this,
    // so `next start` serves the production build. Locally, `npm run dev`
    // is faster. Both listen on 3000.
    command: process.env.CI ? "npx next start" : "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
