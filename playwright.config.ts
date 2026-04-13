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
    // Locally: `npm run dev` is the fastest path and picks up HMR.
    //
    // In CI: the workflow runs `npx next build` before playwright,
    // producing a fully static export in `out/`. MarDoc uses
    // `output: "export"` in next.config.js, so `next start` is not
    // supported. Serve the static bundle with `serve` instead — it
    // handles client-side hash routing correctly because the shell
    // lives at `out/index.html` and everything else is a hash route.
    command: process.env.CI
      ? "npx --yes serve out -l 3000 --no-clipboard"
      : "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
