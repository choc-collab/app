import { test, expect } from "./fixtures";

// E2E coverage for the /today dashboard. Empty-state tests run in a fresh
// IndexedDB (the fixture sets `chocolatier-seeded` so the CSV seeder is
// suppressed). Data-driven flows (ToMakeList → wizard, Sell · Quick) are
// covered by component-level vitest + ad-hoc playwright runs against demo
// data; here we stick to the chrome and routing the dashboard owns.

test.describe("Today dashboard", () => {
  test("renders header, tile row, and the To Make / Sell · Quick sections", async ({ page }) => {
    await page.goto("/today");

    // Header
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();

    // Tile row — labels visible (mono-label rendered in <span>)
    await expect(page.getByText(/Shopping list/i)).toBeVisible();
    await expect(page.getByText(/In progress/i).first()).toBeVisible();
    await expect(page.getByText(/Experiments brewing/i)).toBeVisible();
    await expect(page.getByText(/Week sales/i)).toBeVisible();

    // Lower row
    await expect(page.getByText(/To make/i).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: /Pre-packaged boxes/i })).toBeVisible();
  });

  test("Week sales tile links to Observatory's Shop breakdown", async ({ page }) => {
    await page.goto("/today");
    // next.config has trailingSlash: true, so the rendered href is suffixed.
    await expect(page.locator('a[href^="/observatory/shop"]')).toHaveCount(1);
  });

  test("Shopping list tile links to /shopping", async ({ page }) => {
    await page.goto("/today");
    await expect(page.locator('a[href^="/shopping"]').first()).toBeVisible();
  });

  test("empty states render when the database is empty", async ({ page }) => {
    await page.goto("/today");
    // ToMakeList — no products in the seeded-empty DB
    await expect(page.getByText(/No products yet/i)).toBeVisible();
    // SellQuickGrid — no prepared sales
    await expect(page.getByText(/Nothing prepped right now/i)).toBeVisible();
    // In progress tile — no active or draft plans
    await expect(page.getByText(/Nothing in progress/i)).toBeVisible();
  });

  test("Universal search clears + closes on Escape", async ({ page }) => {
    await page.goto("/today");
    const search = page.getByLabel(/Universal search/i);
    await expect(search).toBeVisible();
    await search.click();
    await search.fill("anything");
    await page.keyboard.press("Escape");
    await expect(search).toHaveValue("");
  });

  test("Universal search shows 'No matches' when the query has no hits", async ({ page }) => {
    await page.goto("/today");
    const search = page.getByLabel(/Universal search/i);
    await search.fill("zzzzz_no_such_thing");
    await expect(page.getByText(/No matches/i)).toBeVisible();
  });

  test("Quick add menu is gone (replaced by Universal search)", async ({ page }) => {
    await page.goto("/today");
    await expect(page.getByRole("button", { name: /Quick add/i })).toHaveCount(0);
  });
});
