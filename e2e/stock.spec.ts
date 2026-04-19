import { test, expect } from "./fixtures";

test.describe("Stock", () => {
  test("loads the stock page", async ({ page }) => {
    await page.goto("/stock");
    await expect(page.getByRole("heading", { name: "Stock" })).toBeVisible();
  });

  test("shows empty state when no batches are done", async ({ page }) => {
    await page.goto("/stock");
    // With no completed production plans, nothing is in stock
    await expect(page.getByRole("listitem")).toHaveCount(0);
  });

  test("search input is present", async ({ page }) => {
    await page.goto("/stock");
    await expect(page.getByLabel("Search stock")).toBeVisible();
  });

  test("filter toggle is present", async ({ page }) => {
    await page.goto("/stock");
    // Filter button should be visible (SlidersHorizontal icon button)
    await expect(page.getByRole("button", { name: "Filters" })).toBeVisible();
  });
});
