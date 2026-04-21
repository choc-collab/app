import { test, expect } from "./fixtures";

test.describe("Production", () => {
  test("shows empty state on fresh database", async ({ page }) => {
    await page.goto("/production");
    await expect(page.getByRole("heading", { name: "Production" })).toBeVisible();
    await expect(page.getByText(/No active batches/i)).toBeVisible();
  });

  test("history tab shows empty state on fresh database", async ({ page }) => {
    await page.goto("/production");
    await page.getByRole("button", { name: "History" }).click();
    await expect(page.getByText(/No completed batches/i)).toBeVisible();
  });

  test("navigates to new plan wizard", async ({ page }) => {
    await page.goto("/production");
    await page.getByRole("link", { name: "New plan" }).click();
    await expect(page).toHaveURL("/production/new/");
  });

  test("new plan wizard shows plan-type picker first", async ({ page }) => {
    await page.goto("/production/new");
    // Wizard lands on the plan-type step — two cards are visible
    await expect(page.getByRole("button", { name: /Full production/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Fillings only/ })).toBeVisible();
  });

  test("?mode=full skips the plan-type picker and jumps to product select", async ({ page }) => {
    await page.goto("/production/new?mode=full");
    // Plan-type cards are not shown
    await expect(page.getByRole("button", { name: /Full production/ })).not.toBeVisible();
    // Product select phase is visible even with no products (shows the empty label)
    await expect(page.getByText(/Select the products you want to make/)).toBeVisible();
  });
});
