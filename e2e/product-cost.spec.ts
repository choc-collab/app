import { test, expect } from "./fixtures";

test.describe("Product Cost Analysis", () => {
  test("page is reachable from the Observatory home", async ({ page }) => {
    await page.goto("/observatory");
    // Use the main content card (last match), not the sidenav link
    await page.locator('a[href="/observatory/product-cost/"]').last().click();
    await expect(page).toHaveURL("/observatory/product-cost/");
    await expect(page.getByRole("heading", { name: "Product Cost Analysis" })).toBeVisible();
  });

  test("shows empty state when no cost snapshots exist", async ({ page }) => {
    await page.goto("/observatory/product-cost");
    await expect(page.getByText("No cost data yet")).toBeVisible();
  });

  test("side nav item is visible and active on product cost page", async ({ page }) => {
    await page.goto("/observatory/product-cost");
    const navLink = page.getByRole("link", { name: "Product Cost" });
    await expect(navLink).toBeVisible();
  });

});
