import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // Two suites are excluded from the default dev run:
  //  - docs-screenshots: a manual script (npm run docs:screenshots), included
  //    only when PLAYWRIGHT_DOCS=1 is set by that npm script.
  //  - hydration: asserts against the STATIC EXPORT in out/ (route trees, _spa
  //    shells, _redirects rewrites). `next dev` renders on the fly and produces
  //    none of that, so these can only run via npm run test:e2e:prod, which
  //    uses playwright.prod.config.ts.
  testIgnore: process.env.PLAYWRIGHT_DOCS
    ? ["**/hydration.spec.ts"]
    : ["**/docs-screenshots.spec.ts", "**/hydration.spec.ts"],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "html",
  expect: {
    // Dexie useLiveQuery can take a moment to resolve on first load
    timeout: 15000,
  },
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
