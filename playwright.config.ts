import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // Screenshot generation is a manual script (npm run docs:screenshots),
  // not part of the e2e test suite. Excluded from default runs; included
  // when PLAYWRIGHT_DOCS=1 is set by the docs:screenshots npm script.
  testIgnore: process.env.PLAYWRIGHT_DOCS ? undefined : ["**/docs-screenshots.spec.ts"],
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
