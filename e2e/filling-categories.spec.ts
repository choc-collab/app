import { test, expect } from "./fixtures";

/**
 * Filling categories — tab strip on /fillings + categories CRUD coverage.
 *
 * Note: ensureDefaultFillingCategories() runs on every page load via the seed
 * loader, so each fresh test context already has the 5 seeded categories.
 */

test.describe("Fillings — Tabs", () => {
  test("shows 2 tabs: Fillings, Categories", async ({ page }) => {
    await page.goto("/fillings");
    await expect(page.getByRole("heading", { name: "Fillings" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Fillings$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Categories$/ })).toBeVisible();
  });

  test("Fillings tab is active by default", async ({ page }) => {
    await page.goto("/fillings");
    await expect(page.getByRole("button", { name: /Add filling$/i })).toBeVisible();
  });

  test("switching to Categories tab shows seeded categories", async ({ page }) => {
    await page.goto("/fillings");
    await page.getByRole("button", { name: /^Categories$/ }).click();
    await expect(page.getByText("Ganaches (Emulsions)")).toBeVisible();
    await expect(page.getByText("Pralines & Giandujas (Nut-Based)")).toBeVisible();
    await expect(page.getByText("Fruit-Based (Pectins & Acids)")).toBeVisible();
  });

  test("seeded shelf-stable categories are flagged", async ({ page }) => {
    await page.goto("/fillings");
    await page.getByRole("button", { name: /^Categories$/ }).click();
    // Both Pralines and Fruit-Based should display the Shelf-stable badge.
    const badges = page.getByText("Shelf-stable", { exact: true });
    await expect(badges.first()).toBeVisible();
    await expect(await badges.count()).toBeGreaterThanOrEqual(2);
  });
});

test.describe("Fillings — Categories CRUD", () => {
  test("creates a new category and lands on detail page", async ({ page }) => {
    await page.goto("/fillings");
    await page.getByRole("button", { name: /^Categories$/ }).click();
    await page.getByRole("button", { name: /Add filling category/i }).click();
    await page.getByPlaceholder(/Category name/).fill("Marmalades");
    await page.getByRole("button", { name: "Create Category" }).click();
    await expect(page).toHaveURL(/\/fillings\/categories\/.+/);
  });

  test("created category appears in the list", async ({ page }) => {
    await page.goto("/fillings");
    await page.getByRole("button", { name: /^Categories$/ }).click();
    await page.getByRole("button", { name: /Add filling category/i }).click();
    await page.getByPlaceholder(/Category name/).fill("Spiced Pastes");
    await page.getByRole("button", { name: "Create Category" }).click();
    await expect(page).toHaveURL(/\/fillings\/categories\/.+/);

    await page.goto("/fillings");
    await page.getByRole("button", { name: /^Categories$/ }).click();
    await expect(page.getByText("Spiced Pastes")).toBeVisible();
  });

  test("toggling shelf-stable on a category persists across reload", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/fillings");
    await page.getByRole("button", { name: /^Categories$/ }).click();
    await page.getByRole("button", { name: /Add filling category/i }).click();
    await page.getByPlaceholder(/Category name/).fill("Confits");
    await page.getByRole("button", { name: "Create Category" }).click();
    await expect(page).toHaveURL(/\/fillings\/categories\/.+/);

    // Click the shelf-stable checkbox on the detail page (the label is "Treat as shelf-stable").
    // Use click() rather than check() because the controlled-checkbox state updates via a live
    // Dexie query, which Playwright's check() can race with.
    const cb = page.getByLabel(/Treat as shelf-stable/i);
    await cb.click();

    // Badge should appear on the detail page header once the live query refreshes
    await expect(page.getByText("Shelf-stable", { exact: true })).toBeVisible({ timeout: 10000 });

    // Persist across a hard reload
    await page.reload();
    await expect(page.getByText("Shelf-stable", { exact: true })).toBeVisible();
  });

  test("cancel add form hides without creating", async ({ page }) => {
    await page.goto("/fillings");
    await page.getByRole("button", { name: /^Categories$/ }).click();
    await page.getByRole("button", { name: /Add filling category/i }).click();
    await page.getByPlaceholder(/Category name/).fill("Should Not Exist");
    await page.getByRole("button", { name: "Cancel" }).click();

    await expect(page.getByPlaceholder(/Category name/)).not.toBeVisible();
    await expect(page.getByText("Should Not Exist")).not.toBeVisible();
  });

  test("deletes an unused category from the detail page", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/fillings");
    await page.getByRole("button", { name: /^Categories$/ }).click();
    await page.getByRole("button", { name: /Add filling category/i }).click();
    await page.getByPlaceholder(/Category name/).fill("Delete Me Cat");
    await page.getByRole("button", { name: "Create Category" }).click();
    await expect(page).toHaveURL(/\/fillings\/categories\/.+/);

    await page.getByRole("button", { name: /Delete category/i }).click();
    await page.getByRole("button", { name: "Yes, delete" }).click();

    await expect(page).toHaveURL(/\/fillings(\?tab=categories)?$/);
  });
});
