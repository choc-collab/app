import { defineConfig, devices } from "@playwright/test";

/**
 * Production-build smoke test config.
 *
 * Runs hydration checks against the *static-export* output in `out/` — the same
 * artefact Cloudflare Pages serves. The regular `playwright.config.ts` runs
 * against `next dev` (Turbopack), which skips static export entirely, so this
 * config catches prod-only hydration failures like React error #418 that don't
 * surface in dev.
 *
 * Run:  npm run test:e2e:prod
 *       (which builds then invokes this config)
 *
 * Keep this suite small and deterministic — every route added here pays a
 * cold-boot cost. Add routes here only when you need the guarantee "this page
 * hydrates cleanly in the static build".
 */

const PORT = 3001;

export default defineConfig({
  testDir: "./e2e",
  testMatch: ["**/hydration.spec.ts"],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"]],
  expect: {
    timeout: 10000,
  },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium-prod",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `node scripts/serve-static.mjs`,
    env: { PORT: String(PORT) },
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
