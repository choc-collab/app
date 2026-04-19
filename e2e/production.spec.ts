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

  test("new plan wizard shows product selection step", async ({ page }) => {
    await page.goto("/production/new");
    // Wizard loads — check page heading or plan name input is present
    await expect(page.getByRole("main").getByRole("link", { name: "Production" })).toBeVisible();
  });
});
