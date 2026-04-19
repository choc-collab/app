import { test, expect } from "./fixtures";

test.describe("Observatory", () => {
  test("loads the observatory home page", async ({ page }) => {
    await page.goto("/observatory");
    await expect(page.getByRole("heading", { name: "The Observatory" })).toBeVisible();
  });

  test("shows links to Pricing & Margins, Production Stats, and Product Cost", async ({ page }) => {
    await page.goto("/observatory");
    // Use href selectors to target the main content cards, not the sidenav
    await expect(page.locator('a[href="/pricing"]').last()).toBeVisible();
    await expect(page.locator('a[href="/stats"]').last()).toBeVisible();
    await expect(page.locator('a[href="/observatory/product-cost"]').last()).toBeVisible();
  });

  test("navigates to Pricing & Margins", async ({ page }) => {
    await page.goto("/observatory");
    await page.locator('a[href="/pricing"]').last().click();
    await expect(page).toHaveURL("/pricing");
    await expect(page.getByRole("heading", { name: /Pricing/i })).toBeVisible();
  });

  test("navigates to Production Stats", async ({ page }) => {
    await page.goto("/observatory");
    await page.locator('a[href="/stats"]').last().click();
    await expect(page).toHaveURL("/stats");
    await expect(page.getByRole("heading", { name: /Stats/i })).toBeVisible();
  });

  test("navigates to Product Cost", async ({ page }) => {
    await page.goto("/observatory");
    await page.locator('a[href="/observatory/product-cost"]').last().click();
    await expect(page).toHaveURL("/observatory/product-cost");
  });
});

test.describe("Pricing & Margins", () => {
  test("loads the pricing page", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.getByRole("heading", { name: /Pricing/i })).toBeVisible();
  });

  test("shows empty state when no collections have pricing", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.getByText("No collections with box pricing yet.")).toBeVisible();
  });
});

test.describe("Production Stats", () => {
  test("loads the stats page", async ({ page }) => {
    await page.goto("/stats");
    await expect(page.getByRole("heading", { name: /Stats/i })).toBeVisible();
  });

  test("shows time preset filter buttons", async ({ page }) => {
    await page.goto("/stats");
    // Time range filter pills should be present (label is "30 days")
    await expect(page.getByRole("button", { name: "30 days" })).toBeVisible();
  });
});
