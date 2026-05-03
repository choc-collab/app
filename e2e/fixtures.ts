import { test as base } from "@playwright/test";

/**
 * Extended test fixture that prevents the CSV seed loader from running.
 * Each test gets a fresh browser context (fresh IndexedDB) by default.
 * We set the seed key in localStorage before the app boots so seedIfNeeded() is a no-op.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    // Prevent the seed loader from populating the DB with demo CSV data
    await page.addInitScript(() => {
      localStorage.setItem("chocolatier-seeded", "true");
    });
    // `use` is Playwright's fixture-yield callback, not React's `use()` hook.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(page);
  },
});

export { expect } from "@playwright/test";
